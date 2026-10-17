import { fireEvent, render, screen } from '@testing-library/react-native';

import { ProtectionControl } from '../../src/activeSession/ProtectionControl';

function renderControl(props: Partial<Parameters<typeof ProtectionControl>[0]> = {}) {
  const onChange = jest.fn();
  render(
    <ProtectionControl
      level={55}
      modeLine="Adaptive · AirPods control off"
      sliderLevel={55}
      onChange={onChange}
      mode="auto"
      isSwitchingMode={false}
      onModeChange={jest.fn()}
      {...props}
    />
  );
  return { onChange, slider: screen.getByLabelText('Protection level') };
}

describe('ProtectionControl', () => {
  test('shows the reported level and the mode line', () => {
    renderControl();
    expect(screen.getByLabelText('Protection level: 55')).toBeTruthy();
    expect(screen.getByText('Adaptive · AirPods control off')).toBeTruthy();
  });

  test('shows a dash and no mode line before Swift reports a level', () => {
    renderControl({ level: null, modeLine: null });
    expect(screen.getByLabelText('Protection level: —')).toBeTruthy();
    expect(screen.queryByText(/AirPods/)).toBeNull();
  });

  test('the thumb sits at sliderLevel, which may run ahead of the reported level', () => {
    const { slider } = renderControl({ level: 40, sliderLevel: 72 });
    expect(slider.props.value).toBe(72);
    expect(screen.getByLabelText('Protection level: 40')).toBeTruthy();
  });

  test('VoiceOver reads whole points, not a percentage, with a hint about the modes', () => {
    const { slider } = renderControl();
    expect(slider.props.accessibilityUnits).toBe('points');
    expect(slider.props.accessibilityIncrements).toHaveLength(101);
    expect(slider.props.accessibilityIncrements[70]).toBe('70');
    expect(slider.props.accessibilityHint).toBe('Adaptive below 70, Noise Cancellation from 70.');
  });

  test('tapping the track jumps to that level', () => {
    const { slider } = renderControl();
    expect(slider.props.tapToSeek).toBe(true);
  });

  test('both a drag and a release report the value', () => {
    const { onChange, slider } = renderControl();
    fireEvent(slider, 'valueChange', 60);
    fireEvent(slider, 'slidingComplete', 61);
    expect(onChange.mock.calls).toEqual([[60], [61]]);
  });
});
