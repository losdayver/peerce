import { TransceiverIPv4 } from "@src/transport/transceiver";

const transceiver1 = new TransceiverIPv4();
const transceiver2 = new TransceiverIPv4();

transceiver1.listen({ address: "127.0.0.1", port: 2435 });
transceiver2.listen({ address: "127.0.0.1", port: 2434 });

transceiver1.connect("127.0.0.1", 2434);
transceiver1.send("127.0.0.1", 2434, "hello world!");
