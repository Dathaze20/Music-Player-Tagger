// The library's fields are written out by hand in several places: the scan
// mapping that turns a MediaStore row into a file, the two save paths, and the
// merges that fold fresh scan data onto songs already known. Nothing ties those
// lists together, so a field added to one and forgotten in another is invisible
// — the app keeps working and quietly loses that one value.
//
// It has happened twice. dateAdded was dropped by the scan mapping, so every
// song was stored with no date and "Date added" sorted a list in which
// everything tied. Fixing that exposed the same omission one layer down: the
// date reached localStorage but not IndexedDB, which is the store that actually
// holds a large library, so it was discarded on every save and rebuilt from
// MediaStore on every launch.
//
// These tests read the field lists straight out of app.js and compare them, so
// the next omission fails here instead of shipping.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(ROOT, 'www', 'app.js'), 'utf8');
const BRIDGE = readFileSync(join(ROOT, 'www', 'native-bridge.js'), 'utf8');

/**
 * The keys of the object literal returned inside the function at `marker`.
 *
 * Walks the source rather than evaluating it, so the lists can be compared
 * without pulling the whole app into the test.
 */
function fieldsOf(src, marker, label) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`could not find ${label} (${marker})`);
  // The fields live in the `return { ... }` inside that function, not in the
  // function body itself.
  const ret = src.indexOf('return {', start);
  if (ret < 0) throw new Error(`no return object in ${label}`);
  const open = src.indexOf('{', ret);
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error(`unterminated return object in ${label}`);

  // Comments out, first. A field preceded by an explanatory comment would
  // otherwise be read as following that comment's last character rather than
  // the comma before it, and be skipped.
  const body = src.slice(open + 1, end)
    .split('\n')
    .filter(l => !/^\s*\/\//.test(l))          // whole-line comments
    .map(l => (l.indexOf("'") === -1 && l.indexOf('"') === -1)
      ? l.replace(/\/\/.*$/, '')                // trailing comments, when no string could contain //
      : l)
    .join('\n');
  const keys = new Set();
  let d = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '{' || c === '(' || c === '[') { d++; continue; }
    if (c === '}' || c === ')' || c === ']') { d--; continue; }
    if (d !== 0) continue;
    // A key is an identifier followed by ':' that starts the line or follows a
    // comma — never the ':' of a ternary, which sits at depth 0 too.
    const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(body.slice(i));
    if (!m) continue;
    let j = i - 1;
    while (j >= 0 && /\s/.test(body[j])) j--;
    const prev = j >= 0 ? body[j] : ',';
    if (prev === ',' || prev === '{') keys.add(m[1]);
    i += m[0].length - 1;
  }
  if (keys.size === 0) throw new Error(`parsed no fields out of ${label}`);
  return keys;
}

const leanFields = () => fieldsOf(APP, 'var lean = songs.map(function(s) {', 'the localStorage snapshot');
const idbFields  = () => fieldsOf(APP, 'var snapshot = songs.map(function(s) {', 'the IndexedDB snapshot');

describe('the two save paths agree on what a song is', () => {
  it('IndexedDB keeps everything localStorage keeps', () => {
    // IndexedDB is the real store: localStorage only ever holds a truncated
    // preview, so anything worth putting in the preview is worth keeping here.
    const missing = [...leanFields()].filter(f => !idbFields().has(f));
    expect(missing).toEqual([]);
  });

  it('both of them keep the date a song was added', () => {
    // The field this suite exists for.
    expect(leanFields().has('dateAdded')).toBe(true);
    expect(idbFields().has('dateAdded')).toBe(true);
  });

  it('keeps the fields the sorts read', () => {
    // Every sort in renderSongs reads one of these off a stored song. A sort
    // whose field is not persisted silently stops working after a reload.
    const idb = idbFields();
    ['title', 'artist', 'album', 'year', 'dur', 'dateAdded', 'playCount', 'lastPlayed', 'disc', 'track']
      .forEach(f => expect(idb, `IndexedDB drops "${f}", which a sort reads`).toContain(f));
  });
});

describe('the scan hands over what the library stores', () => {
  const scanFields = () => fieldsOf(BRIDGE, 'return files.map(function(f) {', 'the MediaStore scan mapping');

  it('carries the date MediaStore reports', () => {
    expect(scanFields().has('dateAdded')).toBe(true);
  });

  it('carries everything the song record is built from', () => {
    const scan = scanFields();
    ['title', 'artist', 'album', 'albumArtist', 'year', 'genre', 'dur',
     'track', 'disc', 'contentUri', 'albumArtUri', 'dateAdded']
      .forEach(f => expect(scan, `the scan mapping drops "${f}"`).toContain(f));
  });
});
