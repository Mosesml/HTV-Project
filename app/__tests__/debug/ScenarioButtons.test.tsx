import { fireEvent, render, screen } from '@testing-library/react-native';

import { ScenarioButtons } from '../../src/debug/ScenarioButtons';
import { SCENARIOS, scenarioLabel } from '../../src/debug/scenarios';

describe('ScenarioButtons', () => {
  test('shows one button per scenario, labelled with its PRD name', () => {
    render(<ScenarioButtons onFire={jest.fn()} blockedReason={null} />);
    expect(screen.getAllByRole('button')).toHaveLength(7);
    SCENARIOS.forEach((s) => expect(screen.getByRole('button', { name: scenarioLabel(s) })).toBeTruthy());
  });

  test.each(SCENARIOS.map((s) => [s.number, scenarioLabel(s)] as const))(
    'button %i fires scenario %i',
    (scenario, label) => {
      const onFire = jest.fn();
      render(<ScenarioButtons onFire={onFire} blockedReason={null} />);
      fireEvent.press(screen.getByRole('button', { name: label }));
      expect(onFire).toHaveBeenCalledTimes(1);
      expect(onFire).toHaveBeenCalledWith(scenario);
    }
  );

  test('each button tells VoiceOver what to do once it fires', () => {
    render(<ScenarioButtons onFire={jest.fn()} blockedReason={null} />);
    const duress = screen.getByRole('button', { name: 'Scenario 3: Duress' });
    expect(duress.props.accessibilityHint).toBe(SCENARIOS[2].next);
  });

  test('says which trigger each scenario fires', () => {
    render(<ScenarioButtons onFire={jest.fn()} blockedReason={null} />);
    expect(screen.getAllByText(/^Fall\./)).toHaveLength(3);
    expect(screen.getAllByText(/^Manual trigger\./)).toHaveLength(4);
  });

  test('while blocked, every button is off and the reason shows', () => {
    const onFire = jest.fn();
    render(<ScenarioButtons onFire={onFire} blockedReason="Answer the open check-in first." />);
    expect(screen.getByText('Answer the open check-in first.')).toBeTruthy();
    screen.getAllByRole('button').forEach((button) => {
      expect(button.props.accessibilityState).toMatchObject({ disabled: true });
      fireEvent.press(button);
    });
    expect(onFire).not.toHaveBeenCalled();
  });
});
