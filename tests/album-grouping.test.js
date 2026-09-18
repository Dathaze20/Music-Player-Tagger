// How songs are grouped into albums, and how a card on an artist page finds the
// album it opens. These two have disagreed twice now, and each time the symptom
// was a library filling up with one-song albums and cards that open onto
// nothing — so they are pinned down here.
//
// app.js is a single browser script with no exports, so the functions under
// test are lifted out of it by name and evaluated together. Crude, but it means
// the real shipped code is what gets tested rather than a copy of it that can
// drift.

import { describe, it, expect, beforeEach } from 'vitest';
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

const NAMES = [
  'albumArtistKeyOf', '_leadCredit', '_buildAlbumCreditMap', 'albumGroupKeyOf',
  '_buildSongCaches', 'getAlbumSongs', 'getArtistSongs', 'getArtistAlbums',
  'getBestAlbumArtistKey', 'artistPageNameFor',
  'isUnknownArtistName', 'findArtistsFromAlbums',
];

function loadLibrary(library) {
  const sep = SRC.match(/var _CREDIT_SEP = .*;/)[0];
  const vague = SRC.match(/var _VAGUE_ALBUM = .*;/)[0];
  // eslint-disable-next-line no-new-func
  return new Function(`
    ${sep}
    ${vague}
    var songs = ${JSON.stringify(library)};
    var _albumCreditMap = null, _artistSongsCache = null, _albumSongsCache = null;
    function safeArtUrl(u) { return u || ''; }
    ${NAMES.map(extract).join('\n')}
    _buildSongCaches();
    return { ${NAMES.join(', ')} };
  `)();
}

const song = (title, album, artist, albumArtist, track) => ({
  title, album, artist, albumArtist: albumArtist ?? artist, track, dur: 180,
});

describe('a guest credit does not split an album', () => {
  let api;
  beforeEach(() => {
    api = loadLibrary([
      song('Intro',         'Gorillaween, Vol. 3 - EP', 'Sheek Louch', null, 1),
      song('Gorilla',       'Gorillaween, Vol. 3 - EP', 'Sheek Louch', null, 2),
      song('Clear My Mind', 'Gorillaween, Vol. 3 - EP', 'Sheek Louch/Dave East', null, 4),
    ]);
  });

  it('files the featured track with the rest of the album', () => {
    expect(api.getAlbumSongs('Gorillaween, Vol. 3 - EP', 'Sheek Louch')).toHaveLength(3);
  });

  it('leaves the artist page with one album, not two', () => {
    const albums = api.getArtistAlbums('Sheek Louch');
    expect(albums).toHaveLength(1);
    expect(albums[0].songCount).toBe(3);
  });
});

describe('a name that merely contains a separator is left alone', () => {
  it('keeps AC/DC together and does not invent an artist called AC', () => {
    const api = loadLibrary([
      song('Hells Bells', 'Back in Black', 'AC/DC', null, 1),
      song('Shoot to Thrill', 'Back in Black', 'AC/DC', null, 2),
    ]);
    expect(api.getAlbumSongs('Back in Black', 'AC/DC')).toHaveLength(2);
    expect(api.getAlbumSongs('Back in Black', 'AC')).toHaveLength(0);
    expect(api.getArtistAlbums('AC/DC')).toHaveLength(1);
  });

  it('keeps a comma-and-ampersand band name intact', () => {
    const api = loadLibrary([song('Shining Star', 'Gratitude', 'Earth, Wind & Fire', null, 1)]);
    expect(api.getAlbumSongs('Gratitude', 'Earth, Wind & Fire')).toHaveLength(1);
  });
});

describe('_leadCredit', () => {
  let lead;
  beforeEach(() => { lead = loadLibrary([])._leadCredit; });

  it('finds the lead name in a joint credit', () => {
    expect(lead('Sheek Louch/Dave East')).toBe('Sheek Louch');
    expect(lead('Jay-Z x Kanye West')).toBe('Jay-Z');
    expect(lead('Method Man & Redman')).toBe('Method Man');
  });

  it('returns nothing when there is no second name to drop', () => {
    expect(lead('Sheek Louch')).toBe('');
    expect(lead('/Nobody')).toBe('');
    expect(lead('')).toBe('');
  });
});

describe('a guest verse on somebody else’s record', () => {
  let api;
  beforeEach(() => {
    api = loadLibrary([
      song('Young Ns',               'Street Dreams',      'Fabolous', null,      1),
      song('Da Streets Freestyle',   'Best Of Clue Pt II', 'Fabolous', 'DJ Clue', 3),
      song('Nas Freestyle',          'Best Of Clue Pt II', 'Nas',      'DJ Clue', 4),
    ]);
  });

  it('stays on the record it belongs to', () => {
    expect(api.getAlbumSongs('Best Of Clue Pt II', 'DJ Clue')).toHaveLength(2);
  });

  it('gives the artist card the key that actually opens the album', () => {
    const clue = api.getArtistAlbums('Fabolous').find(a => a.name === 'Best Of Clue Pt II');
    expect(clue.artist).toBe('DJ Clue');
    // The count on the card is what tapping it shows — this is the pair that
    // used to read "1 song" and open onto "0 songs".
    expect(api.getAlbumSongs(clue.name, clue.artist)).toHaveLength(clue.songCount);
  });

  it('finds the album even when asked with the wrong key', () => {
    expect(api.getBestAlbumArtistKey('Best Of Clue Pt II', null)).toBe('DJ Clue');
  });

  it('sends Go to artist to somebody who has a page', () => {
    // DJ Clue is the album artist but performs nothing, so his page is empty.
    expect(api.artistPageNameFor('Best Of Clue Pt II', 'DJ Clue')).toBe('Fabolous');
    expect(api.artistPageNameFor('Street Dreams', 'Fabolous')).toBe('Fabolous');
  });
});

describe('borrowing an artist from the rest of the album', () => {
  const proposals = (library) =>
    loadLibrary(library).findArtistsFromAlbums()
      .map(f => `${f.song.title} -> ${f.artist}`).sort();

  it('gives an artist-less track the name the rest of its album agrees on', () => {
    expect(proposals([
      song('Ambitionz',  'All Eyez On Me', '2Pac', null, 1),
      song('All About U','All Eyez On Me', '2Pac', null, 2),
      song('Skandalouz', 'All Eyez On Me', '',     '',   3),
    ])).toEqual(['Skandalouz -> 2Pac']);
  });

  it('treats a guest credit as the same artist, not a disagreement', () => {
    expect(proposals([
      song('Intro',   'Gorillaween, Vol. 3 - EP', 'Sheek Louch',            null, 1),
      song('Clear',   'Gorillaween, Vol. 3 - EP', 'Sheek Louch/Dave East',  null, 2),
      song('Unknown', 'Gorillaween, Vol. 3 - EP', 'Unknown Artist',         '',   3),
    ])).toEqual(['Unknown -> Sheek Louch']);
  });

  it('refuses when two artists share an album title', () => {
    // Two different records both called "Greatest Hits 2" — there is no way to
    // tell which one the untagged song belongs to, so it is left alone.
    expect(proposals([
      song('A side',  'Greatest Hits 2', 'Total', null, 1),
      song('B side',  'Greatest Hits 2', 'SWV',   null, 1),
      song('Mystery', 'Greatest Hits 2', '',      '',   2),
    ])).toEqual([]);
  });

  it('refuses on an album name that identifies nothing', () => {
    expect(proposals([
      song('Known',   'Unknown Album', '2Pac', null, 1),
      song('Mystery', 'Unknown Album', '',     '',   2),
    ])).toEqual([]);
    expect(proposals([
      song('Known',   'Greatest Hits', '2Pac', null, 1),
      song('Mystery', 'Greatest Hits', '',     '',   2),
    ])).toEqual([]);
  });

  it('refuses when nobody on the album is named', () => {
    expect(proposals([
      song('One', 'Some Mixtape Vol 4', '', '', 1),
      song('Two', 'Some Mixtape Vol 4', '', '', 2),
    ])).toEqual([]);
  });

  it('leaves songs that already have an artist alone', () => {
    expect(proposals([
      song('One', 'Street Dreams', 'Fabolous', null, 1),
      song('Two', 'Street Dreams', 'Fabolous', null, 2),
    ])).toEqual([]);
  });

  it('knows which names mean the field was empty', () => {
    const { isUnknownArtistName } = loadLibrary([]);
    expect(isUnknownArtistName('')).toBe(true);
    expect(isUnknownArtistName('Unknown Artist')).toBe(true);
    expect(isUnknownArtistName('unknown')).toBe(true);
    expect(isUnknownArtistName('2Pac')).toBe(false);
    expect(isUnknownArtistName('VA')).toBe(false); // could be a real name
  });
});
