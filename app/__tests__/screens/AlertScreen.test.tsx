import { fireEvent, screen } from 'expo-router/testing-library';

import type { EscalationEvent } from '../../modules/raveguard-native';
import { nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitEscalation, emitPhase, renderApp } from '../../test-utils/renderApp';

const NOTIFIED_AT = 1_800_000_000_000;

const NOTIFYING: EscalationEvent = {
  state: 'notifying',
  sosOpen: false,
  recipients: [
    { name: 'Sam', kind: 'contact', notifiedAt: NOTIFIED_AT, ackedAt: null },
    { name: 'Riley', kind: 'contact', notifiedAt: null, ackedAt: null },
  ],
};

beforeEach(() => nativeMock().reset());

describe('Alert screen', () => {
  test('lists who was texted from the snapshot', async () => {
    await renderApp('/alert', { phase: PHASES.escalated, escalation: NOTIFYING });
    expect(screen.getByText('Alert sent')).toBeTruthy();
    expect(screen.getByText('Sam: texted')).toBeTruthy();
    expect(screen.getByText('Riley: not texted yet')).toBeTruthy();
  });

  test('shows an acknowledgement from onEscalation', async () => {
    await renderApp('/alert', { phase: PHASES.escalated, escalation: NOTIFYING });
    await emitEscalation({
      ...NOTIFYING,
      state: 'acknowledged',
      recipients: [{ ...NOTIFYING.recipients[0], ackedAt: NOTIFIED_AT + 1000 }, NOTIFYING.recipients[1]],
    });
    expect(screen.getByText('Sam: acknowledged')).toBeTruthy();
  });

  test('says SOS once the module reaches it', async () => {
    await renderApp('/alert', { phase: PHASES.escalated, escalation: NOTIFYING });
    await emitPhase(PHASES.sos);
    expect(screen.getByText('SOS')).toBeTruthy();
  });

  test('opens from an escalation while the wearer is elsewhere', async () => {
    const app = await renderApp('/session', { phase: PHASES.monitoring });
    await emitPhase(PHASES.escalated);
    expect(app.getPathname()).toBe('/alert');
  });

  test('Enter PIN opens PIN entry and stays there while still escalated', async () => {
    const app = await renderApp('/alert', { phase: PHASES.escalated, escalation: NOTIFYING });
    fireEvent.press(screen.getByRole('button', { name: 'Enter PIN to cancel' }));
    expect(await screen.findByLabelText('PIN')).toBeTruthy();
    await emitEscalation(NOTIFYING);
    expect(app.getPathname()).toBe('/pin');
  });

  test('Call is shown but disabled until K10', async () => {
    await renderApp('/alert', { phase: PHASES.escalated, escalation: NOTIFYING });
    expect(screen.getByRole('button', { name: 'Call' })).toBeDisabled();
  });

  test('offers the way back once resolved', async () => {
    const app = await renderApp('/alert', { phase: PHASES.escalated, escalation: NOTIFYING });
    expect(screen.queryByRole('button', { name: 'Back to session' })).toBeNull();
    await emitPhase(PHASES.monitoring);
    fireEvent.press(screen.getByRole('button', { name: 'Back to session' }));
    expect(await screen.findByText('Session running')).toBeTruthy();
    expect(app.getPathname()).toBe('/session');
  });
});
