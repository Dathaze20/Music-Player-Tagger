// Metadata comes out of files downloaded from anywhere, and some of it ends up
// in the page as markup. These tests pin the places where a tag could stop
// being text and start being code.
//
// The original defect: imgOrArt() built an inline onerror handler with the
// song's title pasted in as a JavaScript string literal. Apostrophes were
// escaped, backslashes were not — so a title containing a backslash followed
// by an apostrophe closed the string and ran what came next, in a WebView
// holding an API key and able to reach the native bridge. A second way in went
// through the src attribute, which was not escaped at all: an imported backup
// can carry an art value beginning "data:" that contains a quote.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import TextUtils from '../www/text-utils.js';

// Attribute VALUES legitimately contain things like "onerror=" once a hostile
// title has been escaped into them — that text is inert. A real handler is an
// attribute, so look only at what is left once the quoted values are removed.
function attributesOnly(html) {
  return html.replace(/"[^"]*"/g, '""');
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'www', 'app.js'), 'utf8');

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

const gradients = SRC.match(/var GRADIENTS = \[[\s\S]*?\];/)[0];
const api = new Function('escHtml', `
  ${gradients}
  var NativeBridge = { isNative: function () { return false; } };
  ${['getGrad', 'safeArtUrl', 'artHTML', 'imgOrArt'].map(extract).join('\n')}
  return { imgOrArt: imgOrArt, artHTML: artHTML };
`)(TextUtils.escHtml);

const { imgOrArt, artHTML } = api;

// Titles that have each, at some point, been able to leave their string.
const NASTY = [
  "\\',0); window.__PWNED=1; //",   // backslash closes the escaped quote
  "\\'",
  "'; alert(1); '",
  '"><script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  "O'Brien \\ Mixtape",
];

describe('artwork markup cannot carry executable code', () => {
  it('emits no inline event handler at all', () => {
    // The whole class of bug goes away with the attribute, so this is the
    // assertion that matters most.
    NASTY.forEach(t => {
      const html = imgOrArt('http://localhost/a.jpg', t, 48, false);
      expect(attributesOnly(html), `handler emitted for ${JSON.stringify(t)}`)
        .not.toMatch(/\son\w+\s*=/i);
    });
    expect(attributesOnly(imgOrArt('http://localhost/a.jpg', 'Normal Title', 48, false)))
      .not.toMatch(/\son\w+\s*=/i);
  });

  it('never lets a title break out of its attribute', () => {
    NASTY.forEach(t => {
      const html = imgOrArt('http://localhost/a.jpg', t, 48, false);
      const m = html.match(/data-art-fallback="([^"]*)"/);
      expect(m, `no fallback attribute for ${JSON.stringify(t)}`).toBeTruthy();
      // A raw quote inside the value would have ended the attribute early.
      expect(m[1]).not.toContain('"');
    });
  });

  it('escapes the src, which an imported backup controls', () => {
    // customArtOnly() keeps anything starting "data:", quote and all.
    const evil = 'data:image/png;base64,AAA" onerror="window.x=1" y="';
    const html = imgOrArt(evil, 'Harmless', 48, false);
    expect(attributesOnly(html)).not.toMatch(/\son\w+\s*=/i);
    const m = html.match(/src="([^"]*)"/);
    // The quote that would have ended the attribute is escaped, so what looks
    // like a handler stays inside the value as text.
    expect(m[1]).not.toContain('"');
    expect(m[1]).toContain('&quot;');
  });

  it('keeps markup in a title as text in the placeholder', () => {
    const html = artHTML('<img src=x onerror=alert(1)> evil', 48, false);
    // One element, the placeholder itself — no injected tag.
    expect(html.match(/<img/i)).toBeNull();
    expect(html).toMatch(/^<div class="art-placeholder/);
  });

  it('still produces the right initials for ordinary titles', () => {
    expect(artHTML('Sporty Thievz', 48, false)).toContain('>ST<');
    expect(artHTML('Illmatic', 48, false)).toContain('>I<');
    expect(artHTML('', 48, false)).toContain('></div>');
  });

  it('still carries what the fallback needs to redraw itself', () => {
    const html = imgOrArt('http://localhost/a.jpg', "God's Son", 64, true, 'mini');
    expect(html).toContain('data-art-size="64"');
    expect(html).toContain('data-art-round="1"');
    expect(html).toContain('data-art-cls="mini"');
    expect(html).toMatch(/data-art-fallback="God&#39;s Son"|data-art-fallback="God's Son"/);
  });
});
