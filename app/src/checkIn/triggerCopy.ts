import type { CheckInTrigger, TriggerKind } from '../../modules/raveguard-native';
import { describeTrigger } from '../session/describe';
import type { IconName } from '../ui';

// What started the check-in, as the Check-in screen shows it: a label on whisper, a card with
// the detector's reason on loud. The words come from describeTrigger (shared), so they never
// claim a diagnosis (brief rule 2).

/** The label when the phase carries no trigger (for a moment, or from an older module). */
export const NO_TRIGGER_LABEL = 'Check-in';

export interface TriggerCopy {
  title: string;
  /** The detector's reason ("Spike 3.1 g, …"), or null when it has nothing to add. */
  detail: string | null;
  icon: IconName;
}

const TRIGGER_ICONS: Record<TriggerKind, IconName> = {
  scheduled: 'clock',
  fall: 'warning',
  stillness: 'warning',
  manual: 'info',
};

export function triggerCopy(trigger: CheckInTrigger | null | undefined): TriggerCopy | null {
  const described = describeTrigger(trigger);
  if (!trigger || described === null) return null;
  const { title, detail } = described;
  // Swift's scheduled reason is "scheduled check-in": the same words as the title.
  const isRepeat = detail.toLocaleLowerCase() === title.toLocaleLowerCase();
  return {
    title,
    detail: detail === '' || isRepeat ? null : detail,
    icon: TRIGGER_ICONS[trigger.kind] ?? TRIGGER_ICONS.manual,
  };
}
