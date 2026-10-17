import { act, renderHook, waitFor } from '@testing-library/react-native';

import { IDLE_SNAPSHOT } from '../../modules/raveguard-native/src/mock';
import { useAutoProtection } from '../../src/hearing/useAutoProtection';
import { nativeMock } from '../../test-utils/nativeMock';

beforeEach(() => nativeMock().reset());

async function renderAutoProtection() {
  const hook = renderHook(() => useAutoProtection());
  await waitFor(() => expect(hook.result.current.hearing).not.toBeNull());
  return hook;
}

describe('useAutoProtection', () => {
  test('starts from the snapshot', async () => {
    nativeMock().setSnapshot({
      ...IDLE_SNAPSHOT,
      hearing: { roomDb: 98, dosePercent: 20, mode: 'manual' },
    });
    const { result } = await renderAutoProtection();
    expect(result.current).toMatchObject({ isAuto: false, roomText: '98 dB', doseText: '20%', error: null });
  });

  test('follows onHearing', async () => {
    const { result } = await renderAutoProtection();
    act(() => nativeMock().emit('onHearing', { roomDb: 104, dosePercent: 55, mode: 'auto' }));
    expect(result.current).toMatchObject({ isAuto: true, roomText: '104 dB', doseBand: 'high' });
  });

  test('an onHearing that beats the snapshot wins', async () => {
    let resolveSnapshot: (value: typeof IDLE_SNAPSHOT) => void = () => undefined;
    jest
      .spyOn(nativeMock(), 'getSnapshot')
      .mockReturnValueOnce(new Promise((resolve) => (resolveSnapshot = resolve)));
    const { result } = renderHook(() => useAutoProtection());
    act(() => nativeMock().emit('onHearing', { roomDb: 101, dosePercent: 5, mode: 'manual' }));
    await act(async () => resolveSnapshot(IDLE_SNAPSHOT));
    expect(result.current).toMatchObject({ isAuto: false, roomText: '101 dB' });
  });

  test('setAuto switches the mode through Swift, which reports it back', async () => {
    const { result } = await renderAutoProtection();
    await act(async () => result.current.setAuto(false));
    expect(nativeMock().calls.filter((c) => c.method === 'setProtectionMode').map((c) => c.args[0])).toEqual([
      'manual',
    ]);
    expect(result.current.isAuto).toBe(false);
    await act(async () => result.current.setAuto(true));
    expect(result.current.isAuto).toBe(true);
    expect(result.current.isSwitching).toBe(false);
  });

  test('stays switching until the last of two quick changes lands', async () => {
    let finishFirst: () => void = () => undefined;
    jest
      .spyOn(nativeMock(), 'setProtectionMode')
      .mockReturnValueOnce(new Promise<void>((resolve) => (finishFirst = resolve)))
      .mockReturnValueOnce(new Promise<void>(() => undefined));
    const { result } = await renderAutoProtection();
    act(() => result.current.setAuto(false));
    act(() => result.current.setAuto(true));
    await act(async () => finishFirst());
    expect(result.current.isSwitching).toBe(true);
  });

  test('a failed switch says so and keeps the mode Swift reported', async () => {
    jest.spyOn(nativeMock(), 'setProtectionMode').mockRejectedValueOnce(new Error('module gone'));
    const { result } = await renderAutoProtection();
    await act(async () => result.current.setAuto(false));
    expect(result.current.error).toBe("Couldn't switch to manual protection (module gone). Try again.");
    expect(result.current.isAuto).toBe(true);
    expect(result.current.isSwitching).toBe(false);
  });

  test('a snapshot that fails leaves the summary at its defaults and reports it', async () => {
    jest.spyOn(nativeMock(), 'getSnapshot').mockRejectedValueOnce(new Error('not ready'));
    const { result } = renderHook(() => useAutoProtection());
    await waitFor(() => expect(result.current.error).toBe("Couldn't read protection (not ready)."));
    expect(result.current).toMatchObject({ hearing: null, isAuto: true, roomText: '—' });
  });

  test('stops listening on unmount', async () => {
    const { result, unmount } = await renderAutoProtection();
    const before = result.current;
    unmount();
    nativeMock().emit('onHearing', { roomDb: 110, dosePercent: 90, mode: 'manual' });
    expect(result.current).toBe(before);
  });
});

afterEach(() => jest.restoreAllMocks());
