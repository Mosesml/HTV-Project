import { fireEvent, render, screen } from '@testing-library/react-native';

import { NoiseBackendPicker } from '../../src/debug/NoiseBackendPicker';
import { OfflineSwitch } from '../../src/debug/OfflineSwitch';
import { TimingsControl } from '../../src/debug/TimingsControl';
import { DEMO_TIMINGS, REAL_TIMINGS, secondsToSos, TIMING_OPTIONS } from '../../src/debug/timings';

const DEMO = /^Demo timings/;
const REAL = /^Real timings/;

function isChecked(name: RegExp | string): boolean {
  return screen.getByRole('radio', { name }).props.accessibilityState.checked;
}

describe('timings (mirrors Swift SessionTimings)', () => {
  test('demo reaches SOS 95 s after the check-in opens, real about 7 min', () => {
    expect(secondsToSos(DEMO_TIMINGS)).toBe(95);
    expect(secondsToSos(REAL_TIMINGS)).toBe(430);
  });

  test('the segments carry the mockup labels and say them in full to VoiceOver', () => {
    expect(TIMING_OPTIONS.map((o) => o.label)).toEqual(['Demo · 95 s to SOS', 'Real · 7 min']);
    expect(TIMING_OPTIONS.map((o) => o.accessibilityLabel)).toEqual([
      'Demo timings, 95 seconds to SOS',
      'Real timings, about 7 minutes to SOS',
    ]);
  });
});

describe('TimingsControl', () => {
  test('shows the saved flag and what the timings mean', () => {
    render(<TimingsControl isDemo onChange={jest.fn()} />);
    expect(isChecked(DEMO)).toBe(true);
    expect(isChecked(REAL)).toBe(false);
    expect(screen.getByText('Demo · 95 s to SOS')).toBeTruthy();
    expect(screen.getByText(/10 s stages/)).toBeTruthy();
  });

  test('real means real timings and scheduled check-ins', () => {
    render(<TimingsControl isDemo={false} onChange={jest.fn()} />);
    expect(isChecked(REAL)).toBe(true);
    expect(screen.getByText(/real timings/i)).toBeTruthy();
  });

  test('picking the other segment reports the new value', () => {
    const onChange = jest.fn();
    render(<TimingsControl isDemo onChange={onChange} />);
    fireEvent.press(screen.getByRole('radio', { name: REAL }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  test('is one radio group named Timings', () => {
    render(<TimingsControl isDemo onChange={jest.fn()} />);
    expect(screen.getByLabelText('Timings').props.accessibilityRole).toBe('radiogroup');
  });
});

describe('NoiseBackendPicker', () => {
  test('offers the background relay, explicit Shortcuts fallback and Off; the cut Linux bridge is left out', () => {
    render(<NoiseBackendPicker noise={null} onSelect={jest.fn()} />);
    expect(screen.getAllByRole('radio').map((r) => r.props.accessibilityLabel)).toEqual([
      'Background relay',
      'Shortcuts',
      'Off',
    ]);
    expect(screen.getByLabelText('Noise control').props.accessibilityRole).toBe('radiogroup');
  });

  test('marks the backend Swift reports, and whether it is connected', () => {
    render(<NoiseBackendPicker noise={{ backend: 'shortcuts', connected: true, level: 40 }} onSelect={jest.fn()} />);
    expect(isChecked('Shortcuts')).toBe(true);
    expect(isChecked('Off')).toBe(false);
    expect(screen.getByText('Backend: shortcuts · connected')).toBeTruthy();
  });

  test('says when Swift has not reported a backend yet (Off marked)', () => {
    render(<NoiseBackendPicker noise={null} onSelect={jest.fn()} />);
    expect(screen.getByText('Backend: not reported yet')).toBeTruthy();
    expect(isChecked('Off')).toBe(true);
  });

  test('picking one reports it', () => {
    const onSelect = jest.fn();
    render(<NoiseBackendPicker noise={{ backend: 'off', connected: false, level: 0 }} onSelect={onSelect} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Shortcuts' }));
    expect(onSelect.mock.calls).toEqual([['shortcuts']]);
  });

  test('relay selection is explicit and explains its setup requirement', () => {
    const onSelect = jest.fn();
    const { rerender } = render(<NoiseBackendPicker noise={null} onSelect={onSelect} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Background relay' }));
    expect(onSelect).toHaveBeenCalledWith('automation');
    rerender(<NoiseBackendPicker noise={{ backend: 'automation', connected: false, level: 80 }} onSelect={onSelect} />);
    expect(screen.getByText(/Requires the RG Noise Relay automation/)).toBeTruthy();
    expect(screen.getByText('Backend: automation · not connected')).toBeTruthy();
  });
});

describe('OfflineSwitch', () => {
  test('shows the state Swift reports, with the mockup copy', () => {
    render(<OfflineSwitch isOffline onChange={jest.fn()} />);
    const toggle = screen.getByRole('switch', { name: 'Simulate offline' });
    expect(toggle.props.accessibilityState).toMatchObject({ checked: true });
    expect(toggle.props.accessibilityHint).toMatch(/every server call fails/i);
    // The row's words are drawn for sighted users; the switch says them to VoiceOver.
    expect(screen.getByText('Backup if airplane mode fails on stage', { includeHiddenElements: true })).toBeTruthy();
    expect(toggle.props.accessibilityHint).toMatch(/^Backup if airplane mode fails on stage\./);
  });

  test('is off until Swift has reported', () => {
    render(<OfflineSwitch isOffline={null} onChange={jest.fn()} />);
    expect(screen.getByRole('switch', { name: 'Simulate offline' }).props.accessibilityState).toMatchObject({ checked: false });
  });

  test('flipping it reports the new value', () => {
    const onChange = jest.fn();
    render(<OfflineSwitch isOffline={false} onChange={onChange} />);
    fireEvent.press(screen.getByRole('switch', { name: 'Simulate offline' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
