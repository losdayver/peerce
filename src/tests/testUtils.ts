import * as dgram from "node:dgram";

export class UDPLossyProxy {
  constructor(
    private selfAddress: string,
    private selfPort: number,
    private peer1Addr: { address: string; port: number },
    private peer2Addr: { address: string; port: number },
    private relayAddr: { address: string; port: number },
    /** 0 -> 1 */
    private lossPercentage: number = 0
  ) {}

  socket?: dgram.Socket;

  private isConnectedViaRelay = false;
  wasConnectedViaRelay = () => {
    this.isConnectedViaRelay = true;
  };

  start = () => {
    this.socket = dgram.createSocket("udp4");
    this.socket.bind(this.selfPort, this.selfAddress);
    this.socket.on("message", (buffer, { address, port }) => {
      this.onDgram(buffer, address, port);
    });
  };

  onDgram = (buffer: Buffer, address: string, port: number) => {
    if (this.lossPercentage != 0) {
      if (this.lossPercentage == 1) return;
      const randomNum = Math.random();
      if (randomNum <= this.lossPercentage) return;
    }

    if (address == this.peer1Addr.address && port == this.peer1Addr.port) {
      if (!this.isConnectedViaRelay)
        this.socket!.send(buffer, this.relayAddr.port, this.relayAddr.address);
      else
        this.socket!.send(buffer, this.peer2Addr.port, this.peer2Addr.address);
    } else if (address == this.relayAddr.address && port == this.relayAddr.port)
      this.socket!.send(buffer, this.peer1Addr.port, this.peer1Addr.address);
    else if (address == this.peer2Addr.address && port == this.peer2Addr.port)
      this.socket!.send(buffer, this.peer1Addr.port, this.peer1Addr.address);
  };
}
