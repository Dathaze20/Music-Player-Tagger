import { describe, it, expect } from 'vitest';
import TextUtils from '../www/text-utils.js';

const { fmtTime, escHtml, parseFileName, parseLRC } = TextUtils;

describe('fmtTime', () => {
  it('formats seconds as m:ss', () => {
    expect(fmtTime(0)).toBe('0:00');
    expect(fmtTime(65)).toBe('1:05');
    expect(fmtTime(3661)).toBe('61:01');
  });

  it('falls back to 0:00 for invalid input', () => {
    expect(fmtTime(NaN)).toBe('0:00');
    expect(fmtTime(undefined)).toBe('0:00');
  });
});

describe('escHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(escHtml('<script>alert("hi")</script>')).toBe(
      '&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt;'
    );
  });

  it('handles nullish input', () => {
    expect(escHtml(null)).toBe('');
    expect(escHtml(undefined)).toBe('');
  });
});

describe('parseFileName', () => {
  it('splits "Artist - Title" style names', () => {
    expect(parseFileName('Daft Punk - One More Time.mp3')).toEqual({
      artist: 'Daft Punk',
      title: 'One More Time',
      feat: '',
    });
  });

  it('strips a leading track number', () => {
    expect(parseFileName('03 - Artist - Title.mp3')).toEqual({
      artist: 'Artist',
      title: 'Title',
      feat: '',
    });
  });

  it('pulls out a featured artist', () => {
    const result = parseFileName('Artist - Title feat. Someone Else.mp3');
    expect(result.artist).toBe('Artist');
    expect(result.title).toBe('Title');
    expect(result.feat).toBe('Someone Else');
  });

  it('strips bracketed "Official Audio" style tags', () => {
    const result = parseFileName('Artist - Title [Official Audio].mp3');
    expect(result.title).toBe('Title');
  });

  it('falls back to Unknown Artist when there is no separator', () => {
    expect(parseFileName('justatitle.mp3')).toEqual({
      artist: 'Unknown Artist',
      title: 'justatitle',
      feat: '',
    });
  });

  it('handles underscore-separated names', () => {
    expect(parseFileName('Some_Artist_-_Some_Title.mp3')).toEqual({
      artist: 'Some Artist',
      title: 'Some Title',
      feat: '',
    });
  });
});

describe('parseLRC', () => {
  it('parses timestamped lyric lines in order', () => {
    const lrc = '[00:01.00]First line\n[00:05.50]Second line';
    expect(parseLRC(lrc)).toEqual([
      { time: 1, text: 'First line' },
      { time: 5.5, text: 'Second line' },
    ]);
  });

  it('sorts out-of-order lines by time', () => {
    const lrc = '[00:10.00]Later\n[00:02.00]Earlier';
    const result = parseLRC(lrc);
    expect(result.map((l) => l.text)).toEqual(['Earlier', 'Later']);
  });

  it('skips lines with no lyric text', () => {
    const lrc = '[00:01.00]\n[00:02.00]Has text';
    expect(parseLRC(lrc)).toEqual([{ time: 2, text: 'Has text' }]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseLRC('')).toEqual([]);
    expect(parseLRC(null)).toEqual([]);
  });
});

// Genre fields arrive from a file's own tag, from MusicBrainz as lowercase free
// text, and from the model — none of which agree on spelling. A library ended
// up with "RB", "rnb" and "R&b" as separate genres of the same music.
describe('canonicalGenre', () => {
  const { canonicalGenre } = TextUtils;

  it('spells every form of R&B the same way', () => {
    ['RB', 'rb', 'rnb', 'RnB', 'R n B', 'R&B', 'r&b', 'R & B',
     'Rhythm and Blues', 'rhythm & blues'].forEach(g => {
      expect(canonicalGenre(g)).toBe('R&B');
    });
  });

  it('does not leave an acronym half-capitalised', () => {
    // What capitalising only the first letter used to produce.
    expect(canonicalGenre('edm')).toBe('EDM');
    expect(canonicalGenre('idm')).toBe('IDM');
    expect(canonicalGenre('uk garage')).toBe('UK Garage');
    expect(canonicalGenre('ost')).toBe('Soundtrack');
  });

  it('hyphenates the compounds that are normally hyphenated', () => {
    expect(canonicalGenre('hip hop')).toBe('Hip-Hop');
    expect(canonicalGenre('HipHop')).toBe('Hip-Hop');
    expect(canonicalGenre('neo soul')).toBe('Neo-Soul');
    expect(canonicalGenre('lofi')).toBe('Lo-Fi');
    expect(canonicalGenre('g funk')).toBe('G-Funk');
  });

  it('keeps a longer phrase together instead of casing word by word', () => {
    expect(canonicalGenre('east coast hip hop')).toBe('East Coast Hip-Hop');
    expect(canonicalGenre('contemporary r&b')).toBe('Contemporary R&B');
    expect(canonicalGenre('lo-fi hip hop')).toBe('Lo-Fi Hip-Hop');
  });

  it('splits a field holding two genres and spells both', () => {
    expect(canonicalGenre('Rap/Hip-Hop')).toBe('Rap / Hip-Hop');
    expect(canonicalGenre('soul, funk')).toBe('Soul / Funk');
  });

  it('does not duplicate a genre written twice in one field', () => {
    expect(canonicalGenre('Hip Hop/HipHop')).toBe('Hip-Hop');
    expect(canonicalGenre('RB, rnb')).toBe('R&B');
  });

  it('leaves an unrecognised genre alone apart from its casing', () => {
    expect(canonicalGenre('shoegaze')).toBe('Shoegaze');
    expect(canonicalGenre('Bachata')).toBe('Bachata');
    expect(canonicalGenre('outlaw country')).toBe('Outlaw Country');
    expect(canonicalGenre('zamrock')).toBe('Zamrock');
  });

  it('does not match an acronym hiding inside a longer word', () => {
    expect(canonicalGenre('Serbian Folk')).toBe('Serbian Folk');
    expect(canonicalGenre('Ukulele')).toBe('Ukulele');
  });

  it('has nothing to say about an empty field', () => {
    expect(canonicalGenre('')).toBe('');
    expect(canonicalGenre(null)).toBe('');
    expect(canonicalGenre('   ')).toBe('');
  });

  it('is stable — canonicalising twice changes nothing', () => {
    ['RB', 'hip hop', 'Rap/Hip-Hop', 'edm', 'east coast hip hop', 'Shoegaze']
      .forEach(g => {
        const once = canonicalGenre(g);
        expect(canonicalGenre(once)).toBe(once);
      });
  });
});
