import { fireEvent, render, screen } from '@testing-library/react-native';

import { ProtectionControl } from '../../src/activeSession/ProtectionControl';
import { PALETTE } from '../../src/ui';

function renderControl(props: Partial<Parameters<typeof ProtectionControl>[0]> = {}) {
  const onChange = jest.fn();
  render(<ProtectionControl level={55} sliderLevel={55} onChange={onChange} {...props} />);
  return { onChange, slider: screen.getByLabelText('Protection level') };
}

describe('ProtectionControl', () => {
  test('shows the reported level under the "Protection" label', () => {
    renderControl();
    expect(screen.getByLabelText('Protection level: 55')).toBeTruthy();
    expect(screen.getByText('Protection')).toBeTruthy();
    expect(screen.getByText('55')).toBeTruthy();
  });

  test('shows a dash before Swift reports a level', () => {
    renderControl({ level: null });
    expect(screen.getByLabelText('Protection level: —')).toBeTruthy();
  });

  test('labels the ends "Hear more" and "Filter more" (hidden from VoiceOver, the hint says it)', () => {
    const { slider } = renderControl();
    expect(screen.getByText('Hear more', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Filter more', { includeHiddenElements: true })).toBeTruthy();
    expect(slider.props.accessibilityHint).toBe(
      'Lower hears more, higher filters more. Adaptive below 70, Noise Cancellation from 70.'
    );
  });

  test('the thumb sits at sliderLevel, which may run ahead of the reported level', () => {
    const { slider } = renderControl({ level: 40, sliderLevel: 72 });
    expect(slider.props.value).toBe(72);
    expect(screen.getByLabelText('Protection level: 40')).toBeTruthy();
  });

  test('VoiceOver reads whole points, not a percentage', () => {
    const { slider } = renderControl();
    expect(slider.props.accessibilityUnits).toBe('points');
    expect(slider.props.accessibilityIncrements).toHaveLength(101);
    expect(slider.props.accessibilityIncrements[70]).toBe('70');
  });

  test('is a 0–100 slider in whole steps, lavender on the theme track, at least 44 pt tall', () => {
    const { slider } = renderControl();
    expect(slider.props).toMatchObject({
      minimumValue: 0,
      maximumValue: 100,
      step: 1,
      minimumTrackTintColor: PALETTE.lavender,
      maximumTrackTintColor: PALETTE.surface2,
      thumbTintColor: PALETTE.lavender,
    });
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
