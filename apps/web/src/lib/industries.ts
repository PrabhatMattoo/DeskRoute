/**
 * Each names a shape of business booked as a fixed-length appointment on a
 * calendar, which is the booking `domain/scheduling.ts` builds.
 */
export const INDUSTRIES = [
  'Hair and beauty',
  'Health and medical',
  'Dental',
  'Therapy and counselling',
  'Fitness and wellness',
  'Tutoring and lessons',
  'Pet services',
  'Professional services',
] as const

/** A picker sentinel. `agents.industry` reaches the system prompt verbatim. */
export const OTHER = 'Something else'

/** True when the stored value came from the free-text box rather than the list. */
export function isCustomIndustry(value: string): boolean {
  return (
    value.trim().length > 0 && !INDUSTRIES.includes(value as (typeof INDUSTRIES)[number])
  )
}
