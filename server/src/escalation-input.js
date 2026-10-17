import { z } from 'zod';
const date = z.iso.datetime({ offset: true });
const finite = z.number().finite();
const optionalDate = date.nullish();
export const factsInput = z.strictObject({
  wearerName: z.string().trim().min(1).max(100), selfDescription: z.string().max(500),
  lastActiveState: z.enum(['dancing', 'walking', 'still', 'fallen', 'unknown']), lastActiveUntil: optionalDate,
  trigger: z.strictObject({ kind: z.enum(['fall', 'stillness', 'scheduled', 'manual']), at: date,
    reason: z.string().min(1).max(1000),
    posture: z.strictObject({ pitchDeg: finite, rollDeg: finite }).nullish() }),
  promptsUnanswered: z.number().int().min(0).max(1000),
  location: z.strictObject({ lat: finite.min(-90).max(90), lon: finite.min(-180).max(180),
    accuracyM: finite.min(0), at: date }).nullish()
});
export const registerInput = z.strictObject({ deadline: date, facts: factsInput });
export const updateInput = z.strictObject({ facts: factsInput });
export const cancelInput = z.strictObject({ mode: z.enum(['safe', 'duress']) });
export const fireInput = z.strictObject({ reason: z.string().trim().min(1).max(1000) });
