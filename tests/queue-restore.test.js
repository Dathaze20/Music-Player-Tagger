// What is playing survives a relaunch; the queue behind it did not. The song
// came back, the Next and Previous buttons returned at their first line, and
// the only thing that worked was playing the same track again — which reads as
// "it will only repeat". These pin down the rebuild so it cannot quietly go
// back to an empty queue.
//
// app.js is a single browser script with no exports, so the functions under
// test are lifted out of it by name and evaluated together, the same way the
// other suites do it: the shipped code is what runs, not a copy of it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'www', 'app.js'),
  'utf8'
);

function extract(name) {
  const start = SRC.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`app.js no longer defines ${name}()`);
  let depth = 0;
  for (let i = SRC.indexOf('{', start); i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}' && --depth === 0) return SRC.slice(start, i + 1);
  }
  throw new Error(`could not find the end of ${name}()`);
}

// A fresh world per test: the globals these two read, and nothing else.
function world(library) {
  return new Function('__lib', `
    var songs = __lib;
    var queue = [];
    var currentSong = null;
    var _restoreQueueFns = null;
    ${extract('rebuildQueue')}
    ${extract('ensureQueue')}
    return {
      rebuildQueue: rebuildQueue,
      ensureQueue: ensureQueue,
      set: function(k, v) {
        if (k === 'queue') queue = v;
        if (k === 'currentSong') currentSong = v;
        if (k === '_restoreQueueFns') _restoreQueueFns = v;
      },
      get: function(k) {
        if (k === 'queue') return queue;
        if (k === 'currentSong') return currentSong;
        return undefined;
      }
    };
  `)(library);
}

const song = (fn, id) => ({ fn, id: id || 'id-' + fn, title: fn });

// Six tracks of an album, plus other things in the library around it — ids are
// deliberately unlike the names, because ids are minted fresh on every launch
// and are exactly what cannot be relied on across one.
const ALBUM = ['a1.mp3', 'a2.mp3', 'a3.mp3', 'a4.mp3', 'a5.mp3', 'a6.mp3'].map((f, i) => song(f, 'x' + i));
const OTHER = ['z1.mp3', 'z2.mp3'].map((f, i) => song(f, 'z' + i));
const LIBRARY = OTHER.slice(0, 1).concat(ALBUM, OTHER.slice(1));
const FNS = ALBUM.map(s => s.fn);

describe('rebuilding the queue behind a restored song', () => {
  it('puts the album back, in the order it was saved in', () => {
    const w = world(LIBRARY);
    const out = w.rebuildQueue(FNS, ALBUM[2]);
    expect(out.map(s => s.fn)).toEqual(FNS);
  });

  it('matches by name, not by id, because ids do not survive a launch', () => {
    // The same album, loaded again with every id different.
    const relaunched = LIBRARY.map(s => ({ ...s, id: 'fresh-' + Math.random() }));
    const w = world(relaunched);
    const current = relaunched.find(s => s.fn === 'a3.mp3');
    const out = w.rebuildQueue(FNS, current);
    expect(out.map(s => s.fn)).toEqual(FNS);
    expect(out.some(s => s.id === current.id)).toBe(true);
  });

  it('keeps a shuffled order rather than re-sorting it', () => {
    const shuffled = ['a4.mp3', 'a1.mp3', 'a6.mp3', 'a3.mp3', 'a2.mp3', 'a5.mp3'];
    const w = world(LIBRARY);
    const current = LIBRARY.find(s => s.fn === 'a3.mp3');
    expect(w.rebuildQueue(shuffled, current).map(s => s.fn)).toEqual(shuffled);
  });

  it('drops names that are no longer in the library', () => {
    const w = world(LIBRARY);
    const current = LIBRARY.find(s => s.fn === 'a2.mp3');
    const out = w.rebuildQueue(['a1.mp3', 'gone.mp3', 'a2.mp3'], current);
    expect(out.map(s => s.fn)).toEqual(['a1.mp3', 'a2.mp3']);
  });

  it('falls back to the library when nothing was saved', () => {
    // State written by a build that did not store the queue at all.
    const w = world(LIBRARY);
    expect(w.rebuildQueue(null, LIBRARY[0])).toBe(LIBRARY);
    expect(w.rebuildQueue([], LIBRARY[0])).toBe(LIBRARY);
  });

  it('falls back when the restored list does not contain what is playing', () => {
    // Otherwise Next would jump somewhere unrelated instead of carrying on.
    const w = world(LIBRARY);
    const current = LIBRARY.find(s => s.fn === 'z2.mp3');
    expect(w.rebuildQueue(FNS, current)).toBe(LIBRARY);
  });

  it('survives an empty library without throwing', () => {
    const w = world([]);
    expect(w.rebuildQueue(FNS, song('a1.mp3'))).toEqual([]);
  });
});

describe('ensureQueue only ever fills an empty queue', () => {
  it('gives Next something to walk after a relaunch', () => {
    const w = world(LIBRARY);
    w.set('currentSong', LIBRARY.find(s => s.fn === 'a3.mp3'));
    w.set('_restoreQueueFns', FNS);
    expect(w.get('queue')).toHaveLength(0);     // the bug, as reported
    expect(w.ensureQueue()).toBe(true);
    expect(w.get('queue').map(s => s.fn)).toEqual(FNS);
  });

  it('leaves a queue that already exists completely alone', () => {
    const w = world(LIBRARY);
    const mine = [LIBRARY[0], LIBRARY[1]];
    w.set('currentSong', LIBRARY[5]);           // deliberately not in it
    w.set('queue', mine);
    w.set('_restoreQueueFns', FNS);
    expect(w.ensureQueue()).toBe(true);
    expect(w.get('queue')).toBe(mine);
  });

  it('falls back to the library when no queue was saved', () => {
    const w = world(LIBRARY);
    w.set('currentSong', LIBRARY[2]);
    expect(w.ensureQueue()).toBe(true);
    expect(w.get('queue')).toBe(LIBRARY);
  });

  it('says no when nothing is playing', () => {
    const w = world(LIBRARY);
    expect(w.ensureQueue()).toBe(false);
  });

  it('says no when there is nothing to play at all', () => {
    const w = world([]);
    w.set('currentSong', song('a1.mp3'));
    expect(w.ensureQueue()).toBe(false);
  });
});

describe('tapping one song rebuilds its address instead of refusing', () => {
  // loadLibrary() blanks .url on every launch, so the tap handler cannot read
  // it raw — that is what turned a tap into "Re-import your music folder" for a
  // song that played perfectly well once the album was started and skipped into.
  it('loadLibrary still blanks every url, so the guard must not trust it', () => {
    expect(extract('loadLibrary')).toContain("s.url = ''");
  });

  it('the song-row tap goes through ensureSongUrl, not a bare .url read', () => {
    const marker = SRC.indexOf("Re-import your music folder to enable playback");
    expect(marker).toBeGreaterThan(-1);
    const line = SRC.slice(SRC.lastIndexOf('\n', marker) + 1, marker);
    expect(line).toContain('ensureSongUrl');
  });

  it('ensureSongUrl mints the address from the content URI it kept', () => {
    const body = extract('ensureSongUrl');
    expect(body).toContain('contentUri');
    expect(body).toContain('convertFileSrc');
  });
});
