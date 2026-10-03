// Pure text/formatting helpers used by app.js — kept dependency-free (no DOM
// access) so they can be unit tested under Node as well as loaded directly
// in the browser via <script>. Must be included before app.js.

function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  var m = Math.floor(s / 60);
  var sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function parseFileName(name) {
  name = name.replace(/\.[^/.]+$/, '');
  name = name.replace(/^(?:Track\s*)?(\d{1,3})\s*[-.)]\s*/i, '');
  name = name.replace(/[\[(]prod\.?\s*(?:by\s*)?[^\])]+[\])]/gi, '').trim();
  name = name.replace(/[\[(](?:Official\s*(?:Audio|Video|Music\s*Video)|Explicit|Clean|Lyrics?|HD|HQ|Audio)[\])]/gi, '').trim();
  var feat = '';
  var featMatch = name.match(/\s+(?:ft\.?|feat\.?|featuring|with)\s+(.+?)(?:\s*[-(\[]|$)/i);
  if (featMatch) {
    feat = featMatch[1].trim();
    name = name.replace(featMatch[0], featMatch[0].match(/[-(\[]$/) ? featMatch[0].slice(-1) : '');
  }
  var djMatch = name.match(/^DJ\s+\w+(?:\s+\w+)?\s*-\s*(?:Gangsta Grillz|presents?)\s*-\s*/i);
  if (djMatch) name = name.substring(djMatch[0].length);

  if (name.indexOf(' - ') !== -1) {
    var parts = name.split(' - ');
    var title = parts.slice(1).join(' - ').trim();
    var titleFeat = title.match(/\s+(?:ft\.?|feat\.?|featuring)\s+(.+)/i);
    if (titleFeat) { feat = titleFeat[1].trim(); title = title.replace(titleFeat[0], '').trim(); }
    return { artist: parts[0].trim(), title: title, feat: feat };
  }
  if (name.indexOf('_-_') !== -1) {
    var p = name.split('_-_');
    return { artist: p[0].replace(/_/g, ' ').trim(), title: p.slice(1).join(' - ').replace(/_/g, ' ').trim(), feat: feat };
  }
  return { artist: 'Unknown Artist', title: name.replace(/_/g, ' ').trim(), feat: feat };
}

function parseLRC(lrc) {
  if (!lrc) return [];
  var lines = lrc.replace(/\\n/g, '\n').split('\n');
  var parsed = [];
  for (var i = 0; i < lines.length; i++) {
    var match = lines[i].match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/);
    if (match) {
      var mins = parseInt(match[1]);
      var secs = parseInt(match[2]);
      var ms = match[3] ? parseInt(match[3].padEnd(3, '0')) : 0;
      var time = mins * 60 + secs + ms / 1000;
      var text = match[4].trim();
      if (text) parsed.push({ time: time, text: text });
    }
  }
  parsed.sort(function(a, b) { return a.time - b.time; });
  return parsed;
}


/**
 * A genre written the way it is actually spelled.
 *
 * Genre fields arrive from three places that all spell things differently: a
 * file's own tag, written by whatever ripped it; MusicBrainz, whose tags are
 * free lowercase text; and the model, which is asked for a specific subgenre.
 * None of them agree on casing, and nothing normalised them, so one library
 * ended up with "RB", "rnb", "R&b" and "Rhythm and Blues" as four different
 * genres of the same music. Capitalising only the first letter — which is all
 * the MusicBrainz path did — turns "r&b" into "R&b" and "edm" into "Edm".
 *
 * Matching is done on a flattened key, so punctuation and spacing cannot
 * create a new genre: "R&B", "R n B", "RnB" and "rb" are one answer. Phrases
 * are matched longest-first, which is what keeps "east coast hip hop" together
 * as "East Coast Hip-Hop" rather than title-casing each word on its own.
 *
 * Anything not recognised is title-cased and otherwise left alone — an unusual
 * genre is far more likely to be real than to be a mistake.
 */
function genreKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Keyed in the flattened space above, so each entry covers every spelling of
// itself. Longest phrase wins.
var GENRE_PHRASES = {
  'r and b': 'R&B', 'rb': 'R&B', 'rnb': 'R&B', 'r n b': 'R&B',
  'rhythm and blues': 'R&B', 'randb': 'R&B',
  'hip hop': 'Hip-Hop', 'hiphop': 'Hip-Hop',
  'trip hop': 'Trip-Hop', 'triphop': 'Trip-Hop',
  'lo fi': 'Lo-Fi', 'lofi': 'Lo-Fi',
  'neo soul': 'Neo-Soul', 'neosoul': 'Neo-Soul',
  'g funk': 'G-Funk', 'gfunk': 'G-Funk',
  'k pop': 'K-Pop', 'kpop': 'K-Pop',
  'j pop': 'J-Pop', 'jpop': 'J-Pop',
  'nu metal': 'Nu-Metal', 'numetal': 'Nu-Metal',
  'synth pop': 'Synth-Pop', 'synthpop': 'Synth-Pop',
  'post punk': 'Post-Punk', 'postpunk': 'Post-Punk',
  'post rock': 'Post-Rock', 'postrock': 'Post-Rock',
  'drum and bass': 'Drum & Bass', 'dnb': 'Drum & Bass', 'd n b': 'Drum & Bass',
  'rock and roll': 'Rock & Roll', 'rock n roll': 'Rock & Roll',
  'singer songwriter': 'Singer-Songwriter',
  'original soundtrack': 'Soundtrack', 'ost': 'Soundtrack',
  'dance hall': 'Dancehall',
  'afro beats': 'Afrobeats', 'afrobeat': 'Afrobeats',
  'east coast': 'East Coast', 'west coast': 'West Coast',
  'edm': 'EDM', 'idm': 'IDM', 'ebm': 'EBM', 'uk': 'UK', 'us': 'US',
  'nyc': 'NYC', 'dj': 'DJ', 'mc': 'MC'
};

var _GENRE_MAX_PHRASE = 3;

function _canonOne(part) {
  var key = genreKey(part);
  if (!key) return '';
  var words = key.split(' ');
  var out = [];
  var i = 0;
  while (i < words.length) {
    var hit = '';
    var used = 0;
    for (var take = Math.min(_GENRE_MAX_PHRASE, words.length - i); take >= 1; take--) {
      var phrase = words.slice(i, i + take).join(' ');
      if (Object.prototype.hasOwnProperty.call(GENRE_PHRASES, phrase)) {
        hit = GENRE_PHRASES[phrase];
        used = take;
        break;
      }
    }
    if (hit) { out.push(hit); i += used; continue; }
    var w = words[i];
    out.push(w.charAt(0).toUpperCase() + w.slice(1));
    i++;
  }
  return out.join(' ');
}

function canonicalGenre(g) {
  var raw = String(g || '').trim();
  if (!raw) return '';
  // A whole-string match first, so "Rhythm & Blues" is answered before it is
  // taken apart and rebuilt word by word.
  var whole = genreKey(raw);
  if (Object.prototype.hasOwnProperty.call(GENRE_PHRASES, whole)) return GENRE_PHRASES[whole];
  // Files routinely carry more than one, as "Rap/Hip-Hop" or "Soul, Funk".
  // Each side is a genre in its own right and is spelled as one.
  var parts = raw.split(/\s*[/,;|]\s*/).map(_canonOne).filter(Boolean);
  var seen = {};
  var uniq = [];
  parts.forEach(function(p) {
    var k = p.toLowerCase();
    if (seen[k]) return;
    seen[k] = 1;
    uniq.push(p);
  });
  return uniq.slice(0, 2).join(' / ');
}

var TextUtils = { fmtTime: fmtTime, escHtml: escHtml, parseFileName: parseFileName, parseLRC: parseLRC,
                  genreKey: genreKey, canonicalGenre: canonicalGenre, GENRE_PHRASES: GENRE_PHRASES };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TextUtils;
}
