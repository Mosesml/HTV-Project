import { Linking, StyleSheet } from 'react-native';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import type { EscalationEvent, Settings } from '../../modules/raveguard-native';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { PALETTE } from '../../src/ui';
import { fakeFileSystem, seedSavedSettings } from '../../test-utils/fakeFiles';
import { nativeMock, PHASES } from '../../test-utils/nativeMock';
import { emitPhase, renderApp } from '../../test-utils/renderApp';

// SOS (docs/design/screens/SOS.html). Its Call keeps the rule Alert's has: demo mode rings the
// teammate, and nothing ever dials emergency services.

const TEAMMATE = '+14165550199';
const AT = new Date(2027, 0, 9, 1, 47).getTime();
const SOS_CAPTION = 'Demo mode: calls a teammate, never emergency services';

const EVERYONE_TEXTED: EscalationEvent = {
  state: 'notifying',
  sosOpen: true,
  recipients: [
    { name: 'Maya', kind: 'contact', notifiedAt: AT, ackedAt: null },
    { name: 'Theo', kind: 'contact', notifiedAt: AT, ackedAt: null },
    { name: 'Venue staff', kind: 'venueStaff', notifiedAt: AT, ackedAt: null },
  ],
};

function saveSettings(change: Partial<Settings>): void {
  seedSavedSettings({ ...DEFAULT_SETTINGS, ...change });
}

beforeEach(() => {
  nativeMock().reset();
  fakeFileSystem().reset();
  jest.mocked(Linking.openURL).mockClear();
});

afterEach(() => jest.restoreAllMocks());

describe('SOS screen', () => {
  test('opens on sos from wherever the wearer is', async () => {
    const app = await renderApp('/session', { phase: PHASES.escalated });
    expect(app.getPathname()).toBe('/alert');
    await emitPhase(PHASES.sos);
    expect(app.getPathname()).toBe('/sos');
    expect(screen.getByText('SOS')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'No one has answered yet' })).toBeTruthy();
  });

  test('says who was texted', async () => {
    await renderApp('/sos', { phase: PHASES.sos, escalation: EVERYONE_TEXTED });
    expect(screen.getByText('Maya, Theo and Venue staff were all texted. Call for help if you can.')).toBeTruthy();
  });

  test('draws on the SOS background', async () => {
    await renderApp('/sos', { phase: PHASES.sos });
    expect(StyleSheet.flatten(screen.getByTestId('sos-screen').props.style)).toMatchObject({ backgroundColor: PALETTE.sosBg });
  });

  test('in demo mode, Call for help rings the teammate and says it never dials emergency services', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    saveSettings({ demo: true, teammatePhone: TEAMMATE });
    await renderApp('/sos', { phase: PHASES.sos });
    const call = await screen.findByRole('button', { name: 'Call for help' });
    await waitFor(() => expect(call).toBeEnabled());
    expect(screen.getByText(SOS_CAPTION)).toBeTruthy();
    expect(call.props.accessibilityHint).toBe(`Rings your teammate's demo number, ${TEAMMATE}. iOS asks before it dials.`);
    fireEvent.press(call);
    await waitFor(() => expect(openURL).toHaveBeenCalledWith(`tel:${TEAMMATE}`));
    expect(openURL).toHaveBeenCalledTimes(1);
  });

  test('outside demo mode, Call for help is off and dials nothing', async () => {
    const openURL = jest.spyOn(Linking, 'openURL');
    saveSettings({ demo: false, teammatePhone: TEAMMATE });
    await renderApp('/sos', { phase: PHASES.sos });
    expect(await screen.findByText('Calling is only on in demo mode. RaveGuard never dials emergency services.')).toBeTruthy();
    const call = screen.getByRole('button', { name: 'Call for help' });
    expect(call).toBeDisabled();
    fireEvent.press(call);
    expect(openURL).not.toHaveBeenCalled();
  });

  test('in demo mode with no teammate number, Call for help says where to add one', async () => {
    const openURL = jest.spyOn(Linking, 'openURL');
    saveSettings({ demo: true, teammatePhone: null });
    await renderApp('/sos', { phase: PHASES.sos });
    expect(screen.getByText("Add your teammate's number on the Debug screen to call from here.")).toBeTruthy();
    const call = screen.getByRole('button', { name: 'Call for help' });
    expect(call).toBeDisabled();
    fireEvent.press(call);
    expect(openURL).not.toHaveBeenCalled();
  });

  test('a phone that cannot call says so and shows the number', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no phone app'));
    saveSettings({ demo: true, teammatePhone: TEAMMATE });
    await renderApp('/sos', { phase: PHASES.sos });
    const call = await screen.findByRole('button', { name: 'Call for help' });
    await waitFor(() => expect(call).toBeEnabled());
    fireEvent.press(call);
    expect(await screen.findByText(`Couldn't start the call. Dial ${TEAMMATE} yourself.`)).toBeTruthy();
  });

  test('never calls on its own', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    saveSettings({ demo: true, teammatePhone: TEAMMATE });
    await renderApp('/sos', { phase: PHASES.sos });
    await emitPhase(PHASES.sos);
    expect(openURL).not.toHaveBeenCalled();
  });

  test('"Read this out" gives the meeting spot and what the wearer has on', async () => {
    saveSettings({ wearerName: 'Alex', meetingSpot: 'Main stage, left side', selfDescription: 'Black hoodie, white cap' });
    await renderApp('/sos', { phase: PHASES.sos });
    expect(await screen.findByText('Main stage, left side · Black hoodie, white cap')).toBeTruthy();
    expect(screen.getByText('Read this out')).toBeTruthy();
  });

  test('"Read this out" says what to tell them when neither is set', async () => {
    saveSettings({ wearerName: 'Alex' });
    await renderApp('/sos', { phase: PHASES.sos });
    expect(await screen.findByText('Say your name, Alex, and where you are right now.')).toBeTruthy();
  });

  test("\"I'm okay now\" opens the PIN gate and stays there while still at SOS", async () => {
    const app = await renderApp('/sos', { phase: PHASES.sos });
    fireEvent.press(screen.getByRole('button', { name: "I'm okay now" }));
    await waitFor(() => expect(app.getPathname()).toBe('/pin'));
    await emitPhase(PHASES.sos);
    expect(app.getPathname()).toBe('/pin');
  });
});
