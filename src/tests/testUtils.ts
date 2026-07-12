import { PeerProxy } from "@src/simple/simpleRelay";
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

  setup: PeerProxy["setup"] = (ownPeer, distantPeer) => {
    this.ownPeer = ownPeer;
    this.distantPeer = distantPeer;
    this.socket = dgram.createSocket("udp4");
    this.socket.bind(this.port, this.address);
    this.socket.on("message", (buffer, { address, port }) => {
      this.onDgram(buffer, address, port);
    });
  };

  onDgram = (buffer: Buffer, fromAddress: string, fromPort: number) => {
    if (this.lossPercentage != 0) {
      if (this.lossPercentage == 1) return;
      const randomNum = Math.random();
      if (randomNum <= this.lossPercentage) return;
    }

    if (fromAddress == this.ownPeer?.address && fromPort == this.ownPeer?.port)
      this.socket!.send(
        buffer,
        this.distantPeer!.port,
        this.distantPeer!.address
      );

    if (
      fromAddress == this.distantPeer?.address &&
      fromPort == this.distantPeer?.port
    )
      this.socket!.send(buffer, this.ownPeer!.port, this.ownPeer!.address);
  };
}
