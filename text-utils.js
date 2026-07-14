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

var TextUtils = { fmtTime: fmtTime, escHtml: escHtml, parseFileName: parseFileName, parseLRC: parseLRC };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TextUtils;
}
