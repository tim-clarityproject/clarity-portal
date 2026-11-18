// The outside Health Check's style trim (scripts/build/trimStyles.mjs): a
// rule stays when its selector can match on the page. Inside :is() and
// :where() one choice is enough, and :not() asks for nothing (the shared
// buttons' rules, Tim, 18 Nov).
import test from 'node:test';
import assert from 'node:assert/strict';
import { namesIn, selectorCanMatch, trimSheets } from '../../scripts/build/trimStyles.mjs';

const names = namesIn(['<button class="ds-btn ds-btn--primary ds-guide-next">', "const c = `hc-dot--${state}`;"]);

test('a plain selector needs each of its classes', () => {
  assert.equal(selectorCanMatch('.ui-root .ds-btn--primary', names), false); // ui-root isn't named here
  assert.equal(selectorCanMatch('.ds-btn.ds-guide-next', names), true);
  assert.equal(selectorCanMatch('.ds-btn .si-btn', names), false);
  assert.equal(selectorCanMatch('.hc-dot--on', names), true);
});

test('inside :is() or :where() one choice is enough, and :not() asks for nothing', () => {
  assert.equal(selectorCanMatch(':is(.si-btn, .ds-btn--primary):not(#_)', names), true);
  assert.equal(selectorCanMatch(':where(.si-btn, .ui-btn-ghost)', names), false);
  assert.equal(selectorCanMatch('.ds-btn:not(.ui-btn-ghost)', names), true);
  assert.equal(selectorCanMatch(':is(.si-btn, .ds-btn--primary):is(button, a, label, span)::after', names), true);
  assert.equal(selectorCanMatch(':is(.ds-btn, :is(.si-btn, .auth-btn-ghost)) .ds-guide-next', names), true);
  assert.equal(selectorCanMatch(':is(.si-btn, :is(.auth-btn-ghost)) .ds-guide-next', names), false);
});

test('the trim keeps the shared buttons and drops what cannot match', () => {
  const css = ':is(.ds-btn--primary, .si-btn):not(#_) { color: red; }\n.si-btn { color: blue; }\n.ds-guide-next, .ui-btn-ghost { margin: 0; }';
  const { sheets } = trimSheets([css], names);
  assert.match(sheets[0], /:is\(\.ds-btn--primary, \.si-btn\):not\(#_\)/);
  assert.doesNotMatch(sheets[0], /^\.si-btn \{/m);
  assert.match(sheets[0], /\.ds-guide-next \{/);
  assert.doesNotMatch(sheets[0], /ui-btn-ghost/);
});
