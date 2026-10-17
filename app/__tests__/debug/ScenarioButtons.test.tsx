import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ScenarioButtons } from '../../src/debug/ScenarioButtons';
import { DEFAULT_SCENARIO_NAMES, SCENARIOS, scenarioHint, scenarioLabel, scenarioSummary } from '../../src/debug/scenarios';

const NAMES = { first: 'Maya', second: 'Theo' };

function renderButtons(blockedReason: string | null = null, onFire = jest.fn()) {
  render(<ScenarioButtons onFire={onFire} blockedReason={blockedReason} names={NAMES} />);
  return onFire;
}

describe('ScenarioButtons', () => {
  test('shows one row per scenario, labelled with its PRD name', () => {
    renderButtons();
    expect(screen.getAllByRole('button')).toHaveLength(7);
    SCENARIOS.forEach((s) => expect(screen.getByRole('button', { name: scenarioLabel(s) })).toBeTruthy());
  });

  test('each row shows the mockup title and subline', () => {
    renderButtons();
    SCENARIOS.forEach((s) => {
      expect(screen.getByText(s.name)).toBeTruthy();
      expect(screen.getByText(scenarioSummary(s, NAMES))).toBeTruthy();
    });
    expect(screen.getByText('Maya never answers, Theo is texted')).toBeTruthy();
  });

  test('without saved recipients the sublines say Contact 1 and Contact 2', () => {
    render(<ScenarioButtons onFire={jest.fn()} blockedReason={null} names={DEFAULT_SCENARIO_NAMES} />);
    expect(screen.getByText('Contact 2 gets no location, short brief')).toBeTruthy();
  });

  test.each(SCENARIOS.map((s) => [s.number, scenarioLabel(s)] as const))(
    'row %i (%s) fires its scenario',
    (scenario, label) => {
      const onFire = renderButtons();
      fireEvent.press(screen.getByRole('button', { name: label }));
      expect(onFire).toHaveBeenCalledTimes(1);
      expect(onFire).toHaveBeenCalledWith(scenario);
    }
  );

  test('each row tells VoiceOver the trigger and what to do once it fires', () => {
    renderButtons();
    const duress = screen.getByRole('button', { name: 'Scenario 3: Duress' });
    expect(duress.props.accessibilityHint).toBe(scenarioHint(SCENARIOS[2]));
    expect(duress.props.accessibilityHint).toContain(SCENARIOS[2].next);
  });

  test('says which trigger each scenario fires', () => {
    renderButtons();
    const hints = screen.getAllByRole('button').map((b) => b.props.accessibilityHint as string);
    expect(hints.filter((h) => h.startsWith('Fall.'))).toHaveLength(3);
    expect(hints.filter((h) => h.startsWith('Manual trigger.'))).toHaveLength(4);
  });

  test('every row is at least 44 pt tall', () => {
    renderButtons();
    screen.getAllByRole('button').forEach((button) => {
      expect(StyleSheet.flatten(button.props.style).minHeight).toBeGreaterThanOrEqual(44);
    });
  });

  test('while blocked, every row is off and the reason shows', () => {
    const onFire = renderButtons('Answer the open check-in first.');
    expect(screen.getByText('Answer the open check-in first.')).toBeTruthy();
    screen.getAllByRole('button').forEach((button) => {
      expect(button.props.accessibilityState).toMatchObject({ disabled: true });
      fireEvent.press(button);
    });
    expect(onFire).not.toHaveBeenCalled();
  });
});
