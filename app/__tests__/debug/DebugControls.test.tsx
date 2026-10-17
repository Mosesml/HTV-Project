import { fireEvent, render, screen } from '@testing-library/react-native';

import { DemoToggle } from '../../src/debug/DemoToggle';
import { NoiseBackendPicker } from '../../src/debug/NoiseBackendPicker';
import { OfflineSwitch } from '../../src/debug/OfflineSwitch';

describe('DemoToggle', () => {
  test('shows the saved flag and what the timings mean', () => {
    render(<DemoToggle isDemo onChange={jest.fn()} />);
    expect(screen.getByLabelText('Demo timings').props.value).toBe(true);
    expect(screen.getByText(/10 s stages/)).toBeTruthy();
  });

  test('off means real timings and scheduled check-ins', () => {
    render(<DemoToggle isDemo={false} onChange={jest.fn()} />);
    expect(screen.getByLabelText('Demo timings').props.value).toBe(false);
    expect(screen.getByText(/real timings/i)).toBeTruthy();
  });

  test('flipping it reports the new value', () => {
    const onChange = jest.fn();
    render(<DemoToggle isDemo onChange={onChange} />);
    fireEvent(screen.getByLabelText('Demo timings'), 'valueChange', false);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe('NoiseBackendPicker', () => {
  test('offers the background relay, explicit Shortcuts fallback and Off', () => {
    render(<NoiseBackendPicker noise={null} onSelect={jest.fn()} />);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Background relay' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Shortcuts' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Off' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: /bridge/i })).toBeNull();
  });

  test('marks the backend Swift reports, and whether it is connected', () => {
    render(<NoiseBackendPicker noise={{ backend: 'shortcuts', connected: true, level: 40 }} onSelect={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'Shortcuts' }).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByRole('radio', { name: 'Off' }).props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByText('Backend: shortcuts · connected')).toBeTruthy();
  });

  test('says when Swift has not reported a backend yet', () => {
    render(<NoiseBackendPicker noise={null} onSelect={jest.fn()} />);
    expect(screen.getByText('Backend: not reported yet')).toBeTruthy();
  });

  test('picking one reports it', () => {
    const onSelect = jest.fn();
    render(<NoiseBackendPicker noise={{ backend: 'off', connected: false, level: 0 }} onSelect={onSelect} />);
    fireEvent.press(screen.getByRole('radio', { name: 'Shortcuts' }));
    expect(onSelect).toHaveBeenCalledWith('shortcuts');
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
  test('shows the state Swift reports', () => {
    render(<OfflineSwitch isOffline onChange={jest.fn()} />);
    expect(screen.getByLabelText('Simulate offline').props.value).toBe(true);
    expect(screen.getByText(/every server call fails/i)).toBeTruthy();
  });

  test('is off until Swift has reported', () => {
    render(<OfflineSwitch isOffline={null} onChange={jest.fn()} />);
    expect(screen.getByLabelText('Simulate offline').props.value).toBe(false);
  });

  test('flipping it reports the new value', () => {
    const onChange = jest.fn();
    render(<OfflineSwitch isOffline={false} onChange={onChange} />);
    fireEvent(screen.getByLabelText('Simulate offline'), 'valueChange', true);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
