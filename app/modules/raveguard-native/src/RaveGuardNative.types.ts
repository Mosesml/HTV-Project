// The seam between React Native and Swift (WORK_ORDER.md, "The seam"). Changing anything
// here is a CONTRACT change: it needs a yes from every owner listed in the seam table.
// Times are epoch milliseconds, matching the Swift `modulePayload` encoders.

export type MotionState = 'dancing' | 'walking' | 'still' | 'fallen' | 'unknown';
export type CheckInStage = 'whisper' | 'loud' | 'pinGate';
export type SessionPhaseName = 'idle' | 'monitoring' | 'checkIn' | 'escalated' | 'sos';
export type RecipientKind = 'contact' | 'venueStaff';
export type PinResultKind = 'safe' | 'duress' | 'wrong';
export type NoiseBackend = 'bridge' | 'shortcuts' | 'off';
export type EscalationState = 'pending' | 'notifying' | 'acknowledged' | 'resolved' | 'cancelled';

export interface RecipientPermissions {
  receiveAlerts: boolean;
  seeLocation: boolean;
  seeFullBrief: boolean;
  canResolve: boolean;
}

export interface Recipient {
  /** UUID string. */
  id: string;
  name: string;
  /** E.164, e.g. "+14165550123". */
  phoneE164: string;
  kind: RecipientKind;
  /** 1 = texted first. */
  order: number;
  permissions: RecipientPermissions;
}

/** What `configure(settings)` sends down. Settings storage itself lives in React Native (K4). */
export interface Settings {
  wearerName: string;
  selfDescription: string;
  recipients: Recipient[];
  intervalMin: 30 | 60;
  /** In-ear loudness target in dB, 0–120. */
  loudnessTarget: number;
  demo: boolean;
  /** E.164. The only number the demo SOS screen may dial. */
  teammatePhone: string | null;
  /** Linux bridge base URL, e.g. "http://192.168.1.20:8080". */
  bridgeUrl: string | null;
}

export interface PhaseEvent {
  phase: SessionPhaseName;
  stage: CheckInStage | null;
  stageEndsAt: number | null;
  escalationId: string | null;
}

export interface MotionEvent {
  state: MotionState;
  pitch: number;
  roll: number;
  accelG: number;
  at: number;
}

export interface RecipientStatus {
  name: string;
  kind: RecipientKind;
  notifiedAt: number | null;
  ackedAt: number | null;
}

export interface EscalationEvent {
  state: EscalationState;
  recipients: RecipientStatus[];
  sosOpen: boolean;
}

export interface NoiseEvent {
  backend: NoiseBackend;
  connected: boolean;
  level: number;
}

/** Both null until automatic protection (backlog BL1) lands. */
export interface HearingEvent {
  roomDb: number | null;
  dosePercent: number | null;
}

/** Current state, for a screen that mounts late or the app coming back from a locked phone. */
export interface Snapshot {
  phase: PhaseEvent;
  /** Null when there is no visible escalation. Never shows a duress escalation. */
  escalation: EscalationEvent | null;
  noise: NoiseEvent;
  hearing: HearingEvent;
  /**
   * When the next scheduled check-in is due, while monitoring (K8). Null otherwise, and always
   * null in demo mode, where check-ins come from the Debug panel. Not sent with `onPhase`:
   * re-read the snapshot when the phase becomes `monitoring`.
   */
  nextCheckInAt: number | null;
  /**
   * The Debug panel's "simulate offline" (K11): true after `debugSetOffline(true)` or once
   * scenario 4 has registered its escalation; `stopSession()` turns it off. Not sent as an
   * event: re-read the snapshot when the phase changes.
   */
  simulatedOffline: boolean;
}

export type RaveGuardEvents = {
  onPhase: (event: PhaseEvent) => void;
  onMotion: (event: MotionEvent) => void;
  onEscalation: (event: EscalationEvent) => void;
  onNoise: (event: NoiseEvent) => void;
  onHearing: (event: HearingEvent) => void;
};

export type RaveGuardEventName = keyof RaveGuardEvents;
