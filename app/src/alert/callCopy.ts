import type { CallTarget } from './teammateCall';

// What Alert's and SOS's "Call for help" say. Calling only ever rings the teammate's number in
// demo mode (teammateCall.ts), and the copy never names an emergency number: it says "never
// emergency services" instead (docs/design/README.md, rule 4).

export const CALL_LABEL = 'Call for help';

/** The second line on Alert's coral button (the mockup's "Demo: calls a teammate"). */
export function alertCallCaption(target: CallTarget): string {
  switch (target.kind) {
    case 'ready':
      return 'Demo: calls a teammate';
    case 'notDemo':
      return 'Off outside demo mode';
    case 'noNumber':
      return 'No teammate number yet';
  }
}

/** The line under SOS's round button. */
export const SOS_CALL_CAPTION = 'Demo mode: calls a teammate, never emergency services';

/** Why Call is off, shown under the button; null when it can ring the teammate. */
export function callNote(target: CallTarget): string | null {
  switch (target.kind) {
    case 'ready':
      return null;
    case 'notDemo':
      return 'Calling is only on in demo mode. RaveGuard never dials emergency services.';
    case 'noNumber':
      return "Add your teammate's number on the Debug screen to call from here.";
  }
}

/** What VoiceOver adds after "Call for help": who it rings. */
export function callHint(target: CallTarget): string | undefined {
  return target.kind === 'ready' ? `Rings your teammate's demo number, ${target.phone}. iOS asks before it dials.` : undefined;
}

/** Shown when iOS can't place the call (the Simulator, an iPad). */
export function callFailedText(phone: string): string {
  return `Couldn't start the call. Dial ${phone} yourself.`;
}
