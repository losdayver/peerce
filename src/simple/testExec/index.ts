import { TransceiverIPv4 } from "@src/transport/transceiver";
import { SimplePeer } from "../simplePeer";
import { SimpleRelay } from "../simpleRelay";

void (async () => {
  const simpleClient = new SimplePeer();
  await simpleClient.requestSessionViaRelay(
    "127.0.0.1",
    5555,
    "me",
    "other",
    "Hello World!"
  );
})();

void (async () => {
  const simpleClient = new SimplePeer();
  await simpleClient.requestSessionViaRelay("127.0.0.1", 5555, "other", "me");
})();

const simpleRelay = new SimpleRelay("127.0.0.1", 5555);
