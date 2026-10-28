// Metric or US units (person_settings.units; M1 chrome "Metric or US"):
// an amount is always stored in the unit the habit was set up with, and
// only shown in the person's own units. Water set up in litres shows in
// US fluid ounces for someone who chose 'imperial', and what they type
// in fluid ounces is stored back in litres. Pure code, tested in
// tests/performance/units.test.mjs.

const FL_OZ_PER_LITRE = 33.814;

// Stored unit (lower case) to the unit shown in US units and how many
// of it make one stored unit.
const US = {
  litres: { unit: 'fl oz', per: FL_OZ_PER_LITRE, decimals: 0 },
  litre: { unit: 'fl oz', per: FL_OZ_PER_LITRE, decimals: 0 },
  l: { unit: 'fl oz', per: FL_OZ_PER_LITRE, decimals: 0 },
};

const conversion = (unit, units) => (units === 'imperial' ? US[(unit || '').trim().toLowerCase()] || null : null);

/** The unit someone sees for a stored unit: "fl oz" for litres in US units, else the unit itself. */
export function shownUnit(unit, units) {
  return conversion(unit, units)?.unit || unit || '';
}

/** A stored value as shown (rounded to what the shown unit uses), or null. */
export function toShown(value, unit, units) {
  if (value == null) return null;
  const c = conversion(unit, units);
  if (!c) return Number(value);
  const f = 10 ** c.decimals;
  return Math.round(Number(value) * c.per * f) / f;
}

/** A typed value in the shown unit, back to the stored unit, or null. */
export function toStored(value, unit, units) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return null;
  const c = conversion(unit, units);
  if (!c) return Number(value);
  // Kept to 4 decimal places of a litre: enough to give back what was typed.
  return Math.round((Number(value) / c.per) * 10000) / 10000;
}

/** Does this unit show differently in US units (so a typed decimal is allowed)? */
export function convertsInUs(unit) {
  return Boolean(US[(unit || '').trim().toLowerCase()]);
}
