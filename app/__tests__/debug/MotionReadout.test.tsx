import { act, render, screen } from '@testing-library/react-native';

import type { MotionEvent } from '../../modules/raveguard-native';
import { MotionReadout } from '../../src/debug/MotionReadout';
import { nativeMock } from '../../test-utils/nativeMock';

const READING: MotionEvent = { state: 'walking', pitch: 3.04, roll: -12.96, accelG: 0.98, at: 1_000 };

function emit(motion: MotionEvent) {
  act(() => nativeMock().emit('onMotion', motion));
}

beforeEach(() => nativeMock().reset());

describe('MotionReadout', () => {
  test('says there are no readouts before the first onMotion', () => {
    render(<MotionReadout />);
    expect(screen.getByText('no readouts yet (start a session)')).toBeTruthy();
  });

  test('shows state, pitch, roll and g from each onMotion', () => {
    render(<MotionReadout />);
    emit(READING);
    expect(screen.getByText('walking')).toBeTruthy();
    expect(screen.getByText('3.0°')).toBeTruthy();
    expect(screen.getByText('-13.0°')).toBeTruthy();
    expect(screen.getByText('0.98 g')).toBeTruthy();
  });

  test('follows the feed live: the newest reading replaces the last', () => {
    render(<MotionReadout />);
    emit(READING);
    emit({ state: 'fallen', pitch: 5, roll: 70, accelG: 3.1, at: 1_100 });
    expect(screen.getByText('fallen')).toBeTruthy();
    expect(screen.getByText('70.0°')).toBeTruthy();
    expect(screen.queryByText('walking')).toBeNull();
  });

  test('counts readouts, so a stalled feed is visible', () => {
    render(<MotionReadout />);
    emit(READING);
    emit({ ...READING, at: 1_100 });
    expect(screen.getByText('2 readouts')).toBeTruthy();
  });

  test('VoiceOver reads the readout as one line', () => {
    render(<MotionReadout />);
    emit(READING);
    expect(screen.getByLabelText('Motion: walking · pitch 3.0° · roll -13.0° · 0.98 g')).toBeTruthy();
  });

  test('stops listening when it unmounts', () => {
    const view = render(<MotionReadout />);
    view.unmount();
    expect(() => emit(READING)).not.toThrow();
  });
});
