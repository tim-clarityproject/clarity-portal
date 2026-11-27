// Stage D item 3: the words that change by role and country (Draft 6's table).
import test from 'node:test';
import assert from 'node:assert/strict';
import { roleWords, roleWordsKey, withRoleWords, isUsRegion } from '../../src/lib/roleWords.js';

const Q = 'Who in [team] will own it? Ask [staff], tell [board], plan [year], outside [work], across your [organisation].';

test('business, UK', () => {
  assert.equal(roleWordsKey({ role: 'ceo_executive', country: 'GB' }), 'business_uk');
  assert.equal(withRoleWords(Q, { role: 'leader', country: 'GB' }),
    'Who in team will own it? Ask staff, tell board, plan this year, outside work, across your organisation.');
});

test('business, US', () => {
  assert.equal(withRoleWords(Q, { role: 'ceo_executive', country: 'US' }),
    'Who in team will own it? Ask people, tell board, plan this year, outside work, across your organization.');
});

test('sport, UK', () => {
  assert.equal(withRoleWords(Q, { role: 'head_coach', timeZone: 'Europe/London' }),
    'Who in squad will own it? Ask staff, tell board or owners, plan this season, outside the game, across your club.');
});

test('sport, US', () => {
  assert.equal(withRoleWords(Q, { role: 'head_coach', timeZone: 'America/Chicago' }),
    'Who in team will own it? Ask coaching staff, tell owners or front office, plan this season, outside the game, across your organization.');
});

test('the country wins over the time zone; Canada and other zones are British', () => {
  assert.equal(isUsRegion({ country: 'GB', timeZone: 'America/New_York' }), false);
  assert.equal(isUsRegion({ country: 'us' }), true);
  assert.equal(isUsRegion({ timeZone: 'America/Toronto' }), false);
  assert.equal(isUsRegion({ timeZone: 'America/Indiana/Indianapolis' }), true);
  assert.equal(isUsRegion({}), false);
});

test('other roles and no role are business', () => {
  assert.deepEqual(roleWords({ role: 'other' }), roleWords({}));
  assert.equal(roleWords({}).team, 'team');
});

test('a word that starts a sentence takes a capital; other placeholders stay', () => {
  assert.equal(withRoleWords('[team] first. Then [name].', { role: 'head_coach' }), 'Squad first. Then [name].');
});
