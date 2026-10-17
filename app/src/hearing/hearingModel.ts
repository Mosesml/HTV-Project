import type { HearingEvent, ProtectionMode } from '../../modules/raveguard-native';
import { formatDose, formatRoomDb } from '../activeSession/readings';

// Automatic protection (backlog BL1) as text, for whichever screen shows it. Swift runs the
// level loop and the dose (it must keep going with the phone locked); this only describes
// what `onHearing` reports.

export type DoseBand = 'unknown' | 'ok' | 'high' | 'over';

/** Shares of the daily allowance (85 dB for 8 h) where the band changes. */
export const DOSE_HIGH_FROM = 50;
export const DOSE_OVER_FROM = 100;

const DOSE_BAND_TEXT: Record<DoseBand, string> = {
  unknown: 'No reading yet',
  ok: "Within today's allowance",
  high: "Over half of today's allowance",
  over: "Over today's allowance",
};

const MODE_TEXT: Record<ProtectionMode, { label: string; hint: string; spoken: string }> = {
  auto: { label: 'Automatic', hint: "RaveGuard sets protection from the room's loudness.", spoken: 'automatic' },
  manual: { label: 'Manual', hint: 'You set protection with the slider.', spoken: 'manual' },
};

export interface HearingSummary {
  mode: ProtectionMode;
  isAuto: boolean;
  modeLabel: string;
  modeHint: string;
  roomText: string;
  /** Always shown as an estimate (HRG-2). */
  doseText: string;
  doseBand: DoseBand;
  doseBandText: string;
  /** One sentence for VoiceOver. */
  accessibilityLabel: string;
}

export function doseBand(dosePercent: number | null): DoseBand {
  if (dosePercent === null || !Number.isFinite(dosePercent)) return 'unknown';
  if (dosePercent >= DOSE_OVER_FROM) return 'over';
  if (dosePercent >= DOSE_HIGH_FROM) return 'high';
  return 'ok';
}

/** `hearing` is null before the snapshot arrives; every session starts automatic. */
export function summarizeHearing(hearing: HearingEvent | null): HearingSummary {
  const mode = hearing?.mode ?? 'auto';
  const roomText = formatRoomDb(hearing?.roomDb ?? null);
  const doseText = formatDose(hearing?.dosePercent ?? null);
  const band = doseBand(hearing?.dosePercent ?? null);
  const text = MODE_TEXT[mode];
  return {
    mode,
    isAuto: mode === 'auto',
    modeLabel: text.label,
    modeHint: text.hint,
    roomText,
    doseText,
    doseBand: band,
    doseBandText: DOSE_BAND_TEXT[band],
    accessibilityLabel: `Protection ${text.spoken}. Room ${roomText}. Sound dose (estimate) ${doseText}.`,
  };
}
