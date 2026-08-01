import { ConnectedBehavior } from "../transport/session/behaviors/connected";
import { MessageType } from "../transport/messageBuffer";
import { Session } from "../transport/session/session";
import { TransceiverIPv4 } from "../transport/transceiver";

test("disconnects a session after the keep-alive timeout", async () => {
  jest.useFakeTimers({ now: 0 });

  const session = new Session(new TransceiverIPv4(), "127.0.0.1", 50_001);
  const behavior = new ConnectedBehavior(session);
  const sendOne = jest
    .spyOn(session, "sendOne")
    .mockImplementation(() => undefined);
  const shiftTo = jest
    .spyOn(session.stateMachine, "shiftTo")
    .mockResolvedValue(undefined);

  try {
    behavior.onEnter();

    await jest.advanceTimersByTimeAsync(5_000);
    expect(shiftTo).not.toHaveBeenCalledWith("closing");

    await jest.advanceTimersByTimeAsync(21_000);
    expect(shiftTo).toHaveBeenCalledTimes(1);
    expect(shiftTo).toHaveBeenCalledWith("closing");
    expect(sendOne).toHaveBeenCalledWith({ type: MessageType.KEEP_ALIVE });
  } finally {
    behavior.onExit();
    jest.useRealTimers();
  }
});
