import { describe, it, expect } from 'vitest';
import TextUtils from '../text-utils.js';

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
