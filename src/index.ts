import { TransceiverIPv4 } from "@src/transport/transceiver";

const transceiver1 = new TransceiverIPv4("127.0.0.1", 2434, "127.0.0.1", 2435);
const transceiver2 = new TransceiverIPv4("127.0.0.1", 2435, "127.0.0.1", 2434);
const transceiver3 = new TransceiverIPv4(undefined, undefined, "0.0.0.0", 5623);
const transceiver4 = new TransceiverIPv4("127.0.0.1", 5623);

transceiver1.listen();
transceiver2.listen();
transceiver3.listen();
transceiver4.listen();

transceiver1.send("asdasdada");
transceiver2.send("asdasdada123");

transceiver4.send("gwsfgasdfsdgsdfasd");
