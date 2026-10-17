import { createLevelSender } from '../../src/activeSession/levelSender';

type Deferred = { level: number; resolve: () => void; reject: (error: Error) => void };

/** A `send` whose calls stay open until the test settles them. */
function controllableSend() {
  const open: Deferred[] = [];
  const sent: number[] = [];
  const send = (level: number) =>
    new Promise<void>((resolve, reject) => {
      sent.push(level);
      open.push({ level, resolve, reject });
    });
  return { send, sent, open };
}

/** Lets the sender's promise callbacks run. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('createLevelSender', () => {
  test('sends a level straight away when nothing is in flight', () => {
    const { send, sent } = controllableSend();
    createLevelSender(send, jest.fn()).push(40);
    expect(sent).toEqual([40]);
  });

  test('a fast drag sends one call at a time and ends on the newest level', async () => {
    const { send, sent, open } = controllableSend();
    const sender = createLevelSender(send, jest.fn());
    [41, 42, 43, 44, 45].forEach((level) => sender.push(level));
    expect(sent).toEqual([41]);
    open[0].resolve();
    await flush();
    expect(sent).toEqual([41, 45]);
    open[1].resolve();
    await flush();
    expect(sent).toEqual([41, 45]);
  });

  test('does not resend the level that is already in flight', async () => {
    const { send, sent, open } = controllableSend();
    const sender = createLevelSender(send, jest.fn());
    sender.push(60);
    sender.push(61);
    sender.push(60);
    open[0].resolve();
    await flush();
    expect(sent).toEqual([60]);
  });

  test('sends the same level again once idle (Swift may have moved since)', async () => {
    const { send, sent, open } = controllableSend();
    const sender = createLevelSender(send, jest.fn());
    sender.push(70);
    open[0].resolve();
    await flush();
    sender.push(70);
    expect(sent).toEqual([70, 70]);
  });

  test('reports a failure with its level and still sends what was queued', async () => {
    const { send, sent, open } = controllableSend();
    const onError = jest.fn();
    const sender = createLevelSender(send, onError);
    sender.push(30);
    sender.push(35);
    const failure = new Error('module busy');
    open[0].reject(failure);
    await flush();
    expect(onError).toHaveBeenCalledWith(failure, 30);
    expect(sent).toEqual([30, 35]);
  });

  test('a send that throws straight away is reported, not thrown at the slider', async () => {
    const onError = jest.fn();
    const failure = new RangeError('bad level');
    const sender = createLevelSender(() => {
      throw failure;
    }, onError);
    expect(() => sender.push(5)).not.toThrow();
    await flush();
    expect(onError).toHaveBeenCalledWith(failure, 5);
  });
});
