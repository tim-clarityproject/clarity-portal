// The evidence library's seed (031) keeps the words it first ran with, and
// migration 041 carries the 10 Nov renames. These check the two agree: what
// the generator puts back (asFirstSeeded) is exactly what 041 changes, so a
// database seeded by 031 and then given 041 reads as the register does, and
// no other register text is touched on the way.
//
//   node --test tests/scores/evidence-seed.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseRegister, asFirstSeeded, toolKey } from '../../scripts/make-evidence-seed.mjs';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const register = parseRegister(read('docs/claims-register.md'));
const seeded = asFirstSeeded(register);
const migration = read('supabase/migrations/041_confidence_bank_labels.sql');

// 041's own changes to "where it shows", in its order ("First check-in" first).
const shows041 = (text) => text
  .replaceAll('Performance Evidence', 'Confidence Bank')
  .replaceAll('First check-in', 'First review')
  .replaceAll('Check-in', 'Monthly review')
  .replaceAll('Plan my day', 'Daily plan')
  .replaceAll('Review my day', 'Daily review');
// 041's own changes to a tool's name, by key.
const TOOL_NAMES_041 = {
  performance_evidence: ['Performance Evidence', 'Confidence Bank'],
  plan_my_day: ['Plan my day', 'Daily plan'],
  review_my_day: ['Review my day', 'Daily review'],
  hardware_and_software_check_in: ['Hardware and Software check-in', 'Monthly Hardware and Software review'],
};

test('041 holds the replacements these checks copy, in the same order', () => {
  const at = (words) => migration.indexOf(words);
  const order = ["'First check-in', 'First review'", "'Check-in', 'Monthly review'", "'Plan my day', 'Daily plan'", "'Review my day', 'Daily review'"].map(at);
  assert.ok(order.every((i) => i > 0), 'each replacement is in 041');
  assert.deepEqual([...order].sort((a, b) => a - b), order, '"First check-in" is replaced before "Check-in"');
  assert.ok(at("replace(where_it_shows, 'Performance Evidence', 'Confidence Bank')") > 0);
  for (const [key, [then, now]] of Object.entries(TOOL_NAMES_041)) {
    assert.match(migration, new RegExp(`set name = '${now}'\\s+where key = '${key}' and name = '${then}'`), key);
  }
});

test('where a claim shows: 031’s words, changed by 041, are the register’s words', () => {
  for (const [i, claim] of seeded.claims.entries()) {
    assert.equal(shows041(claim.whereItShows), register.claims[i].whereItShows, claim.id);
    // Nothing but "where it shows" is put back to older words.
    assert.equal(claim.wording, register.claims[i].wording, claim.id);
    assert.equal(claim.caveat, register.claims[i].caveat, claim.id);
  }
});

test('where a claim shows: 041 run a second time changes nothing, and never makes "First Monthly review"', () => {
  for (const claim of seeded.claims) {
    const once = shows041(claim.whereItShows);
    assert.equal(shows041(once), once, claim.id);
    assert.doesNotMatch(once, /First Monthly review|check-in|Plan my day|Review my day|Performance Evidence/i, claim.id);
  }
});

test('a tool’s name: only the four tools 041 renames differ from the register, under the keys 041 looks for', () => {
  const changed = [];
  for (const [i, tool] of seeded.tools.entries()) {
    const now = register.tools[i];
    assert.equal(tool.basedOn, now.basedOn, now.name);
    if (tool.name === now.name) continue;
    const key = toolKey(tool.name);
    changed.push(key);
    assert.deepEqual([tool.name, now.name], TOOL_NAMES_041[key], key);
  }
  assert.deepEqual(changed.sort(), Object.keys(TOOL_NAMES_041).sort());
});
