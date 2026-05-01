import { TransceiverIPv4 } from "@src/transport/transceiver";

const transceiver2 = new TransceiverIPv4();

transceiver2.listen({ address: "127.0.0.1", port: 2434 });
