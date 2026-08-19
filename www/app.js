// ═══════════════════════════════════════════════════════
// My Music - Smart Music Player
// Pure HTML/CSS/JS - No build tools needed
// Open index.html in any browser or Web Code on Android
// ═══════════════════════════════════════════════════════

// ─── Utilities ───

// Haptic feedback — uses Capacitor Haptics plugin when available, falls back to Web Vibration API.
// Requires android.permission.VIBRATE in the manifest for navigator.vibrate() to work.
function _haptic(pattern) {
  try {
    var dur = Array.isArray(pattern) ? pattern[0] : (pattern || 40);
    // Use NativeBridge (direct Android Vibrator) first — most reliable in Capacitor WebView
    if (typeof NativeBridge !== 'undefined' && NativeBridge.isNative && NativeBridge.isNative()) {
      NativeBridge.vibrate(dur);
      return;
    }
    var cap = window.Capacitor;
    if (cap && cap.Plugins && cap.Plugins.Haptics) {
      cap.Plugins.Haptics.vibrate({ duration: dur });
    } else if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch(e) {}
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// fmtTime, escHtml, parseFileName, and parseLRC now live in text-utils.js
// (loaded before this file) so they can be unit tested without the DOM.

var GRADIENTS = [
  ['#667eea','#764ba2'],['#f093fb','#f5576c'],['#4facfe','#00f2fe'],
  ['#43e97b','#38f9d7'],['#fa709a','#fee140'],['#a18cd1','#fbc2eb'],
  ['#fccb90','#d57eeb'],['#e0c3fc','#8ec5fc'],['#f5576c','#ff6a00'],
  ['#667eea','#43e97b'],['#fa709a','#764ba2'],['#4facfe','#f5576c'],
  ['#38f9d7','#fbc2eb'],['#fee140','#d57eeb'],['#ff6a00','#8ec5fc'],
];

function getGrad(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}

function artHTML(text, size, round, cls) {
  var g = getGrad(text);
  var init = text.split(' ').map(function(w){return w[0]||'';}).join('').substring(0,2).toUpperCase();
  var r = round ? 'border-radius:50%;' : 'border-radius:8px;';
  var extra = cls ? ' ' + cls : '';
  return '<div class="art-placeholder' + (round ? ' round' : '') + extra + '" style="width:' + size + 'px;height:' + size + 'px;background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ');font-size:' + Math.floor(size * 0.35) + 'px;' + r + '">' + init + '</div>';
}

// External https:// URLs fail silently in the Capacitor Android WebView.
// Return '' for those so callers fall back to gradient placeholder art.
// data: URLs (iTunes enrichment art) are always safe — they render everywhere.
function safeArtUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  if (typeof NativeBridge !== 'undefined' && NativeBridge.isNative() && !url.startsWith('http://localhost')) return '';
  return url;
}

function applyArt(el, dataUrls) {
  var valid = dataUrls.filter(Boolean);
  if (!valid.length || !el.parentNode) return;
  el.dataset.loaded = '1';
  var fill  = el.dataset.fill  === '1';
  var round = el.dataset.round === '1';
  var size  = parseInt(el.dataset.size) || 56;

  if (fill) {
    // Ensure el is a positioning context so absolute children stay contained
    var pos = el.style.position;
    if (pos !== 'absolute' && pos !== 'relative' && pos !== 'fixed') {
      el.style.position = 'relative';
    }
    if (valid.length >= 2 && round) {
      var imgs = valid.slice(0, 4);
      while (imgs.length < 4) imgs.push(imgs[imgs.length % valid.length]);
      el.innerHTML = '<div style="position:absolute;top:0;left:0;right:0;bottom:0;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;">'
        + imgs.map(function(u) {
            return '<img src="' + u + '" style="width:50%;height:50%;object-fit:cover;display:block;">';
          }).join('') + '</div>';
    } else {
      el.innerHTML = '<img src="' + valid[0] + '" style="position:absolute;top:0;left:0;right:0;bottom:0;width:100%;height:100%;object-fit:cover;display:block;">';
    }
  } else {
    var r = round ? 'border-radius:50%;' : 'border-radius:8px;';
    var wStyle = 'width:' + size + 'px;height:' + size + 'px;' + r + 'overflow:hidden;flex-shrink:0;';
    if (valid.length >= 2 && round) {
      var imgs2 = valid.slice(0, 4);
      while (imgs2.length < 4) imgs2.push(imgs2[imgs2.length % valid.length]);
      el.innerHTML = '<div style="' + wStyle + 'display:-webkit-box;display:-webkit-flex;display:flex;-webkit-flex-wrap:wrap;flex-wrap:wrap;">'
        + imgs2.map(function(u) {
            return '<img src="' + u + '" style="width:50%;height:50%;object-fit:cover;display:block;">';
          }).join('') + '</div>';
    } else {
      el.innerHTML = '<img src="' + valid[0] + '" style="width:' + size + 'px;height:' + size + 'px;' + r + 'object-fit:cover;display:block;flex-shrink:0;">';
    }
  }
}

function artCacheSet(uri, data) {
  if (!data) return;
  if (artCache[uri]) { delete artCache[uri]; artCache[uri] = data; return; } // promote to MRU
  var keys = Object.keys(artCache);
  if (keys.length >= _ART_CACHE_MAX) delete artCache[keys[0]]; // evict LRU
  artCache[uri] = data;
}

var _ART_HD_CACHE_MAX = 80;
function artHdCacheSet(uri, data) {
  if (!data) return;
  if (artCacheHD[uri]) { delete artCacheHD[uri]; artCacheHD[uri] = data; return; }
  var keys = Object.keys(artCacheHD);
  if (keys.length >= _ART_HD_CACHE_MAX) delete artCacheHD[keys[0]];
  artCacheHD[uri] = data;
}

function _applyLazyForUri(uri) {
  document.querySelectorAll('.art-lazy[data-lazy-uri]').forEach(function(lazyEl) {
    var uris = (lazyEl.dataset.lazyUri || '').split('|').filter(Boolean);
    if (uris.indexOf(uri) !== -1 && uris.every(function(u) { return artCache[u]; })) {
      applyArt(lazyEl, uris.map(function(u) { return artCache[u]; }));
    }
  });
}

function fetchThumbnail(uri) {
  if (artCache[uri]) { var d = artCache[uri]; delete artCache[uri]; artCache[uri] = d; return Promise.resolve(d); } // LRU promote
  if (artInFlight[uri]) return artInFlight[uri];
  // Check IDB before the native bridge — IDB reads take ~5 ms vs ~100-200 ms for
  // the Android MediaStore bridge. On a 3000-album library this means art is instant
  // on every session after the first, not just for the 1000 entries that fit in RAM.
  var p = openArtDb().then(function(db) {
    return new Promise(function(resolve) {
      var req = db.transaction(ART_STORE_NAME, 'readonly').objectStore(ART_STORE_NAME).get(uri);
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror   = function() { resolve(null); };
    });
  }).then(function(stored) {
    if (stored) {
      delete artInFlight[uri];
      artCacheSet(uri, stored);
      _applyLazyForUri(uri);
      return stored;
    }
    // Not in IDB yet — hit the native bridge and persist the result
    return NativeBridge.readAlbumArt(uri).then(function(data) {
      delete artInFlight[uri];
      if (data) {
        artCacheSet(uri, data);
        persistArt(uri, data);
        _applyLazyForUri(uri);
      }
      return data || '';
    });
  }).catch(function() { delete artInFlight[uri]; return ''; });
  artInFlight[uri] = p;
  return p;
}

// Pre-warm the art cache for all songs so scrolling is always instant.
// Loads 4 thumbnails at a time in the background — won't block playback.
function backgroundLoadAllArt() {
  if (typeof NativeBridge === 'undefined' || !NativeBridge.isNative()) return;
  if (_artBgLoading) return;
  _artBgLoading = true;

  var seen = {};
  var uris = [];
  songs.forEach(function(s) {
    if (s.albumArtUri && !seen[s.albumArtUri]) {
      seen[s.albumArtUri] = true;
      uris.push(s.albumArtUri);
    }
  });
  // Expand the in-memory cap to fit every unique album art so nothing gets
  // evicted while loading — without this, loading 3629 arts into a 500-entry
  // cache evicts the earliest ones, causing lag when the user scrolls back.
  if (uris.length > _ART_CACHE_MAX) _ART_CACHE_MAX = uris.length + 100;
  var idx = 0;
  var active = 0;
  var MAX = 4; // 4 concurrent reads avoids memory spike on low-end devices

  function finish() { active--; pump(); }
  function pump() {
    while (active < MAX && idx < uris.length) {
      var uri = uris[idx++];
      if (artCache[uri] || artInFlight[uri]) continue;
      active++;
      fetchThumbnail(uri).then(finish, finish);
    }
    if (active === 0) _artBgLoading = false;
  }
  pump();
}

// Batch-fetch all missing arts for a VS window in a SINGLE IDB transaction.
// Covers both the visible window [start, end) and an optional read-ahead range
// [end, readAheadEnd) so one transaction serves both — ~5ms total vs N×5ms.
// After the sync URI collection, data/seen fall out of scope before IDB starts.
function batchPrefetchWindowArt(data, start, end, rowsId, readAheadEnd) {
  var missing = [];
  var seen = {};
  var limit = (readAheadEnd !== undefined) ? readAheadEnd : end;
  for (var i = start; i < limit; i++) {
    var item = data[i];
    if (!item) continue;
    var uris = item.albumArtUris ? item.albumArtUris : (item.albumArtUri ? [item.albumArtUri] : []);
    for (var j = 0; j < uris.length; j++) {
      var uri = uris[j];
      if (uri && !seen[uri] && !artCache[uri] && !artInFlight[uri]) {
        seen[uri] = true;
        missing.push(uri);
      }
    }
  }
  // data, seen, start, end freed here — only missing[] enters the async closure
  if (missing.length) _fetchMissingArt(missing, rowsId);
}

// Separate function so the large data array isn't kept alive by the IDB closure.
function _fetchMissingArt(missing, rowsId) {
  openArtDb().then(function(db) {
    var tx = db.transaction(ART_STORE_NAME, 'readonly');
    var store = tx.objectStore(ART_STORE_NAME);
    var pending = missing.length;
    missing.forEach(function(uri) {
      var req = store.get(uri);
      req.onsuccess = function() {
        if (req.result) artCacheSet(uri, req.result);
        if (!--pending && rowsId) _scheduleApplyArt(rowsId);
      };
      req.onerror = function() {
        if (!--pending && rowsId) _scheduleApplyArt(rowsId);
      };
    });
  }).catch(function() {});
}

// Debounce DOM art-application to one pass per animation frame — multiple
// concurrent batch completions collapse into a single querySelectorAll scan.
var _applyArtScheduled = Object.create(null);
function _scheduleApplyArt(rowsId) {
  if (_applyArtScheduled[rowsId]) return;
  _applyArtScheduled[rowsId] = true;
  requestAnimationFrame(function() {
    _applyArtScheduled[rowsId] = false;
    _applyArtToRows(document.getElementById(rowsId));
  });
}

function _applyArtToRows(rows) {
  if (!rows) return;
  rows.querySelectorAll('.art-lazy[data-lazy-uri]').forEach(function(el) {
    if (el.dataset.loaded) return;
    var uris = (el.dataset.lazyUri || '').split('|').filter(Boolean);
    if (uris.length && uris.every(function(u) { return artCache[u]; })) {
      applyArt(el, uris.map(function(u) { return artCache[u]; }));
    }
  });
}

function loadLazyEl(el) {
  var urisStr = el.dataset.lazyUri || '';
  var uris = urisStr.split('|').filter(Boolean);
  if (!uris.length) return;
  if (uris.every(function(u) { return artCache[u]; })) {
    applyArt(el, uris.map(function(u) { return artCache[u]; }));
    return;
  }
  Promise.all(uris.map(fetchThumbnail)).then(function(dataUrls) {
    if (!el.dataset.loaded) applyArt(el, dataUrls);
  });
}

function initLazyArt(container) {
  if (typeof NativeBridge === 'undefined' || !NativeBridge.isNative()) return;

  var lazies = container.querySelectorAll('.art-lazy[data-lazy-uri]');
  if (!lazies.length) return;

  if (!window.IntersectionObserver) {
    lazies.forEach(loadLazyEl);
    return;
  }

  // Disconnect any previous observer on this container before creating a new one
  if (container._lazyObs) { container._lazyObs.disconnect(); container._lazyObs = null; }

  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) { obs.unobserve(entry.target); loadLazyEl(entry.target); }
    });
  }, { rootMargin: '4000px' });
  container._lazyObs = obs;

  lazies.forEach(function(el) {
    var uris = (el.dataset.lazyUri || '').split('|').filter(Boolean);
    if (uris.length && uris.every(function(u) { return artCache[u]; })) {
      applyArt(el, uris.map(function(u) { return artCache[u]; }));
    } else {
      obs.observe(el);
    }
  });
}

// ─── Virtual Scroll (Songs Tab) ───
// Only renders the visible window (~60 rows) to keep 15k song lists instant.

var VS_ROW_H = 73;        // px per song row — padding(12+12) + art(48) + border-bottom(1)
var VS_ARTIST_ROW_H = 80; // px per artist row (56px art + 12+12 padding)
var VS_BUFFER = 25;  // extra rows rendered above and below the viewport
var _vsData = null;
var _vsRenderedStart = 0;
var _vsScrollFn = null;

// Artist list virtual scroll state
var _vsArtistData    = null;
var _vsArtistStart   = -9999;
var _vsArtistScrollFn = null;
var _vsArtistLetterIdx = null; // letter → first row index for alphabet jump
var _savedArtistScroll = 0;   // restored when returning from artist detail

function cleanupVirtualScroll() {
  if (_vsScrollFn) {
    var mc = document.getElementById('mainContent');
    if (mc) mc.removeEventListener('scroll', _vsScrollFn);
    _vsScrollFn = null;
  }
  _vsData = null;
}

function cleanupArtistVS() {
  if (_vsArtistScrollFn) {
    var mc = document.getElementById('mainContent');
    if (mc) mc.removeEventListener('scroll', _vsArtistScrollFn);
    _vsArtistScrollFn = null;
  }
  _vsArtistData = null;
  _vsArtistLetterIdx = null;
}

function initVirtualScroll(vsRows, sorted) {
  _vsData = sorted;
  _vsRenderedStart = -9999;
  var main = document.getElementById('mainContent');
  _vsScrollFn = function() {
    var vsOuter = document.getElementById('vsOuter');
    if (!vsOuter) { cleanupVirtualScroll(); return; }
    var relScroll = main.scrollTop - vsOuter.offsetTop;
    var newStart = Math.max(0, Math.floor(relScroll / VS_ROW_H) - VS_BUFFER);
    if (newStart > 0 && Math.abs(newStart - _vsRenderedStart) < Math.floor(VS_BUFFER / 2)) return;
    _vsRenderedStart = newStart;
    renderVsWindow(newStart);
  };
  main.addEventListener('scroll', _vsScrollFn, { passive: true });
  renderVsWindow(0);
}

function renderVsWindow(start) {
  if (!_vsData) return;
  var rows = document.getElementById('vsRows');
  if (!rows) { cleanupVirtualScroll(); return; }
  var end = Math.min(_vsData.length, start + VS_BUFFER * 2 + 20);
  var parts = [];
  for (var i = start; i < end; i++) {
    parts.push(songRowHTML(_vsData[i], currentSong && currentSong.id === _vsData[i].id, true));
  }
  rows.innerHTML = parts.join('');
  rows.style.top = (start * VS_ROW_H) + 'px';
  initLazyArt(rows);
  // One IDB transaction covers visible window + read-ahead range
  var naEnd = Math.min(_vsData.length, end + VS_BUFFER * 2 + 20);
  batchPrefetchWindowArt(_vsData, start, end, 'vsRows', naEnd);
}

function artistRowHTML(a) {
  var chkHtml = '';
  if (_msArtistMode && _msArtistNames) {
    var sel = !!_msArtistNames[a.name];
    chkHtml = '<div style="width:18px;height:18px;border-radius:50%;border:2px solid '
      + (sel ? 'var(--accent);background:var(--accent);color:#fff;' : 'var(--border);background:transparent;color:transparent;')
      + 'flex-shrink:0;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;font-size:11px;font-weight:700;margin-right:6px;">'
      + (sel ? '&#10003;' : '') + '</div>';
  }
  var artEl = a.albumArtUris && a.albumArtUris.length > 0
    ? '<div class="art-lazy" data-lazy-uri="' + escHtml(a.albumArtUris.join('|')) + '" data-size="56" data-round="1" style="width:56px;height:56px;flex-shrink:0;border-radius:50%;overflow:hidden;">' + artHTML(a.name, 56, true) + '</div>'
    : artHTML(a.name, 56, true);
  var menuBtn = _msArtistMode ? '' : '<button class="artist-menu-btn" data-artist-menu="' + escHtml(a.name) + '">&#8942;</button>';
  return '<div class="artist-row" data-artist="' + escHtml(a.name) + '">'
    + chkHtml + artEl
    + '<div class="song-info">'
    + '<div class="artist-name">' + escHtml(a.name) + '</div>'
    + '<div class="artist-meta">' + a.albumCount + ' ' + (a.albumCount === 1 ? 'Album' : 'Albums') + ' &bull; ' + a.songCount + ' ' + (a.songCount === 1 ? 'Song' : 'Songs') + '</div>'
    + '</div>'
    + menuBtn
    + '</div>';
}

function initArtistVS(container, artists) {
  _vsArtistData  = artists;
  _vsArtistStart = -9999;
  var main = document.getElementById('mainContent');
  _vsArtistScrollFn = function() {
    var outer = document.getElementById('vsArtistOuter');
    if (!outer) { cleanupArtistVS(); return; }
    var relScroll = main.scrollTop - outer.offsetTop;
    var newStart = Math.max(0, Math.floor(relScroll / VS_ARTIST_ROW_H) - VS_BUFFER);
    if (newStart > 0 && Math.abs(newStart - _vsArtistStart) < Math.floor(VS_BUFFER / 2)) return;
    _vsArtistStart = newStart;
    renderArtistVsWindow(newStart);
  };
  main.addEventListener('scroll', _vsArtistScrollFn, { passive: true });
  renderArtistVsWindow(0);
}

function renderArtistVsWindow(start) {
  if (!_vsArtistData) return;
  var rows = document.getElementById('vsArtistRows');
  if (!rows) { cleanupArtistVS(); return; }
  var end = Math.min(_vsArtistData.length, start + VS_BUFFER * 2 + 20);
  var parts = [];
  for (var i = start; i < end; i++) parts.push(artistRowHTML(_vsArtistData[i]));
  rows.innerHTML = parts.join('');
  rows.style.top = (start * VS_ARTIST_ROW_H) + 'px';
  initLazyArt(rows);
  // One IDB transaction covers visible window + read-ahead range
  var naEnd = Math.min(_vsArtistData.length, end + VS_BUFFER * 2 + 20);
  batchPrefetchWindowArt(_vsArtistData, start, end, 'vsArtistRows', naEnd);
}

// ─── Swipe Gestures (song rows) ───
// Swipe right → add to queue  |  swipe left → toggle favorite

var _swipeGestureEls = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
function initSwipeGestures(el) {
  if (_swipeGestureEls) {
    if (_swipeGestureEls.has(el)) return;
    _swipeGestureEls.add(el);
  }
  var startX = 0, startY = 0, activeEl = null, decided = false, swipeDx = 0;

  el.addEventListener('touchstart', function(e) {
    var row = e.target.closest('.song-row[data-id]');
    if (!row) return;
    activeEl = row;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    decided = false;
    swipeDx = 0;
    row.style.transition = '';
  }, { passive: true });

  el.addEventListener('touchmove', function(e) {
    if (!activeEl) return;
    if (activeEl.isConnected === false) { activeEl = null; return; }
    var tdx = e.touches[0].clientX - startX;
    var tdy = e.touches[0].clientY - startY;
    if (!decided) {
      if (Math.abs(tdx) < 8 && Math.abs(tdy) < 8) return;
      decided = true;
      if (Math.abs(tdy) >= Math.abs(tdx)) { activeEl = null; return; }
    }
    e.preventDefault();
    swipeDx = Math.max(-110, Math.min(110, tdx));
    activeEl.style.transform = 'translateX(' + swipeDx + 'px)';
    if (swipeDx > 30) activeEl.style.background = 'rgba(76,175,80,0.15)';
    else if (swipeDx < -30) activeEl.style.background = 'rgba(0,168,158,0.15)';
    else activeEl.style.background = '';
  }, { passive: false });

  el.addEventListener('touchend', function() {
    if (!activeEl || !decided) { activeEl = null; return; }
    var row = activeEl;
    var finalDx = swipeDx;
    activeEl = null;
    row.style.transition = 'transform 0.22s ease, background 0.22s';
    row.style.transform = '';
    row.style.background = '';
    if (finalDx > 60) {
      var s = songMap[row.dataset.id];
      if (s) {
        if (!currentSong) { playSong(s, _vsData || [s]); }
        else { addToQueue([s]); showToast('+ Added to queue'); }
      }
    } else if (finalDx < -60) {
      var s = songMap[row.dataset.id];
      if (s) {
        s.fav = !s.fav; _countsCache = null; saveLibraryLater();
        showToast(s.fav ? '❤ Favorited' : 'Removed from favorites');
        var favBtn = row.querySelector('[data-fav]');
        if (favBtn) { favBtn.innerHTML = heartSvg(s.fav, 20); favBtn.className = 'song-fav' + (s.fav ? ' active' : ''); }
      }
    }
  }, { passive: true });

  el.addEventListener('touchcancel', function() {
    if (activeEl) {
      activeEl.style.transition = 'transform 0.22s ease';
      activeEl.style.transform = '';
      activeEl.style.background = '';
      activeEl = null;
    }
  }, { passive: true });
}

// ─── Full-screen Art Viewer ───

function openArtViewer(src) {
  if (!src) return;
  var overlay = document.createElement('div');
  overlay.className = 'art-viewer-overlay';
  var img = document.createElement('img');
  img.className = 'art-viewer-img';
  img.src = src;
  img.alt = 'Album art';
  var closeBtn = document.createElement('button');
  closeBtn.className = 'art-viewer-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  overlay.appendChild(img);
  overlay.appendChild(closeBtn);
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay || e.target.classList.contains('art-viewer-close')) overlay.remove();
  });
  // Pinch-to-zoom: let browser handle via touch-action
  document.getElementById('app').appendChild(overlay);
  setTimeout(function() { overlay.classList.add('visible'); }, 10);
}

// Deduplicated 600px HD art fetch — ensures only one native read fires per URI
// even when playSong() and renderNowPlaying() both request art at the same time.
var _artHdInFlight = {};

function fetchHdArt(uri) {
  if (!uri || typeof NativeBridge === 'undefined' || !NativeBridge.isNative()) return Promise.resolve('');
  if (artCacheHD[uri]) return Promise.resolve(artCacheHD[uri]);
  if (_artHdInFlight[uri]) return _artHdInFlight[uri];
  var p = NativeBridge.readAlbumArt(uri, 600).then(function(data) {
    delete _artHdInFlight[uri];
    if (data) artHdCacheSet(uri, data);
    return data || '';
  }).catch(function() { delete _artHdInFlight[uri]; return ''; });
  _artHdInFlight[uri] = p;
  return p;
}

function extractArtColors(imgEl) {
  try {
    var canvas = document.createElement('canvas');
    var sz = 64;
    canvas.width = sz; canvas.height = sz;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, sz, sz);
    var px = ctx.getImageData(0, 0, sz, sz).data;
    var buckets = {};
    for (var i = 0; i < px.length; i += 4) {
      var r = Math.round(px[i] / 32) * 32;
      var g = Math.round(px[i + 1] / 32) * 32;
      var b = Math.round(px[i + 2] / 32) * 32;
      var lo = Math.min(r, g, b), hi = Math.max(r, g, b);
      if (hi < 40 || lo > 215 || hi - lo < 35) continue;
      var k = r + ',' + g + ',' + b;
      buckets[k] = (buckets[k] || 0) + 1;
    }
    var keys = Object.keys(buckets).sort(function(a, b) { return buckets[b] - buckets[a]; });
    var out = [];
    for (var j = 0; j < keys.length && out.length < 2; j++) {
      var c = keys[j].split(',').map(Number);
      if (out.length === 0) { out.push(c); continue; }
      var d = out[0];
      var dist = Math.sqrt(Math.pow(c[0]-d[0],2)+Math.pow(c[1]-d[1],2)+Math.pow(c[2]-d[2],2));
      if (dist > 70) out.push(c);
    }
    if (out.length === 0) out = [[0,168,158],[0,200,190]];
    if (out.length === 1) out.push([Math.min(out[0][0]+40,255), out[0][1], Math.max(out[0][2]-20,0)]);
    return out;
  } catch(e) {
    return [[0,168,158],[0,200,190]];
  }
}

function applyArtColors(colors) {
  var np = document.getElementById('nowPlaying');
  if (!np) return;
  var c1 = colors[0], c2 = colors[1];
  np.style.setProperty('--art-c1-glow', 'rgba('+c1[0]+','+c1[1]+','+c1[2]+',0.55)');
  np.style.setProperty('--art-c2-glow', 'rgba('+c2[0]+','+c2[1]+','+c2[2]+',0.28)');
}

function sampleAndApplyArtColors(dataSrc) {
  var img = new Image();
  img.onload = function() { applyArtColors(extractArtColors(img)); img = null; };
  img.src = dataSrc;
}

// Apply HD art to the Now Playing panel, preserving the lyrics overlay child.
// Called from both loadCurrentSongArt and renderNowPlaying so the logic stays in one place.
function applyHdArtToNP(uri, data) {
  if (!data || !showNowPlaying || !currentSong || currentSong.albumArtUri !== uri) return;
  // Don't overwrite custom user art with cached MediaStore art
  if (currentSong.art && currentSong.art.startsWith('data:')) return;
  var imgEl = document.getElementById('npArtImgEl');
  if (imgEl) {
    imgEl.src = data;
  } else {
    var artEl = document.getElementById('npArtImg');
    if (artEl) {
      var overlay = document.getElementById('npArtLyrics');
      var newImg = document.createElement('img');
      newImg.id = 'npArtImgEl';
      newImg.src = data;
      newImg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      Array.from(artEl.childNodes).forEach(function(c) { if (c !== overlay) artEl.removeChild(c); });
      artEl.insertBefore(newImg, overlay || null);
    }
  }
  var bg = document.getElementById('npBgBlur');
  if (bg) bg.style.backgroundImage = 'url(' + data + ')';
  sampleAndApplyArtColors(data);
}

function loadCurrentSongArt(song) {
  if (!song || !song.albumArtUri) return;
  if (typeof NativeBridge === 'undefined' || !NativeBridge.isNative()) return;
  var uri = song.albumArtUri;
  // 192px thumbnail → mini player + media session
  fetchThumbnail(uri).then(function(data) {
    if (!data || !currentSong || currentSong.albumArtUri !== uri) return;
    if (currentSong.art && currentSong.art.startsWith('data:')) return;
    if (!showNowPlaying) {
      var el = document.getElementById('miniArt');
      if (el) {
        el.innerHTML = '<img src="' + data + '" style="width:48px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0;">';
        _miniLastSongId = '';
      }
    }
    updateMediaSession();
  });
  // 600px HD → NP hero + media session; uses shared fetchHdArt to deduplicate the
  // native read when playSong() and renderNowPlaying() both kick off simultaneously
  fetchHdArt(uri).then(function(data) {
    if (!data || !currentSong || currentSong.albumArtUri !== uri) return;
    updateMediaSession();
    applyHdArtToNP(uri, data);
  });
}

// ─── LRClib Lyrics Fetch ───

function _lrcFetch(url) {
  var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function() { ctrl.abort(); }, 10000) : null;
  return fetch(url, ctrl ? { signal: ctrl.signal } : {})
    .then(function(res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) return null;
      return res.json();
    })
    .catch(function() { if (timer) clearTimeout(timer); return null; });
}

function _lrcResult(data) {
  if (!data) return null;
  if (data.syncedLyrics || data.plainLyrics) {
    return { syncedLyrics: data.syncedLyrics || '', plainLyrics: data.plainLyrics || '' };
  }
  return null;
}

function fetchLRCLibLyrics(song) {
  // Strip feat. from both artist and title for cleaner matching
  var artist = (song.albumArtist || song.artist || '').replace(/\s+[\(\[]?(?:ft\.?|feat\.?|featuring)[^\)\]\n]*/i, '').trim();
  var title  = (song.title  || '').replace(/\s+[\(\[]?(?:ft\.?|feat\.?|featuring)[^\)\]\n]*/i, '').trim();
  if (!artist || !title) return Promise.resolve(null);

  var params = '?artist_name=' + encodeURIComponent(artist) + '&track_name=' + encodeURIComponent(title);

  // Step 1: exact get WITHOUT duration — duration mismatch causes silent 404 failures
  return _lrcFetch('https://lrclib.net/api/get' + params).then(function(data) {
    var r = _lrcResult(data);
    if (r) return r;
    // Step 2: fuzzy search — more lenient, returns ranked array
    return _lrcFetch('https://lrclib.net/api/search' + params).then(function(results) {
      if (!Array.isArray(results)) return null;
      for (var i = 0; i < results.length; i++) {
        var r2 = _lrcResult(results[i]);
        if (r2) return r2;
      }
      return null;
    });
  });
}

// ─── NP Lyrics Panel Helpers ───

function bindSyncedLyricsClicks(container) {
  var sc = container.querySelector('#syncedLyricsContainer');
  if (!sc) return;
  sc.querySelectorAll('.lyric-line').forEach(function(line) {
    line.onclick = function() {
      var t = parseFloat(line.dataset.time);
      if (!isNaN(t) && currentSong && currentSong.url) {
        audio.currentTime = t;
        if (!isPlaying) { isPlaying = true; audio.play().catch(function() { isPlaying = false; syncPlaybackUI(); }); syncPlaybackUI(); }
      }
    };
  });
}

function noLyricsPanelHTML() {
  return '<div class="lyrics-empty-np">'
    + '<div class="lyrics-empty-icon">&#9835;</div>'
    + '<p>No lyrics found</p>'
    + '<button class="add-lyrics-btn" id="fetchAiLyricsBtn" style="margin-bottom:6px;">&#128269; Search Lyrics</button>'
    + '<button class="add-lyrics-btn" id="addLyricsBtn" style="background:rgba(255,255,255,0.06);">&#9998; Add Manually</button>'
    + '</div>';
}

function bindAddLyricsBtn(panel, song) {
  // Retry LRCLIB (real synced timestamps) — Gemini no longer returns lyrics
  var aiBtn = panel.querySelector('#fetchAiLyricsBtn');
  if (aiBtn) aiBtn.onclick = function() {
    panel.innerHTML = '<div class="lyrics-empty-np"><div class="lyrics-empty-icon" style="animation:spin 1.5s linear infinite;display:inline-block;">&#9835;</div><p>Searching lyrics...</p></div>';
    fetchLRCLibLyrics(song).then(function(result) {
      if (result) {
        if (result.syncedLyrics)     { song.syncedLyrics = result.syncedLyrics; song.lyrics = ''; }
        else if (result.plainLyrics) { song.lyrics = result.plainLyrics; song.syncedLyrics = ''; }
        saveLibraryLater();
        saveEdit(song);
      }
      applyLyricsToNPPanel(song);
    }).catch(function() { applyLyricsToNPPanel(song); });
  };

  var btn = panel.querySelector('#addLyricsBtn');
  if (!btn) return;
  btn.onclick = function() {
    panel.innerHTML = '<div class="lyrics-editor-wrap">'
      + '<p class="lyrics-editor-hint">Paste plain lyrics or LRC timed format (e.g. [00:12.50]First line)</p>'
      + '<textarea id="lyricsEditorTA" class="lyrics-editor-ta" placeholder="[00:10.00]First line&#10;[00:14.50]Second line&#10;&#10;Or just plain lyrics without timestamps..."></textarea>'
      + '<div class="lyrics-editor-actions">'
      + '<button id="lyricsEditorCancel">Cancel</button>'
      + '<button id="lyricsEditorSave" class="save-btn">&#10003; Save</button>'
      + '</div>'
      + '</div>';
    document.getElementById('lyricsEditorCancel').onclick = function() {
      panel.innerHTML = noLyricsPanelHTML();
      bindAddLyricsBtn(panel, song);
    };
    document.getElementById('lyricsEditorSave').onclick = function() {
      var text = document.getElementById('lyricsEditorTA').value.trim();
      if (!text) return;
      if (parseLRC(text).length > 0) {
        song.syncedLyrics = text;
        song.lyrics = '';
      } else {
        song.lyrics = text;
        song.syncedLyrics = '';
      }
      saveLibraryLater();
      applyLyricsToNPPanel(song);
    };
    setTimeout(function() { var ta = document.getElementById('lyricsEditorTA'); if (ta) ta.focus(); }, 100);
  };
}

function applyLyricsToNPPanel(song) {
  if (!showNowPlaying || !currentSong || currentSong.id !== song.id) return;
  var overlay = document.getElementById('npArtLyrics');
  if (!overlay) return;
  var newLines = parseLRC(song.syncedLyrics);
  lyricsLines = newLines;
  currentLyricIdx = -1;
  lyricsVisible = newLines.length > 0;
  _lyricItems = null; // invalidate NodeList cache
  if (newLines.length > 0) {
    overlay.innerHTML = buildSyncedLyricsHTML();
    overlay.classList.remove('np-art-lyrics-hidden');
    bindSyncedLyricsClicks(overlay);
    updateSyncedLyrics(currentTime);
  } else if (song.lyrics && song.lyrics.trim()) {
    overlay.innerHTML = '<div class="plain-lyrics-scroll"><div class="lyrics-text">'
      + escHtml(song.lyrics).replace(/\\n/g, '<br>').replace(/\n/g, '<br>')
      + '</div></div>';
    overlay.classList.remove('np-art-lyrics-hidden');
  } else {
    overlay.classList.add('np-art-lyrics-hidden');
  }
}

// ─── Gapless Preload ───

function peekNextSong() {
  if (!currentSong || queue.length === 0 || isShuffled || repeatMode === 'one') return null;
  var idx = queue.findIndex(function(s) { return s.id === currentSong.id; });
  if (idx < 0 || idx >= queue.length - 1) return null;
  return queue[idx + 1];
}

function maybePreloadNext() {
  var next = peekNextSong();
  if (!next || !next.url) return;
  if (preloadedUrl === next.url) return;
  preloadedUrl = next.url;
  preloadedSong = next;
  audioPreload.src = next.url;
  audioPreload.load();
}

// ─── Media Session (lock screen / notification controls) ───

// Track last-pushed native notification state to avoid redundant bridge calls
var _lastNotifKey = '';

function updateMediaSession() {
  if (!currentSong) return;
  var artUri = currentSong.albumArtUri;
  // Custom data: art (user changed it) takes priority over the MediaStore cache
  var artData = (currentSong.art && currentSong.art.startsWith('data:')) ? currentSong.art
              : (artUri && artCacheHD[artUri]) ? artCacheHD[artUri]
              : (artUri && artCache[artUri]) ? artCache[artUri] : '';
  var sessionAlbum = (currentSong.album && currentSong.album !== 'Unknown Album') ? currentSong.album : '';
  // Push to native Android notification — fires regardless of Web MediaSession API availability
  if (typeof NativeBridge !== 'undefined' && NativeBridge.isNative()) {
    var notifKey = (currentSong.id || '') + '|' + (isPlaying ? '1' : '0') + '|' + (artData ? '1' : '0');
    if (notifKey !== _lastNotifKey) {
      _lastNotifKey = notifKey;
      NativeBridge.updateMediaNotification({
        title:    currentSong.title  || '',
        artist:   currentSong.artist || '',
        album:    sessionAlbum,
        art:      artData,
        playing:  isPlaying,
        position: Math.round(currentTime * 1000),
        duration: Math.round((duration || 0) * 1000),
      });
    }
  }
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title:  currentSong.title  || '',
    artist: currentSong.artist || '',
    album:  sessionAlbum,
    artwork: artData ? [{ src: artData, sizes: '512x512', type: 'image/jpeg' }] : []
  });
  navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  if (navigator.mediaSession.setPositionState && duration > 0) {
    try {
      navigator.mediaSession.setPositionState({ duration: duration, playbackRate: playbackRate, position: Math.min(currentTime, duration) });
    } catch(e) {}
  }
}

function initMediaSession() {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.setActionHandler('play',          function() { if (!isPlaying) togglePlay(); });
  navigator.mediaSession.setActionHandler('pause',         function() { if (isPlaying) togglePlay(); });
  navigator.mediaSession.setActionHandler('previoustrack', handlePrev);
  navigator.mediaSession.setActionHandler('nexttrack',     handleNext);
  navigator.mediaSession.setActionHandler('seekto',        function(d) {
    if (d.seekTime !== undefined) { audio.currentTime = d.seekTime; updateMediaSession(); }
  });
  navigator.mediaSession.setActionHandler('seekforward',   function(d) { audio.currentTime = Math.min(duration, audio.currentTime + (d.seekOffset || 10)); });
  navigator.mediaSession.setActionHandler('seekbackward',  function(d) { audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 10)); });
}

function imgOrArt(url, text, size, round, cls) {
  var safeUrl = safeArtUrl(url);
  if (safeUrl) {
    var r = round ? 'border-radius:50%;' : 'border-radius:8px;';
    return '<img src="' + safeUrl + '" class="song-art' + (cls ? ' ' + cls : '') + '" style="width:' + size + 'px;height:' + size + 'px;' + r + 'object-fit:cover;" onerror="this.outerHTML=artHTML(\'' + escHtml(text).replace(/'/g,"\\'") + '\',' + size + ',' + round + ')">';
  }
  return artHTML(text, size, round, cls);
}

function showToast(msg, duration) {
  var old = document.querySelector('.toast-msg');
  if (old) old.remove();
  var t = document.createElement('div');
  t.className = 'toast-msg';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function() { t.classList.add('fade-out'); setTimeout(function() { t.remove(); }, 300); }, duration || 2500);
}

// Show a one-time battery optimization banner for Samsung/Android users.
// Once dismissed or acted on it never appears again (stored in localStorage).
function maybeShowBatteryBanner() {
  if (typeof NativeBridge === 'undefined' || !NativeBridge.isNative()) return;
  if (localStorage.getItem('muzio_battery_banner_done')) return;
  NativeBridge.isBatteryOptimizationExempt().then(function(res) {
    if (res && res.exempt) { localStorage.setItem('muzio_battery_banner_done', '1'); return; }
    var old = document.querySelector('.battery-banner');
    if (old) return;
    var b = document.createElement('div');
    b.className = 'battery-banner';
    b.innerHTML = '<div class="battery-banner-text">'
      + '<div class="battery-banner-title">&#9889; Keep music playing in background</div>'
      + '<div class="battery-banner-sub">Disable battery optimization so My Music isn\'t paused by the system.</div>'
      + '</div>'
      + '<button class="battery-banner-fix">Fix it</button>'
      + '<button class="battery-banner-dismiss">&#10005;</button>';
    document.body.appendChild(b);
    b.querySelector('.battery-banner-fix').onclick = function() {
      localStorage.setItem('muzio_battery_banner_done', '1');
      b.remove();
      NativeBridge.requestBatteryOptimizationExemption();
    };
    b.querySelector('.battery-banner-dismiss').onclick = function() {
      localStorage.setItem('muzio_battery_banner_done', '1');
      b.remove();
    };
  }).catch(function() {});
}

// ─── Persistence (localStorage + IndexedDB) ───

var _saveLibraryTimer = null;
function saveLibraryLater() {
  clearTimeout(_saveLibraryTimer);
  _saveLibraryTimer = setTimeout(saveLibrary, 1000);
}

// IndexedDB library store — much larger quota than localStorage (no 5 MB cap)
var _libDb = null;
var LIB_DB_NAME = 'muzio_library_idb';
var LIB_STORE = 'songs';

var EDITS_STORE = 'manual_edits';

function openLibDb() {
  if (_libDb) return Promise.resolve(_libDb);
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(LIB_DB_NAME, 2);
    req.onupgradeneeded = function() {
      var db = req.result;
      if (!db.objectStoreNames.contains(LIB_STORE))   db.createObjectStore(LIB_STORE);
      if (!db.objectStoreNames.contains(EDITS_STORE)) db.createObjectStore(EDITS_STORE);
    };
    req.onsuccess = function() { _libDb = req.result; resolve(_libDb); };
    req.onerror = function() { reject(req.error); };
  });
}

function saveLibraryIDB() {
  if (!songs.length) return;
  var snapshot = songs.map(function(s) {
    return {
      fn: s.fn, title: s.title, artist: s.artist, album: s.album,
      year: s.year, genre: s.genre, disc: s.disc || 1, track: s.track, art: s.art,
      lyrics: s.lyrics, syncedLyrics: s.syncedLyrics,
      dur: s.dur, fav: s.fav, type: s.type, feat: s.feat,
      playCount: s.playCount || 0, lastPlayed: s.lastPlayed || 0,
      nativePath: s.nativePath || '', contentUri: s.contentUri || '',
      albumArtUri: s.albumArtUri || '', albumArtist: s.albumArtist || '',
      aiAttempted: s.aiAttempted || 0, enrichAttempted: s.enrichAttempted || 0
    };
  });
  openLibDb().then(function(db) {
    var tx = db.transaction(LIB_STORE, 'readwrite');
    tx.objectStore(LIB_STORE).put(snapshot, 'library');
  }).catch(function() {});
}

function loadLibraryIDB() {
  return openLibDb().then(function(db) {
    return new Promise(function(resolve) {
      var req = db.transaction(LIB_STORE, 'readonly').objectStore(LIB_STORE).get('library');
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { resolve([]); };
    });
  }).catch(function() { return []; });
}

// ─── Manual Edits Store ───
// A separate IDB store that records every tag the user has manually set.
// Applied on top of library data after every load or scan so edits survive
// cache clears, rescans, and reinstalls (as long as contentUri/filename matches).
// Structured for future Google Drive / cloud backup.

var _editsMap = Object.create(null); // contentUri||fn → edit object (in-memory mirror)

function saveEdit(song) {
  var key = song.contentUri || song.fn;
  if (!key) return;
  var edit = {
    title: song.title, artist: song.artist, album: song.album,
    albumArtist: song.albumArtist, year: song.year, genre: song.genre,
    track: song.track, type: song.type, feat: song.feat,
    syncedLyrics: song.syncedLyrics, lyrics: song.lyrics,
    art: song.art, editedAt: Date.now()
  };
  _editsMap[key] = edit;
  openLibDb().then(function(db) {
    db.transaction(EDITS_STORE, 'readwrite').objectStore(EDITS_STORE).put(edit, key);
  }).catch(function() {});
}

function saveEditsBatch(songList) {
  var now = Date.now();
  openLibDb().then(function(db) {
    var tx = db.transaction(EDITS_STORE, 'readwrite');
    var st = tx.objectStore(EDITS_STORE);
    songList.forEach(function(song) {
      var key = song.contentUri || song.fn;
      if (!key) return;
      var edit = {
        title: song.title, artist: song.artist, album: song.album,
        albumArtist: song.albumArtist, year: song.year, genre: song.genre,
        track: song.track, type: song.type, feat: song.feat,
        syncedLyrics: song.syncedLyrics, lyrics: song.lyrics,
        art: song.art, editedAt: now
      };
      _editsMap[key] = edit;
      st.put(edit, key);
    });
  }).catch(function() {});
}

function loadAllEdits() {
  return openLibDb().then(function(db) {
    return new Promise(function(resolve) {
      var result = Object.create(null);
      var req = db.transaction(EDITS_STORE, 'readonly').objectStore(EDITS_STORE).openCursor();
      req.onsuccess = function(e) {
        var c = e.target.result;
        if (c) { result[c.key] = c.value; c.continue(); }
        else resolve(result);
      };
      req.onerror = function() { resolve(result); };
    });
  }).catch(function() { return Object.create(null); });
}

function applyEditsToSongs() {
  if (!songs.length) return;
  songs.forEach(function(s) {
    var edit = _editsMap[s.contentUri] || _editsMap[s.fn];
    if (!edit) return;
    // Apply every saved field, including intentional blanks (user cleared a value)
    if (edit.title  !== undefined) s.title  = edit.title;
    if (edit.artist !== undefined) s.artist = edit.artist;
    if (edit.album  !== undefined) s.album  = edit.album;
    if (edit.albumArtist !== undefined) s.albumArtist = edit.albumArtist;
    if (edit.year   !== undefined) s.year   = edit.year;
    if (edit.genre  !== undefined) s.genre  = edit.genre;
    if (edit.track  !== undefined) s.track  = edit.track;
    if (edit.type   !== undefined) s.type   = edit.type;
    if (edit.feat   !== undefined) s.feat   = edit.feat;
    if (edit.syncedLyrics !== undefined) s.syncedLyrics = edit.syncedLyrics;
    if (edit.lyrics !== undefined) s.lyrics = edit.lyrics;
    if (edit.art)    s.art = edit.art;
  });
}

// Permanently delete a list of songs from the device filesystem (native) or just
// remove them from the library (web). Shows a system confirm dialog on Android 10+.
function deleteSongsFromDevice(songsToDelete) {
  var ids = new Set(songsToDelete.map(function(s) { return s.id; }));
  function removeFromMemory() {
    songsToDelete.forEach(function(s) { if (s.url && s.url.startsWith('blob:')) URL.revokeObjectURL(s.url); });
    songs = songs.filter(function(s) { return !ids.has(s.id); });
    queue = queue.filter(function(s) { return !ids.has(s.id); });
    songMap = Object.create(null); songs.forEach(function(s) { songMap[s.id] = s; });
    _countsCache = null;
    if (currentSong && ids.has(currentSong.id)) { currentSong = null; isPlaying = false; audio.pause(); }
    saveLibrary();
    render();
  }
  if (NativeBridge.isNative()) {
    var uris = songsToDelete.map(function(s) { return s.contentUri; }).filter(Boolean);
    if (!uris.length) { removeFromMemory(); showToast('Removed from library'); return; }
    NativeBridge.deleteFiles(uris).then(function(r) {
      removeFromMemory();
      showToast('Deleted ' + (r.deleted || songsToDelete.length) + ' song' + (songsToDelete.length !== 1 ? 's' : ''));
    }).catch(function(e) {
      if (e && e.message && e.message.indexOf('cancelled') !== -1) {
        showToast('Delete cancelled');
      } else {
        showToast('Delete failed: ' + (e && e.message ? e.message : e));
      }
    });
  } else {
    removeFromMemory();
    showToast('Removed from library');
  }
}

function saveLibrary() {
  _countsCache = null; _artistsCache = null; _albumsCache = null;
  _artistSongsCache = null; _albumSongsCache = null; _spCache = null;
  songMap = Object.create(null);
  songs.forEach(function(s) { songMap[s.id] = s; });
  // Lean localStorage tier: no lyrics, no art (stored in IDB only).
  // For large libraries (>5 MB) the full list won't fit in localStorage.
  // We try the full list first; if it's too big we fall back to the first
  // 2 000 songs so the UI has something to show instantly on cold start while
  // IDB loads the rest.  IDB always gets the full list below.
  try {
    var lean = songs.map(function(s) {
      return {
        fn: s.fn, title: s.title, artist: s.artist, album: s.album,
        year: s.year, genre: s.genre, disc: s.disc || 1, track: s.track,
        dur: s.dur, fav: s.fav, type: s.type, feat: s.feat,
        playCount: s.playCount || 0, lastPlayed: s.lastPlayed || 0,
        nativePath:  s.nativePath  || '',
        contentUri:  s.contentUri  || '',
        albumArtUri: s.albumArtUri || '',
        albumArtist: s.albumArtist || '',
        dateAdded:   s.dateAdded   || 0,
        aiAttempted: s.aiAttempted || 0, enrichAttempted: s.enrichAttempted || 0
      };
    });
    try {
      localStorage.setItem('muzio_library', JSON.stringify(lean));
      localStorage.removeItem('muzio_library_partial');
    } catch (quotaErr) {
      // Library is too large for localStorage — save first 2 000 as a fast-start preview
      try {
        localStorage.setItem('muzio_library', JSON.stringify(lean.slice(0, 2000)));
        localStorage.setItem('muzio_library_partial', '1');
      } catch (e2) {}
    }
    localStorage.setItem('muzio_library_count', songs.length.toString());
    localStorage.setItem('muzio_library_saved', Date.now().toString());
  } catch (e) {}
  // Always persist to IndexedDB as well (no quota limit, survives localStorage failures)
  saveLibraryIDB();
}

function loadLibrary() {
  try {
    var raw = localStorage.getItem('muzio_library');
    if (!raw) return [];
    var data = JSON.parse(raw);
    return data.map(function(s) {
      s.id = genId();
      s.url = '';
      s.tagging = false;
      s.fav = s.fav || false;
      return s;
    });
  } catch (e) {
    // Corrupt or truncated JSON — remove so the next launch doesn't repeat
    try { localStorage.removeItem('muzio_library'); } catch(e2) {}
    return [];
  }
}

function loadPlaylists() {
  try {
    var raw = localStorage.getItem('muzio_playlists');
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) { return []; }
}

function savePlaylists() {
  try { localStorage.setItem('muzio_playlists', JSON.stringify(playlists)); } catch (e) {}
}

// ─── Art Cache Persistence (IndexedDB) ───
// Thumbnails are stored here so subsequent sessions load art instantly from
// local storage instead of re-fetching through the native bridge each time.

var _artDb = null;
var ART_DB_NAME = 'muzio_art';
var ART_STORE_NAME = 'thumbs';

function openArtDb() {
  if (_artDb) return Promise.resolve(_artDb);
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(ART_DB_NAME, 1);
    req.onupgradeneeded = function() { req.result.createObjectStore(ART_STORE_NAME); };
    req.onsuccess = function() { _artDb = req.result; resolve(_artDb); };
    req.onerror = function() { reject(req.error); };
  });
}

function persistArt(uri, data) {
  if (!data) return;
  // No eviction cap — store every unique album art permanently so large libraries
  // (15k+ songs) never re-fetch from the native bridge after the first session.
  // Thumbnails are small (~10-15 KB each); 3000 albums ≈ 36 MB on disk, well within
  // Android app sandbox limits.
  openArtDb().then(function(db) {
    db.transaction(ART_STORE_NAME, 'readwrite').objectStore(ART_STORE_NAME).put(data, uri);
  }).catch(function() {});
}

function loadPersistedArt() {
  return openArtDb().then(function(db) {
    return new Promise(function(resolve) {
      var tx = db.transaction(ART_STORE_NAME, 'readonly');
      var result = {};
      var count = 0;
      var req = tx.objectStore(ART_STORE_NAME).openCursor();
      req.onsuccess = function(e) {
        var cur = e.target.result;
        if (cur && count < _ART_CACHE_MAX) { result[cur.key] = cur.value; count++; cur.continue(); }
        else resolve(result);
      };
      req.onerror = function() { resolve({}); };
    });
  }).catch(function() { return {}; });
}

// ─── Persistent Folder Access (IndexedDB + File System Access API) ───

var savedDirHandle = null;
var DB_NAME = 'muzio_db';
var STORE_NAME = 'handles';

function openDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function() { req.result.createObjectStore(STORE_NAME); };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}

function saveDirHandle(handle) {
  savedDirHandle = handle;
  return openDB().then(function(db) {
    return new Promise(function(resolve) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, 'musicDir');
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { resolve(); };
    });
  }).catch(function() {});
}

function loadDirHandle() {
  return openDB().then(function(db) {
    return new Promise(function(resolve) {
      var tx = db.transaction(STORE_NAME, 'readonly');
      var req = tx.objectStore(STORE_NAME).get('musicDir');
      req.onsuccess = function() { resolve(req.result || null); };
      req.onerror = function() { resolve(null); };
    });
  }).catch(function() { return null; });
}

function clearDirHandle() {
  savedDirHandle = null;
  return openDB().then(function(db) {
    return new Promise(function(resolve) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete('musicDir');
      tx.oncomplete = function() { resolve(); };
      tx.onerror = function() { resolve(); };
    });
  }).catch(function() {});
}

var AUDIO_EXTS = ['mp3','m4a','flac','ogg','wav','aac','wma','opus','mp4','webm'];

function scanDirectoryHandle(dirHandle) {
  var files = [];
  return (function walk(handle, path) {
    return new Promise(function(resolve) {
      var entries = handle.values();
      var promises = [];
      function next() {
        entries.next().then(function(result) {
          if (result.done) {
            Promise.all(promises).then(function() { resolve(); });
            return;
          }
          var entry = result.value;
          if (entry.kind === 'file') {
            var ext = entry.name.split('.').pop().toLowerCase();
            if (AUDIO_EXTS.indexOf(ext) !== -1) {
              promises.push(entry.getFile().then(function(f) { files.push(f); }));
            }
          } else if (entry.kind === 'directory') {
            promises.push(walk(entry, path + entry.name + '/'));
          }
          next();
        }).catch(function() { next(); });
      }
      next();
    });
  })(dirHandle, '').then(function() { return files; });
}

function autoScanFromHandle() {
  return loadDirHandle().then(function(handle) {
    if (!handle) return false;
    savedDirHandle = handle;
    return handle.requestPermission({ mode: 'read' }).then(function(perm) {
      if (perm !== 'granted') return false;
      showToast('Scanning music folder...', 3000);
      return scanDirectoryHandle(handle).then(function(files) {
        if (files.length > 0) {
          handleFileImport(files);
          return true;
        }
        return false;
      });
    });
  }).catch(function() { return false; });
}

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function pickFolderWithHandle() {
  if (isMobile()) return false;
  if (!window.showDirectoryPicker) return false;
  try {
    window.showDirectoryPicker({ mode: 'read' }).then(function(handle) {
      saveDirHandle(handle);
      showToast('Finding your music...', 3000);
      scanDirectoryHandle(handle).then(function(files) {
        if (files.length > 0) handleFileImport(files);
        else showToast('No audio files found in that folder');
      });
    }).catch(function(e) {
      if (e.name !== 'AbortError') {
        document.getElementById('folderInput').click();
      }
    });
    return true;
  } catch (e) {
    return false;
  }
}

// ─── Song Library ───

var songs = loadLibrary();

// ─── State ───

var artCache = {};     // content:// URI → 192px base64 thumbnail
var artCacheHD = {};   // content:// URI → 600px base64 for Now Playing
var artInFlight = {};  // content:// URI → Promise (deduplicates concurrent requests)
var _artBgLoading = false; // true while backgroundLoadAllArt is pumping
var _ART_CACHE_MAX = 500; // ~50KB × 500 ≈ 25 MB — safe on mid-range Android

// Playback speed
var playbackRate = 1.0;
var SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];

// Genre navigation
var selectedGenre = null;

// Audio interruption resume flags
var _ourPause = false;
var _systemPaused = false;

// ─── Web Audio API — EQ + Crossfade ───
var _audioCtx = null;
var _srcMain  = null;
var _srcPre   = null;
var _gainMain = null;
var _gainPre  = null;
var _eqNodes  = [];

var EQ_FREQS  = [60, 230, 910, 3600, 14000];
var EQ_TYPES  = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];
var EQ_PRESETS = {
  'Default':    [0, 0, 0, 0, 0],
  'Bass Boost': [6, 4, 0, -1, -1],
  'Hip-Hop':    [5, 3, -1, 2, 1],
  'Treble':     [-1, -1, 1, 4, 6],
  'Vocal':      [-2, -1, 3, 3, 1],
  'Rock':       [4, 2, -1, 2, 4]
};

var eqGains = [0, 0, 0, 0, 0];
var crossfadeDur = 2;
(function() {
  var saved = localStorage.getItem('eqSettings');
  try { saved = saved ? JSON.parse(saved) : null; } catch(e) { saved = null; }
  if (saved && Array.isArray(saved.gains) && saved.gains.length === 5) eqGains = saved.gains;
  if (saved && saved.xfade != null) crossfadeDur = saved.xfade;
})();

// Gapless preload buffer
var audioPreload = (function() { var a = new Audio(); a.preload = 'auto'; return a; })();
var preloadedUrl = '';
var preloadedSong = null;

// Song lookup map — rebuilt in saveLibrary(); avoids O(n) songs.find() on every tap
var songMap = (function() { var m = Object.create(null); songs.forEach(function(s){m[s.id]=s;}); return m; })();

// Counts cache — invalidated in saveLibrary()
var _countsCache = null;
// Derived-data caches — invalidated whenever songs changes
var _artistsCache = null;
var _albumsCache = null;
var _artistSongsCache = null;   // name → sorted [song]
var _albumSongsCache = null;    // 'album|||artist' → sorted [song]
var _spCache = null;            // smart playlist lists (top, recent, lastAdded)
// saveUIState debounce
var _saveUITimer = null;
function saveUIStateLater() { clearTimeout(_saveUITimer); _saveUITimer = setTimeout(saveUIState, 300); }
// Startup render dedup
var _startupRenderPending = false;
function scheduleStartupRender() {
  if (_startupRenderPending) return;
  _startupRenderPending = true;
  requestAnimationFrame(function() { _startupRenderPending = false; render(); });
}

// IntersectionObserver singleton — disconnected before each new render
// _lazyArtObs removed — initLazyArt now uses per-container observers

// Now Playing DOM element refs — cached after renderNowPlaying, cleared on close
var _npSeekEl = null, _npFillEl = null, _npTime0El = null, _npSeeking = false;

// Mini player DOM cache — populated on first updateMiniPlayer() call
var _miniLastSongId = '';
var _mpEl = null, _mpTitleEl = null, _mpArtistEl = null, _mpArtEl = null;
var _mpPlayBtn = null, _mpBar = null, _mpEq = null;

var currentTab = 'artists';
var currentSong = null;
var isPlaying = false;
var currentTime = 0;
var duration = 0;
var volume = 0.8;
var isMuted = false;
var isShuffled = false;
var repeatMode = 'off';
var _playHistory = [];    // song IDs played in order, most recent last
var _historyJump = false; // set true by handlePrev so playSong skips the push
var showNowPlaying = false;
var selectedArtist = null;
var selectedAlbum = null;
var currentSmartPlaylist = null;
var _msMode = false;
var _msSongIds = null;
var _msEl = null;
var _msArtistMode = false;
var _msArtistNames = null;
var _prevTab = null; // tab to restore when backing out of album detail navigated from NowPlaying/search
var albumFilter = 'all';
var albumGenreFilter = 'all';
var _pendingArtBase64 = ''; // album art picked in edit modal, cleared on close
var queue = [];
var apiKey = localStorage.getItem('gemini_api_key') || '';
var GENERIC_GENRE = /^(hip.hop|rap|r&b|music|unknown|other|pop)$/i;
var _GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
// Ordered by preference — first working model is cached in localStorage so we stop retrying
var _GEMINI_MODELS = [
  'gemini-2.5-flash-latest',
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-3.0-flash',
  'gemini-3-flash',
  'gemini-2.0-flash-latest',
  'gemini-1.5-flash-latest'
];
var _geminiModel = localStorage.getItem('gemini_model') || '';
var _GEMINI_URL = _GEMINI_BASE + (_geminiModel || _GEMINI_MODELS[0]) + ':generateContent';
var _GEMINI_EXPERTISE = 'You are a music metadata expert with encyclopedic knowledge of hip-hop, rap, R&B, drill, trap, boom-bap, G-funk, cloud rap, and mixtape culture. Research this release from your knowledge and return correct values for every field — do not leave fields blank if you know the answer.\n\n';
var _GEMINI_TAG_RULES = 'Rules:\n- Use standard title case\n- genre must be one specific subgenre (e.g. "Trap", "Boom Bap", "Drill") not a broad category\n- releaseType: Album | Mixtape | EP | Single\n- featuredArtists: comma-separated guest artists from the title (e.g. "Lil Wayne, Drake") or ""\n- If unsure, use "" not "Unknown"\n';
var sortMode = 'title';
var artistSortMode = 'az';
var albumSortMode = 'az';
var artistViewMode = 'list';   // 'list' | 'grid2' | 'grid3'
var albumArtistsOnly = true;
var playlists = loadPlaylists();
var currentPlaylistId = null;
var sleepTimerEnd = 0;
var _sleepTimerTimeout = null;
var _sleepTimerDisplayInt = null;
var nativeScanning = false;
var nativeScanCount = 0;
var nativeScanError = '';
var _forceRescan = false; // set when IDB/localStorage has fewer songs than the saved count
var _idbLoading = true; // true until first IDB load completes; prevents premature auto-scan

var audio = document.getElementById('audioEl');

// ─── Derived Data ───

function getArtists() {
  if (_artistsCache) return _artistsCache;
  var map = {};
  // Build a set of known album artists for filtering
  var albumArtistSet = {};
  songs.forEach(function(s) {
    if (s.albumArtist) albumArtistSet[s.albumArtist] = true;
  });

  songs.forEach(function(s) {
    var key = s.artist;
    if (!map[key]) map[key] = { albums: {}, count: 0, arts: [], albumArtist: s.albumArtist || '', albumArtUris: [] };
    map[key].albums[s.album] = true;
    map[key].count++;
    var artUrl = s.art || '';
    if (artUrl && artUrl.startsWith('http://localhost') && map[key].arts.indexOf(artUrl) === -1) {
      map[key].arts.push(artUrl);
    }
    if (s.albumArtUri && map[key].albumArtUris.indexOf(s.albumArtUri) === -1 && map[key].albumArtUris.length < 4) {
      map[key].albumArtUris.push(s.albumArtUri);
    }
    if (!map[key].albumArtist && s.albumArtist) map[key].albumArtist = s.albumArtist;
  });

  var list = Object.keys(map).map(function(name) {
    return { name: name, albumCount: Object.keys(map[name].albums).length, songCount: map[name].count, arts: map[name].arts, albumArtist: map[name].albumArtist, albumArtUris: map[name].albumArtUris };
  });

  // Album artists filter: only show artists that appear as an albumArtist on at least one song
  if (albumArtistsOnly && Object.keys(albumArtistSet).length > 0) {
    list = list.filter(function(a) { return albumArtistSet[a.name]; });
  }

  if (artistSortMode === 'za') list.sort(function(a, b) { return b.name.localeCompare(a.name); });
  else if (artistSortMode === 'songs') list.sort(function(a, b) { return b.songCount - a.songCount; });
  else list.sort(function(a, b) { return a.name.localeCompare(b.name); }); // 'az' default

  _artistsCache = list;
  return list;
}

function getAlbums(filter) {
  if (_albumsCache && !filter) return _albumsCache;
  if (_albumsCache && filter === 'all') return _albumsCache;
  var map = {};
  songs.forEach(function(s) {
    var artistKey = (s.albumArtist || s.artist).replace(/\s*(feat?\.?|ft\.?|featuring)\s+.+$/i, '').trim();
    var key = s.album + '|||' + artistKey;
    var art = safeArtUrl(s.art);
    if (!map[key]) map[key] = { artist: artistKey, year: s.year, art: art, count: 0, type: s.type || 'Album', albumArtUri: '', genre: s.genre || '' };
    map[key].count++;
    if (art && !map[key].art) map[key].art = art;
    if (s.genre && !map[key].genre) map[key].genre = s.genre;
    if (s.albumArtUri && !map[key].albumArtUri) map[key].albumArtUri = s.albumArtUri;
  });
  var all = Object.keys(map).map(function(key) {
    var name = key.split('|||')[0];
    var d = map[key];
    return { name: name, artist: d.artist, year: d.year, art: d.art, albumArtUri: d.albumArtUri || '', songCount: d.count, type: d.type, genre: d.genre || '' };
  });

  _albumsCache = all;
  if (!filter || filter === 'all') return all;
  if (filter === 'albums') return all.filter(function(a) { return a.type === 'Album'; });
  if (filter === 'mixtapes') return all.filter(function(a) { return a.type === 'Mixtape'; });
  if (filter === 'eps') return all.filter(function(a) { return a.type === 'EP' || a.type === 'Single'; });
  return all;
}

function getAlbumSongs(albumName, artistName) {
  if (!_albumSongsCache) _buildSongCaches();
  return _albumSongsCache[albumName + '|||' + artistName] || [];
}

// Find the album-artist cache key (artist string) for the album with the most songs.
// Prevents featured-artist songs from pointing to a single-song sub-cache instead of the full album.
function getBestAlbumArtistKey(albumName) {
  if (!_albumSongsCache) _buildSongCaches();
  var prefix = albumName + '|||';
  var bestKey = null;
  var bestCount = 0;
  Object.keys(_albumSongsCache).forEach(function(k) {
    if (k.indexOf(prefix) === 0) {
      var cnt = _albumSongsCache[k].length;
      if (cnt > bestCount) { bestCount = cnt; bestKey = k.substring(prefix.length); }
    }
  });
  return bestKey || '';
}

// Clean up album names that came from filenames (underscores, stray dashes).
function cleanFilenameAlbum(s) {
  if (!s) return s;
  return s
    .replace(/_/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function getArtistSongs(name) {
  if (!_artistSongsCache) _buildSongCaches();
  return _artistSongsCache[name] || [];
}

function _buildSongCaches() {
  var ac = Object.create(null); // artist → songs (sorted)
  var bc = Object.create(null); // 'album|||artist' → songs (sorted)
  songs.forEach(function(s) {
    if (!ac[s.artist]) ac[s.artist] = [];
    ac[s.artist].push(s);
    var albumArtistKey = (s.albumArtist || s.artist).replace(/\s*(feat?\.?|ft\.?|featuring)\s+.+$/i, '').trim();
    var k = s.album + '|||' + albumArtistKey;
    if (!bc[k]) bc[k] = [];
    bc[k].push(s);
  });
  var artistSort = function(a, b) {
    if (a.album !== b.album) return a.album.localeCompare(b.album);
    var da = ((a.disc || 1) * 1000) + (a.track || 0);
    var db = ((b.disc || 1) * 1000) + (b.track || 0);
    return da - db;
  };
  var albumSort = function(a, b) {
    var da = ((a.disc || 1) * 1000) + (a.track || 0);
    var db = ((b.disc || 1) * 1000) + (b.track || 0);
    return da - db;
  };
  Object.keys(ac).forEach(function(n) { ac[n].sort(artistSort); });
  Object.keys(bc).forEach(function(k) { bc[k].sort(albumSort); });
  _artistSongsCache = ac;
  _albumSongsCache = bc;
}

function getArtistAlbums(name) {
  var list = getArtistSongs(name); // uses cache
  var map = Object.create(null);
  list.forEach(function(s) {
    var art = safeArtUrl(s.art);
    if (!map[s.album]) map[s.album] = { year: s.year, art: art, count: 0, type: s.type, albumArtUri: '' };
    map[s.album].count++;
    if (art && !map[s.album].art) map[s.album].art = art;
    if (s.albumArtUri && !map[s.album].albumArtUri) map[s.album].albumArtUri = s.albumArtUri;
  });
  return Object.keys(map).map(function(a) {
    return { name: a, artist: name, year: map[a].year, art: map[a].art, albumArtUri: map[a].albumArtUri || '', songCount: map[a].count, type: map[a].type };
  }).sort(function(a, b) {
    var ya = parseInt(a.year) || 9999;
    var yb = parseInt(b.year) || 9999;
    if (ya !== yb) return ya - yb;
    return a.name.localeCompare(b.name);
  });
}

function getFavorites() {
  return songs.filter(function(s) { return s.fav; });
}

function getSongCounts() {
  if (_countsCache) return _countsCache;
  var artists = Object.create(null);
  var albums = Object.create(null);
  var genres = Object.create(null);
  var favs = 0;
  songs.forEach(function(s) {
    artists[s.artist] = 1;
    albums[s.album + '|||' + s.artist] = 1;
    if (s.genre) genres[s.genre] = 1;
    if (s.fav) favs++;
  });
  _countsCache = { songs: songs.length, artists: Object.keys(artists).length, albums: Object.keys(albums).length, genres: Object.keys(genres).length, favs: favs };
  return _countsCache;
}

// ─── Render ───

var _TI = {
  artists:   '<svg class="tab-icon" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>',
  songs:     '<svg class="tab-icon" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>',
  albums:    '<svg class="tab-icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>',
  playlists: '<svg class="tab-icon" viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>',
  genres:    '<svg class="tab-icon" viewBox="0 0 24 24"><path d="M12 3v13.55A4 4 0 1 0 14 20V8h4V3h-6zm-2 17a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/><circle cx="18" cy="5.5" r="1"/></svg>'
};
var _lastTabCounts = { artists: -1, songs: -1, albums: -1, genres: -1 };

function render() {
  _msExit();
  _msArtistMode = false; _msArtistNames = null; _msHideBar();
  cleanupVirtualScroll();
  cleanupArtistVS();
  cleanupAlbumGrid();
  var main = document.getElementById('mainContent');
  var tabBar = document.getElementById('tabBar');
  var header = document.getElementById('headerTitle');
  var fab = document.getElementById('fabBtn');
  var menuBtn = document.getElementById('menuBtn');
  var searchBar = document.getElementById('searchBar');

  // Close any open overflow menu on navigation
  var openMenu = document.getElementById('overflowMenu');
  if (openMenu) openMenu.remove();

  // Remove alphabet strip when navigating away from artist list
  ['alphaStrip', 'alphaBubble'].forEach(function(id) { var e = document.getElementById(id); if (e) e.remove(); });
  removeScrollIndicator();

  searchBar.classList.add('hidden');
  tabBar.classList.remove('hidden');
  menuBtn.innerHTML = '&#9776;';
  menuBtn.onclick = function() { toggleDrawer(true); };
  fab.classList.add('hidden');

  // Wire overflow button
  var overflowBtn = document.getElementById('overflowBtn');
  if (overflowBtn) {
    if (selectedAlbum) {
      overflowBtn.onclick = function(e) { e.stopPropagation(); showAlbumMenu(selectedAlbum); };
    } else if (selectedArtist) {
      overflowBtn.onclick = function(e) { e.stopPropagation(); showArtistMenu(selectedArtist); };
    } else {
      overflowBtn.onclick = function(e) { e.stopPropagation(); showOverflowMenu(); };
    }
  }

  var counts = getSongCounts();
  var tabs = tabBar.querySelectorAll('button');
  if (counts.artists !== _lastTabCounts.artists || counts.songs !== _lastTabCounts.songs || counts.albums !== _lastTabCounts.albums || counts.genres !== _lastTabCounts.genres) {
    _lastTabCounts = { artists: counts.artists, songs: counts.songs, albums: counts.albums, genres: counts.genres };
    tabs[0].innerHTML = _TI.artists   + '<span class="tab-label">Artists<span class="tab-count"> ' + counts.artists + '</span></span>';
    tabs[1].innerHTML = _TI.songs     + '<span class="tab-label">Songs<span class="tab-count"> '   + counts.songs   + '</span></span>';
    tabs[2].innerHTML = _TI.albums    + '<span class="tab-label">Albums<span class="tab-count"> '  + counts.albums  + '</span></span>';
    tabs[3].innerHTML = _TI.playlists + '<span class="tab-label">Playlists</span>';
    tabs[4].innerHTML = _TI.genres    + '<span class="tab-label">Genres<span class="tab-count"> '  + counts.genres  + '</span></span>';
  }

  if (selectedAlbum) {
    tabBar.classList.add('hidden');
    header.textContent = selectedAlbum.name;
    menuBtn.innerHTML = '&#8249;';
    menuBtn.onclick = function() { selectedAlbum = null; if (_prevTab) { currentTab = _prevTab; _prevTab = null; } render(); };
    renderAlbumDetail(main);
    main.scrollTop = 0;
  } else if (selectedArtist) {
    tabBar.classList.add('hidden');
    header.textContent = selectedArtist;
    menuBtn.innerHTML = '&#8249;';
    menuBtn.onclick = function() { selectedArtist = null; render(); };
    renderArtistDetail(main);
    main.scrollTop = 0;
  } else if (selectedGenre) {
    tabBar.classList.add('hidden');
    header.textContent = selectedGenre;
    menuBtn.innerHTML = '&#8249;';
    menuBtn.onclick = function() { selectedGenre = null; render(); };
    renderGenreDetail(main);
    main.scrollTop = 0;
  } else {
    header.textContent = 'My Music';
    if (currentTab === 'artists') {
      renderArtists(main);
      if (_savedArtistScroll > 0) {
        main.scrollTop = _savedArtistScroll;
        if (_vsArtistScrollFn) _vsArtistScrollFn();
        _savedArtistScroll = 0;
      }
    } else if (currentTab === 'songs') {
      fab.innerHTML = '&#128256;';
      fab.style.fontSize = '22px';
      fab.title = 'Shuffle all';
      fab.classList.remove('hidden');
      renderSongs(main);
    } else if (currentTab === 'albums') {
      renderAlbums(main);
    } else if (currentTab === 'playlists') {
      renderPlaylists(main);
    } else if (currentTab === 'playlist') {
      renderPlaylistSongs(main);
      main.scrollTop = 0;
    } else if (currentTab === 'smartpl') {
      tabBar.classList.add('hidden');
      header.textContent = currentSmartPlaylist ? currentSmartPlaylist.title : 'Smart Playlist';
      menuBtn.innerHTML = '&#8249;';
      menuBtn.onclick = function() { currentSmartPlaylist = null; currentTab = 'playlists'; render(); };
      renderSmartPlaylistDetail(main);
      main.scrollTop = 0;
    } else if (currentTab === 'favorites') {
      renderFavorites(main);
    } else if (currentTab === 'genres') {
      renderGenres(main);
    }
  }

  // Subtle fade-in on every navigation — makes transitions feel premium
  main.classList.remove('content-fade-in');
  void main.offsetWidth; // force reflow so animation restarts
  main.classList.add('content-fade-in');

  updateMiniPlayer();
  saveUIStateLater();
}

// ─── Welcome Screen ───

function renderWelcome(el) {
  var isNativeApp = typeof NativeBridge !== 'undefined' && NativeBridge.isNative();

  // Native app: show scanning UI — auto-starts on open
  if (isNativeApp) {
    if (nativeScanError) {
      el.innerHTML = '<div class="welcome-screen welcome-screen--compact">'
        + '<div class="welcome-perm-icon" style="font-size:36px;width:72px;height:72px;margin-bottom:16px">&#128683;</div>'
        + '<h2 class="welcome-title" style="font-size:18px;margin-bottom:8px">Permission Needed</h2>'
        + '<p class="welcome-text" style="margin-bottom:16px">' + nativeScanError + '</p>'
        + '<button class="welcome-btn" id="welcomeRetryBtn" style="max-width:240px;margin-bottom:10px">&#8635; Try Again</button>'
        + '<button class="welcome-btn" id="welcomeSettingsBtn" style="max-width:240px;background:rgba(255,255,255,0.08);box-shadow:none;border:1px solid rgba(255,255,255,0.15)">&#9881; Open App Settings</button>'
        + '<p class="welcome-hint" style="margin-top:12px">In Settings: Permissions → Music and audio → Allow</p>'
        + '</div>';
      document.getElementById('welcomeRetryBtn').onclick = function() {
        nativeScanError = '';
        nativeAutoScan();
      };
      document.getElementById('welcomeSettingsBtn').onclick = function() {
        if (typeof NativeBridge !== 'undefined' && NativeBridge.openAppSettings) {
          NativeBridge.openAppSettings();
        }
      };
      return;
    }
    var countLine = nativeScanCount > 0
      ? '<p class="scan-count-badge">&#127925; ' + nativeScanCount.toLocaleString() + ' songs found...</p>'
      : '';
    var statusMsg = nativeScanning ? 'Scanning phone &amp; SD card...' : 'Starting scan...';
    el.innerHTML = '<div class="welcome-screen welcome-screen--compact">'
      + '<div class="welcome-scan-ring"><div class="welcome-scan-note">&#9835;</div></div>'
      + '<h2 class="welcome-title" style="font-size:18px;margin-bottom:6px">Finding Your Music</h2>'
      + '<p class="welcome-text" id="scanStatusText" style="margin-bottom:8px">' + statusMsg + '</p>'
      + countLine
      + '</div>';
    return;
  }

  // Web browser: show file picker button
  var html = '<div class="welcome-screen">'
    + '<div class="welcome-perm-icon">&#127925;</div>'
    + '<h2 class="welcome-title">My Music</h2>'
    + '<p class="welcome-text">Select your music files to start playing. Songs play directly from your storage — nothing is copied.</p>'
    + '<button class="welcome-btn" id="welcomeGrantBtn">&#127911; Select Music Files</button>'
    + '<p class="welcome-hint">Navigate to your Music folder → long press → Select All</p>';

  html += '</div>';
  el.innerHTML = html;

  document.getElementById('welcomeGrantBtn').onclick = function() {
    if (!pickFolderWithHandle()) {
      document.getElementById('folderInput').click();
    }
  };
  var apiLink = document.getElementById('welcomeApiLink');
  if (apiLink) {
    apiLink.onclick = function() { openSettings(); };
  }
}

function showScanMorePrompt(count) {
  var existing = document.querySelector('.scan-more-prompt');
  if (existing) existing.remove();
  var el = document.createElement('div');
  el.className = 'scan-more-prompt';
  el.innerHTML = '<div class="scan-more-body">'
    + '<p class="scan-more-title">&#10003; Found ' + count + ' songs!</p>'
    + '<p class="scan-more-sub">Have music on your SD card or another folder?<br>Navigate there and Select All to add more.</p>'
    + '<div class="scan-more-actions">'
    + '<button class="scan-more-btn" id="scanMoreBtn">Add More Songs</button>'
    + '<button class="scan-more-dismiss" id="scanDoneBtn">I\'m Done</button>'
    + '</div>'
    + '</div>';
  document.getElementById('app').appendChild(el);
  requestAnimationFrame(function() { el.classList.add('visible'); });

  document.getElementById('scanMoreBtn').onclick = function() {
    el.classList.remove('visible');
    setTimeout(function() { el.remove(); }, 300);
    if (!pickFolderWithHandle()) document.getElementById('folderInput').click();
  };
  document.getElementById('scanDoneBtn').onclick = function() {
    el.classList.remove('visible');
    setTimeout(function() { el.remove(); }, 300);
  };
}


// ─── Alphabet Fast-Scroll Strip ───

function renderAlphaStrip(listEl, letters, getScrollOffset) {
  ['alphaStrip', 'alphaBubble'].forEach(function(id) { var e = document.getElementById(id); if (e) e.remove(); });
  if (letters.length < 4) return;

  var appEl = document.getElementById('app');

  var strip = document.createElement('div');
  strip.id = 'alphaStrip';
  strip.className = 'alpha-strip';
  letters.forEach(function(letter) {
    var d = document.createElement('div');
    d.className = 'alpha-letter';
    d.textContent = letter;
    d.dataset.letter = letter;
    strip.appendChild(d);
  });
  appEl.appendChild(strip);

  // Position the strip to exactly cover the scrollable content area so it
  // never overlaps the header, tabs, or mini player regardless of screen size.
  requestAnimationFrame(function() {
    if (!strip.parentNode) return;
    var mc = document.getElementById('mainContent');
    if (!mc) return;
    var mcRect = mc.getBoundingClientRect();
    strip.style.top = mcRect.top + 'px';
    var mpEl = document.getElementById('miniPlayer');
    var mpH = (mpEl && !mpEl.classList.contains('hidden')) ? mpEl.getBoundingClientRect().height : 0;
    strip.style.bottom = mpH + 'px';
  });

  var bubble = document.createElement('div');
  bubble.id = 'alphaBubble';
  bubble.className = 'alpha-bubble';
  bubble.style.display = 'none';
  appEl.appendChild(bubble);

  function getLetterAtY(clientY) {
    var items = strip.querySelectorAll('.alpha-letter');
    var best = null, bestDist = Infinity;
    for (var i = 0; i < items.length; i++) {
      var rect = items[i].getBoundingClientRect();
      var mid = rect.top + rect.height / 2;
      var dist = Math.abs(clientY - mid);
      if (dist < bestDist) { bestDist = dist; best = items[i].dataset.letter; }
    }
    return best;
  }

  function activate(letter, clientY) {
    strip.querySelectorAll('.alpha-letter').forEach(function(d) {
      d.classList.toggle('active', d.dataset.letter === letter);
    });
    bubble.textContent = letter;
    bubble.style.display = 'flex';
    bubble.style.top = (clientY - 28) + 'px';
    var mc = document.getElementById('mainContent');
    if (getScrollOffset) {
      var pos = getScrollOffset(letter);
      if (pos != null) {
        // Reset VS debounce so any programmatic jump — not just jumps to position 0 —
        // always triggers a re-render even if it lands within the debounce window.
        _vsRenderedStart = -9999;
        _vsArtistStart = -9999;
        mc.scrollTop = pos;
      }
    } else {
      var anchor = listEl.querySelector('[data-alpha-anchor="' + letter + '"]');
      if (anchor) mc.scrollTop = anchor.offsetTop;
    }
  }

  function deactivate() {
    strip.querySelectorAll('.alpha-letter').forEach(function(d) { d.classList.remove('active'); });
    bubble.style.display = 'none';
  }

  strip.addEventListener('touchstart', function(e) {
    e.preventDefault();
    var l = getLetterAtY(e.touches[0].clientY);
    if (l) activate(l, e.touches[0].clientY);
  }, { passive: false });

  strip.addEventListener('touchmove', function(e) {
    e.preventDefault();
    var l = getLetterAtY(e.touches[0].clientY);
    if (l) activate(l, e.touches[0].clientY);
  }, { passive: false });

  strip.addEventListener('touchend', deactivate);
  strip.addEventListener('touchcancel', deactivate);
}

// ─── Scroll Indicator ───
var _scrollInd         = null;
var _scrollIndTimer    = null;
var _scrollIndTouching = false;
var _scrollIndDragging = false;
var _scrollIndDragY    = 0;
var _scrollIndDragST   = 0;
// Cached static DOM refs used on every scroll event
var _scrollIndMcEl  = null; // mainContent
var _scrollIndMpEl  = null; // miniPlayer

function initScrollIndicator() {
  if (!_scrollInd) {
    _scrollInd = document.createElement('div');
    _scrollInd.className = 'scroll-indicator';
    document.getElementById('app').appendChild(_scrollInd);
  }
  _scrollInd.style.pointerEvents = 'auto';
  _scrollInd.style.touchAction   = 'none';
  _scrollInd.removeEventListener('touchstart', _onIndDragStart, false);
  _scrollInd.addEventListener('touchstart', _onIndDragStart, { passive: false });
  var mc = document.getElementById('mainContent');
  mc.removeEventListener('scroll',     _onScrollInd,     false);
  mc.removeEventListener('touchstart', _onIndTouchStart, false);
  mc.removeEventListener('touchend',   _onIndTouchEnd,   false);
  mc.removeEventListener('touchcancel',_onIndTouchEnd,   false);
  mc.addEventListener('scroll',     _onScrollInd,     { passive: true });
  mc.addEventListener('touchstart', _onIndTouchStart, { passive: true });
  mc.addEventListener('touchend',   _onIndTouchEnd,   { passive: true });
  mc.addEventListener('touchcancel',_onIndTouchEnd,   { passive: true });
  // Show briefly on load so user knows scrolling is available
  requestAnimationFrame(function() {
    if (_posScrollInd()) {
      _scrollInd.style.opacity = '1';
      clearTimeout(_scrollIndTimer);
      _scrollIndTimer = setTimeout(function() {
        if (_scrollInd && !_scrollIndTouching) {
          _scrollInd.style.opacity = '0';
          _scrollInd.style.pointerEvents = 'none';
        }
      }, 2000);
    }
  });
}

function _posScrollInd() {
  var ind = _scrollInd;
  if (!_scrollIndMcEl) _scrollIndMcEl = document.getElementById('mainContent');
  if (!_scrollIndMpEl) _scrollIndMpEl = document.getElementById('miniPlayer');
  var mc  = _scrollIndMcEl;
  if (!ind || !mc) return false;
  var sh = mc.scrollHeight, ch = mc.clientHeight, st = mc.scrollTop;
  if (sh <= ch + 4) { ind.style.opacity = '0'; return false; }
  var topOff = 108;
  var mini = _scrollIndMpEl;
  var botOff = (mini && !mini.classList.contains('hidden')) ? 72 : 8;
  var trackH = window.innerHeight - topOff - botOff;
  var thumbH = Math.max(44, Math.floor(trackH * ch / sh));
  var thumbY = topOff + Math.floor((trackH - thumbH) * st / (sh - ch));
  ind.style.height = thumbH + 'px';
  ind.style.top    = thumbY + 'px';
  return true;
}

function _onScrollInd() {
  if (!_posScrollInd()) return;
  _scrollInd.style.opacity = '1';
  _scrollInd.style.pointerEvents = 'auto';
  if (!_scrollIndTouching) {
    clearTimeout(_scrollIndTimer);
    _scrollIndTimer = setTimeout(function() {
      if (_scrollInd && !_scrollIndTouching) {
        _scrollInd.style.opacity = '0';
        _scrollInd.style.pointerEvents = 'none';
      }
    }, 2500);
  }
}

function _onIndTouchStart() {
  _scrollIndTouching = true;
  if (_posScrollInd()) {
    _scrollInd.style.opacity = '1';
    clearTimeout(_scrollIndTimer);
  }
}

function _onIndTouchEnd() {
  _scrollIndTouching = false;
  clearTimeout(_scrollIndTimer);
  _scrollIndTimer = setTimeout(function() {
    if (_scrollInd && !_scrollIndTouching) {
      _scrollInd.style.opacity = '0';
      _scrollInd.style.pointerEvents = 'none';
    }
  }, 2500);
}

function _onIndDragStart(e) {
  e.stopPropagation();
  _scrollIndDragging = true;
  _scrollIndTouching = true;
  _scrollIndDragY = e.touches[0].clientY;
  var mc = document.getElementById('mainContent');
  _scrollIndDragST = mc ? mc.scrollTop : 0;
  clearTimeout(_scrollIndTimer);
  if (_posScrollInd()) _scrollInd.style.opacity = '1';
  document.addEventListener('touchmove',   _onIndDragMove, { passive: false });
  document.addEventListener('touchend',    _onIndDragEnd,  { passive: true });
  document.addEventListener('touchcancel', _onIndDragEnd,  { passive: true });
}

function _onIndDragMove(e) {
  if (!_scrollIndDragging) return;
  e.preventDefault();
  var mc = _scrollIndMcEl || document.getElementById('mainContent');
  if (!mc) return;
  var sh = mc.scrollHeight, ch = mc.clientHeight;
  if (sh <= ch) return;
  var topOff = 108;
  var mini = _scrollIndMpEl || document.getElementById('miniPlayer');
  var botOff = (mini && !mini.classList.contains('hidden')) ? 72 : 8;
  var trackH = window.innerHeight - topOff - botOff;
  var thumbH = Math.max(44, Math.floor(trackH * ch / sh));
  if (trackH <= thumbH) return;
  var dy = e.touches[0].clientY - _scrollIndDragY;
  mc.scrollTop = _scrollIndDragST + dy * (sh - ch) / (trackH - thumbH);
  _posScrollInd();
}

function _onIndDragEnd() {
  _scrollIndDragging = false;
  _scrollIndTouching = false;
  document.removeEventListener('touchmove',   _onIndDragMove, false);
  document.removeEventListener('touchend',    _onIndDragEnd,  false);
  document.removeEventListener('touchcancel', _onIndDragEnd,  false);
  clearTimeout(_scrollIndTimer);
  _scrollIndTimer = setTimeout(function() {
    if (_scrollInd && !_scrollIndTouching) {
      _scrollInd.style.opacity = '0';
      _scrollInd.style.pointerEvents = 'none';
    }
  }, 2500);
}

function removeScrollIndicator() {
  var mc = document.getElementById('mainContent');
  if (mc) {
    mc.removeEventListener('scroll',     _onScrollInd,     false);
    mc.removeEventListener('touchstart', _onIndTouchStart, false);
    mc.removeEventListener('touchend',   _onIndTouchEnd,   false);
    mc.removeEventListener('touchcancel',_onIndTouchEnd,   false);
  }
  if (_scrollInd) {
    _scrollInd.removeEventListener('touchstart', _onIndDragStart, false);
    _scrollInd.style.pointerEvents = 'none';
    _scrollInd.style.opacity = '0';
  }
  document.removeEventListener('touchmove',   _onIndDragMove, false);
  document.removeEventListener('touchend',    _onIndDragEnd,  false);
  document.removeEventListener('touchcancel', _onIndDragEnd,  false);
  clearTimeout(_scrollIndTimer);
  _scrollIndTouching = false;
  _scrollIndDragging = false;
}

// ─── Tab Renderers ───

function renderArtists(el) {
  var artists = getArtists();
  if (artists.length === 0) { renderWelcome(el); return; }

  if (artistViewMode !== 'list') {
    var cols = artistViewMode === 'grid3' ? 3 : 2;
    var artSize = cols === 3 ? 60 : 80;
    var gridParts = ['<div class="artist-grid grid-' + cols + '">'];
    artists.forEach(function(a) {
      var artEl = a.albumArtUris.length > 0
        ? '<div class="art-lazy" data-lazy-uri="' + escHtml(a.albumArtUris.join('|')) + '" data-size="' + artSize + '" data-round="1">' + artHTML(a.name, artSize, true) + '</div>'
        : artHTML(a.name, artSize, true);
      gridParts.push('<div class="artist-grid-card" data-artist="' + escHtml(a.name) + '">'
        + artEl
        + '<div class="artist-grid-name">' + escHtml(a.name) + '</div>'
        + '<div class="artist-grid-meta">' + a.songCount + ' songs</div>'
        + '</div>');
    });
    gridParts.push('</div>');
    el.innerHTML = gridParts.join('');
    initLazyArt(el);
    el.querySelectorAll('.artist-grid-card').forEach(function(card) {
      card.onclick = function() { selectedArtist = card.dataset.artist; render(); };
    });
    return;
  }

  // Build letter index map for alphabet strip position resolver
  _vsArtistLetterIdx = Object.create(null);
  var alphaLetters = [];
  var seenAlpha = {};
  artists.forEach(function(a, i) {
    var ch = a.name.charAt(0).toUpperCase();
    var letter = (ch >= 'A' && ch <= 'Z') ? ch : '#';
    if (!seenAlpha[letter]) {
      seenAlpha[letter] = true;
      alphaLetters.push(letter);
      _vsArtistLetterIdx[letter] = i;
    }
  });

  var totalH = artists.length * VS_ARTIST_ROW_H;
  el.innerHTML = '<div id="vsArtistOuter" style="position:relative;height:' + totalH + 'px;">'
    + '<div id="vsArtistRows" style="position:absolute;left:0;right:0;top:0;"></div>'
    + '</div>';

  var vsArtistRows = document.getElementById('vsArtistRows');
  vsArtistRows.onclick = function(e) {
    if (_msArtistMode) {
      var row = e.target.closest('.artist-row[data-artist]');
      if (row) { _msArtistToggle(row.dataset.artist); return; }
      return;
    }
    var menuBtn = e.target.closest('[data-artist-menu]');
    if (menuBtn) { e.stopPropagation(); showArtistMenu(menuBtn.dataset.artistMenu); return; }
    var row = e.target.closest('.artist-row[data-artist]');
    if (row) { _savedArtistScroll = el.scrollTop; selectedArtist = row.dataset.artist; render(); }
  };
  // Long-press to enter artist multi-select
  var _arLpTimer = null;
  vsArtistRows.addEventListener('touchstart', function(e) {
    if (_msArtistMode) return;
    var row = e.target.closest('.artist-row[data-artist]');
    if (!row) return;
    var name = row.dataset.artist;
    _arLpTimer = setTimeout(function() { _arLpTimer = null; _msArtistEnter(name); }, 1200);
  }, { passive: true });
  vsArtistRows.addEventListener('touchend', function() {
    if (_arLpTimer) { clearTimeout(_arLpTimer); _arLpTimer = null; }
  }, { passive: true });
  vsArtistRows.addEventListener('touchmove', function() {
    if (_arLpTimer) { clearTimeout(_arLpTimer); _arLpTimer = null; }
  }, { passive: true });

  initArtistVS(el, artists);
  renderAlphaStrip(el, alphaLetters, function(letter) {
    if (!_vsArtistLetterIdx || _vsArtistLetterIdx[letter] === undefined) return null;
    var outer = document.getElementById('vsArtistOuter');
    return (outer ? outer.offsetTop : 0) + _vsArtistLetterIdx[letter] * VS_ARTIST_ROW_H;
  });
}

function showOverflowMenu() {
  var existing = document.getElementById('overflowMenu');
  if (existing) { existing.remove(); return; }

  var menu = document.createElement('div');
  menu.id = 'overflowMenu';
  menu.className = 'overflow-menu';

  var items = '';

  if (currentTab === 'artists') {
    items += '<div class="overflow-item" id="omShuffleAll">&#127925; Shuffle All</div>'
      + '<div class="overflow-divider"></div>'
      + '<div class="overflow-section-label">Sort order</div>'
      + '<div class="overflow-item' + (artistSortMode === 'az' ? ' active' : '') + '" data-sort="az">A &#8594; Z' + (artistSortMode === 'az' ? ' &#10003;' : '') + '</div>'
      + '<div class="overflow-item' + (artistSortMode === 'za' ? ' active' : '') + '" data-sort="za">Z &#8594; A' + (artistSortMode === 'za' ? ' &#10003;' : '') + '</div>'
      + '<div class="overflow-item' + (artistSortMode === 'songs' ? ' active' : '') + '" data-sort="songs">Most Songs' + (artistSortMode === 'songs' ? ' &#10003;' : '') + '</div>'
      + '<div class="overflow-divider"></div>'
      + '<div class="overflow-section-label">Grid style</div>'
      + '<div class="overflow-item' + (artistViewMode === 'list' ? ' active' : '') + '" data-view="list">&#8801; List' + (artistViewMode === 'list' ? ' &#10003;' : '') + '</div>'
      + '<div class="overflow-item' + (artistViewMode === 'grid2' ? ' active' : '') + '" data-view="grid2">&#9638; 2 Columns' + (artistViewMode === 'grid2' ? ' &#10003;' : '') + '</div>'
      + '<div class="overflow-item' + (artistViewMode === 'grid3' ? ' active' : '') + '" data-view="grid3">&#9638; 3 Columns' + (artistViewMode === 'grid3' ? ' &#10003;' : '') + '</div>'
      + '<div class="overflow-divider"></div>'
      + '<div class="overflow-item" id="omAlbumArtists">'
      + (albumArtistsOnly ? '&#9642; All Artists' : '&#9641; Album Artists Only')
      + '</div>';
  } else if (currentTab === 'albums') {
    items += '<div class="overflow-section-label">Sort order</div>'
      + '<div class="overflow-item' + (albumSortMode === 'az' ? ' active' : '') + '" data-album-sort="az">A &#8594; Z' + (albumSortMode === 'az' ? ' &#10003;' : '') + '</div>'
      + '<div class="overflow-item' + (albumSortMode === 'year' ? ' active' : '') + '" data-album-sort="year">Year (newest first)' + (albumSortMode === 'year' ? ' &#10003;' : '') + '</div>'
      + '<div class="overflow-item' + (albumSortMode === 'songs' ? ' active' : '') + '" data-album-sort="songs">Most Songs' + (albumSortMode === 'songs' ? ' &#10003;' : '') + '</div>';
  } else if (currentTab === 'songs') {
    items += '<div class="overflow-section-label">Sort order</div>'
      + '<div class="overflow-item' + (sortMode === 'title' ? ' active' : '') + '" data-song-sort="title">A &#8594; Z (title)' + (sortMode === 'title' ? ' &#10003;' : '') + '</div>'
      + '<div class="overflow-item' + (sortMode === 'artist' ? ' active' : '') + '" data-song-sort="artist">Artist' + (sortMode === 'artist' ? ' &#10003;' : '') + '</div>'
      + '<div class="overflow-item' + (sortMode === 'recent' ? ' active' : '') + '" data-song-sort="recent">Date added (newest first)' + (sortMode === 'recent' ? ' &#10003;' : '') + '</div>';
  }

  if (!items) return;

  // Native-only: rescan option at the bottom of any tab menu
  if (songs.length > 0 && typeof NativeBridge !== 'undefined' && NativeBridge.isNative()) {
    items += '<div class="overflow-divider"></div>'
      + '<div class="overflow-item" id="omRescanLib">&#128257; Rescan Library</div>';
  }

  menu.innerHTML = items;
  document.getElementById('app').appendChild(menu);

  // Auto-remove on outside click
  function closeMenu(e) {
    if (!menu.contains(e.target) && e.target.id !== 'overflowBtn') {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    }
  }
  setTimeout(function() { document.addEventListener('click', closeMenu); }, 0);

  if (currentTab === 'artists') {
    var shuffleBtn = menu.querySelector('#omShuffleAll');
    if (shuffleBtn) shuffleBtn.onclick = function() {
      menu.remove();
      var allS = [];
      getArtists().forEach(function(a) { allS = allS.concat(getArtistSongs(a.name)); });
      if (allS.length > 0) {
        isShuffled = true;
        var sh = allS.slice().sort(function() { return Math.random() - 0.5; });
        playSong(sh[0], sh);
      }
    };
    menu.querySelectorAll('[data-sort]').forEach(function(item) {
      item.onclick = function() { artistSortMode = item.dataset.sort; menu.remove(); render(); };
    });
    menu.querySelectorAll('[data-view]').forEach(function(item) {
      item.onclick = function() { artistViewMode = item.dataset.view; menu.remove(); render(); };
    });
    var aaBtn = menu.querySelector('#omAlbumArtists');
    if (aaBtn) aaBtn.onclick = function() { albumArtistsOnly = !albumArtistsOnly; menu.remove(); render(); };
  } else if (currentTab === 'albums') {
    menu.querySelectorAll('[data-album-sort]').forEach(function(item) {
      item.onclick = function() { albumSortMode = item.dataset.albumSort; menu.remove(); render(); };
    });
  } else if (currentTab === 'songs') {
    menu.querySelectorAll('[data-song-sort]').forEach(function(item) {
      item.onclick = function() { sortMode = item.dataset.songSort; menu.remove(); render(); };
    });
  }

  var rescanBtn = menu.querySelector('#omRescanLib');
  if (rescanBtn) {
    rescanBtn.onclick = function() {
      menu.remove();
      songs = []; songMap = Object.create(null); _countsCache = null; _artistsCache = null; _albumsCache = null;
      nativeScanning = false; nativeScanError = ''; nativeScanCount = 0;
      nativeAutoScan();
    };
  }
}

function renderSongs(el) {
  if (songs.length === 0) { renderWelcome(el); return; }
  var sorted = songs.slice();
  if (sortMode === 'title') sorted.sort(function(a, b) { return a.title.localeCompare(b.title); });
  else if (sortMode === 'artist') sorted.sort(function(a, b) { return a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title); });
  else if (sortMode === 'recent') sorted.sort(function(a, b) { return (b.dateAdded || 0) - (a.dateAdded || 0); });
  else if (sortMode === 'played') sorted.sort(function(a, b) { return (b.lastPlayed || 0) - (a.lastPlayed || 0); });

  var totalH = sorted.length * VS_ROW_H;
  el.innerHTML = '<div class="sort-bar">'
    + '<span class="sort-label">' + sorted.length + ' songs</span>'
    + '<div class="sort-btns">'
    + '<button class="sort-btn' + (sortMode==='title'?' active':'') + '" data-sort="title">A-Z</button>'
    + '<button class="sort-btn' + (sortMode==='artist'?' active':'') + '" data-sort="artist">Artist</button>'
    + '<button class="sort-btn' + (sortMode==='recent'?' active':'') + '" data-sort="recent">New</button>'
    + '<button class="sort-btn' + (sortMode==='played'?' active':'') + '" data-sort="played">Played</button>'
    + '</div></div>'
    + '<div id="vsOuter" style="position:relative;height:' + totalH + 'px;">'
    + '<div id="vsRows" style="position:absolute;left:0;right:0;top:0;"></div>'
    + '</div>';

  el.querySelectorAll('.sort-btn').forEach(function(btn) {
    btn.onclick = function(e) { e.stopPropagation(); sortMode = btn.dataset.sort; render(); };
  });

  // Bind song row events on vsRows using event delegation — survives innerHTML replacement on scroll
  var vsRows = document.getElementById('vsRows');
  bindSongRows(vsRows, sorted);

  initSwipeGestures(vsRows);
  initVirtualScroll(vsRows, sorted);
  initScrollIndicator();
}

function renderAlbums(el) {
  if (songs.length === 0) { renderWelcome(el); return; }

  var allAlbums = getAlbums('all');
  var filtered = getAlbums(albumFilter);
  if (albumGenreFilter !== 'all') {
    filtered = filtered.filter(function(a) { return a.genre === albumGenreFilter; });
  }
  if (albumSortMode === 'year') {
    filtered.sort(function(a, b) { return (parseInt(b.year) || 0) - (parseInt(a.year) || 0); });
  } else if (albumSortMode === 'songs') {
    filtered.sort(function(a, b) { return b.songCount - a.songCount; });
  } else {
    filtered.sort(function(a, b) { return a.name.localeCompare(b.name); });
  }

  var counts = {
    all: allAlbums.length,
    albums: allAlbums.filter(function(a){return a.type==='Album';}).length,
    mixtapes: allAlbums.filter(function(a){return a.type==='Mixtape';}).length,
    eps: allAlbums.filter(function(a){return a.type==='EP'||a.type==='Single';}).length,
  };

  var chips = [['all','All'],['albums','Albums'],['mixtapes','Mixtapes'],['eps','EPs & Singles']];
  var chipsHtml = '<div class="filter-chips">';
  chips.forEach(function(c) {
    chipsHtml += '<button class="chip' + (albumFilter === c[0] ? ' active' : '') + '" data-filter="' + c[0] + '">' + c[1] + '<span class="count">' + counts[c[0]] + '</span></button>';
  });
  chipsHtml += '</div>';

  var genreMap = {};
  allAlbums.forEach(function(a) { if (a.genre) genreMap[a.genre] = (genreMap[a.genre] || 0) + 1; });
  var genres = Object.keys(genreMap).sort(function(a, b) { return genreMap[b] - genreMap[a]; }).slice(0, 6);
  if (genres.length > 1) {
    chipsHtml += '<div class="filter-chips genre-chips">';
    chipsHtml += '<button class="chip chip-genre' + (albumGenreFilter === 'all' ? ' active' : '') + '" data-genre="all">All</button>';
    genres.forEach(function(g) {
      chipsHtml += '<button class="chip chip-genre' + (albumGenreFilter === g ? ' active' : '') + '" data-genre="' + escHtml(g) + '">' + escHtml(g) + '</button>';
    });
    chipsHtml += '</div>';
  }

  el.innerHTML = chipsHtml
    + '<div id="agOuter" style="position:relative;">'
    + '<div id="agRows" style="position:absolute;left:0;right:0;"></div>'
    + '</div>';

  el.querySelectorAll('.chip:not(.chip-genre)').forEach(function(btn) {
    btn.onclick = function() { albumFilter = btn.dataset.filter; render(); };
  });
  el.querySelectorAll('.chip-genre').forEach(function(btn) {
    btn.onclick = function() { albumGenreFilter = btn.dataset.genre; render(); };
  });

  el.addEventListener('click', function agClick(e) {
    var moreBtn = e.target.closest ? e.target.closest('.ag-more') : null;
    if (moreBtn) {
      e.stopPropagation();
      var mIdx = parseInt(moreBtn.dataset.albumIdx, 10);
      if (_agData && _agData[mIdx]) { _haptic(8); showAlbumMenu(_agData[mIdx]); }
      return;
    }
    var card = e.target.closest ? e.target.closest('.ag-card') : null;
    if (card) {
      var cIdx = parseInt(card.dataset.albumIdx, 10);
      if (_agData && _agData[cIdx]) {
        _haptic(8);
        selectedAlbum = { name: _agData[cIdx].name, artist: _agData[cIdx].artist };
        render();
      }
    }
  });

  // Defer one frame so layout is complete before measuring container width.
  // Cancel any pending RAF so a rapid second render() doesn't fire two inits.
  if (_agRafId) cancelAnimationFrame(_agRafId);
  var _filteredForGrid = filtered;
  _agRafId = requestAnimationFrame(function() { _agRafId = 0; initAlbumGrid(_filteredForGrid); });
}

// ─── Album Grid (2-column virtual scroll) ───

var _agData = null;
var _agRenderedStart = -9999;
var _agScrollFn = null;
var _agResizeFn = null;
var _agRafId = 0;
var AG_COLS = 2;
var AG_GAP = 8;
var AG_TEXT_H = 56;
var _agRowH = 0;
var _agColW = 0;

function cleanupAlbumGrid() {
  if (_agRafId) { cancelAnimationFrame(_agRafId); _agRafId = 0; }
  if (_agScrollFn) {
    var mc = document.getElementById('mainContent');
    if (mc) mc.removeEventListener('scroll', _agScrollFn);
    _agScrollFn = null;
  }
  if (_agResizeFn) {
    window.removeEventListener('resize', _agResizeFn);
    _agResizeFn = null;
  }
  _agData = null;
}

function _agCalcDims(outer) {
  var containerW = outer.clientWidth || window.innerWidth;
  _agColW = Math.floor((containerW - AG_GAP * (AG_COLS + 1)) / AG_COLS);
  _agRowH = _agColW + AG_TEXT_H + AG_GAP;
}

function initAlbumGrid(albums) {
  cleanupAlbumGrid(); // remove any stale listeners before attaching new ones
  _agData = albums;
  _agRenderedStart = -9999;

  var outer = document.getElementById('agOuter');
  var main = document.getElementById('mainContent');
  if (!outer || !main) return;

  _agCalcDims(outer);

  var totalRows = Math.ceil(albums.length / AG_COLS);
  outer.style.height = (totalRows * _agRowH + AG_GAP) + 'px';

  _agScrollFn = function() {
    var ag = document.getElementById('agOuter');
    if (!ag) { cleanupAlbumGrid(); return; }
    var relScroll = main.scrollTop - ag.offsetTop;
    var newStart = Math.max(0, Math.floor(relScroll / _agRowH) - VS_BUFFER);
    if (newStart > 0 && Math.abs(newStart - _agRenderedStart) < Math.floor(VS_BUFFER / 2)) return;
    _agRenderedStart = newStart;
    renderAgWindow(newStart);
  };
  main.addEventListener('scroll', _agScrollFn, { passive: true });

  _agResizeFn = function() {
    var ag = document.getElementById('agOuter');
    if (!ag) { cleanupAlbumGrid(); return; }
    _agCalcDims(ag);
    var tRows = Math.ceil(albums.length / AG_COLS);
    ag.style.height = (tRows * _agRowH + AG_GAP) + 'px';
    _agRenderedStart = -9999;
    var relScroll = main.scrollTop - ag.offsetTop;
    renderAgWindow(Math.max(0, Math.floor(relScroll / _agRowH) - VS_BUFFER));
  };
  window.addEventListener('resize', _agResizeFn);

  renderAgWindow(0);

  if (albumSortMode !== 'year' && albumSortMode !== 'songs') {
    var letters = [];
    var letterRowMap = {};
    albums.forEach(function(a, i) {
      var ch = (a.name || '#')[0].toUpperCase();
      var letter = /[A-Z]/.test(ch) ? ch : '#';
      if (letterRowMap[letter] === undefined) {
        letters.push(letter);
        letterRowMap[letter] = Math.floor(i / AG_COLS);
      }
    });
    var agTop = outer.offsetTop || 0;
    renderAlphaStrip(main, letters, function(letter) {
      return agTop + ((letterRowMap[letter] || 0) * _agRowH);
    });
  }
}

function renderAgWindow(start) {
  if (!_agData) return;
  var rows = document.getElementById('agRows');
  if (!rows) { cleanupAlbumGrid(); return; }

  var totalRows = Math.ceil(_agData.length / AG_COLS);
  var end = Math.min(totalRows, start + VS_BUFFER * 2 + 20);
  var parts = [];
  for (var r = start; r < end; r++) { parts.push(agRowHTML(r)); }

  rows.innerHTML = parts.join('');
  // agRows is shifted to the first rendered row; rows inside use normal flow (no per-row top)
  rows.style.top = (start * _agRowH + AG_GAP) + 'px';
  initLazyArt(rows);

  var dataStart = start * AG_COLS;
  var dataEnd = Math.min(_agData.length, end * AG_COLS);
  batchPrefetchWindowArt(_agData, dataStart, dataEnd, 'agRows', Math.min(_agData.length, dataEnd + VS_BUFFER * AG_COLS));
}

function agRowHTML(rowIdx) {
  var html = '<div class="ag-row" style="height:' + (_agColW + AG_TEXT_H) + 'px;margin-bottom:' + AG_GAP + 'px;">';
  for (var c = 0; c < AG_COLS; c++) {
    var aIdx = rowIdx * AG_COLS + c;
    if (aIdx >= _agData.length) {
      html += '<div class="ag-card-empty"></div>';
      continue;
    }
    var a = _agData[aIdx];
    var metaParts = [];
    if (a.artist && a.artist !== 'Unknown Artist') metaParts.push(escHtml(a.artist));
    metaParts.push(a.songCount + (a.songCount === 1 ? ' song' : ' songs'));

    html += '<div class="ag-card" data-album-idx="' + aIdx + '">'
      + '<div class="ag-art art-lazy" data-lazy-uri="' + escHtml(a.albumArtUri || '') + '" data-fill="1" style="width:' + _agColW + 'px;height:' + _agColW + 'px;">'
      + artHTML(a.name, _agColW, false)
      + '</div>'
      + '<div class="ag-info">'
      + '<div class="ag-name">' + escHtml(a.name) + '</div>'
      + '<div class="ag-meta">' + metaParts.join(' &bull; ') + '</div>'
      + '</div>'
      + '<button class="ag-more" data-album-idx="' + aIdx + '">&#8942;</button>'
      + '</div>';
  }
  html += '</div>';
  return html;
}

function renderPlaylists(el) {
  // Build smart playlist song lists (cached until saveLibrary invalidates _spCache)
  if (!_spCache) {
    _spCache = {
      top:     songs.slice().sort(function(a, b) { return (b.playCount || 0) - (a.playCount || 0); }).slice(0, 100),
      last:    songs.slice().reverse().slice(0, 100),
      recent:  songs.filter(function(s) { return s.lastPlayed > 0; })
                    .sort(function(a, b) { return b.lastPlayed - a.lastPlayed; }).slice(0, 100),
      favs:    getFavorites()
    };
  }
  var spTopTracks = _spCache.top;
  var spLastAdded = _spCache.last;
  var spRecent    = _spCache.recent;
  var spFavs      = _spCache.favs;

  function smartCell(cellId, title, list) {
    var g = getGrad(title);
    var firstUri = '';
    for (var i = 0; i < list.length; i++) {
      if (list[i].albumArtUri) { firstUri = list[i].albumArtUri; break; }
    }
    var artEl = firstUri
      ? '<div class="art-lazy" data-lazy-uri="' + escHtml(firstUri) + '" data-fill="1" style="position:absolute;inset:0;"></div>'
      : '';
    var dimmed = list.length === 0 ? ' sp-cell-empty' : '';
    return '<div class="smart-pl-cell' + dimmed + '" id="' + cellId + '">'
      + '<div class="smart-pl-bg" style="background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ');">' + artEl + '</div>'
      + '<div class="smart-pl-overlay">'
      + '<div class="smart-pl-info"><div class="smart-pl-title">' + title + '</div>'
      + '<div class="smart-pl-count">' + list.length + ' Songs</div></div>'
      + '<button class="smart-pl-play" aria-label="Play">&#9654;</button>'
      + '</div>'
      + '</div>';
  }

  var html = '<div class="smart-pl-grid">'
    + smartCell('spTopTracks', 'Top Tracks',      spTopTracks)
    + smartCell('spLastAdded', 'Last Added',       spLastAdded)
    + smartCell('spRecent',    'Recently Played',  spRecent)
    + smartCell('spFavs',      'Favorites',        spFavs)
    + '</div>'
    + '<div class="pl-section-label">'
    + '<span>Playlist</span>'
    + '<button class="pl-section-add" id="createPlBtn">&#43;</button>'
    + '</div>'
    + '<div class="pl-user-list">';

  if (playlists.length === 0) {
    html += '<div class="pl-empty-state">'
      + '<div class="pl-empty-icon">&#9835;</div>'
      + '<div class="pl-empty-text">No playlists</div>'
      + '<button class="pl-create-btn" id="createPlBtn2">&#43; Create playlist</button>'
      + '</div>';
  } else {
    playlists.forEach(function(pl) {
      html += '<div class="playlist-item" data-plid="' + pl.id + '">'
        + '<div class="playlist-icon pl-icon">&#9835;</div>'
        + '<div class="song-info"><div class="artist-name">' + escHtml(pl.name) + '</div>'
        + '<div class="artist-meta">' + pl.songIds.length + ' songs</div></div>'
        + '<button class="pl-delete-btn" data-dplid="' + pl.id + '">&#215;</button>'
        + '</div>';
    });
  }

  html += '</div>';
  el.innerHTML = html;
  initLazyArt(el);

  // Wire smart playlist cells — play button plays immediately, cell body opens list
  function wireCell(cellId, list, title) {
    var cell = document.getElementById(cellId);
    if (!cell) return;
    var playBtn = cell.querySelector('.smart-pl-play');
    if (playBtn) {
      playBtn.onclick = function(e) {
        e.stopPropagation();
        if (list.length) playSong(list[0], list);
      };
    }
    cell.onclick = function(e) {
      if (e.target.closest('.smart-pl-play')) return;
      if (!list.length) return;
      currentSmartPlaylist = { title: title, songs: list };
      currentTab = 'smartpl';
      render();
    };
  }
  wireCell('spTopTracks', spTopTracks, 'Top Tracks');
  wireCell('spLastAdded', spLastAdded, 'Last Added');
  wireCell('spRecent',    spRecent,    'Recently Played');
  wireCell('spFavs',      spFavs,      'Favorites');

  // User playlist rows
  el.querySelectorAll('.playlist-item[data-plid]').forEach(function(row) {
    row.onclick = function(e) {
      if (e.target.closest('.pl-delete-btn')) return;
      currentPlaylistId = row.dataset.plid;
      currentTab = 'playlist';
      render();
    };
  });
  el.querySelectorAll('.pl-delete-btn').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      var id = btn.dataset.dplid;
      var pl = playlists.find(function(p) { return p.id === id; });
      if (!pl) return;
      if (!confirm('Delete playlist "' + pl.name + '"?')) return;
      playlists = playlists.filter(function(p) { return p.id !== id; });
      savePlaylists();
      render();
    };
  });

  function openCreatePlaylist() {
    var name = prompt('Playlist name:');
    if (!name || !name.trim()) return;
    var pl = { id: 'pl_' + Date.now(), name: name.trim(), songIds: [] };
    playlists.push(pl);
    savePlaylists();
    render();
  }
  var btn1 = document.getElementById('createPlBtn');
  if (btn1) btn1.onclick = openCreatePlaylist;
  var btn2 = document.getElementById('createPlBtn2');
  if (btn2) btn2.onclick = openCreatePlaylist;
}

function renderPlaylistSongs(el) {
  var pl = playlists.find(function(p) { return p.id === currentPlaylistId; });
  if (!pl) { currentTab = 'playlists'; render(); return; }
  // songIds stores stable keys (contentUri || fn); look up by those
  var stableMap = Object.create(null);
  songs.forEach(function(s) { var k = s.contentUri || s.fn; if (k) stableMap[k] = s; });
  var plSongs = pl.songIds.map(function(k) { return stableMap[k] || songMap[k]; }).filter(Boolean);
  var html = '<div class="section-header">'
    + '<h3>&#9835; ' + escHtml(pl.name) + '</h3>'
    + '<div style="display:flex;align-items:center;gap:8px;">'
    + '<span class="section-count">' + plSongs.length + ' songs</span>'
    + '<button id="plExportBtn" style="font-size:11px;padding:4px 10px;border-radius:12px;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.06);color:var(--text-dim);cursor:pointer;">&#8659; M3U</button>'
    + '</div>'
    + '</div>';
  if (plSongs.length === 0) {
    html += '<div class="empty-state"><div class="empty-icon">&#9835;</div>'
      + '<p>No songs yet</p><p class="sub">Use the &#8942; menu on any song to add it here</p></div>';
  } else {
    plSongs.forEach(function(s) {
      html += '<div class="song-row' + (currentSong && currentSong.id === s.id ? ' playing' : '') + '" data-id="' + s.id + '">'
        + imgOrArt(s.art, s.album || s.title, 48)
        + '<div class="song-info"><div class="song-title">' + escHtml(s.title) + '</div>'
        + '<div class="song-meta">' + escHtml(s.artist) + '</div></div>'
        + '<span class="song-duration">' + fmtTime(s.dur) + '</span>'
        + '<button class="pl-remove-btn" data-rmid="' + escHtml(s.contentUri || s.fn) + '">&#215;</button>'
        + '</div>';
    });
  }
  el.innerHTML = html;

  el.querySelectorAll('.song-row[data-id]').forEach(function(row) {
    row.onclick = function(e) {
      if (e.target.closest('.pl-remove-btn')) return;
      var s = songMap[row.dataset.id];
      if (s) playSong(s, plSongs);
    };
  });

  el.querySelectorAll('.pl-remove-btn').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      var key = btn.dataset.rmid;
      pl.songIds = pl.songIds.filter(function(k) { return k !== key; });
      savePlaylists();
      renderPlaylistSongs(el);
    };
  });

  var exportBtn = document.getElementById('plExportBtn');
  if (exportBtn) {
    exportBtn.onclick = function(e) {
      e.stopPropagation();
      var lines = ['#EXTM3U'];
      plSongs.forEach(function(s) {
        var dur = Math.round(s.dur || -1);
        var info = (s.artist || 'Unknown Artist') + ' - ' + (s.title || s.fn);
        lines.push('#EXTINF:' + dur + ',' + info);
        lines.push(s.nativePath || s.url || s.fn || '');
      });
      var blob = new Blob([lines.join('\n')], { type: 'audio/x-mpegurl' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (pl.name || 'playlist') + '.m3u';
      document.body.appendChild(a);
      a.click();
      setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
      showToast('Exported ' + plSongs.length + ' songs as M3U');
    };
  }

  initScrollIndicator();
}

function renderFavorites(el) {
  var favs = getFavorites();
  var html = '<div class="section-header">'
    + '<h3>&#10084; Favorites</h3>'
    + '<span class="section-count">' + favs.length + ' songs</span>'
    + '</div>';
  if (favs.length === 0) {
    html += '<div class="empty-state"><div class="empty-icon">&#10084;</div>'
      + '<p>No favorites yet</p><p class="sub">Tap the heart on any song to add it here</p></div>';
  } else {
    favs.forEach(function(s) {
      html += songRowHTML(s, currentSong && currentSong.id === s.id, true);
    });
  }
  el.innerHTML = html;
  initLazyArt(el);
  initSwipeGestures(el);
  bindSongRows(el, favs);
  initScrollIndicator();
}

// ─── Smart Playlist Detail ───

function renderSmartPlaylistDetail(el) {
  if (!currentSmartPlaylist) { currentTab = 'playlists'; render(); return; }
  var sp = currentSmartPlaylist;
  var list = sp.songs;

  // Build mosaic art from first 4 songs with art
  var artSongs = list.filter(function(s) { return s.art || s.albumArtUri; }).slice(0, 4);
  var mosaicHtml = '';
  if (artSongs.length >= 4) {
    mosaicHtml = '<div style="width:80px;height:80px;display:grid;grid-template-columns:1fr 1fr;gap:2px;border-radius:8px;overflow:hidden;flex-shrink:0;">'
      + artSongs.map(function(s) { return imgOrArt(s.art, s.album || s.title, 40); }).join('')
      + '</div>';
  } else if (artSongs.length > 0) {
    mosaicHtml = imgOrArt(artSongs[0].art, artSongs[0].album || artSongs[0].title, 80);
  } else {
    mosaicHtml = artHTML(sp.title, 80);
  }

  var html = '<div class="section-header" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">'
    + mosaicHtml
    + '<div><h3 style="margin:0 0 4px;">' + escHtml(sp.title) + '</h3>'
    + '<span class="section-count">' + list.length + ' songs</span></div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;padding:0 16px 12px;">'
    + '<button id="spDetPlayAll" style="flex:1;padding:10px;background:var(--accent);border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">&#9654; Play All</button>'
    + '<button id="spDetShuffle" style="flex:1;padding:10px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;color:var(--text);font-size:14px;cursor:pointer;">&#128256; Shuffle</button>'
    + '</div>';

  list.forEach(function(s) {
    html += songRowHTML(s, currentSong && currentSong.id === s.id, true);
  });

  el.innerHTML = html;
  initLazyArt(el);
  initSwipeGestures(el);
  bindSongRows(el, list);
  initScrollIndicator();

  var playAllBtn = document.getElementById('spDetPlayAll');
  if (playAllBtn) playAllBtn.onclick = function() { if (list.length) playSong(list[0], list); };

  var shuffleBtn = document.getElementById('spDetShuffle');
  if (shuffleBtn) shuffleBtn.onclick = function() {
    if (!list.length) return;
    var shuffled = list.slice().sort(function() { return Math.random() - 0.5; });
    playSong(shuffled[0], shuffled);
  };
}

// ─── Genres ───

function renderGenres(el) {
  var genreMap = Object.create(null);
  songs.forEach(function(s) {
    var g = s.genre || 'Unknown';
    if (!genreMap[g]) genreMap[g] = { name: g, count: 0, art: '', albumArtUri: '' };
    genreMap[g].count++;
    if (!genreMap[g].art && s.art) { genreMap[g].art = s.art; genreMap[g].albumArtUri = s.albumArtUri || ''; }
  });
  var genreList = Object.keys(genreMap).sort(function(a, b) {
    if (a === 'Unknown') return 1;
    if (b === 'Unknown') return -1;
    return a.localeCompare(b);
  });

  if (genreList.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-icon">&#127925;</div>'
      + '<p>No genres yet</p><p class="sub">Tag your songs with genre info to see them here</p></div>';
    return;
  }

  var html = '<div class="section-header"><h3>&#127925; Genres</h3>'
    + '<span class="section-count">' + genreList.length + ' genres</span></div>';
  html += '<div class="genre-grid">';
  genreList.forEach(function(g) {
    var gd = genreMap[g];
    var gr = getGrad(g);
    html += '<div class="genre-card" data-genre="' + escHtml(g) + '">'
      + '<div class="genre-card-art">'
      + imgOrArt(gd.art, g, 72)
      + '<div class="genre-card-overlay" style="background:linear-gradient(160deg,' + gr[0] + 'cc 0%,' + gr[1] + '88 100%)"></div>'
      + '<div class="genre-card-initial">' + escHtml(g.charAt(0).toUpperCase()) + '</div>'
      + '</div>'
      + '<div class="genre-card-name">' + escHtml(g) + '</div>'
      + '<div class="genre-card-count">' + gd.count + ' song' + (gd.count !== 1 ? 's' : '') + '</div>'
      + '</div>';
  });
  html += '</div>';
  el.innerHTML = html;

  el.querySelectorAll('.genre-card').forEach(function(card) {
    card.onclick = function() {
      selectedGenre = card.dataset.genre;
      render();
    };
  });
  initScrollIndicator();
}

function renderGenreDetail(el) {
  var genre = selectedGenre;
  var genreSongs = songs.filter(function(s) { return (s.genre || 'Unknown') === genre; });
  genreSongs.sort(function(a, b) { return (a.artist || '').localeCompare(b.artist || '') || (a.title || '').localeCompare(b.title || ''); });

  var html = '<div class="section-header"><h3>' + escHtml(genre) + '</h3>'
    + '<span class="section-count">' + genreSongs.length + ' songs</span></div>';
  if (genreSongs.length === 0) {
    html += '<div class="empty-state"><div class="empty-icon">&#127925;</div><p>No songs</p></div>';
  } else {
    genreSongs.forEach(function(s) { html += songRowHTML(s, currentSong && currentSong.id === s.id, false); });
  }
  el.innerHTML = html;
  initLazyArt(el);
  initSwipeGestures(el);
  bindSongRows(el, genreSongs);
  initScrollIndicator();
}

// ─── Song Row HTML ───

function eqBarsHTML(paused) {
  return '<div class="eq-bars' + (paused ? ' paused' : '') + '"><span></span><span></span><span></span></div>';
}

function songRowHTML(s, playing, showEdit) {
  // Custom data: art always wins over the lazy MediaStore loader (user changed the art)
  var artEl = (s.art && s.art.startsWith('data:'))
    ? imgOrArt(s.art, s.album || s.title, 48)
    : s.albumArtUri
      ? '<div class="art-lazy" data-lazy-uri="' + escHtml(s.albumArtUri) + '" data-size="48" style="width:48px;height:48px;border-radius:8px;overflow:hidden;flex-shrink:0;">' + artHTML(s.album || s.title, 48) + '</div>'
      : imgOrArt(s.art, s.album || s.title, 48);
  return '<div class="song-row' + (playing ? ' playing' : '') + (s.tagging ? ' tagging' : '') + '" data-id="' + s.id + '">'
    + artEl
    + '<div class="song-info">'
    + '<div class="song-title' + (playing ? ' playing' : '') + '">' + escHtml(s.title)
    + (s.feat ? '<span class="feat"> ft. ' + escHtml(s.feat) + '</span>' : '')
    + '</div>'
    + '<div class="song-meta">' + escHtml(s.artist) + (s.album && s.album !== 'Unknown Album' ? ' &bull; ' + escHtml(s.album) : '')
    + (s.type === 'Mixtape' ? '<span class="mixtape-tag"> &bull; Mixtape</span>' : '')
    + '</div></div>'
    + (s.tagging ? '<div class="tagging-spinner" style="width:20px;height:20px;"></div>' : '')
    + (playing ? eqBarsHTML(!isPlaying) : '<span class="song-duration">' + fmtTime(s.dur) + '</span>')
    + '<button class="song-fav' + (s.fav ? ' active' : '') + '" data-fav="' + s.id + '">' + heartSvg(s.fav, 20) + '</button>'
    + (showEdit ? '<button class="song-edit" data-song-menu="' + s.id + '">&#8942;</button>' : '')
    + '</div>';
}

// ─── Detail Views ───

function artistCollageHTML(artistAlbums, artistName) {
  // Collect album art URIs; fill up to 4 slots (cycle if fewer)
  var count = Math.max(artistAlbums.length, 1);
  var cells = [];
  for (var i = 0; i < 4; i++) {
    var album = artistAlbums[i % count];
    var uri = album ? (album.albumArtUri || '') : '';
    var g = getGrad(album ? album.name : artistName);
    var init = (album ? album.name : artistName)
      .split(' ').map(function(w) { return w[0] || ''; }).join('').substring(0, 2).toUpperCase();
    cells.push('<div class="artist-collage-cell">'
      + '<div style="width:100%;height:100%;background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ');display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;font-size:20px;font-weight:700;color:rgba(255,255,255,0.8);">' + escHtml(init) + '</div>'
      + (uri ? '<div class="art-lazy" data-lazy-uri="' + escHtml(uri) + '" data-fill="1" style="position:absolute;top:0;left:0;right:0;bottom:0;"></div>' : '')
      + '</div>');
  }
  return '<div class="artist-collage">' + cells.join('') + '</div>';
}

function renderArtistDetail(el) {
  var artistSongs = getArtistSongs(selectedArtist);
  var artistAlbums = getArtistAlbums(selectedArtist);
  var totalDur = artistSongs.reduce(function(sum, s) { return sum + (s.dur || 0); }, 0);

  var html = '<div class="artist-detail-header">'
    + artistCollageHTML(artistAlbums, selectedArtist)
    + '<div class="artist-header-info">'
    + '<div class="artist-header-name">' + escHtml(selectedArtist) + '</div>'
    + '<div class="artist-header-stats">' + artistAlbums.length + ' ' + (artistAlbums.length === 1 ? 'Album' : 'Albums') + ' &bull; ' + artistSongs.length + ' Song' + (artistSongs.length !== 1 ? 's' : '') + '</div>'
    + '<div class="artist-header-dur">' + fmtTime(totalDur) + '</div>'
    + '</div></div>'
    + '<div class="detail-actions" style="padding:0 16px 16px;">'
    + '<button class="btn btn-primary" id="playAllBtn">&#9654; Play All</button>'
    + '<button class="btn btn-secondary" id="shuffleAllBtn">&#8645; Shuffle</button>'
    + '</div>';

  if (artistAlbums.length > 0) {
    html += '<div class="section-label">Albums &amp; Projects</div><div class="album-scroll">';
    artistAlbums.forEach(function(a) {
      var badge = '';
      if (a.type === 'Mixtape') badge = '<span class="release-badge mixtape" style="font-size:8px;padding:1px 6px;">Mixtape</span>';
      else if (a.type === 'EP') badge = '<span class="release-badge ep" style="font-size:8px;padding:1px 6px;">EP</span>';
      var scrollGrad = (function(){ var g = getGrad(a.name); return 'linear-gradient(135deg,' + g[0] + ',' + g[1] + ')'; })();
      var scrollInit = escHtml(a.name.split(' ').map(function(w){return w[0]||'';}).join('').substring(0,2).toUpperCase());
      var artEl = '<div style="position:absolute;top:0;left:0;right:0;bottom:0;background:' + scrollGrad + ';display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;font-size:42px;font-weight:700;color:#fff;">' + scrollInit + '</div>'
        + (a.albumArtUri ? '<div class="art-lazy" data-lazy-uri="' + escHtml(a.albumArtUri) + '" data-fill="1" style="position:absolute;top:0;left:0;right:0;bottom:0;"></div>' : '');
      html += '<div class="album-scroll-item" data-album="' + escHtml(a.name) + '" data-artist="' + escHtml(a.artist) + '">'
        + '<div class="album-scroll-art">'
        + artEl
        + badge
        + '</div>'
        + '<div class="album-scroll-name">' + escHtml(a.name) + '</div>'
        + '<div class="album-scroll-year">' + (a.year || '') + ' &bull; ' + a.songCount + ' songs</div>'
        + '</div>';
    });
    html += '</div>';
  }

  var songParts = ['<div class="section-label">All Songs</div>'];
  artistSongs.forEach(function(s, i) {
    var playing = currentSong && currentSong.id === s.id;
    songParts.push('<div class="song-row' + (playing ? ' playing' : '') + '" data-id="' + s.id + '">'
      + '<span class="track-num">' + (i + 1) + '</span>'
      + '<div class="song-info">'
      + '<div class="song-title' + (playing ? ' playing' : '') + '">' + escHtml(s.title)
      + (s.feat ? '<span class="feat"> ft. ' + escHtml(s.feat) + '</span>' : '') + '</div>'
      + '<div class="song-meta">' + escHtml(s.album) + '</div>'
      + '</div>'
      + (playing ? eqBarsHTML(!isPlaying) : '<span class="song-duration">' + fmtTime(s.dur) + '</span>')
      + '<button class="song-edit" data-song-menu="' + s.id + '">&#8942;</button>'
      + '</div>');
  });

  el.innerHTML = html + songParts.join('');

  initLazyArt(el);

  document.getElementById('playAllBtn').onclick = function() {
    if (artistSongs.length > 0) playSong(artistSongs[0], artistSongs);
  };
  document.getElementById('shuffleAllBtn').onclick = function() {
    if (artistSongs.length > 0) {
      isShuffled = true;
      var shuffled = artistSongs.slice().sort(function() { return Math.random() - 0.5; });
      playSong(shuffled[0], shuffled);
    }
  };
  el.querySelectorAll('.album-scroll-item').forEach(function(item) {
    item.onclick = function() {
      selectedAlbum = { name: item.dataset.album, artist: item.dataset.artist };
      render();
    };
  });
  initSwipeGestures(el);
  bindSongRows(el, artistSongs);
}

function renderAlbumDetail(el) {
  var albumSongs = getAlbumSongs(selectedAlbum.name, selectedAlbum.artist);
  var first = albumSongs[0] || {};
  var typeClass = (first.type || 'Album').toLowerCase();
  var totalDur = albumSongs.reduce(function(sum, s) { return sum + (s.dur || 0); }, 0);
  var albumArtUri = first.albumArtUri || '';

  // Use custom data: URL art if any song in the album has one
  var customAlbumArt = '';
  for (var _ai = 0; _ai < albumSongs.length; _ai++) {
    if (albumSongs[_ai].art && albumSongs[_ai].art.startsWith('data:')) { customAlbumArt = albumSongs[_ai].art; break; }
  }

  var heroGrad = (function(){ var g = getGrad(selectedAlbum.name); return 'linear-gradient(135deg,' + g[0] + ',' + g[1] + ')'; })();
  var heroInit = selectedAlbum.name.split(' ').map(function(w){return w[0]||'';}).join('').substring(0,2).toUpperCase();

  var html = '<div class="detail-header">'
    + '<div style="position:relative;width:200px;height:200px;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.5);flex-shrink:0;">'
    + '<div style="position:absolute;top:0;left:0;right:0;bottom:0;background:' + heroGrad + ';display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;font-size:70px;font-weight:700;color:#fff;">' + escHtml(heroInit) + '</div>'
    + (customAlbumArt
        ? '<img src="' + customAlbumArt + '" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;">'
        : albumArtUri ? '<div class="art-lazy" data-lazy-uri="' + escHtml(albumArtUri) + '" data-fill="1" style="position:absolute;top:0;left:0;right:0;bottom:0;"></div>' : '')
    + '</div>'
    + '<div class="detail-title">' + escHtml(selectedAlbum.name) + '</div>'
    + '<div class="detail-artist">' + escHtml(selectedAlbum.artist) + '</div>'
    + '<div class="detail-info">';
  if (first.type) html += '<span class="detail-type ' + typeClass + '">' + first.type + '</span>';
  if (first.year) html += '<span>' + first.year + '</span>';
  if (first.genre) html += '<span>&bull; ' + first.genre + '</span>';
  html += '<span>&bull; ' + albumSongs.length + ' songs</span>';
  html += '<span>&bull; ' + fmtTime(totalDur) + '</span>';
  html += '</div>'
    + '<div class="detail-actions">'
    + '<button class="btn btn-primary" id="playAlbumBtn">&#9654; Play</button>'
    + '<button class="btn btn-secondary" id="shuffleAlbumBtn">&#8645; Shuffle</button>'
    + '<button class="btn btn-secondary" id="editAlbumBtn">&#9998; Edit</button>'
    + '</div></div>';

  var albumRowParts = [];
  var rowArt = albumArtUri
    ? '<div class="art-lazy" data-lazy-uri="' + escHtml(albumArtUri) + '" data-size="48" style="width:48px;height:48px;flex-shrink:0;border-radius:6px;overflow:hidden;">' + artHTML(selectedAlbum.name, 48) + '</div>'
    : '';

  // Multi-disc section headers
  var hasMultiDisc = albumSongs.some(function(s) { return (s.disc || 1) > 1; });
  var currentDisc = 0;

  albumSongs.forEach(function(s, i) {
    var disc = s.disc || 1;
    if (hasMultiDisc && disc !== currentDisc) {
      currentDisc = disc;
      albumRowParts.push('<div class="disc-header"><span>Disc ' + disc + '</span></div>');
    }
    var playing = currentSong && currentSong.id === s.id;
    albumRowParts.push('<div class="song-row' + (playing ? ' playing' : '') + '" data-id="' + s.id + '">'
      + '<span class="track-num">' + (s.track || i + 1) + '</span>'
      + rowArt
      + '<div class="song-info">'
      + '<div class="song-title' + (playing ? ' playing' : '') + '">' + escHtml(s.title)
      + (s.feat ? '<span class="feat"> ft. ' + escHtml(s.feat) + '</span>' : '') + '</div>'
      + '<div class="song-meta">' + escHtml(s.artist) + ' &bull; ' + fmtTime(s.dur) + '</div>'
      + '</div>'
      + (s.tagging ? '<div class="tagging-spinner" style="width:20px;height:20px;"></div>' : '')
      + '<button class="song-fav' + (s.fav ? ' active' : '') + '" data-fav="' + s.id + '">' + heartSvg(s.fav, 20) + '</button>'
      + '<button class="song-edit" data-song-menu="' + s.id + '">&#8942;</button>'
      + '</div>');
  });

  el.innerHTML = html + albumRowParts.join('');
  initLazyArt(el);
  initSwipeGestures(el);

  document.getElementById('playAlbumBtn').onclick = function() {
    if (albumSongs.length > 0) playSong(albumSongs[0], albumSongs);
  };
  document.getElementById('shuffleAlbumBtn').onclick = function() {
    if (albumSongs.length > 0) {
      isShuffled = true;
      var shuffled = albumSongs.slice().sort(function() { return Math.random() - 0.5; });
      playSong(shuffled[0], shuffled);
    }
  };
  document.getElementById('editAlbumBtn').onclick = function() {
    openEditModal(selectedAlbum.name, selectedAlbum.artist);
  };
  bindSongRows(el, albumSongs);
}

// ─── Artist Multi-select (long-press artist row → select multiple → bulk edit) ───

function _msArtistEnter(name) {
  _msArtistMode = true;
  _msArtistNames = Object.create(null);
  _msArtistNames[name] = true;
  _haptic([20]);
  _msArtistShowBar();
  _msArtistRefreshRows();
}

function _msArtistExit() {
  _msArtistMode = false;
  _msArtistNames = null;
  _msHideBar();
  _msArtistRefreshRows();
}

function _msArtistToggle(name) {
  if (!_msArtistNames) return;
  if (_msArtistNames[name]) delete _msArtistNames[name];
  else _msArtistNames[name] = true;
  _msArtistRefreshRows();
  var lbl = document.getElementById('msBarLabel');
  if (lbl) {
    var cnt = Object.keys(_msArtistNames).length;
    lbl.textContent = cnt + ' artist' + (cnt !== 1 ? 's' : '') + ' selected';
  }
  var btn = document.getElementById('msEditBtn');
  if (btn) btn.disabled = Object.keys(_msArtistNames).length === 0;
}

function _msArtistRefreshRows() {
  if (_vsArtistData && document.getElementById('vsArtistRows')) {
    renderArtistVsWindow(Math.max(0, _vsArtistStart));
  }
}

function _msArtistShowBar() {
  _msHideBar();
  var bar = document.createElement('div');
  bar.id = 'msBar';
  bar.style.cssText = 'position:fixed;bottom:72px;left:0;right:0;height:52px;background:var(--bg-secondary);border-top:1px solid var(--border);display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;align-items:center;padding:0 12px;gap:8px;z-index:5000;box-shadow:0 -2px 12px rgba(0,0,0,0.4);';
  bar.innerHTML = '<button id="msCancelBtn" style="padding:7px 14px;border:1px solid var(--border);background:transparent;color:var(--text-dim);border-radius:10px;font-size:13px;cursor:pointer;">&times; Cancel</button>'
    + '<span id="msBarLabel" style="flex:1;text-align:center;font-size:13px;color:var(--text);">1 artist selected</span>'
    + '<button id="msEditBtn" style="padding:7px 14px;background:var(--accent);border:none;color:#fff;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;">&#9998; Edit Tags</button>';
  document.getElementById('app').appendChild(bar);
  document.getElementById('msCancelBtn').onclick = function() { _msArtistExit(); };
  document.getElementById('msEditBtn').onclick = function() {
    var names = Object.keys(_msArtistNames || {});
    if (!names.length) return;
    var seen = Object.create(null);
    var allSongs = [];
    names.forEach(function(n) {
      getArtistSongs(n).forEach(function(s) {
        if (!seen[s.id]) { seen[s.id] = true; allSongs.push(s); }
      });
    });
    _msArtistExit();
    openBulkEditModal(allSongs);
  };
}

// ─── Song Multi-select (long-press song row → select multiple → bulk edit) ───

function _msEnter(songId, el) {
  _msMode = true;
  _msSongIds = Object.create(null);
  _msSongIds[songId] = true;
  _msEl = el;
  _msShowBar();
  _msRefreshUI();
  _haptic([20]);
}

function _msExit() {
  _msMode = false;
  _msSongIds = null;
  _msEl = null;
  _msHideBar();
}

function _msToggle(id) {
  if (!_msSongIds) return;
  if (_msSongIds[id]) delete _msSongIds[id];
  else _msSongIds[id] = true;
  _msRefreshUI();
}

function _msRefreshUI() {
  if (!_msEl || !_msSongIds) return;
  _msEl.querySelectorAll('.song-row[data-id]').forEach(function(row) {
    var id = row.dataset.id;
    var sel = !!_msSongIds[id];
    var chk = row.querySelector('.ms-check');
    if (!chk) {
      chk = document.createElement('div');
      chk.className = 'ms-check';
      chk.style.cssText = 'width:22px;height:22px;border-radius:50%;border:2px solid var(--border);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;transition:all 0.15s;';
      row.insertBefore(chk, row.firstChild);
    }
    if (sel) {
      chk.style.background = 'var(--accent)';
      chk.style.borderColor = 'var(--accent)';
      chk.style.color = '#fff';
      chk.innerHTML = '&#10003;';
    } else {
      chk.style.background = 'transparent';
      chk.style.borderColor = 'var(--border)';
      chk.style.color = 'transparent';
      chk.innerHTML = '';
    }
  });
  var lbl = document.getElementById('msBarLabel');
  if (lbl) {
    var cnt = Object.keys(_msSongIds).length;
    lbl.textContent = cnt + ' song' + (cnt !== 1 ? 's' : '') + ' selected';
  }
  var btn = document.getElementById('msEditBtn');
  if (btn) btn.disabled = Object.keys(_msSongIds).length === 0;
}

function _msShowBar() {
  _msHideBar();
  var bar = document.createElement('div');
  bar.id = 'msBar';
  bar.style.cssText = 'position:fixed;bottom:72px;left:0;right:0;height:52px;background:var(--bg-secondary);border-top:1px solid var(--border);display:flex;align-items:center;padding:0 12px;gap:8px;z-index:5000;box-shadow:0 -2px 12px rgba(0,0,0,0.4);';
  bar.innerHTML = '<button id="msCancelBtn" style="padding:7px 14px;border:1px solid var(--border);background:transparent;color:var(--text-dim);border-radius:10px;font-size:13px;cursor:pointer;">&times; Cancel</button>'
    + '<span id="msBarLabel" style="flex:1;text-align:center;font-size:13px;color:var(--text);">0 songs selected</span>'
    + '<button id="msEditBtn" style="padding:7px 14px;background:var(--accent);border:none;color:#fff;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;" disabled>&#9998; Edit Tags</button>';
  document.getElementById('app').appendChild(bar);
  document.getElementById('msCancelBtn').onclick = function() { _msExit(); };
  document.getElementById('msEditBtn').onclick = function() {
    var ids = Object.keys(_msSongIds || {});
    if (!ids.length) return;
    var sel = ids.map(function(id) { return songMap[id]; }).filter(Boolean);
    _msExit();
    openBulkEditModal(sel);
  };
}

function _msHideBar() {
  var bar = document.getElementById('msBar');
  if (bar) bar.remove();
}

// ─── Song Row Bindings ───

function bindSongRows(el, songList) {
  var _lpTimer = null;

  el.addEventListener('touchstart', function(e) {
    if (_msMode) return;
    var row = e.target.closest('.song-row[data-id]');
    if (!row) return;
    var rowId = row.dataset.id;
    _lpTimer = setTimeout(function() { _lpTimer = null; _msEnter(rowId, el); }, 480);
  }, { passive: true });

  el.addEventListener('touchend', function() {
    if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
  }, { passive: true });

  el.addEventListener('touchmove', function() {
    if (_lpTimer) { clearTimeout(_lpTimer); _lpTimer = null; }
  }, { passive: true });

  el.onclick = function(e) {
    if (_msMode) {
      var row = e.target.closest('.song-row[data-id]');
      if (row) { _msToggle(row.dataset.id); return; }
      return;
    }
    var fav = e.target.closest('[data-fav]');
    if (fav) {
      var s = songMap[fav.dataset.fav];
      if (s) {
        s.fav = !s.fav; _countsCache = null; _spCache = null; saveLibraryLater();
        fav.innerHTML = heartSvg(s.fav, 20);
        fav.className = 'song-fav' + (s.fav ? ' active' : '');
      }
      return;
    }
    var menuBtn = e.target.closest('[data-song-menu]');
    if (menuBtn) { showSongMenu(menuBtn.dataset.songMenu, songList); return; }
    var row = e.target.closest('.song-row[data-id]');
    if (row) {
      var s = songMap[row.dataset.id];
      if (s) {
        if (!s.url) { showToast('Re-import your music folder to enable playback'); return; }
        playSong(s, songList);
      }
    }
  };
}

// ─── Mini Player ───

function updateMiniPlayer() {
  if (!_mpEl) {
    _mpEl       = document.getElementById('miniPlayer');
    _mpTitleEl  = document.getElementById('miniTitle');
    _mpArtistEl = document.getElementById('miniArtist');
    _mpArtEl    = document.getElementById('miniArt');
    _mpPlayBtn  = document.getElementById('miniPlayBtn');
    _mpBar      = document.getElementById('miniProgressBar');
    _mpEq       = document.getElementById('miniEqBars');
  }
  var mp = _mpEl;
  if (!currentSong) {
    mp.classList.add('hidden');
    if (_mpEq) _mpEq.classList.add('hidden');
    return;
  }
  if (showNowPlaying) { mp.classList.add('hidden'); return; }
  mp.classList.remove('hidden');

  var uri = currentSong.albumArtUri;
  var songChanged = currentSong.id !== _miniLastSongId;

  if (songChanged) {
    _miniLastSongId = currentSong.id;
    _mpTitleEl.textContent = currentSong.title;
    _mpArtistEl.textContent = currentSong.artist;
    var customMiniArt = currentSong.art && currentSong.art.startsWith('data:') ? currentSong.art : '';
    var cached = uri && artCache[uri];
    var miniSrc = customMiniArt || cached || '';
    _mpArtEl.innerHTML = miniSrc
      ? '<img src="' + miniSrc + '" style="width:44px;height:44px;object-fit:cover;border-radius:10px;flex-shrink:0;">'
      : artHTML(currentSong.album || currentSong.title, 44);
    if (!customMiniArt && uri && !cached) loadCurrentSongArt(currentSong);
  }

  _mpPlayBtn.innerHTML = isPlaying ? '&#10074;&#10074;' : '&#9654;';
  var pct = duration > 0 ? (currentTime / duration * 100) : 0;
  _mpBar.style.width = pct + '%';

  if (_mpEq) {
    if (isPlaying) {
      _mpEq.classList.remove('hidden', 'paused');
    } else {
      _mpEq.classList.remove('hidden');
      _mpEq.classList.add('paused');
    }
  }
}

// ─── Synced Lyrics ───

var lyricsLines = [];
var currentLyricIdx = -1;
var lyricsVisible = false;
var _lyricItems = null; // cached NodeList, reset when lyrics rebuild

// parseLRC lives in text-utils.js.

function _lyricsScrollTo(container, targetTop) {
  var start = container.scrollTop;
  var change = Math.max(0, targetTop) - start;
  if (Math.abs(change) < 2) return;
  var startTime = null;
  function step(ts) {
    if (!startTime) startTime = ts;
    var p = Math.min((ts - startTime) / 380, 1);
    var ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
    container.scrollTop = start + change * ease;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function updateSyncedLyrics(time) {
  if (!lyricsVisible || lyricsLines.length === 0) return;
  // Binary search for current line (lyricsLines is sorted by time)
  var lo = 0, hi = lyricsLines.length - 1, newIdx = -1;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    if (lyricsLines[mid].time <= time) { newIdx = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  if (newIdx === currentLyricIdx) return;
  currentLyricIdx = newIdx;

  // Cache NodeList — it's stable between builds (only rebuilt in applyLyricsToNPPanel)
  if (!_lyricItems) {
    var container = document.getElementById('syncedLyricsContainer');
    if (!container) return;
    _lyricItems = container.querySelectorAll('.lyric-line');
  }
  var items = _lyricItems;
  for (var j = 0; j < items.length; j++) {
    items[j].className = j === currentLyricIdx ? 'lyric-line active' : j < currentLyricIdx ? 'lyric-line past' : 'lyric-line future';
  }
  if (currentLyricIdx >= 0 && items[currentLyricIdx]) {
    var el = items[currentLyricIdx];
    var con = el.parentNode;
    if (con) _lyricsScrollTo(con, el.offsetTop - con.clientHeight / 2 + el.clientHeight / 2);
  }
}

function buildSyncedLyricsHTML() {
  if (lyricsLines.length === 0) return '';
  var html = '<div class="synced-lyrics-scroll" id="syncedLyricsContainer">';
  html += '<div class="lyrics-spacer"></div>';
  for (var i = 0; i < lyricsLines.length; i++) {
    var cls = 'lyric-line future';
    html += '<div class="' + cls + '" data-idx="' + i + '" data-time="' + lyricsLines[i].time + '">' + escHtml(lyricsLines[i].text) + '</div>';
  }
  html += '<div class="lyrics-spacer"></div>';
  html += '</div>';
  return html;
}

// ─── Now Playing ───

function heartSvg(filled, size) {
  size = size || 28;
  var p = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
  if (filled) {
    return '<svg class="np-heart-svg fav-filled" viewBox="0 0 24 24" width="' + size + '" height="' + size + '">'
      + '<path d="' + p + '" fill="#ff2d55"/>'
      + '<ellipse cx="8.2" cy="7.8" rx="2.4" ry="1.5" fill="rgba(255,255,255,0.3)" transform="rotate(-35 8.2 7.8)"/>'
      + '</svg>';
  }
  return '<svg class="np-heart-svg" viewBox="0 0 24 24" width="' + size + '" height="' + size + '">'
    + '<path d="' + p + '" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/>'
    + '</svg>';
}

function renderNowPlaying() {
  if (!currentSong) return;
  var np = document.getElementById('nowPlaying');
  showNowPlaying = true;
  np.classList.remove('hidden');
  document.getElementById('miniPlayer').classList.add('hidden');

  lyricsLines = parseLRC(currentSong.syncedLyrics);
  currentLyricIdx = -1;
  lyricsVisible = lyricsLines.length > 0;

  var artUri = currentSong.albumArtUri || '';
  // Custom data: art (user changed it) takes priority over the MediaStore cache
  var artData = (currentSong.art && currentSong.art.startsWith('data:')) ? currentSong.art
              : (artUri && artCacheHD[artUri]) ? artCacheHD[artUri]
              : (artUri && artCache[artUri]) ? artCache[artUri]
              : '';
  var artContent = artData
    ? '<img id="npArtImgEl" src="' + artData + '" style="width:100%;height:100%;object-fit:cover;display:block;">'
    : artHTML(currentSong.album || currentSong.title, 300, false, 'xxl');

  var hasLyrics = lyricsLines.length > 0 || !!(currentSong.lyrics && currentSong.lyrics.trim());
  var lyricsOverlayHtml = '';
  if (lyricsLines.length > 0) {
    lyricsOverlayHtml = buildSyncedLyricsHTML();
  } else if (currentSong.lyrics && currentSong.lyrics.trim()) {
    lyricsOverlayHtml = '<div class="plain-lyrics-scroll"><div class="lyrics-text">'
      + escHtml(currentSong.lyrics).replace(/\\n/g, '<br>').replace(/\n/g, '<br>')
      + '</div></div>';
  }

  var html = '<div class="np-bg-blur" id="npBgBlur"' + (artData ? ' style="background-image:url(' + artData + ')"' : '') + '></div>'
    + '<div id="npAmbient"></div>'
    + '<div class="np-content">'
    + '<div class="np-header">'
    + '<button id="npClose">&#8744;</button>'
    + '<div class="np-header-center"><div class="np-label">Playing From</div>'
    + '<div class="np-header-album" id="npAlbumBtn">' + escHtml(currentSong.album && currentSong.album !== 'Unknown Album' ? currentSong.album : currentSong.artist) + '</div></div>'
    + '<button id="npEditBtn">&#9998;</button>'
    + '</div>'
    + '<div class="np-art-full" id="npArtImg">'
    + artContent
    + '<div class="np-art-lyrics' + (hasLyrics ? '' : ' np-art-lyrics-hidden') + '" id="npArtLyrics">'
    + lyricsOverlayHtml
    + '</div>'
    + '</div>'
    + '<div class="np-info-row">'
    + '<button id="npFav" class="np-fav-btn' + (currentSong.fav ? ' fav-active' : '') + '">' + heartSvg(currentSong.fav) + '</button>'
    + '<div class="np-info-text">'
    + '<div class="np-title-marquee" id="npTitleMarquee"><span class="np-song-title" id="npTitleInner">' + escHtml(currentSong.title)
    + (currentSong.feat ? '<span class="feat"> ft. ' + escHtml(currentSong.feat) + '</span>' : '')
    + '</span></div>'
    + '<div class="np-song-artist" id="npArtistBtn">' + escHtml(currentSong.artist) + '</div>'
    + '</div>'
    + '<button id="npQueueBtn" title="Queue">&#9776;</button>'
    + '</div>'
    + '<div class="np-controls">'
    + '<div class="np-progress">'
    + '<div class="np-seek-wrap">'
    + '<div class="np-seek-track"><div class="np-seek-fill" id="npSeekFill" style="width:' + (duration > 0 ? (currentTime/duration*100).toFixed(1) : 0) + '%"></div></div>'
    + '<input type="range" id="npSeek" min="0" max="' + (duration || 0) + '" value="' + currentTime + '" step="0.1">'
    + '</div>'
    + '<div class="np-times"><span>' + fmtTime(currentTime) + '</span><span>' + fmtTime(duration) + '</span></div>'
    + '</div>'
    + '<div class="np-main-controls">'
    + '<button id="npRepeat" class="np-ctrl' + (repeatMode !== 'off' ? ' active' : '') + '" style="font-size:20px;">'
    + (repeatMode === 'off' ? '&#8594;' : repeatMode === 'all' ? '&#8635;' : '&#8635;<span style="font-size:11px;font-weight:700;vertical-align:super;margin-left:1px;">1</span>')
    + '</button>'
    + '<button id="npPrev" class="np-ctrl np-skip">&#9198;</button>'
    + '<button class="np-play-btn' + (isPlaying ? ' is-playing' : '') + '" id="npPlay">' + (isPlaying ? '&#10074;&#10074;' : '&#9654;') + '</button>'
    + '<button id="npNext" class="np-ctrl np-skip">&#9197;</button>'
    + '<button id="npShuffle" class="np-ctrl' + (isShuffled ? ' active' : '') + '" style="font-size:20px;">&#8644;</button>'
    + '</div>'
    + '<div class="np-bottom">'
    + '<button id="npSpeed" class="np-ctrl' + (playbackRate !== 1.0 ? ' active' : '') + '" style="font-size:13px;font-weight:700;min-width:40px;">' + playbackRate + 'x</button>'
    + '<button id="npAddPlBtn" class="np-ctrl" style="font-size:15px;" title="Add to playlist">&#9835;+</button>'
    + '<button id="npEqBtn" class="np-ctrl' + (eqGains.some(function(g){return g!==0;}) ? ' active' : '') + '" style="font-size:13px;font-weight:700;letter-spacing:1px;" title="Equalizer">EQ</button>'
    + '</div>';

  html += '</div>';  // end np-controls
  html += '</div>';  // end np-content

  np.innerHTML = html;
  _lyricItems = null; // new DOM nodes — invalidate cached NodeList
  if (lyricsVisible) updateSyncedLyrics(currentTime); // jump to current position immediately

  // Cache NP elements used on every timeupdate tick
  _npSeekEl  = document.getElementById('npSeek');
  _npFillEl  = document.getElementById('npSeekFill');
  _npTime0El = np.querySelector('.np-times span');

  // Enable marquee scrolling only if title actually overflows its container.
  // Use rAF so the browser has laid out before we measure.
  requestAnimationFrame(function() {
    var marqueeEl = document.getElementById('npTitleMarquee');
    var innerEl = document.getElementById('npTitleInner');
    if (marqueeEl && innerEl && innerEl.scrollWidth > marqueeEl.offsetWidth + 4) {
      var dist = innerEl.scrollWidth - marqueeEl.offsetWidth;
      marqueeEl.style.setProperty('--np-scroll-dist', '-' + dist + 'px');
      marqueeEl.classList.add('is-scrolling');
    }
  });

  // Extract album art colors for ambient glow (use cached art if available, else wait for HD)
  if (artData) sampleAndApplyArtColors(artData);

  // Load HD art in-place — skip if user already set custom art (don't overwrite data: URL)
  if (artUri && !(currentSong.art && currentSong.art.startsWith('data:'))) {
    fetchHdArt(artUri).then(function(data) {
      applyHdArtToNP(artUri, data);
      if (data && currentSong && currentSong.albumArtUri === artUri) updateMediaSession();
    });
  }

  document.getElementById('npClose').onclick = function() {
    showNowPlaying = false; np.classList.add('hidden');
    _npSeekEl = null; _npFillEl = null; _npTime0El = null;
    updateMiniPlayer();
  };
  var npArtEl = document.getElementById('npArtImg');
  if (npArtEl) {
    npArtEl.onclick = function() {
      var ov = document.getElementById('npArtLyrics');
      if (ov) ov.classList.toggle('np-art-lyrics-hidden');
    };
    npArtEl.style.cursor = 'pointer';
  }
  document.getElementById('npPlay').onclick = togglePlay;
  document.getElementById('npPrev').onclick = handlePrev;
  document.getElementById('npNext').onclick = handleNext;
  // Haptic feedback on touch — fires before click for instant response
  document.getElementById('npPlay').addEventListener('touchstart', function() { _haptic(55); }, { passive: true });
  document.getElementById('npPrev').addEventListener('touchstart', function() { _haptic(35); }, { passive: true });
  document.getElementById('npNext').addEventListener('touchstart', function() { _haptic(35); }, { passive: true });
  document.getElementById('npEditBtn').onclick = function() { openSongEditModal(currentSong.id); };
  document.getElementById('npRepeat').onclick = function() {
    repeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
    var btn = document.getElementById('npRepeat');
    if (!btn) return;
    btn.classList.toggle('active', repeatMode !== 'off');
    btn.innerHTML = repeatMode === 'off' ? '&#8594;'
      : repeatMode === 'all' ? '&#8635;'
      : '&#8635;<span style="font-size:11px;font-weight:700;vertical-align:super;margin-left:1px;">1</span>';
  };
  document.getElementById('npShuffle').onclick = function() {
    isShuffled = !isShuffled;
    if (isShuffled && queue.length > 1) {
      // Reshuffle remaining unplayed songs (Fisher-Yates), keep current song in place
      var curIdx = queue.findIndex(function(s) { return s.id === currentSong.id; });
      var played = queue.slice(0, curIdx + 1);
      var remaining = queue.slice(curIdx + 1);
      for (var i = remaining.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = remaining[i]; remaining[i] = remaining[j]; remaining[j] = tmp;
      }
      queue = played.concat(remaining);
    }
    var btn = document.getElementById('npShuffle');
    if (btn) btn.classList.toggle('active', isShuffled);
  };
  document.getElementById('npFav').onclick = function() {
    var s = songMap[currentSong.id];
    if (!s) return;
    s.fav = !s.fav; currentSong.fav = s.fav; _countsCache = null; saveLibrary();
    var btn = document.getElementById('npFav');
    if (btn) { btn.innerHTML = heartSvg(s.fav); btn.classList.toggle('fav-active', s.fav); }
  };
  document.getElementById('npQueueBtn').onclick = function() { openQueuePanel(); };
  var _seekEl = document.getElementById('npSeek');
  _seekEl.addEventListener('touchstart', function() { _npSeeking = true; }, { passive: true });
  _seekEl.addEventListener('touchend', function(e) {
    audio.currentTime = parseFloat(e.target.value);
    _npSeeking = false;
    _lastNotifKey = '';
    updateMediaSession();
  });
  _seekEl.oninput = function(e) {
    var val = parseFloat(e.target.value);
    if (_npFillEl && duration > 0) _npFillEl.style.width = (val / duration * 100).toFixed(1) + '%';
    if (_npTime0El) _npTime0El.textContent = fmtTime(val);
  };

  // Tap album name at top → go to that album
  var npAlbumBtnEl = document.getElementById('npAlbumBtn');
  if (npAlbumBtnEl && currentSong) {
    var _tapAlbum  = (currentSong.album && currentSong.album !== 'Unknown Album') ? currentSong.album : null;
    if (_tapAlbum) {
      npAlbumBtnEl.onclick = function() {
        showNowPlaying = false;
        var npEl = document.getElementById('nowPlaying');
        if (npEl) npEl.classList.add('hidden');
        _npSeekEl = null; _npFillEl = null; _npTime0El = null;
        var _tapArtist = getBestAlbumArtistKey(_tapAlbum);
        selectedAlbum  = { name: _tapAlbum, artist: _tapArtist };
        selectedArtist = null;
        _prevTab = currentTab; // remember which tab to return to on back
        currentTab = 'albums';
        updateMiniPlayer();
        render();
      };
    }
  }

  // Tap artist name → go to that artist's page
  var npArtistBtnEl = document.getElementById('npArtistBtn');
  if (npArtistBtnEl && currentSong && currentSong.artist) {
    var _tapArtistName = currentSong.artist;
    npArtistBtnEl.onclick = function() {
      showNowPlaying = false;
      var npEl = document.getElementById('nowPlaying');
      if (npEl) npEl.classList.add('hidden');
      _npSeekEl = null; _npFillEl = null; _npTime0El = null;
      selectedArtist = _tapArtistName;
      selectedAlbum  = null;
      currentTab = 'artists';
      updateMiniPlayer();
      render();
    };
  }

  document.getElementById('npSpeed').onclick = function() {
    var idx = SPEEDS.indexOf(playbackRate);
    playbackRate = SPEEDS[(idx + 1) % SPEEDS.length];
    audio.playbackRate = playbackRate;
    var btn = document.getElementById('npSpeed');
    if (btn) { btn.textContent = playbackRate + 'x'; btn.classList.toggle('active', playbackRate !== 1.0); }
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && duration > 0) {
      try { navigator.mediaSession.setPositionState({ duration: duration, playbackRate: playbackRate, position: currentTime }); } catch(e) {}
    }
  };

  document.getElementById('npAddPlBtn').onclick = function() {
    if (currentSong) showAddToPlaylistSheet(currentSong);
  };

  document.getElementById('npEqBtn').onclick = function() { openEqPanel(); };

  // Wire synced lyric line clicks if already showing (re-open NP case)
  var syncContainer = document.getElementById('syncedLyricsContainer');
  if (syncContainer) {
    bindSyncedLyricsClicks(np);
    updateSyncedLyrics(currentTime);
  }

  // Auto-fetch lyrics from LRClib (free, real synced timestamps).
  // No Gemini here — it no longer returns lyrics, and single-song calls during a
  // batch tagging run would eat the shared rate limit and trigger 429s.
  // _lyricsFetched flag prevents re-firing on every renderNowPlaying() call.
  if (!lyricsVisible && !currentSong.lyrics && !currentSong._lyricsFetched) {
    currentSong._lyricsFetched = true;
    var fetchSong = currentSong;
    fetchLRCLibLyrics(fetchSong).then(function(result) {
      if (result) {
        if (result.syncedLyrics) fetchSong.syncedLyrics = result.syncedLyrics;
        if (result.plainLyrics)  fetchSong.lyrics       = result.plainLyrics;
        saveLibraryLater();
      }
      applyLyricsToNPPanel(fetchSong);
    });
  }

  // Swipe gestures: down to close, left/right to skip (but not in lyrics scroll)
  var _swipeX = 0, _swipeY = 0, _swipeBlocked = false;
  np.ontouchstart = function(e) {
    _swipeBlocked = !!(e.target.closest('.synced-lyrics-scroll') || e.target.closest('.plain-lyrics-scroll') || e.target.closest('input[type=range]'));
    _swipeX = e.touches[0].clientX;
    _swipeY = e.touches[0].clientY;
  };
  np.ontouchend = function(e) {
    if (_swipeBlocked) return;
    var dx = e.changedTouches[0].clientX - _swipeX;
    var dy = e.changedTouches[0].clientY - _swipeY;
    if (Math.abs(dy) > Math.abs(dx)) {
      if (dy > 80) { showNowPlaying = false; np.classList.add('hidden'); _npSeekEl = null; _npFillEl = null; _npTime0El = null; updateMiniPlayer(); }
    } else {
      if (dx < -60) handleNext();
      else if (dx > 60) handlePrev();
    }
  };
}

// ─── Share helpers ───────────────────────────────────────────────────────────

function shareSongs(songList, label) {
  var uris = songList.map(function(s) { return s.contentUri; }).filter(Boolean);
  if (!uris.length) { showToast('No shareable file found'); return; }
  NativeBridge.shareFiles(uris, label || 'Share Music').catch(function(e) {
    showToast('Share failed: ' + (e && e.message ? e.message : e));
  });
}

// Show a QR code that lets another phone on the same WiFi download the actual MP3(s).
// songs: array of song objects from the library.
function showShareQrModal(songs, label) {
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;';

  var card = document.createElement('div');
  card.style.cssText = 'background:var(--bg-secondary);border-radius:20px;padding:24px;width:100%;max-width:340px;display:flex;flex-direction:column;align-items:center;gap:14px;';

  var title = document.createElement('div');
  title.style.cssText = 'font-weight:700;font-size:16px;text-align:center;';
  title.textContent = label || songs[0].title;
  card.appendChild(title);

  var qrWrap = document.createElement('div');
  qrWrap.style.cssText = 'width:240px;height:240px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;';
  var spinner = document.createElement('div');
  spinner.textContent = 'Starting…';
  spinner.style.cssText = 'color:#555;font-size:14px;';
  qrWrap.appendChild(spinner);
  card.appendChild(qrWrap);

  var hint = document.createElement('div');
  hint.style.cssText = 'font-size:12px;color:var(--text-faint);text-align:center;line-height:1.5;';
  hint.textContent = 'Both phones must be on the same WiFi.\nScan with camera to download.';
  card.appendChild(hint);

  var closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'padding:10px 32px;border-radius:24px;border:none;background:var(--primary);color:#fff;font-size:15px;font-weight:600;';
  closeBtn.textContent = 'Close';
  function dismiss() {
    NativeBridge.stopShareServer();
    if (overlay.parentNode) document.body.removeChild(overlay);
  }
  closeBtn.onclick = dismiss;
  overlay.onclick = function(e) { if (e.target === overlay) dismiss(); };
  card.appendChild(closeBtn);

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Build song list for the server
  var serverSongs = songs.map(function(s) {
    var fn = s.fn || '';
    var dot = fn.lastIndexOf('.');
    var ext = dot > 0 ? fn.slice(dot) : '.mp3';
    var title = (s.title || fn.slice(0, dot > 0 ? dot : undefined) || 'song').replace(/[\\/:*?"<>|]/g, '_');
    return { contentUri: s.contentUri, fileName: title + ext };
  }).filter(function(s) { return s.contentUri; });

  if (!serverSongs.length) {
    hint.textContent = 'No shareable file found (content URI missing).';
    return;
  }

  NativeBridge.startShareServer(serverSongs).then(function(r) {
    var url = r.url;
    // Generate QR natively
    return NativeBridge.generateQrCode(url, 600).then(function(dataUrl) {
      var qrImg = document.createElement('img');
      qrImg.style.cssText = 'width:240px;height:240px;border-radius:12px;object-fit:contain;';
      qrImg.src = dataUrl;
      qrWrap.innerHTML = '';
      qrWrap.appendChild(qrImg);
      hint.textContent = songs.length === 1
        ? 'Scan to download "' + songs[0].title + '".\nBoth phones must be on same WiFi.'
        : 'Scan to open the album download page.\nBoth phones must be on same WiFi.';
    });
  }).catch(function(e) {
    hint.textContent = 'Failed: ' + (e && e.message ? e.message : e);
    spinner.textContent = '✕';
  });
}

// ─── Context Bottom Sheet ───

function closeBottomSheet() {
  document.getElementById('bottomSheet').classList.add('hidden');
  document.getElementById('bsOverlay').classList.add('hidden');
}

function openBottomSheet(headerHTML, items) {
  document.getElementById('bsHeader').innerHTML = headerHTML;
  var itemsEl = document.getElementById('bsItems');
  itemsEl.innerHTML = '';
  items.forEach(function(item) {
    if (item === 'divider') {
      var d = document.createElement('div');
      d.className = 'bs-divider';
      itemsEl.appendChild(d);
      return;
    }
    var row = document.createElement('div');
    row.className = 'bs-item';
    row.innerHTML = '<span class="bs-icon">' + item.icon + '</span><span class="bs-label">' + escHtml(item.label) + '</span>';
    row.onclick = function() { closeBottomSheet(); item.action(); };
    itemsEl.appendChild(row);
  });
  // Init lazy art inside header if any
  initLazyArt(document.getElementById('bsHeader'));
  document.getElementById('bottomSheet').classList.remove('hidden');
  document.getElementById('bsOverlay').classList.remove('hidden');
}

function playNext(songList) {
  if (!songList || !songList.length) return;
  if (!currentSong || !queue.length) { playSong(songList[0], songList); return; }
  var idx = queue.findIndex(function(s) { return s.id === currentSong.id; });
  if (idx === -1) { queue = queue.concat(songList); }
  else { queue.splice.apply(queue, [idx + 1, 0].concat(songList)); }
  showToast('Playing next: ' + songList.length + ' song' + (songList.length !== 1 ? 's' : ''));
}

function addToQueue(songList) {
  if (!songList || !songList.length) return;
  if (!currentSong || !queue.length) { playSong(songList[0], songList); return; }
  queue = queue.concat(songList);
  showToast('Added ' + songList.length + ' song' + (songList.length !== 1 ? 's' : '') + ' to queue');
}

function showArtistMenu(artistName) {
  var artistAlbums = getArtistAlbums(artistName);
  var artistSongs  = getArtistSongs(artistName);

  // Build mini collage header
  var count = Math.max(artistAlbums.length, 1);
  var cells = [];
  for (var i = 0; i < 4; i++) {
    var album = artistAlbums[i % count];
    var uri = album ? (album.albumArtUri || '') : '';
    var g = getGrad(album ? album.name : artistName);
    var init = (album ? album.name : artistName).split(' ').map(function(w){return w[0]||'';}).join('').substring(0,2).toUpperCase();
    cells.push('<div class="bs-collage-cell">'
      + '<div style="width:100%;height:100%;background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ');display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;font-size:12px;font-weight:700;color:rgba(255,255,255,0.8);">' + escHtml(init) + '</div>'
      + (uri ? '<div class="art-lazy" data-lazy-uri="' + escHtml(uri) + '" data-fill="1" style="position:absolute;top:0;left:0;right:0;bottom:0;"></div>' : '')
      + '</div>');
  }
  var headerHTML = '<div class="bs-collage">' + cells.join('') + '</div>'
    + '<div class="bs-info">'
    + '<div class="bs-name">' + escHtml(artistName) + '</div>'
    + '<div class="bs-meta">' + artistAlbums.length + ' ' + (artistAlbums.length === 1 ? 'Album' : 'Albums') + ' &bull; ' + artistSongs.length + ' Songs</div>'
    + '</div>';

  openBottomSheet(headerHTML, [
    { icon: '&#9654;',  label: 'Play',              action: function() { if (artistSongs.length) playSong(artistSongs[0], artistSongs); } },
    { icon: '&#8631;',  label: 'Play next',          action: function() { playNext(artistSongs); } },
    { icon: '&#8644;',  label: 'Add to queue',       action: function() { addToQueue(artistSongs); } },
    { icon: '&#8645;',  label: 'Shuffle',            action: function() {
        if (!artistSongs.length) return;
        isShuffled = true;
        var sh = artistSongs.slice().sort(function() { return Math.random() - 0.5; });
        playSong(sh[0], sh);
    }},
    'divider',
    { icon: '&#9998;',  label: 'Tag editor',          action: function() { selectedArtist = artistName; render(); showToast('Tap ⋮ on any song to edit its tags'); } },
    { icon: '&#128257;', label: 'Share all songs',    action: function() { shareSongs(artistSongs, artistName); } },
    { icon: '&#128465;', label: 'Delete all songs',   action: function() { deleteSongsFromDevice(artistSongs); } },
  ]);
}

function showAlbumMenu(album) {
  var albumSongs = getAlbumSongs(album.name, album.artist);
  var first = albumSongs[0] || {};
  var uri = first.albumArtUri || '';
  var g = getGrad(album.name);
  var init = album.name.split(' ').map(function(w){return w[0]||'';}).join('').substring(0,2).toUpperCase();
  var headerHTML = '<div class="bs-art-single">'
    + '<div style="width:100%;height:100%;position:absolute;top:0;left:0;background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ');display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;font-size:16px;font-weight:700;color:#fff;">' + escHtml(init) + '</div>'
    + (uri ? '<div class="art-lazy" data-lazy-uri="' + escHtml(uri) + '" data-fill="1" style="position:absolute;top:0;left:0;right:0;bottom:0;"></div>' : '')
    + '</div>'
    + '<div class="bs-info">'
    + '<div class="bs-name">' + escHtml(album.name) + '</div>'
    + '<div class="bs-meta">' + escHtml(album.artist) + ' &bull; ' + albumSongs.length + ' Songs</div>'
    + '</div>';
  openBottomSheet(headerHTML, [
    { icon: '&#9654;', label: 'Play',         action: function() { if (albumSongs.length) playSong(albumSongs[0], albumSongs); } },
    { icon: '&#8631;', label: 'Play next',    action: function() { playNext(albumSongs); } },
    { icon: '&#8644;', label: 'Add to queue', action: function() { addToQueue(albumSongs); } },
    { icon: '&#8645;', label: 'Shuffle',      action: function() {
        if (!albumSongs.length) return;
        isShuffled = true;
        var sh = albumSongs.slice().sort(function() { return Math.random() - 0.5; });
        playSong(sh[0], sh);
    }},
    'divider',
    { icon: '&#9998;',   label: 'Tag editor',       action: function() { openEditModal(album.name, album.artist); } },
    { icon: '&#9835;',   label: 'Go to artist',     action: function() { selectedAlbum = null; selectedArtist = album.artist; render(); } },
    { icon: '&#128257;', label: 'Share album',    action: function() { shareSongs(albumSongs, album.name); } },
    { icon: '&#9638;',   label: 'Share QR code', action: function() { showShareQrModal(albumSongs, album.name); } },
    { icon: '&#128465;', label: 'Delete all songs',  action: function() { deleteSongsFromDevice(albumSongs); } },
  ]);
}

function showAddToPlaylistSheet(song) {
  var items = playlists.map(function(pl) {
    return {
      icon: '&#9835;',
      label: pl.name + ' (' + pl.songIds.length + ')',
      action: function() {
        var key = song.contentUri || song.fn;
        if (key && pl.songIds.indexOf(key) === -1) { pl.songIds.push(key); savePlaylists(); }
        showToast('Added to ' + pl.name);
      }
    };
  });
  items.push({
    icon: '&#43;',
    label: 'New playlist…',
    action: function() {
      var name = prompt('Playlist name:');
      if (!name || !name.trim()) return;
      var pl = { id: 'pl_' + Date.now(), name: name.trim(), songIds: [song.id] };
      playlists.push(pl);
      savePlaylists();
      showToast('Added to ' + pl.name);
    }
  });
  openBottomSheet('<div class="bs-info"><div class="bs-name">Add to playlist</div><div class="bs-meta">' + escHtml(song.title) + '</div></div>', items);
}

function setSleepTimer(minutes) {
  if (_sleepTimerTimeout) { clearTimeout(_sleepTimerTimeout); _sleepTimerTimeout = null; }
  if (_sleepTimerDisplayInt) { clearInterval(_sleepTimerDisplayInt); _sleepTimerDisplayInt = null; }
  sleepTimerEnd = 0;
  if (minutes === 0) {
    var btn = document.getElementById('npSleepBtn');
    if (btn) { btn.innerHTML = '&#9203;'; btn.classList.remove('active'); }
    return;
  }
  sleepTimerEnd = Date.now() + minutes * 60000;
  _sleepTimerTimeout = setTimeout(function() {
    _sleepTimerTimeout = null;
    sleepTimerEnd = 0;
    if (_sleepTimerDisplayInt) { clearInterval(_sleepTimerDisplayInt); _sleepTimerDisplayInt = null; }
    var origVol = audio.volume;
    var steps = 30; var cnt = 0; var dec = origVol / steps;
    var fadeInt = setInterval(function() {
      cnt++;
      audio.volume = Math.max(0, origVol - dec * cnt);
      if (cnt >= steps) {
        clearInterval(fadeInt);
        audio.pause(); isPlaying = false;
        audio.volume = origVol; volume = origVol;
        syncPlaybackUI();
      }
    }, 100);
    var btn = document.getElementById('npSleepBtn');
    if (btn) { btn.innerHTML = '&#9203;'; btn.classList.remove('active'); }
  }, minutes * 60000);
  _sleepTimerDisplayInt = setInterval(function() {
    if (!sleepTimerEnd) { clearInterval(_sleepTimerDisplayInt); return; }
    var btn = document.getElementById('npSleepBtn');
    if (btn) {
      var mins = Math.ceil((sleepTimerEnd - Date.now()) / 60000);
      btn.innerHTML = '&#9203;' + (mins > 0 ? mins + 'm' : '');
      btn.classList.add('active');
    }
  }, 30000);
  var btn = document.getElementById('npSleepBtn');
  if (btn) { btn.innerHTML = '&#9203;' + minutes + 'm'; btn.classList.add('active'); }
}

function showSongMenu(songId, songList) {
  var song = songMap[songId];
  if (!song) return;
  var uri = song.albumArtUri || '';
  var g = getGrad(song.album || song.title);
  var init = (song.album || song.title).split(' ').map(function(w){return w[0]||'';}).join('').substring(0,2).toUpperCase();
  var headerHTML = '<div class="bs-art-single">'
    + '<div style="width:100%;height:100%;position:absolute;top:0;left:0;background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ');display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;">' + escHtml(init) + '</div>'
    + (uri ? '<div class="art-lazy" data-lazy-uri="' + escHtml(uri) + '" data-fill="1" style="position:absolute;top:0;left:0;right:0;bottom:0;"></div>' : '')
    + (song.art ? '<img src="' + escHtml(song.art) + '" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;" onerror="this.style.display=\'none\'">' : '')
    + '</div>'
    + '<div class="bs-info">'
    + '<div class="bs-name">' + escHtml(song.title) + (song.feat ? '<span style="font-size:12px;color:var(--text-dim);"> ft. ' + escHtml(song.feat) + '</span>' : '') + '</div>'
    + '<div class="bs-meta">' + escHtml(song.artist) + ' &bull; ' + escHtml(song.album) + '</div>'
    + '</div>';
  var isFav = song.fav;
  openBottomSheet(headerHTML, [
    { icon: '&#9654;', label: 'Play',              action: function() { if (song.url) playSong(song, songList || queue); else showToast('Re-import folder to play'); } },
    { icon: '&#8631;', label: 'Play next',         action: function() { playNext([song]); } },
    { icon: '&#8644;', label: 'Add to queue',      action: function() { addToQueue([song]); } },
    { icon: isFav ? '&#10084;' : '&#9825;', label: isFav ? 'Remove from favorites' : 'Add to favorites',
      action: function() { song.fav = !song.fav; _countsCache = null; saveLibraryLater(); showToast(song.fav ? 'Added to favorites' : 'Removed from favorites'); } },
    { icon: '&#9835;', label: 'Add to playlist',   action: function() { showAddToPlaylistSheet(song); } },
    'divider',
    { icon: '&#9998;', label: 'Tag editor',        action: function() { openSongEditModal(songId); } },
    { icon: '&#9835;', label: 'Go to album',       action: function() { selectedAlbum = { name: song.album, artist: song.artist }; render(); } },
    { icon: '&#9834;', label: 'Go to artist',      action: function() { selectedAlbum = null; selectedArtist = song.artist; render(); } },
    'divider',
    { icon: '&#128257;', label: 'Share audio',   action: function() { shareSongs([song], song.title); } },
    { icon: '&#9638;',   label: 'Share QR code', action: function() { showShareQrModal([song]); } },
    { icon: '&#128465;', label: 'Delete from device', action: function() { deleteSongsFromDevice([song]); } },
  ]);
}

document.getElementById('bsOverlay').onclick = closeBottomSheet;

// ─── Playback ───

function initAudioCtx() {
  if (_audioCtx) {
    if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(function(){});
    return;
  }
  try {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    _gainMain = _audioCtx.createGain();
    _gainPre  = _audioCtx.createGain();
    _gainPre.gain.value = 0;

    _eqNodes = EQ_FREQS.map(function(freq, i) {
      var node = _audioCtx.createBiquadFilter();
      node.type = EQ_TYPES[i];
      node.frequency.value = freq;
      node.gain.value = eqGains[i];
      return node;
    });
    for (var i = 1; i < _eqNodes.length; i++) _eqNodes[i - 1].connect(_eqNodes[i]);
    _eqNodes[_eqNodes.length - 1].connect(_audioCtx.destination);
    _gainMain.connect(_eqNodes[0]);
    _gainPre.connect(_eqNodes[0]);

    _srcMain = _audioCtx.createMediaElementSource(audio);
    _srcMain.connect(_gainMain);
    _srcPre  = _audioCtx.createMediaElementSource(audioPreload);
    _srcPre.connect(_gainPre);
  } catch(e) { _audioCtx = null; }
}

function applyEqGains() {
  if (!_eqNodes.length) return;
  _eqNodes.forEach(function(node, i) { node.gain.value = eqGains[i]; });
  localStorage.setItem('eqSettings', JSON.stringify({ gains: eqGains, xfade: crossfadeDur }));
}

function openEqPanel() {
  var overlay = document.createElement('div');
  overlay.id = 'eqOverlay';
  overlay.className = 'eq-overlay';

  var presetKeys = Object.keys(EQ_PRESETS);
  var presetHtml = presetKeys.map(function(name) {
    var isActive = JSON.stringify(EQ_PRESETS[name]) === JSON.stringify(eqGains);
    return '<button class="eq-preset-chip' + (isActive ? ' active' : '') + '" data-preset="' + escHtml(name) + '">' + escHtml(name) + '</button>';
  }).join('');

  var bandHtml = EQ_FREQS.map(function(freq, i) {
    var label = freq >= 1000 ? (freq / 1000) + 'k' : freq + '';
    return '<div class="eq-band-h">'
      + '<span class="eq-band-freq">' + label + '</span>'
      + '<input type="range" class="eq-slider" data-band="' + i + '" min="-12" max="12" step="1" value="' + eqGains[i] + '">'
      + '<span class="eq-band-val" id="eqVal' + i + '">' + (eqGains[i] > 0 ? '+' : '') + eqGains[i] + '</span>'
      + '</div>';
  }).join('');

  overlay.innerHTML = '<div class="eq-panel">'
    + '<div class="eq-header"><span class="eq-title">Equalizer</span>'
    + '<button class="eq-close-btn" id="eqCloseBtn">&#10005;</button></div>'
    + '<div class="eq-presets">' + presetHtml + '</div>'
    + '<div class="eq-bands-v">' + bandHtml + '</div>'
    + '<div class="eq-xfade-row">'
    + '<span class="eq-xfade-label">Crossfade</span>'
    + '<input type="range" id="eqXfadeSlider" min="0" max="8" step="0.5" value="' + crossfadeDur + '" style="flex:1;accent-color:var(--primary);">'
    + '<span id="eqXfadeVal" style="min-width:36px;text-align:right;font-size:13px;">' + (crossfadeDur === 0 ? 'Off' : crossfadeDur + 's') + '</span>'
    + '</div>'
    + '</div>';

  document.body.appendChild(overlay);

  overlay.querySelectorAll('.eq-slider').forEach(function(slider) {
    slider.oninput = function() {
      var band = parseInt(slider.dataset.band);
      eqGains[band] = parseFloat(slider.value);
      var valEl = document.getElementById('eqVal' + band);
      if (valEl) valEl.textContent = (eqGains[band] > 0 ? '+' : '') + eqGains[band];
      applyEqGains();
      var eqBtn = document.getElementById('npEqBtn');
      if (eqBtn) eqBtn.classList.toggle('active', eqGains.some(function(g){return g!==0;}));
      overlay.querySelectorAll('.eq-preset-chip').forEach(function(c) {
        c.classList.toggle('active', JSON.stringify(EQ_PRESETS[c.dataset.preset]) === JSON.stringify(eqGains));
      });
    };
  });

  overlay.querySelectorAll('.eq-preset-chip').forEach(function(chip) {
    chip.onclick = function() {
      var preset = EQ_PRESETS[chip.dataset.preset];
      if (!preset) return;
      eqGains = preset.slice();
      applyEqGains();
      overlay.querySelectorAll('.eq-slider').forEach(function(slider) {
        var band = parseInt(slider.dataset.band);
        slider.value = eqGains[band];
        var valEl = document.getElementById('eqVal' + band);
        if (valEl) valEl.textContent = (eqGains[band] > 0 ? '+' : '') + eqGains[band];
      });
      overlay.querySelectorAll('.eq-preset-chip').forEach(function(c) { c.classList.remove('active'); });
      chip.classList.add('active');
      var eqBtn = document.getElementById('npEqBtn');
      if (eqBtn) eqBtn.classList.toggle('active', eqGains.some(function(g){return g!==0;}));
    };
  });

  var xfadeSlider = document.getElementById('eqXfadeSlider');
  var xfadeVal = document.getElementById('eqXfadeVal');
  xfadeSlider.oninput = function() {
    crossfadeDur = parseFloat(xfadeSlider.value);
    xfadeVal.textContent = crossfadeDur === 0 ? 'Off' : crossfadeDur + 's';
    localStorage.setItem('eqSettings', JSON.stringify({ gains: eqGains, xfade: crossfadeDur }));
  };

  document.getElementById('eqCloseBtn').onclick = function() { overlay.remove(); };
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
}

function playSong(song, songList) {
  if (currentSong && !_historyJump) {
    _playHistory.push(currentSong.id);
    if (_playHistory.length > 200) _playHistory.shift();
  }
  _historyJump = false;
  currentSong = song;
  song.playCount = (song.playCount || 0) + 1;
  song.lastPlayed = Date.now();
  preloadedUrl = '';
  preloadedSong = null;
  _miniLastSongId = '';
  _lastNotifKey = ''; // force notification refresh for new song
  loadCurrentSongArt(song);
  saveLibraryLater();
  queue = songList || songs;
  // If shuffle is active and we just loaded a new unshuffled list, reshuffle everything
  // after the selected song so the shuffle indicator stays honest.
  if (isShuffled && queue.length > 1) {
    var _ci = queue.findIndex(function(s) { return s.id === song.id; });
    var _remaining = queue.slice(_ci + 1);
    for (var _i = _remaining.length - 1; _i > 0; _i--) {
      var _j = Math.floor(Math.random() * (_i + 1));
      var _t = _remaining[_i]; _remaining[_i] = _remaining[_j]; _remaining[_j] = _t;
    }
    queue = queue.slice(0, _ci + 1).concat(_remaining);
  }
  currentTime = 0;
  duration = song.dur || 0;
  if (song.url) {
    isPlaying = true;
    initAudioCtx();
    if (_gainMain && crossfadeDur > 0 && _audioCtx) {
      _gainMain.gain.cancelScheduledValues(_audioCtx.currentTime);
      _gainMain.gain.setValueAtTime(0, _audioCtx.currentTime);
      _gainMain.gain.linearRampToValueAtTime(1, _audioCtx.currentTime + crossfadeDur);
    }
    audio.src = song.url;
    audio.playbackRate = playbackRate;
    audio.play().catch(function() { isPlaying = false; render(); });
    updateMediaSession();
  } else {
    isPlaying = false;
    showToast('Re-import folder to play');
  }
  if (showNowPlaying) renderNowPlaying();
  else render();
}

// Update every play/pause indicator in the UI to match isPlaying.
// Call this any time isPlaying changes — togglePlay, audio events, sleep timer, etc.
function syncPlaybackUI() {
  updateMiniPlayer();
  if (showNowPlaying) {
    var btn = document.getElementById('npPlay');
    if (btn) {
      btn.innerHTML = isPlaying ? '&#10074;&#10074;' : '&#9654;';
      btn.classList.toggle('is-playing', isPlaying);
    }
  }
  document.querySelectorAll('.eq-bars').forEach(function(el) {
    el.classList.toggle('paused', !isPlaying);
  });
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  // Keep native notification in sync with play/pause state
  updateMediaSession();
}

function togglePlay() {
  if (!currentSong || !currentSong.url) return;
  _haptic(10);
  if (isPlaying) {
    _ourPause = true;
    audio.pause();
    // _ourPause cleared in the pause event handler after it fires
    isPlaying = false;
  } else {
    _systemPaused = false;
    initAudioCtx();
    isPlaying = true;
    audio.play().catch(function() { isPlaying = false; syncPlaybackUI(); });
  }
  syncPlaybackUI();
}

function handleNext() {
  if (!currentSong || queue.length === 0) return;
  _haptic([14, 25, 14]);
  if (repeatMode === 'one') { audio.currentTime = 0; audio.play().catch(function() { isPlaying = false; syncPlaybackUI(); }); return; }
  var idx = queue.findIndex(function(s) { return s.id === currentSong.id; });
  var nextIdx = idx >= queue.length - 1 ? 0 : idx + 1;
  if (idx >= queue.length - 1 && repeatMode === 'off') { isPlaying = false; render(); return; }
  var song = queue[nextIdx];
  // Gapless: if next song is already buffered, swap src immediately
  if (!isShuffled && preloadedSong && preloadedSong.id === song.id && preloadedUrl) {
    var savedUrl = preloadedUrl;
    preloadedUrl = '';
    preloadedSong = null;
    currentSong = song;
    currentTime = 0;
    duration = song.dur || 0;
    isPlaying = true;
    _miniLastSongId = '';
    if (_gainMain && crossfadeDur > 0 && _audioCtx) {
      _gainMain.gain.cancelScheduledValues(_audioCtx.currentTime);
      _gainMain.gain.setValueAtTime(0, _audioCtx.currentTime);
      _gainMain.gain.linearRampToValueAtTime(1, _audioCtx.currentTime + crossfadeDur);
    }
    audio.src = savedUrl;
    audio.playbackRate = playbackRate;
    audio.play().catch(function() {});
    loadCurrentSongArt(song);
    updateMediaSession();
    if (showNowPlaying) renderNowPlaying();
    else render();
  } else {
    playSong(song, queue);
  }
}

function handlePrev() {
  if (!currentSong || queue.length === 0) return;
  _haptic([14, 25, 14]);
  if (currentTime > 3) { audio.currentTime = 0; return; }
  preloadedUrl = '';
  preloadedSong = null;
  _historyJump = true; // don't push current song when going backwards
  if (_playHistory.length > 0) {
    var prevId = _playHistory.pop();
    var prevSong = songMap[prevId] || queue.find(function(s) { return s.id === prevId; });
    if (prevSong) { playSong(prevSong, queue); return; }
  }
  // Fallback when history is empty: go to previous index in queue
  var idx = queue.findIndex(function(s) { return s.id === currentSong.id; });
  playSong(queue[idx <= 0 ? queue.length - 1 : idx - 1], queue);
}

audio.addEventListener('timeupdate', function() {
  currentTime = audio.currentTime;
  // Trigger gapless preload 8 seconds before track ends
  if (duration > 0 && currentTime > 0 && (duration - currentTime) < 8) maybePreloadNext();
  if (showNowPlaying) {
    if (_npSeekEl && !_npSeeking) { _npSeekEl.value = currentTime; }
    if (_npFillEl && duration > 0 && !_npSeeking) _npFillEl.style.width = (currentTime / duration * 100).toFixed(1) + '%';
    if (_npTime0El) _npTime0El.textContent = fmtTime(currentTime);
    updateSyncedLyrics(currentTime);
  }
  // Update lock screen position state every ~2 seconds
  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && duration > 0 && Math.floor(currentTime) % 2 === 0) {
    try { navigator.mediaSession.setPositionState({ duration: duration, playbackRate: playbackRate, position: Math.min(currentTime, duration) }); } catch(e) {}
  }
  updateMiniPlayer();
});
audio.addEventListener('loadedmetadata', function() {
  duration = audio.duration;
  if (_npSeekEl) _npSeekEl.max = duration || 0;
  if (currentSong && (!currentSong.dur || currentSong.dur < 1)) {
    currentSong.dur = audio.duration;
    saveLibraryLater();
  }
});
audio.addEventListener('ended', handleNext);

// Sync UI when the OS changes playback state externally — phone call interruption,
// Bluetooth disconnect, headphone unplug, media-session notification button, etc.
audio.addEventListener('play', function() {
  if (isPlaying) return; // already handled by our own code
  _systemPaused = false;
  isPlaying = true;
  syncPlaybackUI();
});
audio.addEventListener('pause', function() {
  var wasOurs = _ourPause;
  _ourPause = false; // always clear first — was never cleared when user paused (isPlaying=false already)
  if (!isPlaying) return; // user-pause: togglePlay already set isPlaying=false, nothing left to do
  if (!wasOurs) _systemPaused = true; // OS paused us (call, BT, etc.)
  isPlaying = false;
  syncPlaybackUI();
});
audio.addEventListener('error', function() {
  if (!currentSong) return;
  isPlaying = false;
  syncPlaybackUI();
  showToast('Cannot play this file — tap ⋮ to delete or edit it', 4000);
});

// ─── File Import ───

function handleFileImport(files) {
  var hadSongsBefore = songs.length > 0;
  var newSongs = [];
  var matched = 0;
  var added = 0;

  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var ext = file.name.split('.').pop().toLowerCase();
    if (['mp3','m4a','flac','ogg','wav','aac','wma','opus','mp4','webm'].indexOf(ext) === -1) continue;

    var url = URL.createObjectURL(file);
    var existing = songs.find(function(s) { return s.fn === file.name; });

    if (existing) {
      if (existing.url && existing.url.startsWith('blob:')) URL.revokeObjectURL(existing.url);
      existing.url = url;
      matched++;
    } else {
      var parsed = parseFileName(file.name);
      newSongs.push({
        id: genId(), fn: file.name, url: url,
        title: parsed.title, artist: parsed.artist, album: 'Unknown Album',
        year: '', genre: '', track: 0, art: '', lyrics: '', syncedLyrics: '', dur: 0,
        tagging: false, fav: false, type: '', feat: parsed.feat
      });
      added++;
    }
  }

  if (newSongs.length > 0) songs = songs.concat(newSongs);

  newSongs.forEach(function(s) {
    songMap[s.id] = s; // keep map current before debounced save fires
    var tempAudio = new Audio();
    tempAudio.preload = 'metadata';
    tempAudio.src = s.url;
    tempAudio.onloadedmetadata = function() {
      s.dur = tempAudio.duration;
      saveLibraryLater();
      tempAudio.src = '';
      tempAudio.onloadedmetadata = null;
    };
  });

  var msg = '';
  if (added > 0 && matched > 0) msg = added + ' new + ' + matched + ' reconnected';
  else if (added > 0) msg = 'Found ' + added + ' songs!';
  else if (matched > 0) msg = matched + ' songs ready to play!';
  else if (files.length > 0) msg = 'No audio files found (' + files.length + ' files checked)';
  if (msg) showToast(msg, 3000);

  saveLibrary();
  render();

  if (added > 0 && !hadSongsBefore) {
    setTimeout(function() { showScanMorePrompt(songs.length); }, 1500);
  }

}

// ─── Tag Editor AI Fill ───

// Resize album art to at most maxPx × maxPx JPEG before sending — avoids 10–15 MB
// base64 blobs that choke the WebView on low-RAM devices like the Galaxy A16.
function _resizeArtToBase64(dataUrl, maxPx, quality) {
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var w = img.width, h = img.height;
      var scale = Math.min(1, maxPx / Math.max(w, h, 1));
      var tw = Math.max(1, Math.round(w * scale));
      var th = Math.max(1, Math.round(h * scale));
      try {
        var canvas = document.createElement('canvas');
        canvas.width = tw; canvas.height = th;
        canvas.getContext('2d').drawImage(img, 0, 0, tw, th);
        var out = canvas.toDataURL('image/jpeg', quality);
        resolve(out.replace(/^data:[^;]+;base64,/, '') || null);
      } catch(e) { resolve(null); }
    };
    img.onerror = function() { resolve(null); };
    img.src = dataUrl;
  });
}

// Query MusicBrainz (free, no key) for album metadata — year, albumArtist, releaseType, genre.
// Returns a partial result object (only populated fields) or null on failure / no match.
function lookupMusicBrainz(song) {
  var artist = (song.artist || '').replace(/^unknown( artist)?$/i, '').trim();
  var album  = (song.album  || '').replace(/^unknown album$/i,     '').trim();
  if (!artist && !album) return Promise.resolve(null);

  var parts = [];
  if (artist) parts.push('artist:"' + artist.replace(/"/g, '') + '"');
  if (album)  parts.push('release:"' + album.replace(/"/g, '')  + '"');

  var url = 'https://musicbrainz.org/ws/2/release?query='
          + encodeURIComponent(parts.join(' AND '))
          + '&fmt=json&limit=3&inc=release-groups+artist-credits';

  var ctrl = new AbortController();
  var tid  = setTimeout(function() { ctrl.abort(); }, 12000);

  return fetch(url, {
    signal:  ctrl.signal,
    headers: { 'User-Agent': 'MyMusic/2.0 (music-player-tagger)' }
  }).then(function(res) {
    clearTimeout(tid);
    if (!res.ok) return null;
    return res.json();
  }).then(function(data) {
    if (!data || !data.releases || !data.releases.length) return null;

    // Pick the highest-confidence result; skip results with score < 75 to avoid
    // applying wrong metadata from an unrelated release.
    var rel = null;
    for (var ri = 0; ri < data.releases.length; ri++) {
      if ((data.releases[ri].score || 100) >= 75) { rel = data.releases[ri]; break; }
    }
    if (!rel) return null;

    var result = {};

    // Album name: use the real title from MusicBrainz database (no underscores, proper casing)
    if (rel.title) result.album = rel.title;

    // Year: prefer release-group's first-release-date (original worldwide issue) over
    // rel.date (which may be a remaster/reissue year, not the original release year).
    var rg0 = rel['release-group'];
    var yearStr = (rg0 && rg0['first-release-date']) ? rg0['first-release-date'] : (rel.date || '');
    if (yearStr) {
      var y = (yearStr + '').replace(/^(\d{4}).*/, '$1');
      if (/^\d{4}$/.test(y) && y !== '1970') result.year = y;
    }

    // Album artist from artist-credit array; capture artist MBID for genre fallback
    var ac = rel['artist-credit'];
    var artistMbid = '';
    if (ac && ac.length) {
      result.albumArtist = ac.map(function(c) {
        return (c.artist ? c.artist.name : '') + (c.joinphrase || '');
      }).join('').trim();
      if (ac[0] && ac[0].artist) artistMbid = ac[0].artist.id || '';
    }

    // Release type + genre from release-group
    var rg = rg0;
    if (rg) {
      var pt = (rg['primary-type'] || '').toLowerCase();
      if      (pt === 'album')  result.releaseType = 'Album';
      else if (pt === 'single') result.releaseType = 'Single';
      else if (pt === 'ep')     result.releaseType = 'EP';

      // MusicBrainz marks mixtapes as a secondary type
      var sec = (rg['secondary-types'] || []).map(function(s) { return (s + '').toLowerCase(); });
      if (sec.indexOf('mixtape/street') !== -1 || sec.indexOf('mixtape') !== -1) {
        result.releaseType = 'Mixtape';
      }

      // Genre from crowd-sourced tags (sorted by vote count)
      var tags = (rg.tags || []).slice().sort(function(a, b) { return (b.count||0) - (a.count||0); });
      if (tags.length && tags[0].name) {
        var g = tags[0].name;
        result.genre = g.charAt(0).toUpperCase() + g.slice(1);
      }
    }

    // Genre fallback: artist-level tags (almost always populated even when release-group isn't)
    if (!result.genre && artistMbid) {
      return fetch('https://musicbrainz.org/ws/2/artist/' + artistMbid + '?inc=tags&fmt=json', {
        headers: { 'User-Agent': 'MyMusic/2.0 (music-player-tagger)' }
      }).then(function(r2) {
        if (!r2.ok) return Object.keys(result).length ? result : null;
        return r2.json().then(function(ad) {
          var atags = (ad.tags || []).slice().sort(function(a,b) { return (b.count||0) - (a.count||0); });
          if (atags.length && atags[0].name) {
            var ag = atags[0].name;
            result.genre = ag.charAt(0).toUpperCase() + ag.slice(1);
          }
          return Object.keys(result).length ? result : null;
        });
      }).catch(function() { return Object.keys(result).length ? result : null; });
    }

    return Object.keys(result).length ? result : null;
  }).catch(function() { clearTimeout(tid); return null; });
}

// Primary AI Fill: MusicBrainz first (free, always), Gemini fills remaining gaps if key set.
function aiFill(song) {
  return lookupMusicBrainz(song).then(function(mb) {
    if (!apiKey) return mb || {};
    // Ask Gemini to fill whatever MusicBrainz didn't cover
    return callGeminiTag(song).then(function(gem) {
      // MusicBrainz wins on overlapping fields (database > AI guess)
      var merged = {};
      if (gem) Object.keys(gem).forEach(function(k) { if (gem[k]) merged[k] = gem[k]; });
      if (mb)  Object.keys(mb).forEach(function(k)  { if (mb[k])  merged[k] = mb[k];  });
      return merged;
    }).catch(function() { return mb || {}; });
  });
}

// Try each model in _GEMINI_MODELS order; cache the first one that responds successfully.
function _geminiRequest(prompt, modelIdx, _retried) {
  if (!apiKey) return Promise.resolve(null);
  modelIdx = modelIdx || 0;
  if (modelIdx >= _GEMINI_MODELS.length) return Promise.reject(new Error('No working Gemini model found'));
  var model = _geminiModel || _GEMINI_MODELS[modelIdx];
  var url = _GEMINI_BASE + model + ':generateContent?key=' + encodeURIComponent(apiKey);
  var ctrl = new AbortController();
  var tid = setTimeout(function() { ctrl.abort(); }, 60000);
  return fetch(url, {
    method: 'POST',
    signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  }).then(function(res) {
    clearTimeout(tid);
    return res.text().then(function(raw) {
      var data = null; try { data = JSON.parse(raw); } catch(e) {}
      // Deprecation or not-found — try next model
      if (res.status === 404 || (res.status === 400 && raw.indexOf('deprecated') !== -1) ||
          (raw.indexOf('no longer available') !== -1) || (raw.indexOf('Please update') !== -1)) {
        if (!_geminiModel) return _geminiRequest(prompt, modelIdx + 1, _retried);
      }
      if (res.status === 429) {
        if (_retried) {
          var retryMsg = (data && data.error && data.error.message) ? data.error.message : 'Daily quota reached — get a fresh key at aistudio.google.com';
          return Promise.reject(new Error('HTTP 429: ' + retryMsg));
        }
        return new Promise(function(resolve) { setTimeout(resolve, 22000); })
          .then(function() { return _geminiRequest(prompt, modelIdx, true); });
      }
      if (res.status >= 400) {
        var errMsg = (data && data.error && data.error.message) ? data.error.message : raw.substring(0, 200);
        return Promise.reject(new Error('HTTP ' + res.status + ': ' + errMsg));
      }
      if (!data || !data.candidates || !data.candidates[0]) {
        var blocked = data && data.promptFeedback && data.promptFeedback.blockReason;
        return Promise.reject(new Error(blocked ? ('Blocked: ' + blocked) : 'No response candidates'));
      }
      var cand = data.candidates[0];
      var part = cand.content && cand.content.parts && cand.content.parts[0];
      if (!part || !part.text) return Promise.reject(new Error('Empty response (finish: ' + (cand.finishReason || '?') + ')'));
      // This model works — cache it so we skip the discovery next time
      if (!_geminiModel) { _geminiModel = model; localStorage.setItem('gemini_model', model); }
      try { return JSON.parse(part.text); }
      catch(e) { return Promise.reject(new Error('Bad JSON: ' + part.text.substring(0, 80))); }
    });
  }).catch(function(err) {
    clearTimeout(tid);
    if (err && err.name === 'AbortError') return Promise.reject(new Error('Timed out after 60s — check internet connection'));
    if (err && err.name === 'TypeError') return Promise.reject(new Error('Network error — can\'t reach Gemini. Is mobile data/WiFi on?'));
    return Promise.reject(err);
  });
}

function callGeminiTag(song, _retried) {
  if (!apiKey) return Promise.resolve({});
  var ctx = '';
  if (song.title  && !/^unknown/i.test(song.title))  ctx += 'Title: '  + song.title  + '\n';
  if (song.artist && !/^unknown/i.test(song.artist)) ctx += 'Artist: ' + song.artist + '\n';
  if (song.album  && !/^unknown/i.test(song.album))  ctx += 'Album: '  + song.album  + '\n';
  // 1970 = Unix epoch / corrupt ID3 date — treat as missing
  if (song.year && String(song.year).trim() !== '1970') ctx += 'Year: ' + song.year + '\n';
  // Genre intentionally omitted from context — let Gemini determine it fresh from title/artist/album
  if (song.track) ctx += 'Track: ' + song.track + '\n';

  var prompt = _GEMINI_EXPERTISE
    + (ctx ? 'Known file tags (may be incomplete or wrong):\n' + ctx + '\n' : '')
    + 'Filename: ' + (song.fn || '') + '\n\n'
    + _GEMINI_TAG_RULES
    + '\nReturn ONLY a JSON object with exactly these keys — no markdown, no explanation:\n'
    + '{"title":"","artist":"","album":"","albumArtist":"","trackNumber":"","year":"","genre":"","releaseType":"","featuredArtists":""}';

  return _geminiRequest(prompt);
}

// ─── Edit Modals ───

function openSongEditModal(songId) {
  var song = songMap[songId];
  if (!song) return;
  var modal = document.getElementById('editModal');
  var overlay = document.getElementById('editOverlay');
  var isNat = typeof NativeBridge !== 'undefined' && NativeBridge.isNative();

  // Art fallback
  var g = getGrad(song.album || song.title || '');
  var init = (song.album || song.title || '?').split(' ').map(function(w) { return w[0] || ''; }).join('').substring(0, 2).toUpperCase() || '?';

  // Build release-type chips outside the HTML string to avoid leading-+ syntax error
  var typeChipsHtml = ['Album','Mixtape','EP','Single'].map(function(t) {
    return '<button class="te-chip' + ((song.type || 'Album') === t ? ' active' : '') + '" data-type="' + t + '">' + t + '</button>';
  }).join('');
  var artSrc = isNat
    ? (song.art && (song.art.startsWith('http://localhost') || song.art.startsWith('data:')) ? song.art : '')
    : (song.art || '');

  // Full-screen mode: add tag-editor class, hide the dim overlay
  modal.classList.add('tag-editor');
  modal.classList.remove('hidden');
  overlay.classList.add('hidden');

  modal.innerHTML =
    '<div class="te-header">'
  +   '<button class="te-ai-btn" id="teAiBtn">&#10024; AI Fill</button>'
  +   '<span class="te-title">Tag editor</span>'
  +   '<button class="te-close-btn" id="teClose">&times;</button>'
  + '</div>'
  + '<div class="te-body">'
  +   '<div class="te-art-section">'
  +     '<div class="te-art-wrap" id="teArtWrap">'
  +       '<div class="te-art-bg" style="background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ')">' + escHtml(init) + '</div>'
  +       (artSrc ? '<img class="te-art-img" id="teArtImg" src="' + escHtml(artSrc) + '" onerror="this.style.display=\'none\'">' : '')
  +       '<label class="te-art-pencil" for="teArtFile" title="Change art">&#9998;</label>'
  +     '</div>'
  +     '<input type="file" id="teArtFile" accept="image/*" style="display:none">'
  +   '</div>'
  +   '<div class="te-fields">'
  +     '<div class="te-field"><div class="te-label">Title</div>'
  +       '<input class="te-input" id="teTitle" value="' + escHtml(song.title) + '">'
  +       '<div class="te-ai-hint" id="teTitleHint"></div></div>'
  +     '<div class="te-field"><div class="te-label">Artist</div>'
  +       '<input class="te-input" id="teArtist" value="' + escHtml(song.artist) + '">'
  +       '<div class="te-ai-hint" id="teArtistHint"></div></div>'
  +     '<div class="te-field"><div class="te-label">Album</div>'
  +       '<input class="te-input" id="teAlbum" value="' + escHtml(song.album) + '">'
  +       '<div class="te-ai-hint" id="teAlbumHint"></div></div>'
  +     '<div class="te-field"><div class="te-label">Album Artist</div>'
  +       '<input class="te-input" id="teAlbumArtist" value="' + escHtml(song.albumArtist || '') + '">'
  +       '<div class="te-ai-hint" id="teAlbumArtistHint"></div></div>'
  +     '<div class="te-row">'
  +       '<div class="te-field"><div class="te-label">Year</div>'
  +         '<input class="te-input" id="teYear" value="' + escHtml(song.year || '') + '" placeholder="2024">'
  +         '<div class="te-ai-hint" id="teYearHint"></div></div>'
  +       '<div class="te-field"><div class="te-label">Genre</div>'
  +         '<input class="te-input" id="teGenre" value="' + escHtml(song.genre || '') + '" placeholder="Hip-Hop">'
  +         '<div class="te-ai-hint" id="teGenreHint"></div></div>'
  +     '</div>'
  +     '<div class="te-row">'
  +       '<div class="te-field"><div class="te-label">Track #</div>'
  +         '<input class="te-input" id="teTrack" type="number" value="' + (song.track || '') + '" placeholder="1" min="1">'
  +         '<div class="te-ai-hint" id="teTrackHint"></div></div>'
  +       '<div class="te-field"><div class="te-label">Featured</div>'
  +         '<input class="te-input" id="teFeat" value="' + escHtml(song.feat || '') + '" placeholder="Artist name">'
  +         '<div class="te-ai-hint" id="teFeatHint"></div></div>'
  +     '</div>'
  +     '<div class="te-field"><div class="te-label">Release Type</div>'
  +       '<div class="te-type-row">' + typeChipsHtml + '</div>'
  +     '</div>'
  +     '<div class="te-field"><div class="te-label">Lyrics</div>'
  +       '<textarea class="te-lyrics" id="teLyrics" placeholder="Paste lyrics here (supports [mm:ss.xx] LRC format)…" rows="5">'
  +       escHtml(song.syncedLyrics || song.lyrics || '') + '</textarea></div>'
  +   '</div>'
  + '</div>'
  + '<div class="te-footer">'
  +   '<button class="te-btn-cancel" id="teCancelBtn">Cancel</button>'
  +   '<button class="te-btn-delete" id="teDeleteBtn" style="background:#c0392b;color:#fff;border:none;border-radius:10px;padding:10px 18px;font-size:15px;font-weight:600;cursor:pointer;">&#128465; Delete</button>'
  +   '<button class="te-btn-save" id="teSaveBtn">Save</button>'
  + '</div>';

  var selectedType = song.type || 'Album';
  var pendingArt = null; // data: URL when user picks a replacement image

  // Release-type chips
  var activeChip = modal.querySelector('.te-chip[data-type="' + selectedType + '"]');
  if (activeChip) activeChip.classList.add('active');
  modal.querySelectorAll('.te-chip').forEach(function(btn) {
    btn.onclick = function() {
      if (activeChip) activeChip.classList.remove('active');
      selectedType = btn.dataset.type;
      btn.classList.add('active');
      activeChip = btn;
    };
  });

  // Art file picker
  document.getElementById('teArtFile').onchange = function(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      pendingArt = ev.target.result;
      var wrap = document.getElementById('teArtWrap');
      if (!wrap) return;
      var img = wrap.querySelector('.te-art-img');
      if (img) {
        img.style.display = '';
        img.src = pendingArt;
      } else {
        img = document.createElement('img');
        img.className = 'te-art-img';
        img.src = pendingArt;
        wrap.insertBefore(img, wrap.querySelector('.te-art-pencil'));
      }
    };
    reader.readAsDataURL(file);
  };

  document.getElementById('teClose').onclick = closeEditModal;
  document.getElementById('teCancelBtn').onclick = closeEditModal;
  document.getElementById('teDeleteBtn').onclick = function() {
    closeEditModal();
    deleteSongsFromDevice([song]);
  };

  function applyFormToSong() {
    song.title       = document.getElementById('teTitle').value.trim();
    song.artist      = document.getElementById('teArtist').value.trim();
    song.album       = document.getElementById('teAlbum').value.trim();
    song.albumArtist = document.getElementById('teAlbumArtist').value.trim();
    song.year        = document.getElementById('teYear').value.trim();
    song.genre       = document.getElementById('teGenre').value.trim();
    song.track       = parseInt(document.getElementById('teTrack').value) || 0;
    song.feat        = document.getElementById('teFeat').value.trim();
    song.type        = selectedType;
    if (pendingArt) song.art = pendingArt;
    var lyricsVal = document.getElementById('teLyrics').value.trim();
    if (lyricsVal && parseLRC(lyricsVal).length > 0) {
      song.syncedLyrics = lyricsVal;
      song.lyrics = '';
    } else {
      song.syncedLyrics = '';
      song.lyrics = lyricsVal;
    }
  }

  function finishSave() {
    selectedArtist = null;
    selectedAlbum  = null;
    closeEditModal();
    saveLibrary();
    render();
    showToast('Saved ✓');
    if (showNowPlaying && currentSong && currentSong.id === song.id) {
      currentSong = song;
      renderNowPlaying();
    }
  }

  document.getElementById('teSaveBtn').onclick = function() {
    applyFormToSong();
    saveEdit(song);
    finishSave();
    // On native, persist tags to the actual file immediately
    var isNat = typeof NativeBridge !== 'undefined' && NativeBridge.isNative();
    if (!isNat || !song.contentUri) return;
    // If user picked new art, write it; otherwise read the existing art from MediaStore
    var artPromise = (song.art && song.art.startsWith('data:'))
      ? Promise.resolve(song.art)
      : song.albumArtUri
        ? NativeBridge.readAlbumArt(song.albumArtUri, 500).catch(function() { return ''; })
        : Promise.resolve('');
    artPromise.then(function(artBase64) {
      return NativeBridge.writeFileTags({
        contentUri:   song.contentUri,
        title:        song.title        || '',
        artist:       song.artist       || '',
        album:        song.album        || '',
        year:         song.year         || '',
        genre:        song.genre        || '',
        albumArtist:  song.albumArtist  || '',
        track:        song.track        || 0,
        lyrics:       song.syncedLyrics || song.lyrics || '',
        artBase64:    artBase64         || '',
      });
    }).catch(function() {});  // file write is best-effort; in-app save already confirmed
  };

  if (apiKey) {
    var teAiBtn = document.getElementById('teAiBtn');
    if (teAiBtn) {
      teAiBtn.onclick = function() {
        teAiBtn.disabled = true; teAiBtn.textContent = 'Looking up…';
        aiFill(song).then(function(result) {
          teAiBtn.disabled = false; teAiBtn.innerHTML = '&#10004; Done';
          var filled = 0;
          [
            { id: 'teTitle',       val: String(result.title           || '').trim() },
            { id: 'teArtist',      val: String(result.artist          || '').trim() },
            { id: 'teAlbum',       val: cleanFilenameAlbum(String(result.album || '').trim()) },
            { id: 'teAlbumArtist', val: String(result.albumArtist     || '').trim() },
            { id: 'teYear',        val: String(result.year            || '').trim() },
            { id: 'teGenre',       val: String(result.genre           || '').trim() },
            { id: 'teFeat',        val: String(result.featuredArtists || '').trim() },
            { id: 'teTrack',       val: result.trackNumber ? String(result.trackNumber) : '' },
          ].forEach(function(f) {
            if (!f.val) return;
            var el = document.getElementById(f.id);
            if (!el) return;
            el.value = f.val;
            el.classList.add('te-ai-filled');
            setTimeout(function() { el.classList.remove('te-ai-filled'); }, 1200);
            filled++;
          });
          if (result.releaseType && ['Album','Mixtape','EP','Single'].indexOf(result.releaseType) !== -1) {
            selectedType = result.releaseType;
            modal.querySelectorAll('.te-chip').forEach(function(b) {
              b.classList.toggle('active', b.dataset.type === result.releaseType);
            });
          }
          if (filled > 0) {
            showToast('✓ ' + [result.year, result.genre, result.releaseType].filter(Boolean).join(' · '));
          } else {
            showToast('Already complete — nothing to fill', 3000);
          }
        }).catch(function(err) {
          teAiBtn.disabled = false; teAiBtn.innerHTML = '&#10024; AI Fill';
          showToast('Fill error: ' + (err && err.message ? err.message : String(err)), 5000);
        });
      };
    }
  }

}

function _pickArt(previewEl) {
  if (typeof NativeBridge === 'undefined' || !NativeBridge.isNative()) {
    showToast('Gallery picker requires the native app');
    return;
  }
  NativeBridge.pickAlbumArt().then(function(b64) {
    _pendingArtBase64 = b64;
    var el = previewEl || document.getElementById('editArtPreview') || document.getElementById('bEditArtPreview');
    if (el) el.innerHTML = '<img src="' + b64 + '" style="width:100%;height:100%;object-fit:cover;">';
  }).catch(function() {}); // user cancelled — no action
}

function openEditModal(albumName, artistName) {
  _pendingArtBase64 = '';
  var albumSongs = getAlbumSongs(albumName, artistName);
  var first = albumSongs[0] || {};
  var modal = document.getElementById('editModal');
  var overlay = document.getElementById('editOverlay');

  // Don't pre-fill "Unknown Artist" — leave blank so the guard `if (newArtist)` in the
  // save handler won't overwrite correctly-tagged songs when the user saves without typing.
  var editArtistVal = (artistName && artistName !== 'Unknown Artist') ? artistName : '';

  modal.innerHTML = '<div class="edit-modal-header"><div><h3>Edit Album</h3>'
    + '<p>Changes apply to all ' + albumSongs.length + ' songs</p></div>'
    + '<button id="editClose">&times;</button></div>'
    + '<div class="edit-modal-body">'
    + '<div style="display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-pack:center;justify-content:center;margin-bottom:16px;">'
    + '<div style="position:relative;width:120px;height:120px;">'
    + '<div id="editArtPreview" style="width:120px;height:120px;border-radius:14px;overflow:hidden;background:var(--bg-secondary);display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;font-size:40px;">&#127925;</div>'
    + '<button id="editArtPenBtn" style="position:absolute;bottom:-6px;right:-6px;width:34px;height:34px;border-radius:50%;background:var(--accent);border:2px solid var(--bg);color:#fff;font-size:15px;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.4);">&#9998;</button>'
    + '</div></div>'
    + '<div class="edit-field"><label>Artist</label><input id="editArtist" value="' + escHtml(editArtistVal) + '" placeholder="e.g. Eminem"></div>'
    + '<div class="edit-field"><label>Album Artist</label><input id="editAlbumArtist" value="' + escHtml(first.albumArtist || '') + '" placeholder="e.g. Various Artists"></div>'
    + '<div class="edit-field"><label>Album / Mixtape Name</label><input id="editAlbum" value="' + escHtml(albumName) + '"></div>'
    + '<div class="edit-row">'
    + '<div class="edit-field"><label>Year</label><input id="editYear" value="' + escHtml(first.year || '') + '" placeholder="2024"></div>'
    + '<div class="edit-field"><label>Genre</label><input id="editGenre" value="' + escHtml(first.genre || '') + '" placeholder="Hip-Hop"></div>'
    + '</div>'
    + '<div class="edit-field"><label>Release Type</label><div class="type-buttons">'
    + ['Album','Mixtape','EP','Single'].map(function(t) {
        var cls = (first.type || 'Album') === t ? ' active-' + t.toLowerCase() : '';
        return '<button class="type-btn' + cls + '" data-type="' + t + '">' + t + '</button>';
      }).join('')
    + '</div></div>'
    + '</div>'
    + '<div class="edit-modal-footer">'
    + '<button class="btn-cancel" id="editCancelBtn">Cancel</button>'
    + '<button class="te-ai-btn" id="editAiBtn">&#10024; AI Fill</button>'
    + '<button class="btn-save" id="editSaveBtn">&#10003; Save All</button>'
    + '</div>';

  modal.classList.remove('hidden');
  overlay.classList.remove('hidden');

  var selectedType = first.type || 'Album';
  var activeTypeBtn = modal.querySelector('.type-btn[data-type="' + selectedType + '"]');
  if (activeTypeBtn) activeTypeBtn.className = 'type-btn active-' + selectedType.toLowerCase();
  modal.querySelectorAll('.type-btn').forEach(function(btn) {
    btn.onclick = function() {
      if (activeTypeBtn) activeTypeBtn.className = 'type-btn';
      selectedType = btn.dataset.type;
      btn.className = 'type-btn active-' + selectedType.toLowerCase();
      activeTypeBtn = btn;
    };
  });

  document.getElementById('editClose').onclick = closeEditModal;
  document.getElementById('editCancelBtn').onclick = closeEditModal;
  overlay.onclick = closeEditModal;

  // Load existing album art into preview
  var artPreview = document.getElementById('editArtPreview');
  if (artPreview && first.albumArtUri && typeof NativeBridge !== 'undefined' && NativeBridge.isNative()) {
    NativeBridge.readAlbumArt(first.albumArtUri, 300).then(function(b64) {
      var el = document.getElementById('editArtPreview');
      if (el && b64) el.innerHTML = '<img src="' + b64 + '" style="width:100%;height:100%;object-fit:cover;">';
    }).catch(function() {});
  } else if (artPreview && first.art && first.art.startsWith('data:')) {
    artPreview.innerHTML = '<img src="' + first.art + '" style="width:100%;height:100%;object-fit:cover;">';
  }

  document.getElementById('editArtPenBtn').onclick = function() {
    _pickArt(document.getElementById('editArtPreview'));
  };

  var editAiBtn = document.getElementById('editAiBtn');
  if (editAiBtn) {
    editAiBtn.onclick = function() {
      editAiBtn.disabled = true; editAiBtn.textContent = 'Looking up…';
      aiFill(first).then(function(r) {
        editAiBtn.disabled = false; editAiBtn.innerHTML = '&#10004; Done';
        var filled = 0;
        function fill(id, val) {
          if (!val) return;
          var el = document.getElementById(id);
          if (!el) return;
          var cur = el.value.trim();
          if (cur) {
            // Genre and album always overwrite — AI Fill is explicitly requested
            if (id === 'editGenre' || id === 'editAlbum') { /* fall through */ }
            else if (id === 'editYear' && cur === '1970') { /* overwrite 1970 placeholder */ }
            else return;
          }
          el.value = val; filled++;
        }
        fill('editArtist',      String(r.artist      || '').trim());
        fill('editAlbumArtist', String(r.albumArtist || '').trim());
        fill('editAlbum',       cleanFilenameAlbum(String(r.album || '').trim()));
        fill('editYear',        String(r.year        || '').trim());
        fill('editGenre',       String(r.genre       || '').trim());
        // Auto-populate albumArtist from artist when still blank
        var _aaEl = document.getElementById('editAlbumArtist');
        var _arEl = document.getElementById('editArtist');
        if (_aaEl && !_aaEl.value.trim() && _arEl && _arEl.value.trim()) {
          _aaEl.value = _arEl.value.trim(); filled++;
        }
        var rtype = String(r.releaseType || '').trim();
        if (rtype && ['Album','Mixtape','EP','Single'].indexOf(rtype) !== -1) {
          if (activeTypeBtn) activeTypeBtn.className = 'type-btn';
          selectedType = rtype;
          activeTypeBtn = modal.querySelector('.type-btn[data-type="' + rtype + '"]');
          if (activeTypeBtn) { activeTypeBtn.className = 'type-btn active-' + rtype.toLowerCase(); filled++; }
        }
        if (filled > 0) {
          showToast('✓ ' + [r.year, r.genre, r.releaseType].filter(Boolean).join(' · '));
        } else {
          showToast('Already complete — nothing to fill', 3000);
        }
      }).catch(function(err) {
        editAiBtn.disabled = false; editAiBtn.innerHTML = '&#10024; AI Fill';
        showToast('Fill error: ' + (err && err.message ? err.message : String(err)), 5000);
      });
    };
  }

  document.getElementById('editSaveBtn').onclick = function() {
    var newArtist      = document.getElementById('editArtist').value.trim();
    var newAlbumArtist = document.getElementById('editAlbumArtist').value.trim();
    var newAlbum       = document.getElementById('editAlbum').value.trim();
    var newYear        = document.getElementById('editYear').value.trim();
    var newGenre       = document.getElementById('editGenre').value.trim();

    // albumSongs is already computed in the outer openEditModal scope — use it
    // directly so we update exactly the same songs that were shown in the dialog.
    albumSongs.forEach(function(s) {
      if (newArtist)      s.artist      = newArtist;
      s.albumArtist = newAlbumArtist;
      if (newAlbum)       s.album       = newAlbum;
      if (newYear)        s.year        = newYear;
      if (newGenre)       s.genre       = newGenre;
      s.type = selectedType;
      if (_pendingArtBase64) s.art = _pendingArtBase64;
    });
    saveEditsBatch(albumSongs);

    if (selectedAlbum) {
      selectedAlbum = { name: newAlbum || albumName, artist: newArtist || artistName };
    }
    var _artSnap = _pendingArtBase64; // snapshot before closeEditModal() clears it
    closeEditModal();
    saveLibrary();
    render();

    // On native, write tags to every song file in the album sequentially
    var isNat = typeof NativeBridge !== 'undefined' && NativeBridge.isNative();
    if (!isNat) return;

    var toWrite = albumSongs.filter(function(s) { return s.contentUri; });
    if (!toWrite.length) return;

    var done = 0;
    var failed = 0;

    function writeNext(i) {
      if (i >= toWrite.length) return;  // file write is best-effort; in-app save already confirmed
      var s = toWrite[i];
      var artPromise = _artSnap
        ? Promise.resolve(_artSnap)
        : (s.albumArtUri
          ? NativeBridge.readAlbumArt(s.albumArtUri, 500).catch(function() { return ''; })
          : Promise.resolve(s.art && s.art.startsWith('data:') ? s.art : ''));

      artPromise.then(function(artBase64) {
        return NativeBridge.writeFileTags({
          contentUri:  s.contentUri,
          title:       s.title,
          artist:      s.artist,
          album:       s.album,
          year:        s.year        || '',
          genre:       s.genre       || '',
          albumArtist: s.albumArtist || '',
          track:       s.track       || 0,
          lyrics:      s.syncedLyrics || s.lyrics || '',
          artBase64:   artBase64     || '',
        });
      }).then(function() {
        done++;
        writeNext(i + 1);
      }).catch(function() {
        failed++;
        writeNext(i + 1);
      });
    }
    writeNext(0);
  };
}

function openBulkEditModal(songArr) {
  _pendingArtBase64 = '';
  var modal = document.getElementById('editModal');
  var overlay = document.getElementById('editOverlay');

  modal.innerHTML = '<div class="edit-modal-header"><div><h3>&#9998; Edit ' + songArr.length + ' Songs</h3>'
    + '<p>Leave blank to keep each song\'s existing value</p></div>'
    + '<button id="bEditClose">&times;</button></div>'
    + '<div class="edit-modal-body">'
    + '<div style="display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-pack:center;justify-content:center;margin-bottom:16px;">'
    + '<div style="position:relative;width:120px;height:120px;">'
    + '<div id="bEditArtPreview" style="width:120px;height:120px;border-radius:14px;overflow:hidden;background:var(--bg-secondary);display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;font-size:40px;">&#127925;</div>'
    + '<button id="bEditArtPenBtn" style="position:absolute;bottom:-6px;right:-6px;width:34px;height:34px;border-radius:50%;background:var(--accent);border:2px solid var(--bg);color:#fff;font-size:15px;display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.4);">&#9998;</button>'
    + '</div></div>'
    + '<div class="edit-field"><label>Artist</label><input id="bEditArtist" placeholder="e.g. 2Pac"></div>'
    + '<div class="edit-field"><label>Album Artist</label><input id="bEditAlbumArtist" placeholder="e.g. 2Pac"></div>'
    + '<div class="edit-field"><label>Album</label><input id="bEditAlbum" placeholder="Album name"></div>'
    + '<div class="edit-row">'
    + '<div class="edit-field"><label>Year</label><input id="bEditYear" placeholder="2024" type="number"></div>'
    + '<div class="edit-field"><label>Genre</label><input id="bEditGenre" placeholder="Hip-Hop"></div>'
    + '</div></div>'
    + '<div class="edit-modal-footer">'
    + '<button class="btn-cancel" id="bEditCancel">Cancel</button>'
    + '<button class="btn-save" id="bEditSave">&#10003; Save ' + songArr.length + ' Songs</button>'
    + '</div>';

  modal.classList.remove('hidden');
  overlay.classList.remove('hidden');

  function closeModal() { _pendingArtBase64 = ''; modal.classList.add('hidden'); overlay.classList.add('hidden'); modal.innerHTML = ''; }
  document.getElementById('bEditClose').onclick = closeModal;
  document.getElementById('bEditCancel').onclick = closeModal;
  overlay.onclick = closeModal;

  document.getElementById('bEditArtPenBtn').onclick = function() {
    _pickArt(document.getElementById('bEditArtPreview'));
  };

  document.getElementById('bEditSave').onclick = function() {
    var newArtist      = document.getElementById('bEditArtist').value.trim();
    var newAlbumArtist = document.getElementById('bEditAlbumArtist').value.trim();
    var newAlbum       = document.getElementById('bEditAlbum').value.trim();
    var newYear        = document.getElementById('bEditYear').value.trim();
    var newGenre       = document.getElementById('bEditGenre').value.trim();
    if (!newArtist && !newAlbumArtist && !newAlbum && !newYear && !newGenre && !_pendingArtBase64) {
      showToast('Fill in at least one field or pick album art'); return;
    }
    songArr.forEach(function(s) {
      if (newArtist)      s.artist      = newArtist;
      if (newAlbumArtist) s.albumArtist = newAlbumArtist;
      if (newAlbum)       s.album       = newAlbum;
      if (newYear)        s.year        = newYear;
      if (newGenre)       s.genre       = newGenre;
      if (_pendingArtBase64) s.art = _pendingArtBase64;
    });
    saveEditsBatch(songArr);
    var _artSnap = _pendingArtBase64; // snapshot before closeModal() clears it
    closeModal();
    // Write file tags on native sequentially (fire-and-forget after modal close)
    var isNat = typeof NativeBridge !== 'undefined' && NativeBridge.isNative();
    if (isNat) {
      var toWrite = songArr.filter(function(s) { return s.contentUri; });
      (function writeNext(i) {
        if (i >= toWrite.length) return;
        var s = toWrite[i];
        NativeBridge.writeFileTags({
          contentUri: s.contentUri, title: s.title,
          artist: s.artist, album: s.album, year: s.year || '',
          genre: s.genre || '', albumArtist: s.albumArtist || '',
          track: s.track || 0, lyrics: s.syncedLyrics || s.lyrics || '',
          artBase64: _artSnap || '',
        }).then(function() { writeNext(i + 1); }).catch(function() { writeNext(i + 1); });
      })(0);
    }
    saveLibrary();
    render();
    showToast('Updated ' + songArr.length + ' song' + (songArr.length !== 1 ? 's' : ''));
  };
}

function closeEditModal() {
  _pendingArtBase64 = '';
  var m = document.getElementById('editModal');
  m.classList.add('hidden');
  m.classList.remove('tag-editor');
  document.getElementById('editOverlay').classList.add('hidden');
  // Defensive cleanup — close any lingering overlays so they can't block the tab bar
  var bs = document.getElementById('bottomSheet');
  var bsOv = document.getElementById('bsOverlay');
  if (bs)   bs.classList.add('hidden');
  if (bsOv) bsOv.classList.add('hidden');
  var om = document.getElementById('overflowMenu');
  if (om) om.remove();
}

// ─── Drawer ───

function toggleDrawer(show) {
  document.getElementById('drawer').classList.toggle('hidden', !show);
  document.getElementById('drawerOverlay').classList.toggle('hidden', !show);
}

// ─── Queue Panel ───

function openQueuePanel() {
  var panel = document.getElementById('queuePanel');
  // Replace listEl with a fresh clone to drop any accumulated event listeners
  var oldList = document.getElementById('queueList');
  var listEl = oldList.cloneNode(false);
  oldList.parentNode.replaceChild(listEl, oldList);
  if (!queue || !queue.length) { showToast('Queue is empty'); return; }

  var curIdx = currentSong ? queue.findIndex(function(s) { return s.id === currentSong.id; }) : -1;

  function renderQueueRows() {
    var rows = [];
    queue.forEach(function(s, i) {
      var isCurrent = i === curIdx;
      rows.push('<div class="queue-row' + (isCurrent ? ' queue-now' : '') + '" data-queue-idx="' + i + '">'
        + '<div class="queue-drag-handle" data-drag-handle>&#8942;&#8942;</div>'
        + '<div class="queue-row-num">' + (isCurrent ? '&#9654;' : (i + 1)) + '</div>'
        + '<div class="queue-row-art art-lazy" data-lazy-uri="' + escHtml(s.albumArtUri || '') + '">'
        + '<div style="width:100%;height:100%;background:linear-gradient(135deg,#2a3040,#1a1f2e);display:flex;align-items:center;justify-content:center;font-size:16px;">&#9835;</div>'
        + '</div>'
        + '<div class="queue-row-info">'
        + '<div class="queue-row-title">' + escHtml(s.title) + '</div>'
        + '<div class="queue-row-artist">' + escHtml(s.artist) + '</div>'
        + '</div>'
        + '<div class="queue-row-dur">' + fmtTime(s.dur || 0) + '</div>'
        + (isCurrent ? '' : '<button class="queue-remove-btn" data-remove-idx="' + i + '" title="Remove">&#215;</button>')
        + '</div>');
    });
    listEl.innerHTML = rows.join('');
    initLazyArt(listEl);
    // Bind remove buttons
    listEl.querySelectorAll('.queue-remove-btn').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var removeIdx = parseInt(btn.dataset.removeIdx);
        if (!isNaN(removeIdx) && removeIdx !== curIdx) {
          queue.splice(removeIdx, 1);
          curIdx = currentSong ? queue.findIndex(function(s) { return s.id === currentSong.id; }) : -1;
          renderQueueRows();
        }
      };
    });
  }

  renderQueueRows();

  listEl.onclick = function(e) {
    if (e.target.closest('[data-drag-handle]')) return;
    var row = e.target.closest('[data-queue-idx]');
    if (!row) return;
    var idx = parseInt(row.dataset.queueIdx);
    if (!isNaN(idx) && queue[idx]) {
      closeQueuePanel();
      playSong(queue[idx], queue);
    }
  };

  // Touch drag-to-reorder
  var _dragIdx = -1, _dragStartY = 0, _dragEl = null, _lastOverIdx = -1;
  listEl.addEventListener('touchstart', function(e) {
    var handle = e.target.closest('[data-drag-handle]');
    if (!handle) return;
    var row = handle.closest('[data-queue-idx]');
    if (!row) return;
    _dragIdx = parseInt(row.dataset.queueIdx);
    _dragStartY = e.touches[0].clientY;
    _dragEl = row;
    row.classList.add('dragging');
  }, { passive: true });

  listEl.addEventListener('touchmove', function(e) {
    if (_dragIdx < 0 || !_dragEl) return;
    e.preventDefault();
    var y = e.touches[0].clientY;
    var rows = listEl.querySelectorAll('[data-queue-idx]');
    var overIdx = -1;
    rows.forEach(function(r) {
      var rect = r.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) overIdx = parseInt(r.dataset.queueIdx);
    });
    if (overIdx !== -1 && overIdx !== _lastOverIdx) {
      _lastOverIdx = overIdx;
      listEl.querySelectorAll('.drag-over').forEach(function(r) { r.classList.remove('drag-over'); });
      if (overIdx !== _dragIdx) {
        var overEl = listEl.querySelector('[data-queue-idx="' + overIdx + '"]');
        if (overEl) overEl.classList.add('drag-over');
      }
    }
  }, { passive: false });

  listEl.addEventListener('touchend', function() {
    if (_dragIdx < 0) return;
    if (_lastOverIdx !== -1 && _lastOverIdx !== _dragIdx) {
      var moved = queue.splice(_dragIdx, 1)[0];
      var insertAt = _lastOverIdx > _dragIdx ? _lastOverIdx - 1 : _lastOverIdx;
      queue.splice(insertAt, 0, moved);
      curIdx = currentSong ? queue.findIndex(function(s) { return s.id === currentSong.id; }) : -1;
      renderQueueRows();
    } else if (_dragEl) {
      _dragEl.classList.remove('dragging');
      listEl.querySelectorAll('.drag-over').forEach(function(r) { r.classList.remove('drag-over'); });
    }
    _dragIdx = -1; _dragEl = null; _lastOverIdx = -1;
  }, { passive: true });

  panel.classList.remove('hidden');
  if (curIdx > 2) {
    setTimeout(function() {
      var currentRow = listEl.querySelector('.queue-now');
      if (currentRow) currentRow.scrollIntoView({ block: 'center' });
    }, 80);
  }
}

function closeQueuePanel() {
  document.getElementById('queuePanel').classList.add('hidden');
}

document.getElementById('queueCloseBtn').onclick = closeQueuePanel;
document.getElementById('queueClearBtn').onclick = function() {
  if (!currentSong) { queue = []; closeQueuePanel(); return; }
  queue = [currentSong];
  closeQueuePanel();
  showToast('Queue cleared');
};

// ─── Search ───

function doSearch(q) {
  if (!q) { render(); return; }
  var ql = q.toLowerCase();
  var main = document.getElementById('mainContent');

  var SEARCH_CAP = 20;
  var allSongMatches = songs.filter(function(s) {
    return s.title.toLowerCase().indexOf(ql) !== -1
      || (s.artist && s.artist.toLowerCase().indexOf(ql) !== -1)
      || (s.album && s.album.toLowerCase().indexOf(ql) !== -1)
      || (s.feat && s.feat.toLowerCase().indexOf(ql) !== -1);
  });
  var songMatches = allSongMatches.slice(0, SEARCH_CAP);

  var artistsSeen = {};
  var allArtistMatches = [];
  songs.forEach(function(s) {
    if (!artistsSeen[s.artist] && s.artist.toLowerCase().indexOf(ql) !== -1) {
      artistsSeen[s.artist] = true;
      allArtistMatches.push(s.artist);
    }
  });
  var artistMatches = allArtistMatches.slice(0, SEARCH_CAP);

  var albumsSeen = {};
  var allAlbumMatches = [];
  songs.forEach(function(s) {
    var key = s.album + '|||' + s.artist;
    if (!albumsSeen[key] && s.album.toLowerCase().indexOf(ql) !== -1) {
      albumsSeen[key] = true;
      allAlbumMatches.push({ name: s.album, artist: s.artist, albumArtUri: s.albumArtUri });
    }
  });
  var albumMatches = allAlbumMatches.slice(0, SEARCH_CAP);

  if (!songMatches.length && !artistMatches.length && !albumMatches.length) {
    main.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128269;</div><p>No results for &ldquo;' + escHtml(q) + '&rdquo;</p></div>';
    return;
  }

  var parts = [];

  if (songMatches.length) {
    var moreSongs = allSongMatches.length > SEARCH_CAP ? ' <span style="float:right;font-size:12px;color:var(--primary);font-weight:400;">' + allSongMatches.length + ' total</span>' : '';
    parts.push('<div class="search-section-header">Songs' + moreSongs + '</div>');
    songMatches.forEach(function(s) {
      parts.push(songRowHTML(s, currentSong && currentSong.id === s.id, true));
    });
  }

  if (artistMatches.length) {
    var moreArtists = allArtistMatches.length > SEARCH_CAP ? ' <span style="float:right;font-size:12px;color:var(--primary);font-weight:400;">' + allArtistMatches.length + ' total</span>' : '';
    parts.push('<div class="search-section-header">Artists' + moreArtists + '</div>');
    artistMatches.forEach(function(name) {
      var artistAlbums = getArtistAlbums(name);
      var artUri = artistAlbums.length ? artistAlbums[0].albumArtUri : '';
      var artEl = artUri
        ? '<div class="art-lazy" data-lazy-uri="' + escHtml(artUri) + '" data-round="1" data-size="48" style="width:48px;height:48px;flex-shrink:0;border-radius:50%;overflow:hidden;">' + artHTML(name, 48, true) + '</div>'
        : artHTML(name, 48, true);
      var cnt = getArtistSongs(name).length;
      parts.push('<div class="search-result-row" data-search-artist="' + escHtml(name) + '">'
        + artEl
        + '<div class="song-info"><div class="song-title">' + escHtml(name) + '</div>'
        + '<div class="song-meta">' + cnt + ' song' + (cnt !== 1 ? 's' : '') + '</div></div>'
        + '</div>');
    });
  }

  if (albumMatches.length) {
    var moreAlbums = allAlbumMatches.length > SEARCH_CAP ? ' <span style="float:right;font-size:12px;color:var(--primary);font-weight:400;">' + allAlbumMatches.length + ' total</span>' : '';
    parts.push('<div class="search-section-header">Albums' + moreAlbums + '</div>');
    albumMatches.forEach(function(a) {
      var artEl = a.albumArtUri
        ? '<div class="art-lazy" data-lazy-uri="' + escHtml(a.albumArtUri) + '" data-size="48" style="width:48px;height:48px;flex-shrink:0;border-radius:6px;overflow:hidden;">' + artHTML(a.name, 48) + '</div>'
        : '<div style="width:48px;height:48px;flex-shrink:0;">' + artHTML(a.name, 48) + '</div>';
      var cnt = getAlbumSongs(a.name, a.artist).length;
      parts.push('<div class="search-result-row" data-search-album="' + escHtml(a.name) + '" data-search-album-artist="' + escHtml(a.artist) + '">'
        + artEl
        + '<div class="song-info"><div class="song-title">' + escHtml(a.name) + '</div>'
        + '<div class="song-meta">' + escHtml(a.artist) + ' &bull; ' + cnt + ' songs</div></div>'
        + '</div>');
    });
  }

  main.innerHTML = parts.join('');
  initLazyArt(main);
  bindSongRows(main, songMatches);

  main.querySelectorAll('[data-search-artist]').forEach(function(row) {
    row.onclick = function() {
      selectedArtist = row.dataset.searchArtist;
      selectedAlbum = null;
      currentTab = 'artists';
      document.querySelectorAll('.tabs button').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === 'artists'); });
      document.getElementById('searchBar').classList.add('hidden');
      render();
    };
  });

  main.querySelectorAll('[data-search-album]').forEach(function(row) {
    row.onclick = function() {
      selectedAlbum = { name: row.dataset.searchAlbum, artist: row.dataset.searchAlbumArtist };
      selectedArtist = null;
      if (currentTab !== 'albums') { _prevTab = currentTab; }
      currentTab = 'albums';
      document.querySelectorAll('.tabs button').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === 'albums'); });
      document.getElementById('searchBar').classList.add('hidden');
      render();
    };
  });
}

// ─── Event Bindings ───

document.querySelectorAll('.tabs button').forEach(function(btn) {
  btn.onclick = function() {
    currentTab = btn.dataset.tab;
    selectedArtist = null;
    selectedAlbum = null;
    selectedGenre = null;
    saveUIState();  // save immediately before render so Android kill can't lose it
    document.querySelectorAll('.tabs button').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    render();
  };
});

document.getElementById('searchBtn').onclick = function() {
  var bar = document.getElementById('searchBar');
  bar.classList.toggle('hidden');
  var input = document.getElementById('searchInput');
  if (!bar.classList.contains('hidden')) {
    input.value = '';
    input.focus();
    input.oninput = function() { doSearch(input.value); };
  } else {
    render();
  }
};

document.getElementById('miniPlayerContent').onclick = function() { renderNowPlaying(); };
document.getElementById('miniPrevBtn').onclick = function(e) { e.stopPropagation(); handlePrev(); };
document.getElementById('miniPlayBtn').onclick = function(e) { e.stopPropagation(); togglePlay(); };
document.getElementById('miniNextBtn').onclick = function(e) { e.stopPropagation(); handleNext(); };

// Swipe-up on mini player opens Now Playing
(function() {
  var mp = document.getElementById('miniPlayer');
  var _mpY = 0;
  mp.addEventListener('touchstart', function(e) { _mpY = e.touches[0].clientY; }, { passive: true });
  mp.addEventListener('touchend', function(e) {
    var dy = e.changedTouches[0].clientY - _mpY;
    if (dy < -40) renderNowPlaying();
  }, { passive: true });
})();

document.getElementById('fabBtn').onclick = function() {
  if (currentTab === 'songs') {
    if (songs.length === 0) return;
    isShuffled = true;
    var allSongs = songs.slice();
    for (var _i = allSongs.length - 1; _i > 0; _i--) { var _j = Math.floor(Math.random() * (_i + 1)); var _t = allSongs[_i]; allSongs[_i] = allSongs[_j]; allSongs[_j] = _t; }
    playSong(allSongs[0], allSongs);
  } else {
    if (!pickFolderWithHandle()) document.getElementById('folderInput').click();
  }
};
document.getElementById('importFilesBtn').onclick = function() { toggleDrawer(false); document.getElementById('fileInput').click(); };
document.getElementById('importFolderBtn').onclick = function() {
  toggleDrawer(false);
  if (!pickFolderWithHandle()) document.getElementById('folderInput').click();
};
document.getElementById('fileInput').onchange = function(e) { if (e.target.files) handleFileImport(e.target.files); e.target.value = ''; };
document.getElementById('folderInput').onchange = function(e) {
  if (e.target.files && e.target.files.length > 0) {
    showToast('Found ' + e.target.files.length + ' files, loading...', 3000);
    handleFileImport(e.target.files);
  } else {
    showToast('No files found — try selecting your Music folder directly', 4000);
  }
  e.target.value = '';
};

document.getElementById('menuBtn').onclick = function() { toggleDrawer(true); };
document.getElementById('drawerOverlay').onclick = function() { toggleDrawer(false); };



document.getElementById('setApiKeyBtn').onclick = function() {
  toggleDrawer(false);
  var current = apiKey ? 'Current key: …' + apiKey.slice(-6) + '\n\n' : '';
  var val = prompt(current + 'Enter your Gemini API key (free at aistudio.google.com):', apiKey || '');
  if (val === null) return;
  val = val.trim();
  apiKey = val;
  if (val) {
    localStorage.setItem('gemini_api_key', val);
    document.getElementById('apiKeyLabel').textContent = 'Gemini Key: …' + val.slice(-6);
    showToast('Testing key…', 2000);
    // Fire a trivial Gemini ping to validate the key immediately
    fetch(_GEMINI_URL + '?key=' + encodeURIComponent(val), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with the single word: ready' }] }],
        generationConfig: { responseMimeType: 'text/plain' }
      })
    }).then(function(res) {
      return res.text().then(function(raw) {
        if (res.status === 200) {
          showToast('✓ Key works — Gemini is connected', 4000);
        } else {
          var data = null; try { data = JSON.parse(raw); } catch(e) {}
          var msg = (data && data.error && data.error.message) ? data.error.message : raw.substring(0, 120);
          showToast('Key test failed — HTTP ' + res.status + ': ' + msg, 6000);
        }
      });
    }).catch(function(err) {
      var msg = (err && err.name === 'TypeError') ? 'No internet — check WiFi or mobile data' : (err && err.message ? err.message : String(err));
      showToast('Key test failed: ' + msg, 6000);
    });
  } else {
    localStorage.removeItem('gemini_api_key');
    document.getElementById('apiKeyLabel').textContent = 'Set Gemini API Key';
    showToast('API key cleared');
  }
};

// Init the key label if a key is already set
(function() {
  var lbl = document.getElementById('apiKeyLabel');
  if (lbl && apiKey) lbl.textContent = 'Gemini Key: …' + apiKey.slice(-6);
})();

document.getElementById('favoritesBtn').onclick = function() {
  toggleDrawer(false);
  currentTab = 'favorites';
  document.querySelectorAll('.tabs button').forEach(function(b) { b.classList.remove('active'); });
  selectedArtist = null;
  selectedAlbum = null;
  render();
};

document.getElementById('clearLibBtn').onclick = function() {
  toggleDrawer(false);
  if (confirm('Clear your entire library? This cannot be undone.')) {
    audio.pause();
    isPlaying = false;
    songs = [];
    songMap = Object.create(null);
    _countsCache = null;
    currentSong = null;
    queue = [];
    _playHistory = [];
    selectedArtist = null;
    selectedAlbum = null;
    currentTab = 'artists';
    localStorage.removeItem('muzio_library');
    localStorage.removeItem('muzio_library_count');
    localStorage.removeItem('muzio_ui_state');
    clearDirHandle();
    render();
    showToast('Library cleared');
  }
};

document.getElementById('rescanLibBtn').onclick = function() {
  toggleDrawer(false);
  songs = []; songMap = Object.create(null); _countsCache = null;
  nativeScanning = false; nativeScanError = ''; nativeScanCount = 0;
  nativeAutoScan();
};

// Show native-only drawer items once Capacitor is ready
function updateDrawerForPlatform() {
  var isNat = typeof NativeBridge !== 'undefined' && NativeBridge.isNative();
  var el;
  el = document.getElementById('rescanLibBtn');    if (el) el.classList.toggle('hidden', !isNat);
  el = document.getElementById('importFolderBtn'); if (el) el.classList.toggle('hidden', isNat);
  el = document.getElementById('importFilesBtn');  if (el) el.classList.toggle('hidden', isNat);
}
document.addEventListener('deviceready', updateDrawerForPlatform, false);
setTimeout(updateDrawerForPlatform, 200);

var appEl = document.getElementById('app');
appEl.addEventListener('dragover', function(e) { e.preventDefault(); });
appEl.addEventListener('drop', function(e) {
  e.preventDefault();
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleFileImport(e.dataTransfer.files);
});

// ─── State Persistence (survives app-switch page reloads) ───

function saveUIState() {
  try {
    var state = {
      tab: currentTab,
      artist: selectedArtist,
      album: selectedAlbum,
      genre: selectedGenre,
      songFn: currentSong ? currentSong.fn : null,
      nowPlaying: showNowPlaying,
      albumFilter: albumFilter,
      sortMode: sortMode,
      albumSortMode: albumSortMode,
      albumArtistsOnly: albumArtistsOnly,
      currentPlaylistId: currentPlaylistId,
      time: currentTime,
      shuffled: isShuffled,
      repeat: repeatMode,
      vol: volume,
      muted: isMuted,
      speed: playbackRate
    };
    localStorage.setItem('muzio_ui_state', JSON.stringify(state));
  } catch (e) {}
}

function restoreUIState() {
  // Parse separately so a corrupt JSON string doesn't skip the whole restore
  var state = null;
  try {
    var raw = localStorage.getItem('muzio_ui_state');
    if (raw) state = JSON.parse(raw);
  } catch (e) {}
  if (!state) return;

  try {
    if (state.tab) currentTab = state.tab;
    if (state.artist) selectedArtist = state.artist;
    if (state.album) selectedAlbum = state.album;
    if (state.genre) selectedGenre = state.genre;
    if (state.albumFilter) albumFilter = state.albumFilter;
    if (state.sortMode) sortMode = state.sortMode;
    if (state.albumSortMode) albumSortMode = state.albumSortMode;
    if (typeof state.albumArtistsOnly === 'boolean') albumArtistsOnly = state.albumArtistsOnly;
    if (state.currentPlaylistId) currentPlaylistId = state.currentPlaylistId;
    if (state.shuffled) isShuffled = state.shuffled;
    if (state.repeat) repeatMode = state.repeat;
    if (typeof state.vol === 'number') { volume = state.vol; audio.volume = volume; }
    isMuted = false;
    if (state.speed && SPEEDS.indexOf(state.speed) !== -1) { playbackRate = state.speed; audio.playbackRate = playbackRate; }

    if (state.songFn) {
      var match = songs.find(function(s) { return s.fn === state.songFn; });
      if (match) {
        currentSong = match;
        currentTime = state.time || 0;
        duration = match.dur || 0;
      }
    }

    if (state.tab && state.tab !== 'artists') {
      document.querySelectorAll('.tabs button').forEach(function(b) { b.classList.remove('active'); });
      var tabBtn = document.querySelector('.tabs button[data-tab="' + state.tab + '"]');
      if (tabBtn) tabBtn.classList.add('active');
    }

    render();

    if (state.nowPlaying && currentSong) {
      setTimeout(function() { renderNowPlaying(); }, 120);
    }
  } catch (e) {}
}

document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    saveUIState();
    // Flush any pending debounced save so the library survives if the OS kills the process
    if (_saveLibraryTimer) { clearTimeout(_saveLibraryTimer); _saveLibraryTimer = null; saveLibrary(); }
  } else {
    // App came to foreground — re-render so the UI matches current state
    // (handles cases where Android briefly destroys and recreates the activity)
    render();
    if (showNowPlaying && currentSong) renderNowPlaying();
  }
});
window.addEventListener('beforeunload', saveUIState);
window.addEventListener('pagehide', saveUIState);

// ─── CF state (must be before first render() call) ───
var _cfLastTap = { time: 0, idx: -1, timer: 0 };
var _cfInfoTimer = 0;

// ─── Init ───

restoreUIState();

// Always render on startup — restoreUIState only calls render() when saved state exists,
// so a cold first-launch (no saved state) would otherwise show a blank screen.
render();

// Load edits store first so they're ready to apply on top of any data source.
// Then load the library from IDB (full metadata, no quota cap) and apply edits on top.
loadAllEdits().then(function(edits) {
  _editsMap = edits;
  // Apply on top of whatever localStorage loaded synchronously (fast startup path)
  applyEditsToSongs();
  scheduleStartupRender();
  return loadLibraryIDB();
}).then(function(saved) {
  if (saved && saved.length > 0 && saved.length >= songs.length) {
    songs = saved.map(function(s) {
      s.id = genId();
      s.url = '';
      s.tagging = false;
      s.fav = s.fav || false;
      return s;
    });
    songMap = Object.create(null);
    songs.forEach(function(s) { songMap[s.id] = s; });
    _countsCache = null; _artistsCache = null; _albumsCache = null;
    _artistSongsCache = null; _albumSongsCache = null; _spCache = null;
  }
  applyEditsToSongs(); // always re-apply after IDB load
  _idbLoading = false;
  // If the loaded library is smaller than the true count (localStorage quota truncated it
  // or IDB was overwritten with a partial snapshot), trigger a full rescan to recover.
  var _storedCount = parseInt(localStorage.getItem('muzio_library_count') || '0');
  if (_storedCount > 0 && songs.length < _storedCount) _forceRescan = true;
  scheduleStartupRender();
  nativeAutoScan();
}).catch(function() {
  _idbLoading = false;
  applyEditsToSongs();
  nativeAutoScan();
});

// Load persisted art from IndexedDB — after the first session all thumbnails are
// stored locally, so this fills artCache before the next render and art appears
// instantly with no pop-in, no matter how fast the user scrolls.
loadPersistedArt().then(function(cached) {
  var keys = Object.keys(cached);
  if (keys.length > 0) {
    // Expand cap before inserting so startup arts don't evict each other
    if (keys.length > _ART_CACHE_MAX) _ART_CACHE_MAX = keys.length + 100;
    keys.forEach(function(k) { artCacheSet(k, cached[k]); });
    scheduleStartupRender(); // re-render with full art cache — no more pop-in
  }
  // Start filling any missing URIs immediately (bridge may already be ready)
  backgroundLoadAllArt();
}).catch(function() {});

if (songs.length > 0 && !songs[0].url) {
  if (window.showDirectoryPicker && !isMobile()) {
    autoScanFromHandle().then(function(ok) {
      if (!ok) render();
    });
  }
}

// ─── Native APK: auto-scan on first launch ───

function nativeAutoScan() {
  if (typeof NativeBridge === 'undefined' || !NativeBridge.isNative()) return;
  if (nativeScanning) return;
  // IDB hasn't finished loading yet — don't start a full rescan prematurely.
  // The IDB completion handler calls nativeAutoScan() explicitly once it knows
  // whether the library is truly empty or was just slow to load.
  if (_idbLoading && songs.length === 0) return;

  // Already have songs — reconnect playback URLs, then silently query MediaStore
  // to detect a truncated library (muzio_library_count can't be trusted because
  // saveLibrary() may have been called while songs was still at 2000, resetting
  // the count). MediaStore is the only ground truth.
  if (songs.length > 0 && !_forceRescan) {
    var needsUrl = songs.filter(function(s) { return !s.url; });
    needsUrl.forEach(function(s) {
      try {
        if (s.contentUri) {
          s.url = window.Capacitor.convertFileSrc(s.contentUri);
        } else if (s.nativePath) {
          s.url = window.Capacitor.convertFileSrc(s.nativePath.replace('file://', ''));
        }
      } catch(e) {}
    });
    render();
    backgroundLoadAllArt();

    // Always query MediaStore on cold start — it's a fast DB call, not a
    // filesystem scan — so we can detect a truncated library even when the
    // stored count metadata was itself corrupted to the wrong value.
    NativeBridge.scanAllMusic(null).then(function(files) {
      if (!files || !files.length) return;

      // MediaStore has materially more songs than our library → we lost data.
      // Rebuild: merge scan results with whatever metadata we have in memory.
      if (files.length > Math.floor(songs.length * 1.05) + 10) {
        var _byUri = Object.create(null), _byFn = Object.create(null);
        songs.forEach(function(s) {
          if (s.contentUri) _byUri[s.contentUri] = s;
          if (s.fn)         _byFn[s.fn] = s;
        });
        songs = files.map(function(f) {
          var ns = NativeBridge.toSong(f);
          var ex = _byUri[ns.contentUri] || _byFn[ns.fn];
          if (!ex) return ns;
          ex.url         = ns.url         || ex.url;
          ex.contentUri  = ns.contentUri  || ex.contentUri;
          ex.nativePath  = ns.nativePath  || ex.nativePath;
          ex.albumArtUri = ns.albumArtUri || ex.albumArtUri;
          ex.dur         = ns.dur         || ex.dur;
          return ex;
        });
        songMap = Object.create(null);
        songs.forEach(function(s) { if (!s.id) s.id = genId(); songMap[s.id] = s; });
        _countsCache = null; _artistsCache = null; _albumsCache = null;
        _artistSongsCache = null; _albumSongsCache = null; _spCache = null;
        applyEditsToSongs();
        saveLibrary();
        render();
        backgroundLoadAllArt();
        showToast('Library restored: ' + songs.length + ' songs', 3000);
        return;
      }

      // Library size looks right — just refresh missing art/metadata.
      var byUri = {}, byFn = {};
      songs.forEach(function(s) {
        if (s.contentUri) byUri[s.contentUri] = s;
        byFn[s.fn] = s;
      });
      var updated = 0;
      files.forEach(function(f) {
        var s = byUri[f.contentUri] || byFn[f.name];
        if (!s) return;
        if (f.art && !s.art) { s.art = f.art; updated++; }
        if (f.albumArtUri && !s.albumArtUri) s.albumArtUri = f.albumArtUri;
        if (f.albumArtist && !s.albumArtist) s.albumArtist = f.albumArtist;
        if (f.genre && !s.genre) s.genre = f.genre;
      });
      if (updated > 0) { saveLibrary(); render(); }
    }).catch(function() {});
    return;
  }
  _forceRescan = false;

  // First launch or rescan — show scanning screen and auto-scan
  nativeScanning = true;
  nativeScanCount = 0;
  nativeScanError = '';
  render();

  NativeBridge.scanAllMusic(function(count) {
    nativeScanCount = count;
    var el = document.getElementById('scanStatusText');
    if (el) el.textContent = 'Found ' + count + ' songs...';
  }).then(function(files) {
    nativeScanning = false;
    if (!files || files.length === 0) {
      nativeScanError = 'No music found. Make sure storage permission is allowed.';
      render();
      return;
    }
    var newSongs = files.map(function(f) { return NativeBridge.toSong(f); });

    // Merge with whatever is already in memory (IDB data, user edits, AI tags, lyrics).
    // Never replace — that wipes all saved metadata. MediaStore only owns: url, contentUri,
    // nativePath, albumArtUri, dur. Everything else comes from the saved library.
    var _byUri = Object.create(null), _byFn = Object.create(null);
    songs.forEach(function(s) {
      if (s.contentUri) _byUri[s.contentUri] = s;
      if (s.fn)         _byFn[s.fn]          = s;
    });
    songs = newSongs.map(function(ns) {
      var ex = _byUri[ns.contentUri] || _byFn[ns.fn];
      if (!ex) return ns; // genuinely new file
      ex.url         = ns.url         || ex.url;
      ex.contentUri  = ns.contentUri  || ex.contentUri;
      ex.nativePath  = ns.nativePath  || ex.nativePath;
      ex.albumArtUri = ns.albumArtUri || ex.albumArtUri;
      ex.dur         = ns.dur         || ex.dur;
      return ex;
    });

    applyEditsToSongs(); // restore manual edits on top of fresh scan data
    saveLibrary();
    render();
    backgroundLoadAllArt();
    showToast('Loaded ' + newSongs.length + ' songs!', 3000);
    // Proactively request notification permission so the dialog appears on first launch
    if (typeof NativeBridge !== 'undefined' && NativeBridge.requestNotificationPermission) {
      NativeBridge.requestNotificationPermission().catch(function() {});
    }
    // Show battery optimization banner once — critical for background playback on Samsung
    setTimeout(maybeShowBatteryBanner, 3000);
  }).catch(function(e) {
    nativeScanning = false;
    var msg = e && e.message ? e.message : String(e);
    nativeScanError = msg || 'Scan failed — please grant storage permission and try again.';
    render();
  });
}

// Register on multiple events — Capacitor bridge load timing varies by device
document.addEventListener('deviceready', nativeAutoScan, false);
setTimeout(nativeAutoScan, 100);   // fast path: bridge usually ready within 100ms
setTimeout(nativeAutoScan, 500);   // fallback for slower bridge init
setTimeout(nativeAutoScan, 2000);  // last resort for slow devices

// Lock screen / notification controls
initMediaSession();

// Handle media control events fired by the native Android notification buttons
document.addEventListener('muzioMediaAction', function(e) {
  var action = e && e.detail && e.detail.action;
  if (action === 'prev')      handlePrev();
  else if (action === 'next') handleNext();
  else if (action === 'playPause') togglePlay();
  else if (action === 'seekTo') {
    var posMs = e.detail.positionMs;
    if (typeof posMs === 'number' && audio) {
      audio.currentTime = posMs / 1000;
      _lastNotifKey = ''; // force position update on next updateMediaSession call
      updateMediaSession();
    }
  } else if (action === 'close') {
    if (isPlaying) togglePlay();
    if (typeof NativeBridge !== 'undefined' && NativeBridge.isNative()) {
      NativeBridge.hideMediaNotification();
    }
  }
});


// ─── Hardware Back Button (Android) ───

// ─── Resume after audio interruption (call, BT, other app) ───
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible' && _systemPaused && currentSong && currentSong.url) {
    _systemPaused = false;
    initAudioCtx();
    isPlaying = true;
    audio.play().catch(function() { isPlaying = false; syncPlaybackUI(); });
    syncPlaybackUI();
  }
});

if (typeof window.Capacitor !== 'undefined') {
  document.addEventListener('resume', function() {
    if (_systemPaused && currentSong && currentSong.url) {
      _systemPaused = false;
      initAudioCtx();
      isPlaying = true;
      audio.play().catch(function() { isPlaying = false; syncPlaybackUI(); });
      syncPlaybackUI();
    }
  });
}

function handleHardwareBack() {
  // 1. Close any overlay / panel
  var eqOverlay = document.getElementById('eqOverlay');
  if (eqOverlay) { eqOverlay.remove(); return; }

  // 1. Close any overflow/context menu
  var overflowMenu = document.getElementById('overflowMenu');
  if (overflowMenu) { overflowMenu.remove(); return; }

  // 1b. Close bottom sheet
  var bs = document.getElementById('bottomSheet');
  if (bs && !bs.classList.contains('hidden')) { closeBottomSheet(); return; }

  // 1d. Close queue panel
  var queuePanel = document.getElementById('queuePanel');
  if (queuePanel && !queuePanel.classList.contains('hidden')) {
    queuePanel.classList.add('hidden');
    return;
  }

  // 2. Close edit modal
  var editModal = document.getElementById('editModal');
  if (editModal && !editModal.classList.contains('hidden')) {
    editModal.classList.add('hidden');
    document.getElementById('editOverlay').classList.add('hidden');
    return;
  }

  // 4. Close side drawer
  var drawer = document.getElementById('drawer');
  if (drawer && !drawer.classList.contains('hidden')) {
    toggleDrawer(false);
    return;
  }

  // 5. Close Now Playing
  if (showNowPlaying) {
    showNowPlaying = false;
    document.getElementById('nowPlaying').classList.add('hidden');
    _npSeekEl = null; _npFillEl = null; _npTime0El = null;
    updateMiniPlayer();
    return;
  }

  // 6. Close search bar
  var searchBar = document.getElementById('searchBar');
  if (searchBar && !searchBar.classList.contains('hidden')) {
    searchBar.classList.add('hidden');
    var si = document.getElementById('searchInput');
    if (si) si.value = '';
    render();
    return;
  }

  // 7. Go up one navigation level
  if (selectedAlbum) { selectedAlbum = null; if (_prevTab) { currentTab = _prevTab; _prevTab = null; } render(); return; }
  if (selectedArtist) { selectedArtist = null; render(); return; }
  if (selectedGenre) { selectedGenre = null; render(); return; }

  // 8. Nothing to dismiss — exit app
  var plugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MediaStore;
  if (plugin && plugin.exitApp) {
    plugin.exitApp();
  }
}

// Fired by MainActivity.onBackPressed() via getBridge().triggerJSEvent()
document.addEventListener('capacitorBackButton', handleHardwareBack);
