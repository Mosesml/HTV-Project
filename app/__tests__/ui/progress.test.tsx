import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { CountdownRing } from '../../src/ui/CountdownRing';
import { ProgressBar } from '../../src/ui/ProgressBar';
import { Ring } from '../../src/ui/Ring';
import { StageBar, stageState } from '../../src/ui/StageBar';
import { StepProgress } from '../../src/ui/StepProgress';
import { PALETTE, STAGE_BAR_COLORS, STAGE_COLORS } from '../../src/ui/theme';

describe('StepProgress', () => {
  test('"Step 2 of 4" with two lit bars, as one progress bar', () => {
    render(<StepProgress step={2} />);
    expect(screen.getByText('Step 2 of 4')).toBeTruthy();
    expect(screen.getAllByTestId('step-bar-lit')).toHaveLength(2);
    expect(screen.getAllByTestId('step-bar-unlit')).toHaveLength(2);
    const bar = screen.getByRole('progressbar', { name: 'Setup progress' });
    expect(bar.props.accessibilityValue).toEqual({ min: 1, max: 4, now: 2, text: 'Step 2 of 4' });
  });

  test('keeps the step in range', () => {
    render(<StepProgress step={9} />);
    expect(screen.getByText('Step 4 of 4')).toBeTruthy();
  });
});

describe('StageBar', () => {
  test('stage states: behind is done, current is active, ahead is inactive', () => {
    expect(stageState('whisper', 'loud')).toBe('done');
    expect(stageState('loud', 'loud')).toBe('active');
    expect(stageState('pinGate', 'loud')).toBe('inactive');
    expect(stageState('whisper', null)).toBe('inactive');
  });

  test('the loud stage: whisper done, Louder in amber, PIN off', () => {
    render(<StageBar stage="loud" />);
    expect(screen.getByLabelText('Step 2 of 3: Louder')).toBeTruthy();
    expect(screen.getByTestId('stage-whisper-done')).toBeTruthy();
    expect(screen.getByTestId('stage-loud-active')).toBeTruthy();
    expect(screen.getByTestId('stage-pinGate-inactive')).toBeTruthy();
    const louder = screen.getByText('Louder');
    expect(StyleSheet.flatten(louder.props.style).color).toBe(STAGE_COLORS.loud);
    expect(StyleSheet.flatten(screen.getByText('PIN').props.style).color).toBe(STAGE_BAR_COLORS.inactiveLabel);
  });

  test('the PIN gate is coral', () => {
    render(<StageBar stage="pinGate" />);
    expect(screen.getByLabelText('Step 3 of 3: PIN')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByText('PIN').props.style).color).toBe(PALETTE.coral);
  });
});

describe('CountdownRing', () => {
  test('is one progress bar whose value is "N seconds left"', () => {
    render(<CountdownRing secondsLeft={14} fraction={0.7} color={STAGE_COLORS.whisper} />);
    const ring = screen.getByRole('progressbar', { name: 'Time left to answer' });
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 70, text: '14 seconds left' });
    expect(screen.getByText('14')).toBeTruthy();
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  test('says "1 second left"', () => {
    render(<CountdownRing secondsLeft={1} fraction={0.05} color={STAGE_COLORS.loud} />);
    expect(screen.getByRole('progressbar').props.accessibilityValue.text).toBe('1 second left');
    expect(screen.getByText('second')).toBeTruthy();
  });

  test('before the end time is known it shows a dash', () => {
    render(<CountdownRing secondsLeft={null} fraction={1} color={STAGE_COLORS.whisper} />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByRole('progressbar').props.accessibilityValue.text).toBe('Waiting for the timer');
  });

  test('is 240 pt for every stage', () => {
    render(<CountdownRing secondsLeft={6} fraction={0.3} color={STAGE_COLORS.loud} />);
    expect(StyleSheet.flatten(screen.getByTestId('countdown-ring').props.style)).toMatchObject({ width: 240, height: 240 });
  });
});

describe('Ring', () => {
  test('draws no arc at zero and clamps out-of-range fractions', () => {
    const { rerender } = render(<Ring size={88} strokeWidth={8} fraction={0} color={PALETTE.lavender} testID="ring" />);
    expect(screen.queryByTestId('ring-arc', { includeHiddenElements: true })).toBeNull();
    rerender(<Ring size={88} strokeWidth={8} fraction={2} color={PALETTE.lavender} testID="ring" />);
    expect(screen.getByTestId('ring-arc', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('ProgressBar', () => {
  test('reads as a percentage', () => {
    render(<ProgressBar fraction={0.46} accessibilityLabel="Tonight's dose" />);
    const bar = screen.getByRole('progressbar', { name: "Tonight's dose" });
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 46, text: '46 percent' });
    expect(StyleSheet.flatten(screen.getByTestId('progress-fill').props.style).width).toBe('46%');
  });

  test('a null reading is empty and says so', () => {
    render(<ProgressBar fraction={null} accessibilityLabel="Tonight's dose" />);
    expect(screen.getByRole('progressbar').props.accessibilityValue).toMatchObject({ text: 'no reading yet' });
    expect(StyleSheet.flatten(screen.getByTestId('progress-fill').props.style).width).toBe('0%');
  });

  test('takes its own value text', () => {
    render(<ProgressBar fraction={0.6} valueText="9 of 15 seconds left" accessibilityLabel="Time to enter your PIN" height={6} color={PALETTE.coral} />);
    expect(screen.getByRole('progressbar').props.accessibilityValue.text).toBe('9 of 15 seconds left');
  });
});
