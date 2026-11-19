// The Coaching page's rules (Phase 6a run 2): what a coach is asking, what
// is new for Home's one quiet line, and what the page says. Pure functions
// only (src/lib/coachingRules.js); nothing here reads a database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COACHING_PATH, EMPTY_COACHING, acceptWords, addWords, coachAsks, coachingEmpty, coachingNews, instantMs, isNotThere, placedLine, tidyCoaching, withAction,
} from '../../src/lib/coachingRules.js';
import { quietLines } from '../../src/lib/performance/index.js';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW = new Date('2026-11-19T14:10:00Z');
const TODAY = '2026-11-19';
const invite = { profile_id: id(1), coach_first_name: 'Tim', invited_at: '2026-11-18T09:00:00+00:00' };
const ask = { request_id: id(2), coach_first_name: 'Tim', asked_at: '2026-11-19T14:00:00+00:00', answered_at: null, allowed: null, expires_at: null };
const cover = { cover_id: id(3), coach_first_name: 'Tim', cover_first_name: 'Maya', starts_on: '2026-12-21', ends_on: '2027-01-03', agreed_at: null };
const recap = (n, startsAt, sentAt, actions = []) => ({ session_id: id(n), starts_at: startsAt, minutes: 60, kind: 'session', coach_first_name: 'Tim', group_name: null, recap: 'Thanks for today.', sent_at: sentAt, actions });

test('whatever the database or the device answers, the page gets something it can draw', () => {
  assert.deepEqual(tidyCoaching(null), { ...EMPTY_COACHING });
  assert.deepEqual(tidyCoaching('nonsense').invites, []);
  // A stand-in shaped as another function (my_coach's rows) is never read as an invite.
  assert.deepEqual(tidyCoaching({ invites: [{ coach_id: id(9), first_name: 'Tim' }] }).invites, []);
  const d = tidyCoaching({
    invites: [invite, null, { profile_id: 'not-an-id' }],
    views: [ask, { request_id: 7 }],
    covers: [cover, { cover_id: id(4), starts_on: 'soon', ends_on: '2027-01-03' }],
    recaps: [recap(10, '2026-11-02T10:00:00Z', '2026-11-02T11:00:00Z'), recap(11, '2026-11-16T10:00:00Z', '2026-11-16T11:00:00Z', [{ id: id(20), title: ' Hand the launch plan to Femi ', goes_to: 'backlog', done: false, placed: false }, { id: 'x', title: 'no id' }, { id: id(21), title: '   ' }]), { session_id: id(12), starts_at: 'never' }],
    prep: { body: 'The pricing launch​', noted_at: '2026-11-18T08:00:00Z' },
  });
  assert.deepEqual([d.invites.length, d.views.length, d.covers.length, d.recaps.length], [1, 1, 1, 2]);
  assert.deepEqual(d.recaps.map((r) => r.session_id), [id(11), id(10)], 'newest first');
  assert.deepEqual(d.recaps[0].actions, [{ id: id(20), title: 'Hand the launch plan to Femi', goes_to: 'backlog', done: false, placed: false }]);
  assert.equal(d.prep.body, 'The pricing launch', 'nothing unseen is kept');
  assert.equal(tidyCoaching({ prep: { body: '   ' } }).prep, null);
  // A timestamp with no time-zone ending is UTC.
  assert.equal(instantMs('2026-11-19 14:00:00'), Date.UTC(2026, 10, 19, 14));
  assert.equal(instantMs('2026-11-19T14:00:00+00:00'), Date.UTC(2026, 10, 19, 14));
  assert.ok(Number.isNaN(instantMs(null)));
});

test('From your coach: an invite, a request to answer or a yes still running, and cover that hasn’t ended', () => {
  const data = { invites: [invite], views: [ask], covers: [cover] };
  let a = coachAsks(data, { now: NOW, today: TODAY });
  assert.deepEqual([a.invites.length, a.views[0].state, a.covers[0].agreed], [1, 'ask', false]);
  // Not now puts an invite off for the day; an invite that couldn't be taken is closed for good on this device.
  assert.equal(coachAsks(data, { now: NOW, today: TODAY, notNow: [`${TODAY}|${id(1)}`] }).invites.length, 0);
  assert.equal(coachAsks(data, { now: NOW, today: '2026-11-20', notNow: [`${TODAY}|${id(1)}`] }).invites.length, 1, 'asked again tomorrow');
  assert.equal(coachAsks(data, { now: NOW, today: '2026-11-25', notNow: [`closed|${id(1)}`] }).invites.length, 0);
  // A yes shows until its 30 minutes are up; a no, or an old yes, shows nothing.
  const yes = { ...ask, answered_at: '2026-11-19T14:02:00Z', allowed: true, expires_at: '2026-11-19T14:32:00Z' };
  a = coachAsks({ views: [yes] }, { now: NOW, today: TODAY });
  assert.deepEqual([a.views[0].state, a.views[0].expires_at], ['yes', '2026-11-19T14:32:00Z']);
  assert.equal(coachAsks({ views: [yes] }, { now: new Date('2026-11-19T14:32:00Z'), today: TODAY }).views.length, 0);
  assert.equal(coachAsks({ views: [{ ...yes, allowed: false, expires_at: null }] }, { now: NOW, today: TODAY }).views.length, 0);
  // Cover: agreed stays, with "Agreed"; once the dates have passed it goes.
  assert.equal(coachAsks({ covers: [{ ...cover, agreed_at: '2026-11-19T10:00:00Z' }] }, { now: NOW, today: TODAY }).covers[0].agreed, true);
  assert.equal(coachAsks({ covers: [cover] }, { now: NOW, today: '2027-01-04' }).covers.length, 0);
});

test('with nothing from a coach the page is empty, and Home says nothing', () => {
  assert.equal(coachingEmpty(null, { now: NOW, today: TODAY }), true);
  assert.equal(coachingEmpty({ invites: [invite] }, { now: NOW, today: TODAY }), false);
  assert.equal(coachingEmpty({ prep: { body: 'A note' } }, { now: NOW, today: TODAY }), false);
  assert.equal(coachingEmpty({ recaps: [recap(10, '2026-11-02T10:00:00Z', '2026-11-02T11:00:00Z')] }, { now: NOW, today: TODAY }), false);
  assert.equal(coachingNews(null, { now: NOW, today: TODAY }), null);
  assert.equal(coachingNews({ prep: { body: 'A note' } }, { now: NOW, today: TODAY }), null, 'their own note is never news');
});

test('Home’s one quiet line: something to answer first, then a recap sent since the page was last opened', () => {
  const opts = { now: NOW, today: TODAY, seenAt: null };
  const line = (data, o = opts) => coachingNews(data, o)?.lines[0] || null;
  assert.equal(line({ invites: [invite] }), 'Tim has sent something for you.');
  assert.equal(line({ views: [ask] }), 'Tim has sent something for you.');
  assert.equal(line({ covers: [cover] }), 'Tim has sent something for you.');
  assert.equal(line({ invites: [{ ...invite, coach_first_name: '' }] }), 'Your coach has sent something for you.');
  assert.deepEqual(coachingNews({ invites: [invite] }, opts).action, { label: 'Open', to: COACHING_PATH });
  // Answered, agreed or put off for today: nothing to answer.
  assert.equal(line({ covers: [{ ...cover, agreed_at: '2026-11-19T10:00:00Z' }] }), null);
  assert.equal(line({ views: [{ ...ask, answered_at: '2026-11-19T14:02:00Z', allowed: true, expires_at: '2026-11-19T14:32:00Z' }] }), null);
  assert.equal(line({ invites: [invite] }, { ...opts, notNow: [`${TODAY}|${id(1)}`] }), null);
  // A recap is new until the page has been opened after it was sent.
  const recaps = [recap(10, '2026-11-16T10:00:00Z', '2026-11-16T11:00:00Z')];
  assert.equal(line({ recaps }), 'Tim sent a recap of your session.');
  assert.equal(line({ recaps }, { ...opts, seenAt: Date.UTC(2026, 10, 16, 10, 30) }), 'Tim sent a recap of your session.');
  assert.equal(line({ recaps }, { ...opts, seenAt: Date.UTC(2026, 10, 16, 12) }), null);
  // Something to answer comes before a recap.
  assert.equal(line({ recaps, invites: [invite] }), 'Tim has sent something for you.');
  // On Home it is one of the quiet lines, first, and there are never more than two.
  const news = coachingNews({ recaps }, opts);
  const quiet = quietLines({ person: 'new', hasCoach: false, mission: null, joinedDaysAgo: 20, coaching: news });
  assert.deepEqual(quiet.map((q) => q.key), ['coaching', 'mission']);
  assert.deepEqual(quiet[0], { key: 'coaching', lines: ['Tim sent a recap of your session.'], action: { label: 'Open', to: '/coaching' } });
  assert.equal(quietLines({ person: 'sprint', hasCoach: true, coaching: null }).length, 0, 'Home is as it was with nothing from a coach');
});

test('the words: accepting, adding an action, and where it is', () => {
  assert.equal(acceptWords('linked', 'Tim'), 'You’re now working with Tim.');
  assert.equal(acceptWords('already_linked', 'Tim'), 'You already have a coach in The Clarity Portal, so nothing changed. Ask Tim if that isn’t right.');
  assert.equal(acceptWords('has_another_coach', 'Tim'), 'You already have a coach in The Clarity Portal, so nothing changed. Ask Tim if that isn’t right.');
  assert.equal(acceptWords('linked', ''), 'You’re now working with your coach.');
  assert.equal(addWords({ goes_to: 'week' }), 'Add to this week');
  assert.equal(addWords({ goes_to: 'backlog' }), 'Add to my backlog');
  assert.deepEqual([placedLine('week'), placedLine('backlog'), placedLine(undefined)], ['It’s in this week’s sprint.', 'It’s in your backlog.', 'It’s in your to-dos.']);
  const d = withAction({ recaps: [recap(11, '2026-11-16T10:00:00Z', '2026-11-16T11:00:00Z', [{ id: id(20), title: 'One', goes_to: 'week' }, { id: id(21), title: 'Two', goes_to: 'week' }])] }, id(21), { done: true });
  assert.deepEqual(d.recaps[0].actions.map((a) => a.done), [false, true]);
});

test('a function or table the database doesn’t have yet reads as not there, never as an error', () => {
  assert.equal(isNotThere({ code: 'PGRST202', message: 'Could not find the function public.my_session_recaps without parameters in the schema cache' }), true);
  assert.equal(isNotThere({ code: 'PGRST205' }), true);
  assert.equal(isNotThere({ code: '42P01', message: 'relation "public.session_prep" does not exist' }), true);
  assert.equal(isNotThere({ code: '42501', message: 'permission denied' }), false);
  assert.equal(isNotThere({ message: 'TypeError: Failed to fetch' }), false);
});
