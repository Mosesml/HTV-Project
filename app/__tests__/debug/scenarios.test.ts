import {
  canFireScenario,
  configuresBeforeFiring,
  firedNotice,
  SCENARIOS,
  scenarioLabel,
} from '../../src/debug/scenarios';
import { PHASES } from '../../test-utils/nativeMock';

// The PRD's acceptance table, "Acceptance: the seven scenarios".
const PRD_NAMES = [
  'Safe',
  'No response',
  'Duress',
  'Connectivity failure',
  'Unacknowledged',
  'False alarm',
  'Privacy',
];

describe('the seven debug scenarios', () => {
  test('are numbered 1 to 7 with the PRD names, in order', () => {
    expect(SCENARIOS.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(SCENARIOS.map((s) => s.name)).toEqual(PRD_NAMES);
  });

  test('mirror the trigger Swift fires: a fall for 2, 5 and 7, a manual trigger otherwise', () => {
    const falls = SCENARIOS.filter((s) => s.trigger === 'fall').map((s) => s.number);
    expect(falls).toEqual([2, 5, 7]);
  });

  test('each says what to do once it fires', () => {
    SCENARIOS.forEach((s) => expect(s.next.length).toBeGreaterThan(10));
    expect(SCENARIOS[2].next).toMatch(/duress PIN/);
    expect(SCENARIOS[3].next).toMatch(/offline/i);
  });

  test('labels carry the number and the name', () => {
    expect(scenarioLabel(SCENARIOS[0])).toBe('Scenario 1: Safe');
    expect(scenarioLabel(SCENARIOS[6])).toBe('Scenario 7: Privacy');
  });

  test('the fired notice names the scenario and the next step', () => {
    expect(firedNotice(SCENARIOS[1])).toBe(`Scenario 2 (No response) fired. ${SCENARIOS[1].next}`);
  });
});

describe('when a scenario can fire', () => {
  test('while idle, monitoring, or before the first phase arrives', () => {
    expect(canFireScenario(null)).toBe(true);
    expect(canFireScenario(PHASES.idle)).toBe(true);
    expect(canFireScenario(PHASES.monitoring)).toBe(true);
  });

  test('not while a check-in or alert is open, because Swift ignores the trigger then', () => {
    [PHASES.whisper, PHASES.loud, PHASES.pinGate, PHASES.escalated, PHASES.sos].forEach((phase) =>
      expect(canFireScenario(phase)).toBe(false)
    );
  });

  test('from idle the saved settings are sent first; while monitoring they are not', () => {
    expect(configuresBeforeFiring(null)).toBe(true);
    expect(configuresBeforeFiring(PHASES.idle)).toBe(true);
    expect(configuresBeforeFiring(PHASES.monitoring)).toBe(false);
  });
});
