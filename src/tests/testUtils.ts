import { PeerProxy } from "../simple/simpleRelay";
import * as dgram from "node:dgram";

export class PeerLossyProxy extends PeerProxy {
  constructor(
    address: string,
    port: number,
    /** [ 0, 1 ] */
    public lossPercentage: number = 0
  ) {
    super(address, port);
  }

  private socket?: dgram.Socket;
  private ownPeer?: { address: string; port: number };
  private distantPeer?: { address: string; port: number };
  private closePromise: Promise<void> | undefined;

  setup: PeerProxy["setup"] = (ownPeer, distantPeer) => {
    if (this.socket || this.closePromise)
      throw new Error("PeerLossyProxy is already configured or closed");

    this.ownPeer = ownPeer;
    this.distantPeer = distantPeer;
    this.socket = dgram.createSocket("udp4");
    this.socket.bind(this.port, this.address);
    this.socket.on("message", this.onMessage);
  };

  private onMessage = (
    buffer: Buffer,
    { address, port }: dgram.RemoteInfo
  ) => {
    this.onDgram(buffer, address, port);
  };

  onDgram = (buffer: Buffer, fromAddress: string, fromPort: number) => {
    const socket = this.socket;
    if (!socket) return;

    if (this.lossPercentage != 0) {
      if (this.lossPercentage == 1) return;
      const randomNum = Math.random();
      if (randomNum <= this.lossPercentage) return;
    }

    if (fromAddress == this.ownPeer?.address && fromPort == this.ownPeer?.port)
      socket.send(
        buffer,
        this.distantPeer!.port,
        this.distantPeer!.address
      );

    if (
      fromAddress == this.distantPeer?.address &&
      fromPort == this.distantPeer?.port
    )
      socket.send(buffer, this.ownPeer!.port, this.ownPeer!.address);
  };

  close = (): Promise<void> => {
    if (this.closePromise) return this.closePromise;

    const socket = this.socket;
    if (!socket) return Promise.resolve();

    socket.off("message", this.onMessage);
    this.socket = undefined;

    this.closePromise = new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        socket.off("close", onClose);
        reject(error);
      };
      const onClose = () => {
        socket.off("error", onError);
        resolve();
      };

      socket.once("error", onError);
      socket.once("close", onClose);

      try {
        socket.close();
      } catch (cause) {
        socket.off("error", onError);
        socket.off("close", onClose);
        reject(cause);
      }
    });

    return this.closePromise;
  };
}
