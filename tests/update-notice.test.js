// The automatic update notice decides three things: which release to offer,
// whether the installed build is behind it, and whether the user has already
// said "later". Getting any of them wrong either nags someone who is up to
// date or stays silent when there is something to install, and neither shows
// up until it is in somebody's hands — so they are pinned down here.
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

const api = new Function(`
  ${extract('_versionCodeFromTag')}
  ${extract('pickRelease')}
  ${extract('updSnoozeActive')}
  return { _versionCodeFromTag, pickRelease, updSnoozeActive };
`)();

const DAY = 24 * 60 * 60 * 1000;
const apk = (tag) => ({
  name: `MyMusic-${tag}.apk`, size: 3989141,
  browser_download_url: `https://example.invalid/${tag}.apk`
});
const rel = (tag, extra = {}) => ({
  tag_name: tag, draft: false, prerelease: false, body: '',
  assets: [apk(tag)], ...extra
});

describe('version codes', () => {
  it('matches the integer the release workflow builds', () => {
    expect(api._versionCodeFromTag('v1.9.12')).toBe(10912);
    expect(api._versionCodeFromTag('1.9.12')).toBe(10912);
    expect(api._versionCodeFromTag('v2.0.0')).toBe(20000);
  });

  it('refuses anything that is not a three-part version', () => {
    ['', 'latest', 'v1.9', 'v1.9.12-beta', 'nightly'].forEach(t => {
      expect(api._versionCodeFromTag(t)).toBeNull();
    });
  });
});

describe('choosing the release to offer', () => {
  it('finds an update when one is newer', () => {
    const r = api.pickRelease([rel('v1.9.14'), rel('v1.9.13'), rel('v1.9.12')], 10912);
    expect(r.best.rel.tag_name).toBe('v1.9.14');
    expect(r.best.code).toBeGreaterThan(r.mineCode);
    expect(r.ahead).toBe(2);
  });

  it('offers nothing when the installed build is the newest', () => {
    const r = api.pickRelease([rel('v1.9.12'), rel('v1.9.11')], 10912);
    expect(r.newest.code).toBe(10912);
    expect(r.best.code <= r.mineCode).toBe(true);
    expect(r.ahead).toBe(0);
  });

  it('is not fooled by the order GitHub returns them in', () => {
    // created_at order, which an edited or re-published release changes.
    const r = api.pickRelease([rel('v1.9.13'), rel('v1.9.15'), rel('v1.9.14')], 10912);
    expect(r.best.rel.tag_name).toBe('v1.9.15');
  });

  it('skips a newer release that has no APK, and offers the newest that has one', () => {
    const r = api.pickRelease([
      rel('v1.9.15', { assets: [] }),
      rel('v1.9.14'),
      rel('v1.9.12'),
    ], 10912);
    expect(r.newest.rel.tag_name).toBe('v1.9.15');   // it exists
    expect(r.best.rel.tag_name).toBe('v1.9.14');     // but this is installable
  });

  it('offers nothing installable when the only newer release has no APK', () => {
    const r = api.pickRelease([rel('v1.9.15', { assets: [] }), rel('v1.9.12')], 10912);
    expect(r.best.code <= r.mineCode).toBe(true);
  });

  it('ignores drafts and prereleases', () => {
    const r = api.pickRelease([
      rel('v2.0.0', { prerelease: true }),
      rel('v1.9.20', { draft: true }),
      rel('v1.9.14'),
    ], 10912);
    expect(r.best.rel.tag_name).toBe('v1.9.14');
    expect(r.ahead).toBe(1);
  });

  it('ignores a release whose tag is not a version', () => {
    const r = api.pickRelease([rel('nightly'), rel('v1.9.14')], 10912);
    expect(r.best.rel.tag_name).toBe('v1.9.14');
  });

  it('survives an empty or junk list without throwing', () => {
    expect(api.pickRelease([], 10912).best).toBeNull();
    expect(api.pickRelease(null, 10912).best).toBeNull();
    expect(api.pickRelease([null, {}, rel('v1.9.14')], 10912).best.rel.tag_name).toBe('v1.9.14');
  });

  it('only counts an asset ending in .apk', () => {
    const r = api.pickRelease([rel('v1.9.14', {
      assets: [{ name: 'MyMusic-v1.9.14.aab', size: 1, browser_download_url: 'x' }]
    }), rel('v1.9.12')], 10912);
    expect(r.best.code <= r.mineCode).toBe(true);
  });

  it('reports nothing comparable when the installed version is unknown', () => {
    const r = api.pickRelease([rel('v1.9.14')], null);
    expect(r.mineCode).toBeNull();
    expect(r.ahead).toBe(0);
  });
});

describe('"Later" means later, not never', () => {
  const now = 1_700_000_000_000;

  it('holds a dismissal for a day', () => {
    const sn = { tag: 'v1.9.14', at: now - 60_000 };
    expect(api.updSnoozeActive(sn, 'v1.9.14', now, DAY)).toBe(true);
  });

  it('lets it lapse after a day', () => {
    const sn = { tag: 'v1.9.14', at: now - DAY - 1 };
    expect(api.updSnoozeActive(sn, 'v1.9.14', now, DAY)).toBe(false);
  });

  it('does not carry a dismissal across to a different version', () => {
    const sn = { tag: 'v1.9.14', at: now };
    expect(api.updSnoozeActive(sn, 'v1.9.15', now, DAY)).toBe(false);
  });

  it('treats a missing or malformed record as not dismissed', () => {
    expect(api.updSnoozeActive(null, 'v1.9.14', now, DAY)).toBe(false);
    expect(api.updSnoozeActive({}, 'v1.9.14', now, DAY)).toBe(false);
    expect(api.updSnoozeActive({ tag: 'v1.9.14' }, 'v1.9.14', now, DAY)).toBe(false);
  });
});
