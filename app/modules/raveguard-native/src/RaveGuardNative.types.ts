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
/** What started a check-in: Swift's `TriggerKind` (Contracts.swift). */
export type TriggerKind = 'scheduled' | 'fall' | 'stillness' | 'manual';

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
  /**
   * Where friends should look for the wearer ("left of the main stage, by the bar"); goes in
   * the alert. Empty when not set; at most 120 characters (MAX_MEETING_SPOT_LENGTH).
   */
  meetingSpot: string;
}

/** What started the open check-in, as Swift's session recorded it. */
export interface CheckInTrigger {
  kind: TriggerKind;
  /** The detector's reason, e.g. "spike 3.1 g, head 70° sideways, still 12 s" or "scheduled check-in". */
  reason: string;
  /** Epoch ms. */
  at: number;
}

export interface PhaseEvent {
  phase: SessionPhaseName;
  stage: CheckInStage | null;
  stageEndsAt: number | null;
  escalationId: string | null;
  /**
   * What started the check-in, while one is open and through its escalation and SOS
   * (`checkIn`, `escalated`, `sos`); null while `idle` or `monitoring`. After a duress PIN it
   * is null, exactly as after a safe one.
   */
  trigger: CheckInTrigger | null;
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

/** Whether the AirPods' head motion is connected, from the session's motion source. */
export interface AirPodsEvent {
  connected: boolean;
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
  /**
   * Whether the AirPods' head motion is connected; null until the motion source has said (it
   * reports once a session starts). Changes arrive as `onAirPods`.
   */
  airPodsConnected: boolean | null;
}

export type RaveGuardEvents = {
  onPhase: (event: PhaseEvent) => void;
  onMotion: (event: MotionEvent) => void;
  onEscalation: (event: EscalationEvent) => void;
  onNoise: (event: NoiseEvent) => void;
  onHearing: (event: HearingEvent) => void;
  onAirPods: (event: AirPodsEvent) => void;
};

export type RaveGuardEventName = keyof RaveGuardEvents;
