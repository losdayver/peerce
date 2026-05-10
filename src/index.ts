import { TransceiverIPv4 } from "@src/transport/transceiver";

const transceiver1 = new TransceiverIPv4();

transceiver1.listen({ address: "127.0.0.1", port: 2435 });

transceiver1.connect("127.0.0.1", 2434);

setTimeout(() => {
  transceiver1.send(
    "127.0.0.1",
    2434,
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
  );
}, 3000);
