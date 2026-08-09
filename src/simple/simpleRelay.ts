import { TransceiverIPv4 } from "../transport/transceiver";
import {
  PeerToPeerSessionRequest,
  PeerToRelaySessionRequest,
} from "./simpleProtocol";
import {
  AnsiColor,
  colorLog,
  logError,
  logInfo,
  logWarning,
} from "../utils/logUtils";

const MAX_REQUEST_BYTES = 1_024;
const MAX_TAG_LENGTH = 128;
const MAX_PENDING_REQUESTS = 10_000;
const PENDING_REQUEST_TTL_MS = 30_000;
const REQUEST_CLEANUP_INTERVAL_MS = 5_000;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;

interface PeerAddress {
  readonly address: string;
  readonly port: number;
}

interface PendingSessionRequest extends PeerAddress {
  readonly createdAt: number;
}

const createRequestKey = (selfTag: string, distantTag: string) =>
  JSON.stringify([selfTag, distantTag]);

const isValidTag = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= MAX_TAG_LENGTH &&
  !CONTROL_CHARACTER_PATTERN.test(value);

const parseSessionRequest = (
  message: Buffer
): PeerToRelaySessionRequest | undefined => {
  if (message.length === 0 || message.length > MAX_REQUEST_BYTES)
    return undefined;

  let value: unknown;
  try {
    value = JSON.parse(message.toString("utf8"));
  } catch {
    return undefined;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;

  const candidate = value as Record<string, unknown>;
  if (
    !isValidTag(candidate.selfTag) ||
    !isValidTag(candidate.distantTag) ||
    candidate.selfTag === candidate.distantTag
  )
    return undefined;

  return {
    selfTag: candidate.selfTag,
    distantTag: candidate.distantTag,
  };
};

export abstract class PeerProxy {
  constructor(
    public readonly address: string,
    public readonly port: number
  ) {}

  abstract setup: (
    ownPeer: PeerAddress,
    distantPeer: PeerAddress
  ) => void | Promise<void>;

  abstract close: () => Promise<void>;
}

type TagProxyMap = Record<string, PeerProxy>;

export interface SimpleRelayAdditionalSettings {
  pendingRequestTTLms?: number;
  tagProxyMap?: TagProxyMap;
}

export class SimpleRelay {
  transceiver: TransceiverIPv4;
  private readonly listenPromise: Promise<void>;
  private readonly requestCleanupInterval: NodeJS.Timeout;
  private closePromise: Promise<void> | undefined;
  private readonly requestMap = new Map<string, PendingSessionRequest>();
  private readonly additional?: SimpleRelayAdditionalSettings;

  constructor(
    address: string,
    port: number,
    additional?: SimpleRelayAdditionalSettings
  ) {
    if (additional) this.additional = additional;

    this.transceiver = new TransceiverIPv4();
    this.listenPromise = this.transceiver.listen({ address, port });
    void this.listenPromise.catch(() => undefined);

    this.transceiver.on("onReceive", this.onReceiveFromPeer);
    this.transceiver.on("onSessionClosed", this.onSessionClosed);

    this.requestCleanupInterval = setInterval(
      this.removeExpiredRequests,
      REQUEST_CLEANUP_INTERVAL_MS
    );
    this.requestCleanupInterval.unref();
  }

  ready = () => this.listenPromise;

  close = (): Promise<void> => {
    this.closePromise ??= this.performClose();
    return this.closePromise;
  };

  private performClose = async () => {
    clearInterval(this.requestCleanupInterval);
    this.transceiver.off("onReceive", this.onReceiveFromPeer);
    this.transceiver.off("onSessionClosed", this.onSessionClosed);

    try {
      await this.transceiver.close();
    } finally {
      this.requestMap.clear();
    }
  };

  private removeExpiredRequests = async () => {
    const expiresBefore =
      Date.now() -
      (this.additional?.pendingRequestTTLms ?? PENDING_REQUEST_TTL_MS);

    for (const [key, request] of this.requestMap) {
      if (request.createdAt <= expiresBefore) {
        this.requestMap.delete(key);
        await this.transceiver.closeSession(request.address, request.port);
      }
    }
  };

  onSessionClosed = (address: string, port: number) => {
    for (const [key, peer] of this.requestMap.entries()) {
      if (peer.address === address && peer.port === port)
        this.requestMap.delete(key);
    }
  };

  onReceiveFromPeer = (peerAddress: PeerAddress, message: Buffer) => {
    const request = parseSessionRequest(message);
    if (!request) {
      logWarning(
        `ignored invalid relay request from ${peerAddress.address}:${peerAddress.port}`
      );
      return;
    }

    void this.processSessionRequest(peerAddress, request).catch((cause) => {
      const message = cause instanceof Error ? cause.message : String(cause);
      logError(`failed to process relay request: ${message}`);
    });
  };

  private processSessionRequest = async (
    peerAddress: PeerAddress,
    request: PeerToRelaySessionRequest
  ) => {
    const requestKey = createRequestKey(request.selfTag, request.distantTag);
    const reverseRequestKey = createRequestKey(
      request.distantTag,
      request.selfTag
    );
    const now = Date.now();
    let distantPeer = this.requestMap.get(reverseRequestKey);

    if (
      distantPeer &&
      distantPeer.createdAt <=
        now - (this.additional?.pendingRequestTTLms ?? PENDING_REQUEST_TTL_MS)
    ) {
      this.requestMap.delete(reverseRequestKey);
      distantPeer = undefined;
    }

    if (!distantPeer) {
      if (
        !this.requestMap.has(requestKey) &&
        this.requestMap.size >= MAX_PENDING_REQUESTS
      ) {
        logWarning("relay pending request limit reached");
        return;
      }

      this.requestMap.set(requestKey, {
        ...peerAddress,
        createdAt: now,
      });
      logInfo(`requesting ${request.selfTag}:${request.distantTag}`);
      return;
    }

    this.requestMap.delete(reverseRequestKey);
    this.requestMap.delete(requestKey);

    const selfProxy = this.additional?.tagProxyMap?.[request.selfTag];
    const distantProxy = this.additional?.tagProxyMap?.[request.distantTag];

    if (selfProxy)
      await selfProxy.setup(peerAddress, {
        address: distantProxy ? distantProxy.address : distantPeer.address,
        port: distantProxy ? distantProxy.port : distantPeer.port,
      });
    if (distantProxy)
      await distantProxy.setup(distantPeer, {
        address: selfProxy ? selfProxy.address : peerAddress.address,
        port: selfProxy ? selfProxy.port : peerAddress.port,
      });

    colorLog(
      `request satisfied ${request.selfTag}:${request.distantTag}`,
      AnsiColor.BRIGHTGREEN
    );
    void this.transceiver.send(
      distantPeer.address,
      distantPeer.port,
      JSON.stringify({
        distantTag: request.selfTag,
        distantAddress: distantProxy
          ? distantProxy.address
          : peerAddress.address,
        distantPort: distantProxy ? distantProxy.port : peerAddress.port,
      } satisfies PeerToPeerSessionRequest)
    );
    void this.transceiver.send(
      peerAddress.address,
      peerAddress.port,
      JSON.stringify({
        distantTag: request.distantTag,
        distantAddress: selfProxy ? selfProxy.address : distantPeer.address,
        distantPort: selfProxy ? selfProxy.port : distantPeer.port,
      } satisfies PeerToPeerSessionRequest)
    );
  };
}
