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
  ${SRC.match(/var UPD_NOTES_MARKER = .*;/)[0]}
  ${SRC.match(/var UPD_NOTES_MAX = .*?;/)[0]}
  ${extract('_versionCodeFromTag')}
  ${extract('pickRelease')}
  ${extract('updSnoozeActive')}
  ${extract('_updNotes')}
  return { _versionCodeFromTag, pickRelease, updSnoozeActive, _updNotes,
           UPD_NOTES_MARKER, UPD_NOTES_MAX };
`)();

// What _promptUpdate() does with a body, copied from app.js so a change there
// that breaks what the cache feeds it shows up as a failure here.
function notesAsDialogWouldRender(body) {
  const section = String(body || '').split('## In this version')[1] || '';
  return section.split('##')[0].trim().slice(0, 400);
}

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

describe('cached release notes survive the trip', () => {
  // The real shape: an install preamble, then the notes the dialog reads.
  const PREAMBLE = 'A local music player for Android.\n\n## Install\n\n'
    + 'Download the APK below and open it.\n'.repeat(12);
  const build = (notes) => PREAMBLE + '## In this version\n\n' + notes + '\n';

  it('keeps the notes the dialog shows, identical to the live body', () => {
    const notes = 'Something was fixed, and something else was improved.';
    const full = build(notes);
    expect(api._updNotes(full)).toContain(notes);
    expect(notesAsDialogWouldRender(api._updNotes(full)))
      .toBe(notesAsDialogWouldRender(full));
  });

  it('keeps them even when the preamble is longer than the old 1200 cap', () => {
    // The case the old blind slice got wrong: the marker pushed past the cut,
    // so the dialog found no section at all and showed nothing.
    const long = 'A local music player.\n\n## Install\n\n'
      + 'Install instructions that go on and on.\n'.repeat(60)
      + '## In this version\n\nThe thing you wanted was fixed.\n';
    expect(long.indexOf('## In this version')).toBeGreaterThan(1200);
    expect(String(long).slice(0, 1200)).not.toContain('## In this version'); // old way: lost
    expect(api._updNotes(long)).toContain('The thing you wanted was fixed.');
    expect(notesAsDialogWouldRender(api._updNotes(long)))
      .toBe(notesAsDialogWouldRender(long));
  });

  it('starts the cached body at the marker so the dialog can find it', () => {
    expect(api._updNotes(build('x')).startsWith(api.UPD_NOTES_MARKER)).toBe(true);
  });

  it('says so when notes are long enough to need shortening', () => {
    const huge = build('x'.repeat(api.UPD_NOTES_MAX + 500));
    const out = api._updNotes(huge);
    expect(out.length).toBeLessThanOrEqual(api.UPD_NOTES_MAX + 80);
    expect(out).toContain('notes shortened');
  });

  it('passes a body with no marker through rather than inventing one', () => {
    expect(api._updNotes('just some text')).toBe('just some text');
    expect(api._updNotes('')).toBe('');
    expect(api._updNotes(null)).toBe('');
  });
});
