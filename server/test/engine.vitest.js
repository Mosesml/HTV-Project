import { describe, it, expect, vi, afterEach } from 'vitest';
import { SessionStore } from '../src/sessions.js';
import { EscalationEngine } from '../src/escalations.js';
const facts = () => ({ wearerName: 'Demo', selfDescription: '', lastActiveState: 'walking',
  trigger: { kind: 'manual', at: new Date().toISOString(), reason: 'Synthetic' }, promptsUnanswered: 0 });
// Demo acknowledgement window per recipient (server/src/escalations.js) and the deadline the phone registers
// for a demo check-in (stages 6 + 6 + 8 s). Other tests keep their own 35 s registration.
const DEMO_ACK_MS = 10000;
const PHONE_DEMO_DEADLINE_MS = 20000;
function setup(demo = true, people, deadlineInMs = demo ? 35000 : 70000) {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
  const recipients = people ?? [0, 1, 2].map(i => ({ id: `p${i}`, name: `Contact ${i}`, order: i,
    kind: i === 2 ? 'venueStaff' : 'contact', permissions: { receiveAlerts: true, canResolve: true } }));
  const sessions = new SessionStore();
  const { sessionId } = sessions.create({ wearerName: 'Demo', demo, recipients });
  const delivered = [];
  const engine = new EscalationEngine({ sessions, deliver: event => delivered.push(event) });
  const id = engine.register(sessionId, new Date(Date.now() + deadlineInMs).toISOString(), facts());
  return { engine, sessions, sessionId, delivered, id };
}
afterEach(() => vi.useRealTimers());
describe('AN5 server clock', () => {
  it('demo ladder runs without heartbeat or polling at 20/30/40/50 seconds', () => {
    const { engine: e, id, delivered: d } = setup(true, undefined, PHONE_DEMO_DEADLINE_MS); e.start(); e.start();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(PHONE_DEMO_DEADLINE_MS - 1); expect(d).toHaveLength(0);
    vi.advanceTimersByTime(1); expect(d).toHaveLength(1);
    vi.advanceTimersByTime(DEMO_ACK_MS); expect(d).toHaveLength(2);
    vi.advanceTimersByTime(DEMO_ACK_MS); expect(d).toHaveLength(3); expect(e.status(id).sosOpen).toBe(false);
    vi.advanceTimersByTime(DEMO_ACK_MS); expect(e.status(id).sosOpen).toBe(true);
    e.stop(); expect(vi.getTimerCount()).toBe(0);
  });
  it('real windows last 120 seconds and SOS opens at 430', () => {
    const { engine: e, id, delivered: d } = setup(false); e.start();
    vi.advanceTimersByTime(429000); expect(d).toHaveLength(3); expect(e.status(id).sosOpen).toBe(false);
    vi.advanceTimersByTime(1000); expect(e.status(id).sosOpen).toBe(true); e.stop();
  });
  it('safe cancellation never notifies and retries cannot reopen it', () => {
    const { engine: e, id, delivered: d } = setup(); e.cancel(id, 'safe'); e.cancel(id, 'safe'); e.fire(id);
    vi.advanceTimersByTime(500000); e.sweep(); expect(d).toHaveLength(0); expect(e.status(id).state).toBe('cancelled');
  });
  it('duress fires immediately once and marks future notifications', () => {
    const { engine: e, id, delivered: d } = setup(); e.cancel(id, 'duress'); e.cancel(id, 'duress'); e.fire(id);
    expect(d).toHaveLength(1); expect(d[0].duress).toBe(true);
    vi.advanceTimersByTime(20000); e.sweep(); expect(d).toHaveLength(2); expect(d[1].duress).toBe(true);
  });
  it('duress after a normal first notification marks the next without restarting the window', () => {
    const { engine: e, id, delivered: d } = setup(); e.fire(id);
    expect(d[0].duress).toBe(false);
    vi.advanceTimersByTime(DEMO_ACK_MS / 2); e.cancel(id, 'duress');           // halfway through Contact 0's window
    expect(d).toHaveLength(1);
    vi.advanceTimersByTime(DEMO_ACK_MS / 2 - 1); e.sweep(); expect(d).toHaveLength(1);
    vi.advanceTimersByTime(1); e.sweep(); expect(d).toHaveLength(2); expect(d[1].duress).toBe(true);
  });
  it('heartbeat and facts updates do not extend the deadline; session removal frees records', () => {
    const { engine: e, id, sessions, sessionId, delivered: d } = setup();
    vi.advanceTimersByTime(34000); sessions.heartbeat(sessionId); e.update(id, facts());
    vi.advanceTimersByTime(1000); e.sweep(); expect(d).toHaveLength(1);
    e.deleteSession(sessionId); expect(e.owner(id)).toBeUndefined();
  });
  it('bounds retained escalations and deletes closed records at session end', () => {
    const { sessions, sessionId } = setup();
    const e = new EscalationEngine({ sessions, maxPerSession: 1 });
    const id = e.register(sessionId, new Date().toISOString(), facts());
    e.cancel(id, 'safe');
    expect(() => e.register(sessionId, new Date().toISOString(), facts())).toThrow(/capacity/);
    e.deleteSession(sessionId);
    expect(e.register(sessionId, new Date().toISOString(), facts())).toBeTruthy();
  });
  it('ack halts chain and resolve closes without reopening', () => {
    const { engine: e, id, delivered: d } = setup(); e.fire(id); e.acknowledge(id, 'p0');
    vi.advanceTimersByTime(500000); e.sweep(); expect(d).toHaveLength(1); expect(e.status(id).state).toBe('acknowledged');
    e.resolve(id, 'p0'); e.fire(id); e.cancel(id, 'duress'); expect(e.status(id).state).toBe('resolved');
  });
  it('late safe cancellation stops subsequent recipients', () => {
    const { engine: e, id, delivered: d } = setup(); e.fire(id); e.cancel(id, 'safe');
    vi.advanceTimersByTime(500000); e.sweep();
    // AN14: one alert, then the all-clear for that same notified contact; no later contact is attempted.
    expect(d.map(x => [x.kind, x.recipientId])).toEqual([['alert', 'p0'], ['all-clear', 'p0']]);
    expect(e.status(id).state).toBe('resolved');
  });
  it('sorts, skips opted-out recipients, and enforces notification/resolution permission', () => {
    const { engine: e, id, delivered: d } = setup(true, [
      { id: 'later', name: 'Later', kind: 'contact', order: 2, permissions: { receiveAlerts: true, canResolve: true } },
      { id: 'out', name: 'Out', kind: 'contact', order: 0, permissions: { receiveAlerts: false, canResolve: true } },
      { id: 'first', name: 'First', kind: 'contact', order: 1, permissions: { receiveAlerts: true, canResolve: false } }]);
    expect(() => e.acknowledge(id, 'first')).toThrow(); e.fire(id); expect(d[0].recipientId).toBe('first');
    expect(() => e.resolve(id, 'first')).toThrow(); expect(() => e.acknowledge(id, 'later')).toThrow();
    e.acknowledge(id, 'first'); expect(e.status(id).state).toBe('acknowledged');
  });
  it('delayed sweep gives each newly notified contact a full window', () => {
    const { engine: e, id, delivered: d } = setup(); vi.advanceTimersByTime(500000); e.sweep();
    expect(d).toHaveLength(1); expect(e.status(id).sosOpen).toBe(false);
    vi.advanceTimersByTime(DEMO_ACK_MS - 1); e.sweep(); expect(d).toHaveLength(1);
    vi.advanceTimersByTime(1); e.sweep(); expect(d).toHaveLength(2);
  });
  it('deleting session prunes pending work without sending', () => {
    const { engine: e, id, sessions, sessionId, delivered: d } = setup(); sessions.delete(sessionId);
    vi.advanceTimersByTime(500000); e.sweep(); expect(e.owner(id)).toBeUndefined(); expect(d).toHaveLength(0);
  });
  it('empty recipient list opens SOS without inventing notifications', () => {
    const { engine: e, id, delivered: d } = setup(true, []); e.fire(id);
    expect(d).toHaveLength(0); expect(e.status(id)).toMatchObject({ sosOpen: true, recipients: [] });
  });
  it('failed sink does not mark notified and does not crash sweep', () => {
    const { sessions, sessionId } = setup(); const e = new EscalationEngine({ sessions, deliver: () => { throw Error('synthetic'); } });
    const id = e.register(sessionId, new Date().toISOString(), facts()); e.sweep();
    expect(e.status(id).recipients.every(r => r.notifiedAt === null)).toBe(true);
    expect(e.inspect(id).attempts[0].failed).toBe(true);
  });
  it('updates facts but rejects updates after closure', () => {
    const { engine: e, id } = setup(); e.update(id, { ...facts(), promptsUnanswered: 2 });
    expect(e.inspect(id).facts.promptsUnanswered).toBe(2); e.cancel(id, 'safe'); expect(() => e.update(id, facts())).toThrow();
  });
});
