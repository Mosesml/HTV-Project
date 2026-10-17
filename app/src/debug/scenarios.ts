import type { PhaseEvent } from '../../modules/raveguard-native';

// The seven acceptance scenarios (PRD "Acceptance: the seven scenarios"), as the Debug panel
// fires them with debugFire(n) (K11, PRD D11, UI-6). `trigger` mirrors what Swift's
// SessionManager.debugFire injects: a fall for 2, 5 and 7, a manual trigger otherwise.
// `next` is what the person running the demo does once the check-in opens.

export type ScenarioNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type ScenarioTrigger = 'fall' | 'manual';

export interface Scenario {
  number: ScenarioNumber;
  name: string;
  trigger: ScenarioTrigger;
  next: string;
}

export const SCENARIOS: readonly Scenario[] = [
  { number: 1, name: 'Safe', trigger: 'manual', next: 'Nod, or tap Cancel, while the check-in asks.' },
  {
    number: 2,
    name: 'No response',
    trigger: 'fall',
    next: 'Ignore every prompt and the PIN gate; Contact 1 is texted at the deadline.',
  },
  {
    number: 3,
    name: 'Duress',
    trigger: 'manual',
    next: 'At the PIN gate, enter the duress PIN. The screen looks exactly like a safe cancel.',
  },
  {
    number: 4,
    name: 'Connectivity failure',
    trigger: 'manual',
    next: 'The phone goes offline once the alert is registered; the server still fires. Stop the session to come back online.',
  },
  {
    number: 5,
    name: 'Unacknowledged',
    trigger: 'fall',
    next: 'Ignore everything and let nobody acknowledge: Contact 2, then venue staff, then SOS.',
  },
  {
    number: 6,
    name: 'False alarm',
    trigger: 'manual',
    next: "Let it reach Contact 1, then Mark resolved on their page, or cancel with your PIN.",
  },
  {
    number: 7,
    name: 'Privacy',
    trigger: 'fall',
    next: 'Let it run like scenario 5, then compare the pages: Contact 2 sees no location.',
  },
];

export const TRIGGER_LABELS: Record<ScenarioTrigger, string> = {
  fall: 'Fall',
  manual: 'Manual trigger',
};

/** Swift ignores a trigger while a check-in or alert is open. */
export const SCENARIO_BLOCKED = 'A check-in or alert is open. Answer it before firing another scenario.';

export function scenarioLabel(scenario: Scenario): string {
  return `Scenario ${scenario.number}: ${scenario.name}`;
}

export function firedNotice(scenario: Scenario): string {
  return `Scenario ${scenario.number} (${scenario.name}) fired. ${scenario.next}`;
}

/** Scenarios fire from idle (Swift starts the session) or while monitoring; before the first phase too. */
export function canFireScenario(phase: PhaseEvent | null): boolean {
  return phase === null || phase.phase === 'idle' || phase.phase === 'monitoring';
}

/**
 * From idle Swift starts the session with whatever it was last configured with, so the
 * panel sends the saved settings first, like Start session. Not while monitoring:
 * configure() then would reschedule the next check-in.
 */
export function configuresBeforeFiring(phase: PhaseEvent | null): boolean {
  return phase === null || phase.phase === 'idle';
}
