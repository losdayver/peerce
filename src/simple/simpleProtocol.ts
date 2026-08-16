// messages
export interface PeerToRelaySessionRequest {
  selfTag: string;
  distantTag: string;
  encrypt?: boolean;
  publicKey?: string;
}

export type SessionNegotiationFailure = "ENCRYPTION_MISMATCH";

export interface PeerToPeerSessionRequest {
  distantTag: string;
  distantAddress: string;
  distantPort: number;
  encrypt?: boolean;
  publicKey?: string;
  salt?: string;
  negotiationFailure?: SessionNegotiationFailure;
}

export interface PeerToPeerMessage {
  fileName: string;
  payload: string;
  chunkNo: number;
  totalNo: number;
  authTag?: string;
  nonce?: string;
}

// env
export interface SimpleProtocolConfig
  extends
    SimpleProtocolRelayConfig,
    SimpleProtocolPeerConfig,
    SimpleProtocolPeerExchange {}

export interface SimpleProtocolPeerConfig {
  relayAddr?: string;
  relayPort?: number;
  selfTag?: string;
  distantTag?: string;
  selfAddr?: string;
  selfPort?: number;
  encrypt?: boolean;
  vaultDir?: string;
}

export interface SimpleProtocolPeerExchange {
  payload?: string | Buffer;
  fromFile?: string;
  outDir?: string;
}

export interface SimpleProtocolRelayConfig {
  selfAddr?: string;
  selfPort?: number;
}

export interface PeerToPeerMessageDescriptor {
  fileName?: string;
  payload: Buffer | string;
}

// files
export interface KeysJsonEntry {
  privateKeyFile: string;
  publicKeyFile: string;
  dateCreated: string;
  primitive: string;
}

//keys.json
export type KeysJson = KeysJsonEntry[];

export interface KnownTagsEntry {
  publicKey: string;
  fingerprint: string;
  lastUpdate: string; // iso string
}

//known-tags.json
export type KnownTagsJson = Record<string, KnownTagsEntry>;
