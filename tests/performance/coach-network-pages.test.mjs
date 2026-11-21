// Network's page rules (builder E, Phase 6a run 4, step 4): the address,
// Show only's choices, a row after a change, the import's rows and words,
// export in pages, search, and reading an Excel file with no library.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import {
  columnSwitches, exportChoices, exportQueries, EXPORT_PAGE, FOCUS_ONLY, importFileKind, importSummary, IMPORT_WORDS, moreWords, networkPath, networkProblem, networkSearchItems, networkSheetRows, onlyChoices,
  RHYTHM_ONLY, rowAfter, searchQuery, tableColumns,
} from '../../src/lib/coach/network.js';
import { xlsxBytes, xlsxTable } from '../../src/lib/coach/xlsx.js';

const TODAY = '2026-11-17';

test('networkPath: Actions has no tab in the address; the archive is the table with archived; a person rides along', () => {
  assert.equal(networkPath(), '/coach/network');
  assert.equal(networkPath({ tab: 'map' }), '/coach/network?tab=map');
  assert.equal(networkPath({ archived: true }), '/coach/network?tab=table&archived=1');
  assert.equal(networkPath({ tab: 'table', person: 'p1' }), '/coach/network?tab=table&person=p1');
});

test('onlyChoices: the lists and rhythms are fixed; Role offers the usual roles and those showing; a choice already made stays offered', () => {
  assert.deepEqual(onlyChoices({ only: 'focus' }), FOCUS_ONLY);
  assert.deepEqual(onlyChoices({ only: 'rhythm' }), RHYTHM_ONLY);
  assert.deepEqual(onlyChoices({ key: 'name' }), []);
  const roles = onlyChoices({ only: 'role', key: 'role' }, [{ role: 'Investor' }], {}).map(([v]) => v);
  assert.ok(roles.includes('Investor') && roles.includes('Sponsor'));
  const orgs = onlyChoices({ only: 'organisation', key: 'organisation' }, [{ organisation: 'Kestrel' }], { only: { organisation: ['Citadel'] } }).map(([v]) => v);
  assert.deepEqual(orgs, ['Citadel', 'Kestrel']);
});

test('rowAfter: Where to focus is worked out again from the change, so the table and map move at once', () => {
  const before = { id: 'a', influence: 9, trust: 6, value_delivery: 8, what_you_get: 5, rhythm_months: 3, last_spoke_on: '2026-10-01' };
  assert.equal(rowAfter(before, {}).focus, 'invest');
  assert.equal(rowAfter(before, { trust: 8, what_you_get: 8 }).focus, 'keep_close');
});

test('networkSheetRows: first and last names are joined, unmatched columns kept by heading, a row with no name is left out', () => {
  const table = [['Ada', 'Lane', 'Kestrel', 'Logistics'], ['', '', 'Nobody', 'x'], ['Bo Chen', '', 'Citadel', '']];
  const columns = [{ index: 0, heading: 'First', field: 'first' }, { index: 1, heading: 'Last', field: 'last' }, { index: 2, heading: 'Company', field: 'organisation' }, { index: 3, heading: 'Sector', field: null }];
  const { rows, skipped } = networkSheetRows(table, columns);
  assert.equal(skipped, 1);
  assert.deepEqual(rows[0], { organisation: 'Kestrel', name: 'Ada Lane', extra: { Sector: 'Logistics' } });
  assert.equal(rows[1].name, 'Bo Chen');
  assert.deepEqual(rows[1].extra, {});
});

test('importSummary and importFileKind: what the panel says, and which files can be read here', () => {
  assert.equal(importSummary({ adding: 1, duplicates: 1, skipped: 1 }), '1 person to add. 1 may already be here. 1 row has no name, so it is left out.');
  assert.equal(importSummary({ adding: 0, duplicates: 0, skipped: 2 }), 'Nobody new to add yet. 2 rows have no name, so they are left out.');
  assert.deepEqual(importFileKind('People.XLSX', 1000), { kind: 'xlsx' });
  assert.deepEqual(importFileKind('people.csv'), { kind: 'text' });
  assert.deepEqual(importFileKind('people.numbers'), { problem: IMPORT_WORDS.unreadable });
  assert.deepEqual(importFileKind('big.csv', 9 * 1024 * 1024), { problem: IMPORT_WORDS.tooBig });
});

test('export asks a page at a time, never everyone at once; "This view" only while the table is narrowed', () => {
  const qs = exportQueries('all', {}, 450, TODAY);
  assert.equal(qs.length, Math.ceil(450 / EXPORT_PAGE));
  assert.ok(qs.every((q) => q.limit === EXPORT_PAGE));
  assert.deepEqual(qs.map((q) => q.offset), [0, 200, 400]);
  assert.equal(exportChoices(4, 18, false).length, 2);
  assert.equal(exportChoices(4, 18, true)[0].label, 'This view, 4 people');
});

test('search: a few at a time, by name or organisation, each opening the person (an archived one in the archive)', () => {
  const q = searchQuery('  sofia ', TODAY);
  assert.equal(q.search, 'sofia');
  assert.equal(q.limit, 6);
  const [a, b] = networkSearchItems([{ id: 'x', name: 'Sofia Marsh', organisation: 'Kestrel' }, { id: 'y', name: 'Adam Ford', archived_at: '2026-01-01' }]);
  assert.equal(a.kind, 'Network');
  assert.equal(a.to, '/coach/network?tab=table&person=x');
  assert.equal(b.kind, 'Network, archived');
  assert.equal(b.to, '/coach/network?tab=table&archived=1&person=y');
});

test('networkProblem never shows the database’s words; moreWords counts what is left', () => {
  assert.match(networkProblem({ code: '42501', message: 'permission denied for table network_people' }), /owner’s to change/);
  assert.equal(networkProblem({ message: 'relation "network_people" violates' }), 'That didn’t save. Check your connection and try again.');
  assert.equal(moreWords(50, 50), '');
  assert.match(moreWords(8, 30), /^Show \d+ more$/);
});

test('columnSwitches: Name always shows and has no switch; each switch carries its line of meaning', () => {
  const sw = columnSwitches([], null);
  assert.ok(!sw.some((c) => c.key === 'name'));
  assert.ok(sw.every((c) => typeof c.note === 'string' && c.note.length > 0));
  assert.equal(sw.length, tableColumns([], null).all.filter((c) => !c.fixed).length);
});

// ---------------------------------------------------------------- Excel, read with no library

test('xlsxTable reads back what xlsxBytes writes (stored parts, inline strings, numbers)', async () => {
  const rows = [['Name', 'Influence', 'Note'], ['Sofia Marsh', 9, 'Tom & Jerry <ok>'], ['', '', ''], ['Dan Reid', 4.5, '']];
  assert.deepEqual(await xlsxTable(xlsxBytes(rows)), [['Name', 'Influence', 'Note'], ['Sofia Marsh', '9', 'Tom & Jerry <ok>'], ['Dan Reid', '4.5']]);
});

/** A deflated zip, as Excel itself writes one. */
function deflatedZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = enc.encode(name);
    const raw = enc.encode(text);
    const data = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(n.length, 26);
    parts.push(local, n, data);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(8, 10); dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(raw.length, 24); dir.writeUInt16LE(n.length, 28); dir.writeUInt32LE(offset, 42);
    central.push(dir, n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((s, p) => s + p.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, ...central, end]));
}

test('xlsxTable reads a deflated workbook: shared strings, a date cell, a gap in the row, a formula’s saved value, never the formula', async () => {
  const file = deflatedZip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="People" sheetId="1" r:id="rId7"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId7" Target="worksheets/people.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Name</t></si><si><t>Last spoke</t></si><si><r><t>Ruth </t></r><r><t>Adeyemi</t></r></si></sst>',
    'xl/styles.xml': '<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
    'xl/worksheets/people.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><f>SUM(1,2)</f><v>3</v></c><c r="C2" s="1"><v>45942</v></c></row></sheetData></worksheet>',
  });
  assert.deepEqual(await xlsxTable(file), [['Name', '', 'Last spoke'], ['Ruth Adeyemi', '3', '2025-10-12']]);
});

test('xlsxTable refuses what isn’t a workbook', async () => {
  await assert.rejects(() => xlsxTable(new TextEncoder().encode('Name,Email\nA,b')));
});
