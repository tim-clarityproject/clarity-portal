// The outside Strategic Alignment Health Check against its mock-up, M7b
// version 51, part by part: the mock-up file itself and the built page on
// the same screen, Desktop (1440) and Phone (390, M7b's phone frame), dark
// and light, every screen in M7b's switcher. Positions and sizes to half a
// pixel, fonts, sizes, letter-spacing and colours, and every visible
// sentence word for word, the pop-ups' included.
//
//   node tests/healthcheck/compare-m7b.mjs [folder for screenshots]
//   ONLY=welcome,results WIDTHS=1440 MODES=dark   to run a part of it
//   M7B_FILE=<path>   the mock-up (default: ~/Downloads/clarity-health-check-calm/m7b-health-check.html)
//
// The built page runs on the dev server with its two database calls
// answered by stand-ins and every email call and outside address blocked
// (tests/healthcheck/hc-shared.mjs): nothing is saved and nothing is sent.
// The mock-up's one outside request, DM Sans from Google Fonts, is answered
// here with the same @fontsource files the app uses; Nekst is inside it.
//
// How the two are lined up: M7b draws its screens inside a review frame
// (1180px on a laptop, a 390px phone with a 47px status bar), so each part
// is measured from the content's own corner (the % bar on a guided screen,
// the title on the others, a panel's own corner) and the bottom bar from
// the bottom of the screen. Both pages hold the mock-up's own answers
// (Kestrel Group). Differences that are meant are listed in ALLOW with why;
// anything else fails.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { NEW_BAR_H, NEW_CARD, NEW_NOTE, compareParts, compareWords, makeReport, measureParts, words } from '../phase8/compare-lib.mjs';
import { STEPS, appPage, signIn } from './hc-shared.mjs';
import { backChevron, titleIcons } from './hc-measure.mjs';

const out = process.argv[2] || join(process.cwd(), 'tmp-hc-compare');
mkdirSync(out, { recursive: true });
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const WIDTHS = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : [1440, 390];
const MODES = process.env.MODES ? process.env.MODES.split(',') : ['dark', 'light'];
const M7B_FILE = process.env.M7B_FILE || join(homedir(), 'Downloads', 'clarity-health-check-calm', 'm7b-health-check.html');
const FONTS = join(process.cwd(), 'node_modules', '@fontsource', 'dm-sans', 'files');
// The portal's DM Sans (Phase 8a follow-up, 17 Nov): the variable font with optical sizes Google Fonts serves,
// self-hosted; the mock-up is given the same file for both weights, so both sides measure one font.
const DM_SANS_FILE = join(process.cwd(), 'node_modules', '@fontsource-variable', 'dm-sans', 'files', 'dm-sans-latin-opsz-normal.woff2');
const MOCK_EMAIL = 'j.hartley@kestrelgroup.com'; // the mock-up's invented address, typed into the box and never sent
const MOCK_CODE = 'K7Q2MX';
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

const report = makeReport();
const { pass, note, results } = report;

// ---------------------------------------------------------------- the parts
// [name, M7b's selector, the built page's selector, which one (0 = first), what to compare]
const CROSS = ['the bold crosshair', '.gtop svg', '.ds-guest-top svg, .ds-guide-top svg', 0, ['box']];
const BACKLINK = ['Back', '.bkl', '.hc-back', 0, ['words', 'text']];
const BAR = [
  ['the tool’s name', '.gl b', '.ds-guide-name', 0, ['pos', 'text']],
  ['close', '.gbar .iconbtn .x', '.ds-guide-close .ds-cross', 0, ['box']],
  ['the % bar', '.qpct', '.ds-guide-pct-track', 0, ['box', 'fill']],
  ['the % bar’s filled part', '.qpct i', '.ds-guide-pct-track > span', 0, ['box', 'fill']],
];
const HEAD = [
  ['the project counter', '.cnt span', '.hc-count > span', 0, ['pos', 'text']],
  ['the Success Factor counter', '.cnt span', '.hc-count > span', 1, ['pos', 'text']],
  ['the question', '#h1', '.ds-guide-question', 0, ['pos', 'text']],
  ['the line under it', '.nudge', '.ds-guide-nudge', 0, ['words', 'text']],
];
const FOOT = [
  ['the bottom bar', '.gft', '.ds-guide-foot', 0, ['band']],
  ['the coral button', '.gft .btn', '.ds-guide-next', 0, ['foot', 'text', 'fill']],
];
const ROWS = (last) => [
  ['the first box', '.rw textarea', '.ds-rowlist .ds-text', 0, ['box', 'text', 'edge', 'fill']],
  ['the second box', '.rw textarea', '.ds-rowlist .ds-text', 1, ['box']],
  ['the last box', '.rw textarea', '.ds-rowlist .ds-text', last, ['box']],
  ['the first remove crosshair', '.rw .x', '.ds-rowlist-remove .ds-cross', 0, ['box']],
  ['the add button', '.addrow .ghost', '.ds-rowlist-add', 0, ['box', 'text', 'edge']],
];
const ANSWERS = (last) => [
  ['the first answer', '.opt', '.ds-answer', 0, ['box', 'edge']],
  ['its word', '.opt .ow', '.ds-answer-words', 0, ['pos', 'text']],
  ['its meaning', '.opt small', '.ds-answer-hint', 0, ['pos', 'text']],
  ['the second answer', '.opt', '.ds-answer', 1, ['box']],
  ['the last answer', '.opt', '.ds-answer', last, ['box', 'edge']],
  ['the chosen answer', '.opt[aria-checked="true"]', '.ds-answer[aria-checked="true"]', 0, ['box', 'edge', 'fill']],
];
const SIGNIN = (links) => [
  CROSS,
  ['the heading', '#h1', '.ds-guest h1', 0, ['pos', 'text']],
  ['the line under it', '.nudge', '.ds-guest-sub', 0, ['pos', 'text']],
  ['the Email label', '.field label', '.ds-guest-field label', 0, ['pos', 'text']],
  ['the Email box', '#em', '.ds-guest-field input', 0, ['box', 'text', 'edge', 'fill']],
  ['the Access code label', '.field label', '.ds-guest-field label', 1, ['pos', 'text']],
  ['the Access code box', '.field .inp', '.ds-guest-field input', 1, ['box']],
  ['who sees the answers', '.bsent', '.ds-guest-sentence', 0, ['words', 'text']],
  ['the ⓘ', '.bsent .ib1 svg', '.ds-guest-sentence svg', 0, ['box']],
  ['the button', '.btn.wide', '.hc-wide-btn', 0, ['box', 'text', 'fill']],
  ...Array.from({ length: links }, (_, i) => [`link ${i + 1}`, '.legal .text', '.ds-guest-legal .ds-link', i, ['pos', 'text']]),
];
const CHART = [
  ['the chart', '.dch svg', '.hc-chart svg', 0, ['box']],
  ...['Strategic importance (axis)', 'High', 'Low', 'Embryonic', 'Excellent', 'Progress (axis)', 'Needs attention (area)', 'Moving well (area)']
    .map((n, i) => [`the chart’s “${n}”`, '.dch svg > text', '.hc-chart svg > g[aria-hidden] > text', i, ['box', 'text']]),
  ...[0, 1, 2, 3, 4, 5, 6].map((i) => [`dot ${i + 1}`, '.dch g.dot .v', '.hc-dot-mark', i, ['box', 'colour', 'edge']]),
  ['dot 1’s number', '.dch g.dot text', '.hc-dot-n', 0, ['box', 'text']],
  ['dot 1’s second ring', '.dch g.dot circle:nth-child(2):not(.v)', '.hc-dot-ring', 0, ['box', 'edge']],
];
const ONE_PAGER = (ex, lastRow, lastFactor) => [
  ['the headline', '.headl', '.ds-headline', 0, ['pos', 'text']],
  ['the headline’s second line', '.headl2', '.hc-headline-rest', 0, ['pos', 'text']],
  ...['the chart', 'Projects', 'Objective', 'Success Factors', 'Questions to start with', ...(ex ? [] : ['Keep your results'])]
    .flatMap((n, i) => [
      [`section name: ${n}`, '.sech h2', '.ds-results-head', i, ['words', 'text']],
      [`section line: ${n}`, '.sech', '.ds-results-headrow', i, ['box']],
    ]),
  // No ⓘ on the chart's heading since 16 Nov: "How to read the chart" is a quiet link under the chart.
  ...(ex ? [] : [
    ['the line’s label', '.ctl .flab', '.hc-ctl .ds-label-row-text', 0, ['pos', 'text']],
    ['the line’s drop-down', '.ctl .dd', '.hc-ctl .ds-dd', 0, ['box', 'text', 'edge', 'fill']],
    ['Edit (Projects)', '.sech .text', '.ds-results-headrow .ds-link', 0, ['pos', 'text']],
  ]),
  ...CHART.slice(0, ex ? 9 : CHART.length),
  ['Sort by', '.ctl .flab', '.hc-ctl .ds-label-row-text', ex ? 0 : 1, ['pos', 'text']],
  ['the Sort by drop-down', '.ctl .dd', '.hc-ctl .ds-dd', ex ? 0 : 1, ['box', 'text', 'edge']],
  ['the list’s heading row', '.prow.h', '.hc-prow--head', 0, ['box']],
  ['heading: Project', '.prow.h > span', '.hc-prow--head > span', 0, ['pos', 'text']],
  ['heading: Strategic importance', '.prow.h > span', '.hc-prow--head > span', 1, ['words', 'text']],
  ['heading: Progress', '.prow.h > span', '.hc-prow--head > span', 2, ['pos', 'text']],
  ['heading: Resource required', '.prow.h > span', '.hc-prow--head > span', 3, ['pos', 'text']],
  ['the importance ⓘ', '.prow.h .ib1 svg', '.hc-prow--head svg', 0, ['box']],
  ['the first project row', '.prow:not(.h)', 'button.hc-prow', 0, ['box']],
  ['the second project row', '.prow:not(.h)', 'button.hc-prow', 1, ['box']],
  ['the last project row', '.prow:not(.h)', 'button.hc-prow', lastRow, ['box']],
  ['project 1’s number', '.pn', '.hc-pn', 0, ['box', 'text', 'edge']],
  ['project 1’s name', '.prow .pt b', '.hc-pt b', 0, ['pos', 'text', 'weight']],
  ['project 1’s state', '.prow .pt small span', '.hc-pt small span', 0, ['pos', 'text']],
  ['project 1’s start', '.prow .pt small span', '.hc-pt small span', 1, ['pos', 'text']],
  ['label: Strategic importance', '.prow .ml', '.hc-ml', 0, ['pos', 'text']],
  ['label: Progress', '.prow .ml', '.hc-ml', 1, ['pos', 'text']],
  ['label: Resource required', '.prow .ml', '.hc-ml', 2, ['pos', 'text']],
  ['the importance bar', '.imb .tr', '.hc-imb-track', 0, ['box', 'fill']],
  ['its filled part', '.imb .tr i', '.hc-imb-track i', 0, ['box', 'fill']],
  ['the importance figure', '.imb > span:last-child', '.hc-imb-figure', 0, ['pos', 'text']],
  ['the progress steps', '.lv', '.ds-stepbars', 0, ['box']],
  ['a filled step', '.lv i.on', '.ds-stepbars i.ds-stepbars-on', 0, ['box', 'fill']],
  ['an empty step', '.lv i:not(.on)', '.ds-stepbars i:not(.ds-stepbars-on)', 0, ['box', 'fill']],
  ['the progress word', '.lvw', '.ds-stepbars-word', 0, ['pos', 'text']],
  ['the resource steps', '.lv', '.ds-stepbars', 1, ['box']],
  ['the resource word', '.lvw', '.ds-stepbars-word', 1, ['pos', 'text']],
  ['a mint step (Good or Excellent)', '.lv.hi i.on', '.ds-stepbars--good i.ds-stepbars-on', 0, ['fill']],
  ['the word under a mint bar', '.lv.hi + .lvw', '.ds-stepbars-word--good', 0, ['text']],
  ['the objective', '.objt', '.hc-objective', 0, ['pos', 'text']],
  ['the first Success Factor', '.csfr', '.hc-factor', 0, ['box']],
  ['the last Success Factor', '.csfr', '.hc-factor', lastFactor, ['box']],
  ['its number', '.onum', '.hc-factor-n', 0, ['box', 'text', 'edge']],
  ['its level', '.csfr .k', '.hc-factor-level', 0, ['pos', 'text']],
  ['its name', '.csfr p', '.hc-factor p', 0, ['pos', 'text']],
  ['no project supports it', '.csfr .gap', '.hc-factor-gap', 0, ['pos', 'text']],
  ['the first question', '.qi', '.ds-startq', 0, ['box']],
  ['the second question', '.qi', '.ds-startq', 1, ['box']],
  ['the last question', '.qi', '.ds-startq', 2, ['box']],
  ['its topic', '.qi .k', '.ds-startq-label', 0, ['pos', 'text']],
  ['the question itself', '.qi p', '.ds-startq p', 0, ['pos', 'text']],
  ['why it’s asked', '.qi .w', '.ds-startq-reason', 0, ['pos', 'text']],
];
const SCREENS = {
  welcome: [CROSS,
    ['the title', '.ptl', '.ds-guest-title', 0, ['pos', 'text']],
    ['the line under it', '.lead', '.hc-lead', 0, ['pos', 'text']],
    ['the Quick guide card', '.vinl .vcard', '.hc-vcard--inline', 0, ['box', 'edge']],
    ['the picture', '.vinl .stg', '.hc-vcard--inline .hc-stage', 0, ['box']],
    ['the play disc', '.bigplay .bpc', '.hc-bigplay-mark', 0, ['box', 'fill']],
    ['the play triangle', '.bigplay .bpc svg', '.hc-bigplay-mark svg', 0, ['box']],
    ['Watch this first', '.bigplay b', '.hc-bigplay b', 0, ['pos', 'text']],
    ['the line under Watch', '.bigplay small', '.hc-bigplay small', 0, ['pos', 'text']],
    ['Begin', '.bnote .btn', '.hc-begin .ds-btn', 0, ['box', 'text', 'fill', 'edge']],
    ['~15 minutes', '.bnote small', '.ds-btn-note-text', 0, ['pos', 'text']]],
  signin: [BACKLINK, ...SIGNIN(3)],
  ret: SIGNIN(2),
  objective: [...BAR, ...HEAD, ...FOOT,
    ['the play icon', '.ic1 svg', '.ds-guide-question .ds-play svg', 0, ['box']],
    ['the eye', '.eye1 svg', '.ds-guide-question .ds-who:not(.ds-play) svg', 0, ['box']],
    ['the objective box', '.big-ta', '.ds-guide-body .ds-text', 0, ['box', 'text', 'edge', 'fill']]],
  // Next pressed with nothing typed: the calm line under the box.
  calm: [...BAR, ...HEAD, ...FOOT,
    ['the objective box', '.big-ta', '.ds-guide-body .ds-text', 0, ['box']],
    ['the calm line', '.err', '.ds-guide .ds-error', 0, ['box', 'fill', 'text']],
    ['its mark', '.err b', '.ds-guide .ds-error-mark', 0, ['pos', 'text', 'weight']],
    ['its words', '.err span', '.ds-guide .ds-error > span:last-child', 0, ['pos', 'text']]],
  csf: [...BAR, ...HEAD, ...FOOT,
    ['the label', '.flab', '.hc-flab', 0, ['words', 'text']],
    ['the ⓘ', '.flab .ib1 svg', '.hc-flab svg', 0, ['box']],
    ...ROWS(3)],
  weight: [...BAR, ...HEAD, ...FOOT,
    ['the first row', '.wrow', '.hc-weight', 0, ['box']],
    ['the second row', '.wrow', '.hc-weight', 1, ['box']],
    ['the last row', '.wrow', '.hc-weight', 3, ['box']],
    ['the first Success Factor', '.wrow p', '.hc-weight p', 0, ['pos', 'text']],
    ['the first control', '.seg', '.hc-weight .ds-seg:not(.ds-seg-measure)', 0, ['box', 'edge']],
    ['Critical (chosen)', '.seg button', '.hc-weight .ds-seg-btn', 0, ['box', 'text', 'fill']],
    ['Very important', '.seg button', '.hc-weight .ds-seg-btn', 1, ['box', 'text']],
    ['Important', '.seg button', '.hc-weight .ds-seg-btn', 2, ['box', 'text']]],
  projects: [...BAR, ...HEAD, ...FOOT,
    ['the ⓘ', '.nudge .ib1 svg', '.ds-guide-nudge svg', 0, ['box']],
    ...ROWS(6)],
  contrib: [...BAR, ...HEAD, ...ANSWERS(3)],
  when: [...BAR, ...HEAD, ...FOOT,
    ['Started', '.dts .flab', '.hc-dates .ds-label-row-text', 0, ['pos', 'text']],
    ['the Started drop-down', '.dts .dd', '.hc-dates .ds-dd', 0, ['box', 'text', 'edge', 'fill']],
    ['its month', '.dts .dd > span:first-child', '.hc-dates .ds-dd-value', 0, ['pos']],
    ['Due to finish', '.dts .flab', '.hc-dates .ds-label-row-text', 1, ['pos', 'text']],
    ['the Due to finish drop-down', '.dts .dd', '.hc-dates .ds-dd', 1, ['box']],
    ['Add exact date', '.ans-wrap .text', '.hc-exact .ds-link', 0, ['pos', 'text']]],
  progress: [...BAR, ...HEAD, ...ANSWERS(4)],
  resource: [...BAR, ...HEAD, ...ANSWERS(4)],
  results: [CROSS,
    ['the title', '#h1', '.ds-guide-title', 0, ['words', 'text']],
    ['the play icon', '.ic1 svg', '.ds-guide-title .ds-play svg', 0, ['box']],
    ['the eye', '.eye1 svg', '.ds-guide-title .ds-who:not(.ds-play) svg', 0, ['box']],
    ['the organisation', '.meta span', '.hc-meta span', 0, ['pos', 'text']],
    ['the date', '.meta span', '.hc-meta span', 1, ['pos', 'text']],
    ...ONE_PAGER(false, 6, 3),
    ['the line about the link', '.kp p', '.hc-keep p', 0, ['pos', 'text']],
    ['Email my link', '.kp .ghost', '.hc-keep .ds-btn', 0, ['box', 'text', 'edge']],
    ['the calm card', '.calm', '.ds-calm-card', 0, ['box', 'fill']],
    ['its sentence', '.calm p', '.ds-calm-card p', 0, ['pos', 'text']],
    ['its quieter line', '.calm .sub', '.ds-calm-card-sub', 0, ['pos', 'text']],
    ['Create my free account', '.calm .ghost', '.ds-calm-card .ds-btn', 0, ['box', 'text', 'edge']],
    ...FOOT],
  example: [CROSS, BACKLINK,
    ['the title', '#h1', '.ds-guest-title', 0, ['pos', 'text']],
    ['the organisation', '.meta span', '.hc-meta span', 0, ['pos', 'text']],
    ['the date', '.meta span', '.hc-meta span', 1, ['pos', 'text']],
    ['the introduction', '.exb', '.hc-example-intro', 0, ['box', 'fill']],
    ['its first line', '.exb p', '.hc-example-intro p', 0, ['pos', 'text']],
    ['its last line', '.exb p', '.hc-example-intro p', 2, ['pos', 'text']],
    ...ONE_PAGER(true, 7, 4),
    ['Start my Health Check', '.endb .btn', '.hc-end .ds-btn', 0, ['box', 'text', 'fill']]],
};
// Screens that are a panel over the page: measured from the panel's own corner.
const DIALOG = '[role=dialog]:not(.ds-guide)';
const PANELS = {
  video: [
    ['the panel', '.sheet', DIALOG, 0, ['size', 'fill']],
    ['the panel’s title', '.shh h2', `${DIALOG} h2`, 0, ['pos', 'text']],
    ['close', '.shh .x', `${DIALOG} .ds-dialog-head .ds-cross`, 0, ['box']],
    ['the card', '.sheet .vcard', `${DIALOG} .hc-vcard`, 0, ['box', 'edge']],
    ['the picture', '.sheet .stg', `${DIALOG} .hc-stage`, 0, ['box']],
    ['the caption bar', '.sheet .capbar', `${DIALOG} .hc-capbar`, 0, ['box', 'text']],
    ['Play', '.sheet .pb', `${DIALOG} .hc-vbtn`, 0, ['box']],
    ['Replay', '.sheet .pb', `${DIALOG} .hc-vbtn`, 1, ['box']],
    ['Mute', '.sheet .pb', `${DIALOG} .hc-vbtn`, 2, ['box']],
    ['Play’s icon', '.sheet .pb svg', `${DIALOG} .hc-vbtn svg`, 0, ['box']],
    ['the progress line', '.sheet .scrub .trk', `${DIALOG} .hc-scrub-track`, 0, ['box', 'fill']],
    ['its knob', '.sheet .scrub .th', `${DIALOG} .hc-scrub-thumb`, 0, ['box', 'fill']],
    ['the time', '.sheet .tmx', `${DIALOG} .hc-vtime`, 0, ['pos', 'text']]],
  who: [
    ['the panel', '.sheet', DIALOG, 0, ['size']],
    ['the panel’s title', '.shh h2', `${DIALOG} h2`, 0, ['text']]],
  pdf: [
    ['the panel', '.sheet', DIALOG, 0, ['size', 'fill']],
    ['the panel’s title', '.shh h2', `${DIALOG} h2`, 0, ['pos', 'text']],
    ['close', '.shh .x', `${DIALOG} .ds-dialog-head .ds-cross`, 0, ['box']],
    ['the two versions', '.sheet .ddl', `${DIALOG} .ds-pdfpanel`, 0, ['box', 'edge', 'fill']],
    ['Light, for printing', '.sheet .ddl button', `${DIALOG} .ds-pdfpanel .ds-option`, 0, ['box', 'text']],
    ['Dark, for sharing', '.sheet .ddl button', `${DIALOG} .ds-pdfpanel .ds-option`, 1, ['box', 'text']]],
};

// ---------------------------------------------------------------- meant differences
// `${screen}|${part}|${what}` (a * matches any screen; `@phone` on a phone only), each with why.
const EDGE = 'every outlined edge someone taps or types into takes the edges colour, 3 to 1 (rule 8a; Tim, 11 and 12 Nov, after these parts were drawn in the design reference M7b copies)';
const INFO = 'the ⓘ sits 6px after its words (CLAUDE.md rule 25, the shared part), where M7b draws it about 4px after; M9 and M10’s pages use the same part';
const SHARED_DD = 'the drop-down is the portal’s one branded drop-down (the shared part; a bottom panel on a phone)';
// (The chart's dots: the app keeps its own rule for dots that would touch, moving them apart inside their own
// area, where M7b moves them sideways only. With the mock-up's own answers the two rules put every dot in the
// same place, so no difference is listed here.)
const WHO = 'the guest’s choice (Only you, or You and Tim, with its line) is the portal’s shared small panel (GuestEye on WhoSees), so its size is that panel’s, as M9’s comparison accepts';
const BOX = 'the portal’s one-line box is 58px, as M7b’s own text boxes are; M7b’s two start boxes come out 1.4px shorter, so what follows sits that much lower (as M9’s comparison accepts)';
const SEG = 'the portal’s one shared segmented control (40px pills in a 48px box), as M10’s comparison accepts; M7b draws 38px pills, so each row is 2px taller';
const PANEL = 'the portal’s one shared slide-across panel (480px wide on a laptop, 24px gutters, its own title row), as every other panel in the portal and as M9 and M10’s comparisons accept; M7b’s is 460px with 28px gutters';
const WIDE_PANEL = 'the Quick guide’s panel is the shared slide-across panel made 780px wide, as M7b’s; the shared panel’s gutters are 24px where M7b draws 28px, so the picture is 8px wider and 5px taller and what is under it sits 5px lower';
const POP = 'pop-ups are the portal’s shared ones (InfoPop for an ⓘ and an icon’s words, ChartTips for a chart’s dots: the card colour with a fine edge, 13px), as on every other page; M7b draws them in the text colour at 14px';
const ICONS = 'the first icon is 12px from the last letter’s ink to its own visible edge and the two are 16px apart (Tim, 14 Nov, 09:28), read from both pages’ pixels: M7b’s own drawing comes out about 1px closer after a DM Sans question and about 1px further after Nekst capitals';
const BACK = 'Back’s label is 14px after the chevron’s visible edge (rule 29t and the sign-in pages’ Back, which M7b says this is drawn as); M7b’s drawing puts it 8px after';
const COACH = 'the coach’s first name comes with the answers (migration 034), so the page knows it only once the link has been opened on this device; before that it says “your coach”, as the return visit shows “Tim”';
const TEXTBOX = 'the shared text box is as tall as its example until what is typed is longer than the example (so nothing hidden and no jump while typing; rule 18): on a phone “e.g. Win enterprise customers in the US” takes two lines, so the first Success Factor’s box is two lines tall while its answer is shorter than that; M7b cuts the example off at one line';
export const ALLOW = [
  ['*|the bottom bar|height', NEW_BAR_H],
  ['*|the calm card|height', NEW_CARD],
  ['*|~15 minutes|left', NEW_NOTE],
  ['*|~15 minutes|top', NEW_NOTE],
  ...['Begin', 'the add button', 'the first answer', 'the last answer', 'the first control', 'Email my link', 'Create my free account', 'the play disc, once watched'].map((p) => [`*|${p}|edge`, EDGE]),
  ...['signin', 'ret'].flatMap((s) => [
    [`${s}|the Email box|height`, BOX],
    ...['the Access code label', 'who sees the answers', 'the ⓘ', 'the button', 'link 1', 'link 2', 'link 3'].map((p) => [`${s}|${p}|top`, BOX]),
  ]),
  ...['signin', 'ret'].flatMap((s) => ['top', 'height'].map((w) => [`${s}|the Access code box|${w}`, BOX])),
  ...[['the first box', 'height'], ['the second box', 'top'], ['the last box', 'top'], ['the first remove crosshair', 'top'], ['the add button', 'top']].map(([p, w]) => [`csf|${p}|${w}@phone`, TEXTBOX]),
  ['*|the ⓘ|left', INFO],
  ['*|the importance ⓘ|left', INFO],
  ['projects|the ⓘ|top', 'the ⓘ is centred on the middle of the capitals of its sentence, by measurement (rule 25); M7b’s sits half a pixel higher'],
  ['signin|who sees the answers|left', COACH],
  ...['height', 'top'].flatMap((w) => ['the first row', 'the second row', 'the last row', 'the first Success Factor', 'the first control', 'Critical (chosen)', 'Very important', 'Important'].map((p) => [`weight|${p}|${w}`, SEG])),
  ['*|the Sort by drop-down|width', `${SHARED_DD}: its chevron stands in an 18px line where M7b’s is 16px, so the small drop-down is 2px wider`],
  ...['left', 'top'].map((w) => [`video|*|${w}`, WIDE_PANEL]),
  ...['the card', 'the picture', 'the caption bar', 'the progress line'].map((p) => [`video|${p}|width`, WIDE_PANEL]),
  ...['the card', 'the picture'].map((p) => [`video|${p}|height`, WIDE_PANEL]),
  ...['left', 'top', 'width'].map((w) => [`pdf|*|${w}`, PANEL]),
  ...['fill', 'colour', 'size'].map((k) => [`*|the pop-up|${k}`, POP]),
  ['results|the play icon|left', ICONS],
  ['results|the eye|left', ICONS],
  ['objective|the play icon|left', ICONS],
  ['objective|the eye|left', ICONS],
  ['*|the icons as drawn|gapTitle', ICONS],
  ['*|Back|left', BACK],
  ['*|Back as drawn|gap', BACK],
  ['who|the panel|width', WHO],
  ['who|the panel|height', WHO],
  ['who|the panel’s title|text size', 'the eye’s panel is the portal’s shared small panel (22px title), as M9’s comparison accepts'],
];
// No Nekst inside a control (Tim, 18 Nov, follow-up 1): the Quick guide card's "Watch this first" is DM Sans 14px in
// sentence case, so it is narrower (centred, it starts further in) and its line is shorter: the disc sits 0.8px higher
// and the line under it 0.8px lower.
const NO_NEKST = 'no Nekst inside a control (Tim, 18 Nov, follow-up 1): “Watch this first” is DM Sans 14px in sentence case, narrower and on a shorter line than M7b’s 13px spaced capitals';
ALLOW.push(
  ...['left', 'top', 'font', 'text size', 'letter-spacing', 'capitals'].map((w) => [`*|Watch this first|${w}`, NO_NEKST]),
  ...['the play disc', 'the play triangle', 'the play disc, once watched', 'the line under Watch'].map((p) => [`*|${p}|top`, NO_NEKST]),
);
// Explanations (Tim, 16 Nov, 23:31): "How to read the chart" is a quiet link under the chart (44px tall, a tap
// area), so every part below the chart on the results and the example report sits 44px lower than M7b draws it.
const EXPLAIN = 'the quiet link “How to read the chart” under the chart (Tim, 16 Nov, 23:31: what a chart’s marks mean opens in the side panel) puts everything below the chart 44px lower; M7b has an ⓘ on the chart’s heading instead';
ALLOW.push(['results|*|top', EXPLAIN], ['example|*|top', EXPLAIN]);
const ALLOWED = new Map(ALLOW);
const allowed = (screen0, part, what) => { const screen = screen0.startsWith('pop:') ? '*' : screen0; return allowedFor(screen, part, what); };
const allowedFor = (screen, part, what) => ALLOWED.get(`${screen}|${part}|${what}`) || ALLOWED.get(`*|${part}|${what}`) || ALLOWED.get(`${screen}|*|${what}`) || ALLOWED.get(`*|*|${what}`);

// Sentences that differ on purpose, or are only on one side.
const WORDS_M7B_ONLY = new Map([
  ['signin', [['Only you and Tim will see your answers.', COACH]]],
]);
const WORDS_BUILT_ONLY = new Map([
  ['signin', [['Only you and your coach will see your answers.', COACH]]],
  ['results', [['How to read the chart', EXPLAIN]]],
  ['example', [['How to read the chart', EXPLAIN]]],
]);
const ctx0 = { report, allowed, mockName: 'M7b' };
const ctxWords = { report, mockOnly: WORDS_M7B_ONLY, builtOnly: WORDS_BUILT_ONLY, mockName: 'M7b' };

// ---------------------------------------------------------------- M7b itself
const fontCss = `
@font-face{font-family:'DM Sans';font-weight:400;font-style:normal;src:url(https://fonts.gstatic.com/local/400.woff2) format('woff2')}
@font-face{font-family:'DM Sans';font-weight:500;font-style:normal;src:url(https://fonts.gstatic.com/local/500.woff2) format('woff2')}`;
async function mockOpen(browser, width, mode) {
  const phone = width < 600;
  // M7b's review bar sits above the frame, so the window is taller than the frame.
  const ctx = await browser.newContext({ viewport: { width: phone ? 600 : width, height: 1300 }, colorScheme: mode, locale: 'en-GB', reducedMotion: 'reduce', deviceScaleFactor: 2 });
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: fontCss }));
  await ctx.route(/fonts\.gstatic\.com\/local\/(400|500)/, (r) => {
    const w = /\/(400|500)/.exec(r.request().url())[1];
    r.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(DM_SANS_FILE) });
  });
  await ctx.route(/^https?:/, (r) => (/fonts\./.test(r.request().url()) ? r.fallback() : r.abort()));
  const page = await ctx.newPage();
  await page.goto(`file://${M7B_FILE}`);
  await page.locator(`.rp[data-t="${mode}"]`).click();
  await page.locator(`.rp[data-w="${phone ? 'p' : 'd'}"]`).click();
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}
async function mockShow(page, screen) {
  await page.evaluate((k) => {
    const st = window.__st;
    if (k === 'welcome2') { window.__jump('welcome'); st.watched = true; window.__render(); }
    else if (k === 'pdf') { window.__jump('results'); window.__act('pdf'); }
    else if (k === 'calm' || k === 'calm:undo') {
      // The mock-up's objective is emptied as a person would (typed out), then Next; and put back afterwards.
      window.__jump('objective');
      const box = document.querySelector('#fr textarea');
      if (k === 'calm') { window.__kept = box.value; box.value = ''; } else box.value = window.__kept;
      box.dispatchEvent(new Event('input', { bubbles: true }));
      if (k === 'calm') window.__act('next');
    }
    else if (k === 'video') { window.__jump('video'); st.vplay = false; st.vt = 0; window.__paintVid(); }
    else { if (k === 'welcome') st.watched = false; window.__jump(k); }
    // The Quick guide's own moving picture is rebuilt in a later step: it isn't compared.
    document.querySelectorAll('.sim').forEach((el) => { el.innerHTML = ''; });
    document.querySelectorAll('.qbody, .sheet, .scrim').forEach((el) => { el.style.animation = 'none'; });
  }, screen);
  await sleep(300);
}

// ---------------------------------------------------------------- the built page, one screen at a time
const DONE = { complete: true, step: { screen: 'done' } };
const rows = (p) => p.locator('button.hc-prow').first().waitFor();
const BUILT = {
  welcome: [{ watched: false }, async () => {}],
  welcome2: [{ watched: true }, async () => {}],
  signin: [{}, async (p) => {
    await p.getByRole('button', { name: 'Begin the Health Check' }).click();
    await p.getByLabel('Email').fill(MOCK_EMAIL);
    await p.getByLabel('Access code').fill(MOCK_CODE);
    await p.locator('h1').click();
  }],
  // Close on a guided screen: saved, and the return visit's screen.
  ret: [{ step: STEPS.objective }, async (p, s) => {
    s.email = MOCK_EMAIL; s.code = MOCK_CODE; // the stand-in answers to the mock-up's own invented email and code
    await signIn(p, s);
    await p.locator('.ds-guide-close').click();
    await p.getByRole('button', { name: 'Pick up where you left off' }).waitFor();
    await p.locator('h1').click();
  }],
  ...Object.fromEntries(Object.entries(STEPS).map(([k, step]) => [k, [{ step }, signIn]])),
  calm: [{ step: STEPS.objective }, async (p, s) => {
    await signIn(p, s);
    await p.locator('.ds-guide-body textarea').fill('');
    await p.locator('.ds-guide-next').click();
    await p.locator('.ds-guide .ds-error').waitFor();
  }],
  results: [DONE, async (p, s) => { await signIn(p, s); await rows(p); }],
  example: [{}, async (p) => {
    await p.getByRole('button', { name: 'Begin the Health Check' }).click();
    await p.getByRole('button', { name: 'See an example report' }).click();
    await rows(p);
  }],
  video: [DONE, async (p, s) => {
    await signIn(p, s); await rows(p);
    await p.getByRole('button', { name: 'Quick guide' }).click();
    await p.locator(`${DIALOG} .hc-vcard`).waitFor();
    await sleep(500);
    // Compared at the start, paused, as the mock-up is.
    await p.evaluate(() => { const v = document.querySelector('[role=dialog] video'); v.pause(); try { v.currentTime = 0; } catch { /* not loaded */ } });
  }],
  who: [{ step: STEPS.objective }, async (p, s) => { await signIn(p, s); await p.locator('.ds-guide-question .ds-who:not(.ds-play)').click(); await p.locator(DIALOG).waitFor(); }],
  pdf: [DONE, async (p, s) => { await signIn(p, s); await rows(p); await sleep(500); await p.getByRole('button', { name: 'Download my PDF' }).click(); await p.locator(DIALOG).waitFor(); }],
};
const ANCHOR = {
  welcome: ['.ptl', '.ds-guest-title'], welcome2: ['.ptl', '.ds-guest-title'],
  signin: ['#h1', '.ds-guest h1'], ret: ['#h1', '.ds-guest h1'],
  results: ['#h1', '.ds-guide-title'], example: ['#h1', '.ds-guest-title'],
  video: ['.sheet', DIALOG], who: ['.sheet', DIALOG], pdf: ['.sheet', DIALOG],
};
const GUIDED_ANCHOR = ['.qpct', '.ds-guide-pct-track'];
const HIDE = '.ds-sr, .srt, .tipx, .ds-toast-region, .toast, #tw, .rev, .notes, .sim, .cur, .rip, .ds-seg-measure, .hc-capbar, .capbar, .hc-vtime, .tmx';

// A pop-up's lines, one per piece of text (M7b's big figure and its unit are one line).
function popLines(sel) {
  const el = [...document.querySelectorAll(sel)].filter((e) => !e.hidden && e.getBoundingClientRect().width > 0).pop();
  if (!el) return null;
  const out = [];
  const leaf = (e) => {
    const kids = [...e.children].filter((c) => !['SMALL', 'B', 'I', 'EM'].includes(c.tagName) || c.parentElement === el);
    if (e.matches('.tb')) { out.push([...e.childNodes].map((n) => n.textContent.trim()).filter(Boolean).join(' ')); return; }
    if (!kids.length) { const t = e.innerText.replace(/\s+/g, ' ').trim(); if (t) out.push(t); return; }
    for (const n of e.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim()) out.push(n.textContent.replace(/\s+/g, ' ').trim());
      else if (n.nodeType === 1) leaf(n);
    }
  };
  leaf(el);
  return out;
}
function popStyle(sel) {
  const el = [...document.querySelectorAll(sel)].filter((e) => !e.hidden && e.getBoundingClientRect().width > 0).pop();
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { fill: cs.backgroundColor.replace(/\s+/g, ''), colour: cs.color.replace(/\s+/g, ''), size: parseFloat(cs.fontSize), radius: parseFloat(cs.borderTopLeftRadius), font: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim() };
}
// The pop-ups: [name, the screen, how M7b opens it, how the built page opens it, M7b's pop-up, the page's]
const POPS = [
  // "How your answers are kept" and "What is a Success Factor?" open in the side panel since Tim's rule of
  // 16 Nov, 23:31 (a pop-up holds one short line); M7b draws them as pop-ups, so they aren't compared here
  // (tests/healthcheck/flow.mjs checks the panels).
  ['what counts as a project', 'projects', (m) => m.locator('#fr .nudge .ib1').click(), (p) => p.locator('.ds-guide-nudge .ds-guide-i').click(), '#tip', '.ds-infopop'],
  // How to read the chart: a quiet link under the chart opening the side panel (16 Nov), not M7b's ⓘ on the heading.
  ['what strategic importance means', 'results', (m) => m.locator('#fr .prow.h .ib1').click(), (p) => p.locator('.hc-prow--head .ds-guide-i').click(), '#tip', '.ds-infopop', 'desktop'],
  ['a dot’s pop-up', 'results', (m) => m.locator('#fr g.dot[data-n="1"]').focus().then(() => m.keyboard.press('Enter')), (p) => p.locator('.hc-dot[data-n="1"]').focus(), '#tip', '.ds-tip'],
  ['the play icon’s words', 'objective', (m) => m.locator('#fr .ic1').hover(), (p) => p.locator('.ds-guide-question .ds-play').hover(), '.ic1 .tipx', '.ds-infopop', 'desktop'],
];
// A pop-up holds one short line (Tim, 16 Nov, 23:31): M7b's longer words are now one line, and a dot's read-out is its
// number, name, importance and one more fact (Progress and Resource required are in the list under the chart).
const SHORT = 'a pop-up holds one short line since Tim’s rule of 16 Nov, 23:31';
const POP_ALLOW = new Map([
  ['pop:what counts as a project', [['Projects', SHORT], ['Include anything that takes your team’s time, money or people.', SHORT], ['It’s anything that takes your team’s time, money or people.', SHORT]]],
  ['pop:what strategic importance means', [['Strategic importance', SHORT], ['It’s how much a project helps the Success Factors, out of 100%.', SHORT], ['High on every Success Factor scores 100%.', SHORT], ['It’s how much a project helps the Success Factors.', SHORT]]],
  ['pop:a dot’s pop-up', [['Progress is “Bad”.', SHORT], ['Resource required is “Very high”.', SHORT]]],
]);

// ---------------------------------------------------------------- the run
const want = (screen) => !ONLY || ONLY.includes(screen);
const browser = await chromium.launch();
try {
  for (const width of WIDTHS) {
    for (const mode of MODES) {
      const phone = width < 600;
      const tagBase = `${phone ? 'Phone' : 'Desktop'} ${mode}`;
      const mock = await mockOpen(browser, width, mode);
      const built = async (screen) => {
        const [opts, fn] = BUILT[screen];
        const b = await appPage(browser, width, mode, { ...opts, height: phone ? 844 : 860, scale: 2 });
        await fn(b.page, b.session);
        await b.page.evaluate(() => document.fonts.ready);
        await b.page.mouse.move(2, 2);
        await sleep(700);
        return b;
      };
      for (const screen of [...Object.keys(SCREENS), 'welcome2', ...Object.keys(PANELS)]) {
        if (!want(screen)) continue;
        const tag = `${tagBase}, ${screen}`;
        const panel = Boolean(PANELS[screen]);
        const parts = panel ? PANELS[screen] : screen === 'welcome2'
          ? [['Begin, once the guide is watched', '.bnote .btn', '.hc-begin .ds-btn', 0, ['box', 'text', 'fill']], ['the play disc, once watched', '.bigplay .bpc', '.hc-bigplay-mark', 0, ['box', 'fill', 'edge']]]
          : SCREENS[screen];
        let b = null;
        try {
          await mockShow(mock.page, screen);
          b = await built(screen);
          const [ma, ba] = ANCHOR[screen] || GUIDED_ANCHOR;
          const m = await mock.page.evaluate(measureParts, { parts, mock: true, anchor: ma, bottom: '#fr' });
          const bm = await b.page.evaluate(measureParts, { parts, mock: false, anchor: ba, bottom: null });
          compareParts(ctx0, tag, screen, parts, m, bm, phone);
          const mw = await mock.page.evaluate(words, { root: panel ? '.sheet' : '#fr', hide: HIDE });
          const bw = await b.page.evaluate(words, { root: panel ? DIALOG : '.ds-guest, .ds-guide', hide: HIDE });
          compareWords(ctxWords, tag, screen, mw, bw);
          // Read from both pages' own pixels: Back's chevron and its label, and the two small icons beside a title.
          const back = panel ? null : (['signin', 'example'].includes(screen)
            ? [{ button: '.bkl', label: '.bkl', content: '#h1' }, { button: '.hc-back', label: '.hc-back', content: screen === 'signin' ? '.ds-guest h1' : '.ds-guest-title' }]
            : (!ANCHOR[screen] ? [{ button: '.bk', label: '.gl b', content: '.qpct' }, { button: '.ds-guide-back', label: '.ds-guide-name', content: '.ds-guide-pct-track' }] : null));
          if (back) {
            const mb = await backChevron(mock.page, back[0]);
            const bb = await backChevron(b.page, back[1]);
            const say = (x) => (x ? `edge ${x.edge.toFixed(2)}, label ${x.gap.toFixed(2)} after` : 'not found');
            for (const [label, key] of [['Back’s chevron has its visible edge where M7b’s is', 'edge'], ['Back’s label is as far from the chevron as M7b’s', 'gap']]) {
              const ok = Boolean(mb && bb) && Math.abs(mb[key] - bb[key]) <= 0.5;
              const why = allowed(screen, 'Back as drawn', key);
              if (!ok && why) note(`${tag}: ${label}: differs as meant (M7b ${say(mb)}; built ${say(bb)}): ${why}`);
              else pass(`${tag}: ${label}`, ok, `M7b ${say(mb)}; built ${say(bb)}`);
            }
          }
          if (screen === 'objective' || screen === 'results') {
            const mi = await titleIcons(mock.page, { heading: '#h1', play: '#h1 .ic1 svg', eye: '#h1 .eye1 svg' });
            const head = screen === 'results' ? '.ds-guide-title' : '.ds-guide-question';
            const bi = await titleIcons(b.page, { heading: head, play: `${head} .ds-play svg`, eye: `${head} .ds-who:not(.ds-play) svg` });
            const say = (x) => (x ? `${x.gapTitle.toFixed(2)} after the title, ${x.gapPair.toFixed(2)} between; middles ${x.offPlay.toFixed(2)} and ${x.offEye.toFixed(2)} from the capitals’ middle` : 'not found');
            for (const [label, key] of [['the play icon is as far from the title as M7b’s', 'gapTitle'], ['the eye is as far from the play icon as M7b’s', 'gapPair'], ['the play icon is as high as M7b’s', 'offPlay'], ['the eye is as high as M7b’s', 'offEye']]) {
              const ok = Boolean(mi && bi) && Math.abs(mi[key] - bi[key]) <= 0.5;
              const why = allowed(screen, 'the icons as drawn', key);
              if (!ok && why) note(`${tag}: ${label}: differs as meant (M7b ${say(mi)}; built ${say(bi)}): ${why}`);
              else pass(`${tag}: ${label}`, ok, `M7b ${say(mi)}; built ${say(bi)}`);
            }
          }
          pass(`${tag}: no console or page errors`, b.problems.length === 0, b.problems.join(' | '));
          pass(`${tag}: nothing asked of an outside address`, b.session.outside.length === 0, b.session.outside.join(' | '));
          await b.page.screenshot({ path: join(out, `${screen}-${width}-${mode}-built.png`) });
          await mock.page.locator('#fr').screenshot({ path: join(out, `${screen}-${width}-${mode}-m7b.png`) });
          // The pop-ups on this screen, word for word, and how the pop-up is drawn.
          for (const [name, on, openMock, openBuilt, mSel, bSel, only] of POPS) {
            if (on !== screen || (only === 'desktop' && phone)) continue;
            await openMock(mock.page); await sleep(300);
            await openBuilt(b.page); await sleep(500);
            const ml = await mock.page.evaluate(popLines, mSel);
            const bl = await b.page.evaluate(popLines, bSel);
            const key = `pop:${name}`;
            if (!ml || !bl) { pass(`${tag}: the pop-up for ${name} opens on both`, false, `M7b ${ml ? 'opened' : 'did not open'}, built ${bl ? 'opened' : 'did not open'}`); continue; }
            compareWords({ ...ctxWords, mockOnly: POP_ALLOW, builtOnly: POP_ALLOW }, `${tag}, the pop-up for ${name}`, key, ml, bl);
            const ms = await mock.page.evaluate(popStyle, mSel);
            const bs = await b.page.evaluate(popStyle, bSel);
            for (const k of ['fill', 'colour', 'size', 'radius', 'font']) {
              const why = allowed(key, 'the pop-up', k);
              if (ms[k] !== bs[k] && why) note(`${tag}, the pop-up for ${name}: ${k} differs as meant (M7b ${ms[k]}, built ${bs[k]}): ${why}`);
              else pass(`${tag}, the pop-up for ${name}: ${k}`, ms[k] === bs[k], `M7b ${ms[k]}, built ${bs[k]}`);
            }
            await b.page.screenshot({ path: join(out, `pop-${name.replace(/[^a-z]+/gi, '-')}-${width}-${mode}-built.png`) });
            await mock.page.keyboard.press('Escape'); await mock.page.mouse.move(2, 2);
            await b.page.keyboard.press('Escape'); await b.page.mouse.move(2, 2);
            await sleep(200);
          }
        } catch (error) {
          pass(`${tag}: compared`, false, `${error.message}`.split('\n')[0]);
        }
        if (b) await b.ctx.close();
        if (screen === 'calm') await mockShow(mock.page, 'calm:undo');
      }
      await mock.ctx.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(out, 'report.txt'), `${results.join('\n')}\n`);
const failures = report.failures();
console.log(results.filter((r) => r.startsWith('FAIL')).join('\n'));
console.log(`${results.filter((r) => r.startsWith('PASS')).length} passed, ${failures} failed, ${results.filter((r) => r.startsWith('NOTE')).length} notes. Report: ${join(out, 'report.txt')}`);
process.exit(failures ? 1 : 0);
