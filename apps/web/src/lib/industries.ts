/**
 * Six buckets naming a shape of business rather than a trade. `OTHER` is a
 * picker sentinel: `agents.industry` reaches the system prompt verbatim.
 */
export const INDUSTRIES = [
  'Hair and beauty',
  'Health and medical',
  'Fitness and wellness',
  'Home and trade',
  'Professional services',
  'Pet services',
] as const

export const OTHER = 'Something else'

/** True when the stored value came from the free-text box rather than the list. */
export function isCustomIndustry(value: string): boolean {
  return (
    value.trim().length > 0 && !INDUSTRIES.includes(value as (typeof INDUSTRIES)[number])
  )
}
