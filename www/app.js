// ═══════════════════════════════════════════════════════
// Muzio AI - Smart Music Player
// Pure HTML/CSS/JS - No build tools needed
// Open index.html in any browser or Web Code on Android
// ═══════════════════════════════════════════════════════

// ─── Utilities ───

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
  if (!data || artCache[uri]) return;
  var keys = Object.keys(artCache);
  if (keys.length >= _ART_CACHE_MAX) delete artCache[keys[0]];
  artCache[uri] = data;
}

function fetchThumbnail(uri) {
  if (artCache[uri]) return Promise.resolve(artCache[uri]);
  if (artInFlight[uri]) return artInFlight[uri];
  var p = NativeBridge.readAlbumArt(uri).then(function(data) {
    delete artInFlight[uri];
    if (data) {
      artCacheSet(uri, data);
      persistArt(uri, data); // save to IndexedDB for instant load next session
      // Apply art to any DOM elements currently waiting for this URI
      // (handles the case where render() rebuilt the DOM while fetch was in-flight)
      document.querySelectorAll('.art-lazy[data-lazy-uri]').forEach(function(lazyEl) {
        var uris = (lazyEl.dataset.lazyUri || '').split('|').filter(Boolean);
        if (uris.indexOf(uri) !== -1 && uris.every(function(u) { return artCache[u]; })) {
          applyArt(lazyEl, uris.map(function(u) { return artCache[u]; }));
        }
      });
    }
    return data || '';
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
  var idx = 0;
  var active = 0;
  var MAX = 50; // 50 concurrent native reads fills cache ~2.5× faster

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

var VS_ROW_H = 73;   // px per song row — padding(12+12) + art(48) + border-bottom(1)
var VS_BUFFER = 25;  // extra rows rendered above and below the viewport
var _vsData = null;
var _vsRenderedStart = 0;
var _vsScrollFn = null;

function cleanupVirtualScroll() {
  if (_vsScrollFn) {
    var mc = document.getElementById('mainContent');
    if (mc) mc.removeEventListener('scroll', _vsScrollFn);
    _vsScrollFn = null;
  }
  _vsData = null;
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
    if (Math.abs(newStart - _vsRenderedStart) < Math.floor(VS_BUFFER / 2)) return;
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
    if (data) artCacheHD[uri] = data;
    return data || '';
  }).catch(function() { delete _artHdInFlight[uri]; return ''; });
  _artHdInFlight[uri] = p;
  return p;
}

// Apply HD art to the Now Playing panel, preserving the lyrics overlay child.
// Called from both loadCurrentSongArt and renderNowPlaying so the logic stays in one place.
function applyHdArtToNP(uri, data) {
  if (!data || !showNowPlaying || !currentSong || currentSong.albumArtUri !== uri) return;
  var imgEl = document.getElementById('npArtImgEl');
  if (imgEl) {
    imgEl.src = data;
  } else {
    var artEl = document.getElementById('npArtImg');
    if (artEl) {
      var overlay = document.getElementById('npArtLyrics');
      var newImg = document.createElement('img');
      newImg.id = 'npArtImgEl'; newImg.src = data;
      newImg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      Array.from(artEl.childNodes).forEach(function(c) { if (c !== overlay) artEl.removeChild(c); });
      artEl.insertBefore(newImg, overlay || null);
    }
  }
  var bg = document.getElementById('npBgBlur');
  if (bg) bg.style.backgroundImage = 'url(' + data + ')';
}

function loadCurrentSongArt(song) {
  if (!song || !song.albumArtUri) return;
  if (typeof NativeBridge === 'undefined' || !NativeBridge.isNative()) return;
  var uri = song.albumArtUri;
  // 192px thumbnail → mini player + media session
  fetchThumbnail(uri).then(function(data) {
    if (!data || !currentSong || currentSong.albumArtUri !== uri) return;
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
    fetchSyncedLyricsForSong(song).then(function(synced) {
      if (synced) {
        song.syncedLyrics = synced;
        song.lyrics = '';
        saveLibraryLater();
        applyLyricsToNPPanel(song);
        return;
      }
      return fetchLRCLibLyrics(song).then(function(result) {
        if (result) {
          if (result.syncedLyrics)      { song.syncedLyrics = result.syncedLyrics; song.lyrics = ''; }
          else if (result.plainLyrics)  { song.lyrics = result.plainLyrics; song.syncedLyrics = ''; }
          saveLibraryLater();
        }
        applyLyricsToNPPanel(song);
      });
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

function updateMediaSession() {
  if (!('mediaSession' in navigator) || !currentSong) return;
  var artUri = currentSong.albumArtUri;
  var artData = (artUri && artCacheHD[artUri]) ? artCacheHD[artUri]
              : (artUri && artCache[artUri]) ? artCache[artUri] : '';
  navigator.mediaSession.metadata = new MediaMetadata({
    title:  currentSong.title  || '',
    artist: currentSong.artist || '',
    album:  (currentSong.album && currentSong.album !== 'Unknown Album') ? currentSong.album : '',
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
    // Only override with non-empty saved values so a blank field can't erase good data
    if (edit.title)       s.title       = edit.title;
    if (edit.artist)      s.artist      = edit.artist;
    if (edit.album)       s.album       = edit.album;
    if (edit.albumArtist !== undefined && edit.albumArtist !== null) s.albumArtist = edit.albumArtist;
    if (edit.year  !== undefined && edit.year  !== null) s.year  = edit.year;
    if (edit.genre)       s.genre       = edit.genre;
    if (edit.track)       s.track       = edit.track;
    if (edit.type)        s.type        = edit.type;
    if (edit.feat  !== undefined && edit.feat  !== null) s.feat  = edit.feat;
    if (edit.syncedLyrics !== undefined && edit.syncedLyrics !== null) s.syncedLyrics = edit.syncedLyrics;
    if (edit.lyrics !== undefined && edit.lyrics !== null) s.lyrics = edit.lyrics;
    if (edit.art)         s.art         = edit.art;
  });
}

function saveLibrary() {
  _countsCache = null;
  songMap = Object.create(null);
  songs.forEach(function(s) { songMap[s.id] = s; });
  // Lean localStorage tier: no lyrics, no art (both stored in IDB; art also in art-cache IDB).
  // Art must NOT go here — a single base64 image is ~50KB, so a library with album art
  // easily exceeds the 5 MB localStorage quota. A silent quota failure returns [] on next
  // startup, triggering a full rescan that wipes all saved edits.
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
        aiAttempted: s.aiAttempted || 0, enrichAttempted: s.enrichAttempted || 0
      };
    });
    localStorage.setItem('muzio_library', JSON.stringify(lean));
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
  openArtDb().then(function(db) {
    var store = db.transaction(ART_STORE_NAME, 'readwrite').objectStore(ART_STORE_NAME);
    // Check count first; if at cap, delete the oldest entry before inserting
    var countReq = store.count();
    countReq.onsuccess = function() {
      var tx2 = db.transaction(ART_STORE_NAME, 'readwrite');
      var st2 = tx2.objectStore(ART_STORE_NAME);
      if (countReq.result >= _ART_CACHE_MAX) {
        var cursorReq = st2.openCursor();
        cursorReq.onsuccess = function(e) {
          var cur = e.target.result;
          if (cur) { cur.delete(); st2.put(data, uri); }
        };
      } else {
        st2.put(data, uri);
      }
    };
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
var _ART_CACHE_MAX = 5000; // cover 3600+ album libraries; ~50KB × 5000 ≈ 250 MB (fine on 4GB devices)

// Playback speed
var playbackRate = 1.0;
var SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0];

// Gapless preload buffer
var audioPreload = (function() { var a = new Audio(); a.preload = 'auto'; return a; })();
var preloadedUrl = '';
var preloadedSong = null;

// Song lookup map — rebuilt in saveLibrary(); avoids O(n) songs.find() on every tap
var songMap = (function() { var m = Object.create(null); songs.forEach(function(s){m[s.id]=s;}); return m; })();

// Counts cache — invalidated in saveLibrary()
var _countsCache = null;

// IntersectionObserver singleton — disconnected before each new render
// _lazyArtObs removed — initLazyArt now uses per-container observers

// Now Playing DOM element refs — cached after renderNowPlaying, cleared on close
var _npSeekEl = null, _npFillEl = null, _npTime0El = null;

// Mini player DOM cache to avoid getElementById on every timeupdate
var _miniLastSongId = '';

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
var albumFilter = 'all';
var albumGenreFilter = 'all';
var queue = [];
var apiKey = localStorage.getItem('gemini_api_key') || '';
var GENERIC_GENRE = /^(hip.hop|rap|r&b|music|unknown|other|pop)$/i;
var _GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
var _GEMINI_EXPERTISE = 'You are a music metadata expert with encyclopedic knowledge of hip-hop, rap, R&B, drill, trap, boom-bap, G-funk, cloud rap, and mixtape culture.\n\n';
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

var audio = document.getElementById('audioEl');

// ─── Derived Data ───

function getArtists() {
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

  return list;
}

function getAlbums(filter) {
  var map = {};
  songs.forEach(function(s) {
    var key = s.album + '|||' + s.artist;
    var art = safeArtUrl(s.art);
    if (!map[key]) map[key] = { artist: s.artist, year: s.year, art: art, count: 0, type: s.type || 'Album', albumArtUri: '', genre: s.genre || '' };
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

  if (!filter || filter === 'all') return all;
  if (filter === 'albums') return all.filter(function(a) { return a.type === 'Album'; });
  if (filter === 'mixtapes') return all.filter(function(a) { return a.type === 'Mixtape'; });
  if (filter === 'eps') return all.filter(function(a) { return a.type === 'EP' || a.type === 'Single'; });
  return all;
}

function getAlbumSongs(albumName, artistName) {
  return songs.filter(function(s) { return s.album === albumName && s.artist === artistName; })
    .sort(function(a, b) {
      var da = ((a.disc || 1) * 1000) + (a.track || 0);
      var db = ((b.disc || 1) * 1000) + (b.track || 0);
      return da - db;
    });
}

function getArtistSongs(name) {
  return songs.filter(function(s) { return s.artist === name; })
    .sort(function(a, b) {
      if (a.album !== b.album) return a.album.localeCompare(b.album);
      var da = ((a.disc || 1) * 1000) + (a.track || 0);
      var db = ((b.disc || 1) * 1000) + (b.track || 0);
      return da - db;
    });
}

function getArtistAlbums(name) {
  var map = {};
  songs.forEach(function(s) {
    if (s.artist !== name) return;
    var art = safeArtUrl(s.art);
    if (!map[s.album]) map[s.album] = { year: s.year, art: art, count: 0, type: s.type, albumArtUri: '' };
    map[s.album].count++;
    if (art && !map[s.album].art) map[s.album].art = art;
    if (s.albumArtUri && !map[s.album].albumArtUri) map[s.album].albumArtUri = s.albumArtUri;
  });
  return Object.keys(map).map(function(a) {
    return { name: a, artist: name, year: map[a].year, art: map[a].art, albumArtUri: map[a].albumArtUri || '', songCount: map[a].count, type: map[a].type };
  });
}

function getFavorites() {
  return songs.filter(function(s) { return s.fav; });
}

function getSongCounts() {
  if (_countsCache) return _countsCache;
  var artists = Object.create(null);
  var albums = Object.create(null);
  var favs = 0;
  songs.forEach(function(s) {
    artists[s.artist] = 1;
    albums[s.album + '|||' + s.artist] = 1;
    if (s.fav) favs++;
  });
  _countsCache = { songs: songs.length, artists: Object.keys(artists).length, albums: Object.keys(albums).length, favs: favs };
  return _countsCache;
}

// ─── Render ───

var _TI = {
  artists:   '<svg class="tab-icon" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>',
  songs:     '<svg class="tab-icon" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>',
  albums:    '<svg class="tab-icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"/></svg>',
  playlists: '<svg class="tab-icon" viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>'
};
var _lastTabCounts = { artists: -1, songs: -1, albums: -1 };

function render() {
  cleanupVirtualScroll();
  cleanupCf();
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
  if (counts.artists !== _lastTabCounts.artists || counts.songs !== _lastTabCounts.songs || counts.albums !== _lastTabCounts.albums) {
    _lastTabCounts = { artists: counts.artists, songs: counts.songs, albums: counts.albums };
    tabs[0].innerHTML = _TI.artists   + '<span class="tab-label">Artists<span class="tab-count"> ' + counts.artists + '</span></span>';
    tabs[1].innerHTML = _TI.songs     + '<span class="tab-label">Songs<span class="tab-count"> '   + counts.songs   + '</span></span>';
    tabs[2].innerHTML = _TI.albums    + '<span class="tab-label">Albums<span class="tab-count"> '  + counts.albums  + '</span></span>';
    tabs[3].innerHTML = _TI.playlists + '<span class="tab-label">Playlists</span>';
  }

  if (selectedAlbum) {
    tabBar.classList.add('hidden');
    header.textContent = selectedAlbum.name;
    menuBtn.innerHTML = '&#8249;';
    menuBtn.onclick = function() { selectedAlbum = null; render(); };
    renderAlbumDetail(main);
  } else if (selectedArtist) {
    tabBar.classList.add('hidden');
    header.textContent = selectedArtist;
    menuBtn.innerHTML = '&#8249;';
    menuBtn.onclick = function() { selectedArtist = null; render(); };
    renderArtistDetail(main);
  } else {
    header.textContent = 'Muzio AI';
    if (currentTab === 'artists') {
      renderArtists(main);
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
    } else if (currentTab === 'favorites') {
      renderFavorites(main);
    }
  }

  updateMiniPlayer();
  if (typeof saveUIState === 'function') saveUIState();
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
    + '<h2 class="welcome-title">Muzio AI</h2>'
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

function renderAlphaStrip(listEl, letters) {
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
    var anchor = listEl.querySelector('[data-alpha-anchor="' + letter + '"]');
    if (anchor) {
      var mc = document.getElementById('mainContent');
      mc.scrollTop = anchor.offsetTop;
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
  var mc  = document.getElementById('mainContent');
  if (!ind || !mc) return false;
  var sh = mc.scrollHeight, ch = mc.clientHeight, st = mc.scrollTop;
  if (sh <= ch + 4) { ind.style.opacity = '0'; return false; }
  var topOff = 108;
  var mini = document.getElementById('miniPlayer');
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
  var mc = document.getElementById('mainContent');
  if (!mc) return;
  var sh = mc.scrollHeight, ch = mc.clientHeight;
  if (sh <= ch) return;
  var topOff = 108;
  var mini = document.getElementById('miniPlayer');
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

  var parts = [];
  var alphaLetters = [];
  var seenAlpha = {};
  artists.forEach(function(a) {
    var ch = a.name.charAt(0).toUpperCase();
    var letter = (ch >= 'A' && ch <= 'Z') ? ch : '#';
    var anchor = '';
    if (!seenAlpha[letter]) {
      seenAlpha[letter] = true;
      alphaLetters.push(letter);
      anchor = ' data-alpha-anchor="' + letter + '"';
    }
    var artEl = a.albumArtUris.length > 0
      ? '<div class="art-lazy" data-lazy-uri="' + escHtml(a.albumArtUris.join('|')) + '" data-size="56" data-round="1">' + artHTML(a.name, 56, true) + '</div>'
      : artHTML(a.name, 56, true);
    parts.push('<div class="artist-row" data-artist="' + escHtml(a.name) + '"' + anchor + '>'
      + artEl
      + '<div class="song-info">'
      + '<div class="artist-name">' + escHtml(a.name) + '</div>'
      + '<div class="artist-meta">' + a.albumCount + ' ' + (a.albumCount === 1 ? 'Album' : 'Albums') + ' &bull; ' + a.songCount + ' ' + (a.songCount === 1 ? 'Song' : 'Songs') + '</div>'
      + '</div>'
      + '<button class="artist-menu-btn" data-artist-menu="' + escHtml(a.name) + '">&#8942;</button>'
      + '</div>');
  });
  el.innerHTML = parts.join('');
  initLazyArt(el);
  el.onclick = function(e) {
    var menuBtn = e.target.closest('[data-artist-menu]');
    if (menuBtn) { e.stopPropagation(); showArtistMenu(menuBtn.dataset.artistMenu); return; }
    var row = e.target.closest('.artist-row[data-artist]');
    if (row) { selectedArtist = row.dataset.artist; render(); }
  };
  renderAlphaStrip(el, alphaLetters);
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
      + '<div class="overflow-item' + (sortMode === 'recent' ? ' active' : '') + '" data-song-sort="recent">Recently added' + (sortMode === 'recent' ? ' &#10003;' : '') + '</div>';
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
      songs = []; songMap = Object.create(null); _countsCache = null;
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
  else if (sortMode === 'recent') sorted.reverse();
  else if (sortMode === 'played') sorted.sort(function(a, b) { return (b.lastPlayed || 0) - (a.lastPlayed || 0); });

  var totalH = sorted.length * VS_ROW_H;
  el.innerHTML = '<div class="sort-bar">'
    + '<span class="sort-label">' + sorted.length + ' songs</span>'
    + '<div class="sort-btns">'
    + '<button class="sort-btn' + (sortMode==='title'?' active':'') + '" data-sort="title">A-Z</button>'
    + '<button class="sort-btn' + (sortMode==='artist'?' active':'') + '" data-sort="artist">Artist</button>'
    + '<button class="sort-btn' + (sortMode==='recent'?' active':'') + '" data-sort="recent">Recent</button>'
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

  // Stretch main to full height — no vertical scroll, no bottom padding
  el.classList.add('albums-cf-mode');

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

  // Type chips
  var chips = [['all','All'],['albums','Albums'],['mixtapes','Mixtapes'],['eps','EPs & Singles']];
  var chipsHtml = '<div class="filter-chips cf-chip-row">';
  chips.forEach(function(c) {
    chipsHtml += '<button class="chip' + (albumFilter === c[0] ? ' active' : '') + '" data-filter="' + c[0] + '">' + c[1] + '<span class="count">' + counts[c[0]] + '</span></button>';
  });
  chipsHtml += '</div>';

  // Genre chips (top 6 only when inline)
  var genreMap = {};
  allAlbums.forEach(function(a) { if (a.genre) genreMap[a.genre] = (genreMap[a.genre] || 0) + 1; });
  var genres = Object.keys(genreMap).sort(function(a, b) { return genreMap[b] - genreMap[a]; }).slice(0, 6);
  if (genres.length > 1) {
    chipsHtml += '<div class="filter-chips genre-chips cf-chip-row">';
    chipsHtml += '<button class="chip chip-genre' + (albumGenreFilter === 'all' ? ' active' : '') + '" data-genre="all">All</button>';
    genres.forEach(function(g) {
      chipsHtml += '<button class="chip chip-genre' + (albumGenreFilter === g ? ' active' : '') + '" data-genre="' + escHtml(g) + '">' + escHtml(g) + '</button>';
    });
    chipsHtml += '</div>';
  }

  el.innerHTML = '<div class="cf-stage" id="cfStage">'
    + '<div class="cf-glow" id="cfGlow"></div>'
    + '<div class="cf-floor" id="cfFloor"></div>'
    + '<div class="cf-specular" id="cfSpecular"></div>'
    + '<div class="cf-center-shadow" id="cfCenterShadow"></div>'
    + '<div id="cfViewport"></div>'
    + '<div class="cf-top-glass" id="cfTopGlass">' + chipsHtml + '</div>'
    + '<div class="cf-bot-glass">'
    + '<div class="cf-counter" id="cfCounter"></div>'
    + '<div class="cf-info-name" id="cfAlbumName"></div>'
    + '<div class="cf-info-meta" id="cfAlbumMeta"></div>'
    + '<div class="cf-actions">'
    + '<button class="cf-btn-play" id="cfBtnPlay">&#9654; Play</button>'
    + '<button class="cf-btn-shuffle" id="cfBtnShuffle" title="Shuffle">&#8644;</button>'
    + '<button class="cf-btn-open" id="cfBtnOpen">&#8250;</button>'
    + '</div>'
    + '</div>'
    + '<div class="cf-collection-bar" id="cfCollectionBar"></div>'
    + '</div>';

  // Wire chip filters
  el.querySelectorAll('.chip:not(.chip-genre)').forEach(function(btn) {
    btn.onclick = function() { albumFilter = btn.dataset.filter; cleanupCf(); render(); };
  });
  el.querySelectorAll('.chip-genre').forEach(function(btn) {
    btn.onclick = function() { albumGenreFilter = btn.dataset.genre; cleanupCf(); render(); };
  });

  // Wire actions
  el.querySelector('#cfBtnPlay').onclick = function() { playCfAlbum(_cfR ? Math.round(_cfR.pos) : _cfCenterIdx); };
  el.querySelector('#cfBtnShuffle').onclick = function() {
    var idx = _cfR ? Math.round(_cfR.pos) : _cfCenterIdx;
    var a = _cfAlbums[idx];
    if (!a) return;
    var sng = getAlbumSongs(a.name, a.artist);
    if (!sng.length) { showToast('No songs found'); return; }
    cleanupCf();
    var shuffled = sng.slice().sort(function() { return Math.random() - 0.5; });
    playSong(shuffled[0], shuffled);
    showNowPlaying = true;
    renderNowPlaying();
    document.getElementById('nowPlaying').classList.remove('hidden');
  };
  el.querySelector('#cfBtnOpen').onclick = function() {
    var a = _cfAlbums[_cfR ? Math.round(_cfR.pos) : _cfCenterIdx];
    if (a) { cleanupCf(); selectedAlbum = { name: a.name, artist: a.artist }; render(); }
  };

  // Init inline cover flow
  startInlineCf(filtered);
}

function renderPlaylists(el) {
  // Build smart playlist song lists
  var spTopTracks = songs.slice().sort(function(a, b) { return (b.playCount || 0) - (a.playCount || 0); }).slice(0, 100);
  var spLastAdded = songs.slice().reverse().slice(0, 100);
  var spRecent    = songs.filter(function(s) { return s.lastPlayed > 0; })
    .sort(function(a, b) { return b.lastPlayed - a.lastPlayed; }).slice(0, 100);
  var spFavs      = getFavorites();

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

  // Wire smart playlist cells
  function wireCell(cellId, list) {
    var cell = document.getElementById(cellId);
    if (!cell) return;
    cell.onclick = function() { if (list.length) playSong(list[0], list); };
  }
  wireCell('spTopTracks', spTopTracks);
  wireCell('spLastAdded', spLastAdded);
  wireCell('spRecent',    spRecent);
  wireCell('spFavs',      spFavs);

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
  var plSongs = pl.songIds.map(function(id) { return songMap[id]; }).filter(Boolean);
  var html = '<div class="section-header">'
    + '<h3>&#9835; ' + escHtml(pl.name) + '</h3>'
    + '<span class="section-count">' + plSongs.length + ' songs</span>'
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
        + '<button class="pl-remove-btn" data-rmid="' + s.id + '">&#215;</button>'
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
      var sid = btn.dataset.rmid;
      pl.songIds = pl.songIds.filter(function(id) { return id !== sid; });
      savePlaylists();
      renderPlaylistSongs(el);
    };
  });
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

// ─── Song Row HTML ───

function eqBarsHTML(paused) {
  return '<div class="eq-bars' + (paused ? ' paused' : '') + '"><span></span><span></span><span></span></div>';
}

function songRowHTML(s, playing, showEdit) {
  var artEl = s.albumArtUri
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

  var heroGrad = (function(){ var g = getGrad(selectedAlbum.name); return 'linear-gradient(135deg,' + g[0] + ',' + g[1] + ')'; })();
  var heroInit = selectedAlbum.name.split(' ').map(function(w){return w[0]||'';}).join('').substring(0,2).toUpperCase();

  var html = '<div class="detail-header">'
    + '<div style="position:relative;width:200px;height:200px;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.5);flex-shrink:0;">'
    + '<div style="position:absolute;top:0;left:0;right:0;bottom:0;background:' + heroGrad + ';display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;font-size:70px;font-weight:700;color:#fff;">' + escHtml(heroInit) + '</div>'
    + (albumArtUri ? '<div class="art-lazy" data-lazy-uri="' + escHtml(albumArtUri) + '" data-fill="1" style="position:absolute;top:0;left:0;right:0;bottom:0;"></div>' : '')
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

// ─── Song Row Bindings ───

function bindSongRows(el, songList) {
  el.onclick = function(e) {
    var fav = e.target.closest('[data-fav]');
    if (fav) {
      var s = songMap[fav.dataset.fav];
      if (s) { s.fav = !s.fav; _countsCache = null; saveLibrary(); render(); }
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
  var mp = document.getElementById('miniPlayer');
  if (!currentSong) {
    mp.classList.add('hidden');
    var miniEqHide = document.getElementById('miniEqBars');
    if (miniEqHide) miniEqHide.classList.add('hidden');
    return;
  }
  if (showNowPlaying) { mp.classList.add('hidden'); return; }
  mp.classList.remove('hidden');

  var uri = currentSong.albumArtUri;
  var songChanged = currentSong.id !== _miniLastSongId;

  if (songChanged) {
    _miniLastSongId = currentSong.id;
    document.getElementById('miniTitle').textContent = currentSong.title;
    document.getElementById('miniArtist').textContent = currentSong.artist;
    var cached = uri && artCache[uri];
    document.getElementById('miniArt').innerHTML = cached
      ? '<img src="' + cached + '" style="width:44px;height:44px;object-fit:cover;border-radius:10px;flex-shrink:0;">'
      : artHTML(currentSong.album || currentSong.title, 44);
    if (uri && !cached) loadCurrentSongArt(currentSong);
  }

  document.getElementById('miniPlayBtn').innerHTML = isPlaying ? '&#10074;&#10074;' : '&#9654;';
  var pct = duration > 0 ? (currentTime / duration * 100) : 0;
  document.getElementById('miniProgressBar').style.width = pct + '%';

  var miniEq = document.getElementById('miniEqBars');
  if (miniEq) {
    if (isPlaying) {
      miniEq.classList.remove('hidden', 'paused');
    } else {
      miniEq.classList.remove('hidden');
      miniEq.classList.add('paused');
    }
  }
}

// ─── Synced Lyrics ───

var lyricsLines = [];
var currentLyricIdx = -1;
var lyricsVisible = false;

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
  var newIdx = -1;
  for (var i = lyricsLines.length - 1; i >= 0; i--) {
    if (time >= lyricsLines[i].time) { newIdx = i; break; }
  }
  if (newIdx === currentLyricIdx) return;
  currentLyricIdx = newIdx;

  var container = document.getElementById('syncedLyricsContainer');
  if (!container) return;
  var items = container.querySelectorAll('.lyric-line');
  for (var j = 0; j < items.length; j++) {
    if (j === currentLyricIdx) {
      items[j].className = 'lyric-line active';
    } else if (j < currentLyricIdx) {
      items[j].className = 'lyric-line past';
    } else {
      items[j].className = 'lyric-line future';
    }
  }
  if (currentLyricIdx >= 0 && items[currentLyricIdx]) {
    var el = items[currentLyricIdx];
    _lyricsScrollTo(container, el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2);
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
  var artData = (artUri && artCacheHD[artUri]) ? artCacheHD[artUri]
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
    + '<div class="np-content">'
    + '<div class="np-header">'
    + '<button id="npClose">&#8744;</button>'
    + '<div class="np-header-center"><div class="np-label">Playing From</div>'
    + '<div class="np-header-album">' + escHtml(currentSong.album && currentSong.album !== 'Unknown Album' ? currentSong.album : currentSong.artist) + '</div></div>'
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
    + '<div class="np-song-artist">' + escHtml(currentSong.artist) + '</div>'
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
    + '<button id="npPrev" class="np-ctrl">&#9198;</button>'
    + '<button class="np-play-btn' + (isPlaying ? ' is-playing' : '') + '" id="npPlay">' + (isPlaying ? '&#10074;&#10074;' : '&#9654;') + '</button>'
    + '<button id="npNext" class="np-ctrl">&#9197;</button>'
    + '<button id="npShuffle" class="np-ctrl' + (isShuffled ? ' active' : '') + '" style="font-size:20px;">&#8644;</button>'
    + '</div>'
    + '<div class="np-bottom">'
    + '<button id="npSpeed" class="np-ctrl' + (playbackRate !== 1.0 ? ' active' : '') + '" style="font-size:13px;font-weight:700;min-width:40px;">' + playbackRate + 'x</button>'
    + '<button id="npAddPlBtn" class="np-ctrl" style="font-size:15px;" title="Add to playlist">&#9835;+</button>'
    + '</div>';

  html += '</div>';  // end np-controls
  html += '</div>';  // end np-content

  np.innerHTML = html;

  // Cache NP elements used on every timeupdate tick
  _npSeekEl  = document.getElementById('npSeek');
  _npFillEl  = document.getElementById('npSeekFill');
  _npTime0El = np.querySelector('.np-times span');

  // Enable marquee scrolling only if title actually overflows its container
  var marqueeEl = document.getElementById('npTitleMarquee');
  var innerEl = document.getElementById('npTitleInner');
  if (marqueeEl && innerEl && innerEl.scrollWidth > marqueeEl.offsetWidth + 4) {
    var dist = innerEl.scrollWidth - marqueeEl.offsetWidth;
    marqueeEl.style.setProperty('--np-scroll-dist', '-' + dist + 'px');
    marqueeEl.classList.add('is-scrolling');
  }

  // Load HD art in-place (fetchHdArt deduplicates concurrent calls)
  if (artUri) {
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
  document.getElementById('npSeek').oninput = function(e) { audio.currentTime = parseFloat(e.target.value); };
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
    _swipeBlocked = !!(e.target.closest('.synced-lyrics-scroll') || e.target.closest('.plain-lyrics-scroll'));
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
    { icon: '&#9998;', label: 'Tag editor',   action: function() { openEditModal(album.name, album.artist); } },
    { icon: '&#9835;', label: 'Go to artist', action: function() { selectedAlbum = null; selectedArtist = album.artist; render(); } },
  ]);
}

function showAddToPlaylistSheet(song) {
  var items = playlists.map(function(pl) {
    return {
      icon: '&#9835;',
      label: pl.name + ' (' + pl.songIds.length + ')',
      action: function() {
        if (pl.songIds.indexOf(song.id) === -1) { pl.songIds.push(song.id); savePlaylists(); }
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
    { icon: '&#128465;', label: 'Remove from library', action: function() {
        songs = songs.filter(function(s) { return s.id !== song.id; });
        queue = queue.filter(function(s) { return s.id !== song.id; });
        songMap = Object.create(null); songs.forEach(function(s) { songMap[s.id] = s; });
        _countsCache = null;
        if (currentSong && currentSong.id === song.id) { currentSong = null; isPlaying = false; audio.pause(); }
        saveLibrary();
        render();
        showToast('Removed from library');
      }
    },
  ]);
}

document.getElementById('bsOverlay').onclick = closeBottomSheet;

// ─── Playback ───

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
  loadCurrentSongArt(song);
  saveLibraryLater();
  queue = songList || songs;
  currentTime = 0;
  duration = song.dur || 0;
  if (song.url) {
    isPlaying = true;
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
}

function togglePlay() {
  if (!currentSong || !currentSong.url) return;
  if (isPlaying) {
    audio.pause();
    isPlaying = false;
  } else {
    isPlaying = true;
    audio.play().catch(function() { isPlaying = false; syncPlaybackUI(); });
  }
  syncPlaybackUI();
}

function handleNext() {
  if (!currentSong || queue.length === 0) return;
  if (repeatMode === 'one') { audio.currentTime = 0; audio.play(); return; }
  var idx = queue.findIndex(function(s) { return s.id === currentSong.id; });
  var nextIdx;
  if (isShuffled) nextIdx = Math.floor(Math.random() * queue.length);
  else nextIdx = idx >= queue.length - 1 ? 0 : idx + 1;
  if (idx >= queue.length - 1 && repeatMode === 'off' && !isShuffled) { isPlaying = false; render(); return; }
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
    if (_npSeekEl) { _npSeekEl.value = currentTime; _npSeekEl.max = duration || 0; }
    if (_npFillEl && duration > 0) _npFillEl.style.width = (currentTime / duration * 100).toFixed(1) + '%';
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
  isPlaying = true;
  syncPlaybackUI();
});
audio.addEventListener('pause', function() {
  if (!isPlaying) return;
  isPlaying = false;
  syncPlaybackUI();
});
audio.addEventListener('error', function() {
  if (!isPlaying) return;
  isPlaying = false;
  syncPlaybackUI();
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

function callGeminiTag(song) {
  if (!apiKey) return Promise.resolve({});
  var ctx = '';
  if (song.title  && !/^unknown/i.test(song.title))  ctx += 'Title: '  + song.title  + '\n';
  if (song.artist && !/^unknown/i.test(song.artist)) ctx += 'Artist: ' + song.artist + '\n';
  if (song.album  && !/^unknown/i.test(song.album))  ctx += 'Album: '  + song.album  + '\n';
  if (song.year)  ctx += 'Year: '  + song.year  + '\n';
  if (song.genre && !GENERIC_GENRE.test(song.genre.trim())) ctx += 'Genre: ' + song.genre + '\n';
  if (song.track) ctx += 'Track: ' + song.track + '\n';
  var prompt = _GEMINI_EXPERTISE
    + (ctx ? 'Existing metadata (confirm identity, fill missing fields):\n' + ctx + '\n' : '')
    + 'Filename: ' + (song.fn || '') + '\n\n'
    + 'Return ONLY a JSON object:\n'
    + '{"title":"","artist":"","album":"","albumArtist":"","trackNumber":0,"year":"","genre":"","releaseType":"","featuredArtists":""}\n\n'
    + _GEMINI_TAG_RULES
    + '- Return ONLY the JSON object, no markdown, no explanation';
  var ctrl = new AbortController();
  var tid = setTimeout(function() { ctrl.abort(); }, 35000);
  return fetch(_GEMINI_URL, {
    method: 'POST',
    signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } }
    })
  }).then(function(res) {
    clearTimeout(tid);
    if (res.status === 429) { var e = new Error('Rate limited — try again in a moment'); throw e; }
    if (res.status >= 500)  { var e2 = new Error('Gemini server error'); throw e2; }
    return res.json();
  }).then(function(data) {
    if (!data.candidates || !data.candidates[0]) throw new Error('No response from Gemini');
    var text = data.candidates[0].content.parts[0].text.trim();
    text = text.replace(/^```json?\s*/, '').replace(/```\s*$/, '');
    return JSON.parse(text);
  }).catch(function(err) { clearTimeout(tid); throw err; });
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
  +   (apiKey ? '<button class="te-ai-btn" id="teAiBtn">&#10024; AI Fill</button>' : '')
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
  +   '<button class="te-btn-save" id="teSaveBtn">Save</button>'
  + '</div>';

  var selectedType = song.type || 'Album';
  var pendingArt = null; // data: URL when user picks a replacement image

  // Release-type chips
  modal.querySelectorAll('.te-chip').forEach(function(btn) {
    btn.onclick = function() {
      selectedType = btn.dataset.type;
      modal.querySelectorAll('.te-chip').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
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

  function applyFormToSong() {
    song.title       = document.getElementById('teTitle').value.trim()       || song.title;
    song.artist      = document.getElementById('teArtist').value.trim()      || song.artist;
    song.album       = document.getElementById('teAlbum').value.trim()       || song.album;
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
    var artPromise = song.albumArtUri
      ? NativeBridge.readAlbumArt(song.albumArtUri, 500).catch(function() { return ''; })
      : Promise.resolve(song.art && song.art.startsWith('data:') ? song.art : '');
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
    }).then(function() {
      showToast('Saved to file ✓');
    }).catch(function(err) {
      var msg = err && err.message ? err.message : String(err);
      showToast('File write failed: ' + msg, 4000);
    });
  };

  if (apiKey) {
    var teAiBtn = document.getElementById('teAiBtn');
    if (teAiBtn) {
      teAiBtn.onclick = function() {
        teAiBtn.disabled = true; teAiBtn.textContent = 'Analyzing…';
        callGeminiTag(song).then(function(result) {
          teAiBtn.disabled = false; teAiBtn.innerHTML = '&#10004; Done';
          var filled = 0;
          [
            { id: 'teTitle',       val: String(result.title           || '').trim() },
            { id: 'teArtist',      val: String(result.artist          || '').trim() },
            { id: 'teAlbum',       val: String(result.album           || '').trim() },
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
          showToast(filled > 0 ? '✓ AI filled ' + filled + ' field' + (filled !== 1 ? 's' : '') : 'AI: song not recognized');
        }).catch(function(err) {
          teAiBtn.disabled = false; teAiBtn.innerHTML = '&#10024; AI Fill';
          showToast('AI error: ' + (err && err.message ? err.message : String(err)));
        });
      };
    }
  }

}

function openEditModal(albumName, artistName) {
  var albumSongs = getAlbumSongs(albumName, artistName);
  var first = albumSongs[0] || {};
  var modal = document.getElementById('editModal');
  var overlay = document.getElementById('editOverlay');

  modal.innerHTML = '<div class="edit-modal-header"><div><h3>Edit Album</h3>'
    + '<p>Changes apply to all ' + albumSongs.length + ' songs</p></div>'
    + '<button id="editClose">&times;</button></div>'
    + '<div class="edit-modal-body">'
    + '<div class="edit-field"><label>Artist</label><input id="editArtist" value="' + escHtml(artistName) + '"></div>'
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
    + '<button class="btn-save" id="editSaveBtn">&#10003; Save All</button>'
    + '</div>';

  modal.classList.remove('hidden');
  overlay.classList.remove('hidden');

  var selectedType = first.type || 'Album';
  modal.querySelectorAll('.type-btn').forEach(function(btn) {
    btn.onclick = function() {
      selectedType = btn.dataset.type;
      modal.querySelectorAll('.type-btn').forEach(function(b) { b.className = 'type-btn'; });
      btn.className = 'type-btn active-' + selectedType.toLowerCase();
    };
  });

  document.getElementById('editClose').onclick = closeEditModal;
  document.getElementById('editCancelBtn').onclick = closeEditModal;
  overlay.onclick = closeEditModal;

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
      saveEdit(s);
    });

    if (selectedAlbum) {
      selectedAlbum = { name: newAlbum || albumName, artist: newArtist || artistName };
    }
    closeEditModal();
    saveLibrary();
    render();

    // On native, write tags to every song file in the album sequentially
    var isNat = typeof NativeBridge !== 'undefined' && NativeBridge.isNative();
    if (!isNat) return;

    var toWrite = albumSongs.filter(function(s) { return s.contentUri; });
    if (!toWrite.length) return;

    showToast('Writing tags to ' + toWrite.length + ' files…');
    var done = 0;
    var failed = 0;

    function writeNext(i) {
      if (i >= toWrite.length) {
        if (failed > 0) {
          showToast(done + ' files saved, ' + failed + ' failed');
        } else {
          showToast('All ' + done + ' files saved permanently ✓');
        }
        return;
      }
      var s = toWrite[i];
      var artPromise = s.albumArtUri
        ? NativeBridge.readAlbumArt(s.albumArtUri, 500).catch(function() { return ''; })
        : Promise.resolve(s.art && s.art.startsWith('data:') ? s.art : '');

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
      }).catch(function(err) {
        failed++;
        var msg = err && err.message ? err.message : String(err);
        writeNext(i + 1);
      });
    }
    writeNext(0);
  };
}

function closeEditModal() {
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
        + '</div>');
    });
    listEl.innerHTML = rows.join('');
    initLazyArt(listEl);
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

// ─── Search ───

function doSearch(q) {
  if (!q) { render(); return; }
  var ql = q.toLowerCase();
  var main = document.getElementById('mainContent');

  var songMatches = songs.filter(function(s) {
    return s.title.toLowerCase().indexOf(ql) !== -1
      || (s.artist && s.artist.toLowerCase().indexOf(ql) !== -1)
      || (s.album && s.album.toLowerCase().indexOf(ql) !== -1)
      || (s.feat && s.feat.toLowerCase().indexOf(ql) !== -1);
  }).slice(0, 5);

  var artistsSeen = {};
  var artistMatches = [];
  songs.forEach(function(s) {
    if (!artistsSeen[s.artist] && s.artist.toLowerCase().indexOf(ql) !== -1) {
      artistsSeen[s.artist] = true;
      artistMatches.push(s.artist);
    }
  });
  artistMatches = artistMatches.slice(0, 5);

  var albumsSeen = {};
  var albumMatches = [];
  songs.forEach(function(s) {
    var key = s.album + '|||' + s.artist;
    if (!albumsSeen[key] && s.album.toLowerCase().indexOf(ql) !== -1) {
      albumsSeen[key] = true;
      albumMatches.push({ name: s.album, artist: s.artist, albumArtUri: s.albumArtUri });
    }
  });
  albumMatches = albumMatches.slice(0, 5);

  if (!songMatches.length && !artistMatches.length && !albumMatches.length) {
    main.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128269;</div><p>No results for &ldquo;' + escHtml(q) + '&rdquo;</p></div>';
    return;
  }

  var parts = [];

  if (songMatches.length) {
    parts.push('<div class="search-section-header">Songs</div>');
    songMatches.forEach(function(s) {
      parts.push(songRowHTML(s, currentSong && currentSong.id === s.id, true));
    });
  }

  if (artistMatches.length) {
    parts.push('<div class="search-section-header">Artists</div>');
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
    parts.push('<div class="search-section-header">Albums</div>');
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
    var allSongs = songs.slice().sort(function() { return Math.random() - 0.5; });
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
    showToast('API key saved — AI Fill is ready in the tag editor');
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
    songs = [];
    songMap = Object.create(null);
    _countsCache = null;
    currentSong = null;
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
      songFn: currentSong ? currentSong.fn : null,
      nowPlaying: showNowPlaying,
      albumFilter: albumFilter,
      sortMode: sortMode,
      albumSortMode: albumSortMode,
      albumArtistsOnly: albumArtistsOnly,
      currentPlaylistId: currentPlaylistId,
      scroll: document.getElementById('mainContent').scrollTop,
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

    if (state.scroll) {
      setTimeout(function() {
        var mc = document.getElementById('mainContent');
        if (mc) mc.scrollTop = state.scroll;
      }, 80);
    }

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
  render();
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
    _countsCache = null;
  }
  applyEditsToSongs(); // always re-apply after IDB load
  render();
  // nativeAutoScan is driven by deviceready + setTimeouts; only call here for brand-new installs
  if (songs.length === 0) nativeAutoScan();
}).catch(function() {
  applyEditsToSongs();
  if (songs.length === 0) nativeAutoScan();
});

// Load persisted art from IndexedDB — after the first session all thumbnails are
// stored locally, so this fills artCache before the next render and art appears
// instantly with no pop-in, no matter how fast the user scrolls.
loadPersistedArt().then(function(cached) {
  var keys = Object.keys(cached);
  if (keys.length > 0) {
    keys.forEach(function(k) { artCacheSet(k, cached[k]); });
    render(); // re-render with full art cache — no more pop-in
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

  // Already have songs — reconnect playback URLs and return. NEVER fall through to a
  // full rescan when the library is already in memory; that would wipe user edits.
  if (songs.length > 0) {
    var needsUrl = songs.filter(function(s) { return !s.url; });
    var reconnected = 0;
    needsUrl.forEach(function(s) {
      try {
        if (s.contentUri) {
          s.url = window.Capacitor.convertFileSrc(s.contentUri);
          reconnected++;
        } else if (s.nativePath) {
          s.url = window.Capacitor.convertFileSrc(s.nativePath.replace('file://', ''));
          reconnected++;
        }
      } catch(e) {}
    });
    render();
    backgroundLoadAllArt();

    // Silently refresh album-art metadata for songs that have none
    var needsArtRefresh = songs.some(function(s) { return !s.albumArtUri && !s.art; });
    if (needsArtRefresh) {
      NativeBridge.scanAllMusic(null).then(function(files) {
        var byUri = {};
        var byFn = {};
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
    }
    return; // always stop here — library is loaded, no scan needed
  }

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

// ─── Inline 3D Cover Flow (Albums tab) ───

var _cfAlbums = [];
var _cfCenterIdx = 0;
var _cfR = null; // runtime state; null when CF not active
// rotateY degrees per slot distance; 65° for slot 1 gives the classic CF fan
var _CF_ANGLES = [0, 65, 70, 72, 75];

function _cfInterp(arr, absP) {
  var lo = Math.floor(absP), hi = Math.min(lo + 1, arr.length - 1);
  var t = absP - lo;
  return arr[lo] * (1 - t) + arr[hi] * t;
}

function _cfBuildPositions(sz) {
  // Visual center-X offsets from stage center for slot distances 0..4.
  // Uses center-pivot (50% 50%) — item positioned by its CSS center.
  // visW = sz * cos(angle) = projected width of a rotated album.
  var offsets = [0];
  var rightEdge = sz / 2; // right visual edge of center album
  for (var i = 1; i <= 4; i++) {
    var visW = sz * Math.cos(_CF_ANGLES[i] * Math.PI / 180);
    var centerOff = rightEdge + 6 + visW / 2; // 6px gap, then half the visible width
    offsets.push(centerOff);
    rightEdge = centerOff + visW / 2;
  }
  return offsets;
}

function startInlineCf(albums) {
  // Deduplicate: group multi-artist variants of the same album (same name OR same art URI)
  var seenArt = {}, seenName = {};
  _cfAlbums = albums.filter(function(a) {
    var nameKey = a.name.toLowerCase().trim();
    if (a.albumArtUri && seenArt[a.albumArtUri]) return false;
    if (seenName[nameKey]) return false;
    if (a.albumArtUri) seenArt[a.albumArtUri] = true;
    seenName[nameKey] = true;
    return true;
  });
  if (!_cfAlbums.length) return;

  // Set viewport styles FIRST so offsetWidth/clientHeight give accurate values
  var vp = document.getElementById('cfViewport');
  if (!vp) return;
  vp.innerHTML = '';
  vp.style.cssText = 'position:absolute;inset:0;overflow:hidden;-webkit-perspective:700px;perspective:700px;';

  // Read ACTUAL rendered dimensions (forces synchronous reflow)
  var stage = document.getElementById('cfStage');
  var stageW = Math.max(200, vp.offsetWidth || window.innerWidth);
  var stageH = Math.max(200, (stage && stage.clientHeight > 0) ? stage.clientHeight : Math.max(200, window.innerHeight - 160));
  var isLandscape = stageW > stageH;

  // CD-sized center album: ~43% of stage width; capped for large screens
  var sz = Math.max(130, Math.min(Math.round(stageW * (isLandscape ? 0.38 : 0.43)), 180));
  // Floor at 60% from stage top — album in upper half, generous glass floor below
  var floorY = Math.round(stageH * (isLandscape ? 0.62 : 0.60));
  var refH = Math.round(sz * 0.35);

  var floor = document.getElementById('cfFloor');
  if (floor) floor.style.top = floorY + 'px';
  var spec = document.getElementById('cfSpecular');
  if (spec) spec.style.top = floorY + 'px';
  var csh = document.getElementById('cfCenterShadow');
  if (csh) {
    var shW = Math.round(sz * 0.78);
    csh.style.top = (floorY - 14) + 'px';
    csh.style.width = shW + 'px';
    csh.style.left = '50%';
    csh.style.marginLeft = '-' + Math.round(shW / 2) + 'px';
  }
  var glow = document.getElementById('cfGlow');
  if (glow) {
    glow.style.top = Math.round(floorY - sz * 0.5) + 'px';
    glow.style.left = '50%';
    glow.style.transform = 'translate(-50%, -50%)';
    glow.style.webkitTransform = 'translate(-50%, -50%)';
  }

  var items = [];
  for (var k = 0; k < 9; k++) {
    var item = document.createElement('div');
    item.className = 'cf-item';
    item.style.cssText = 'position:absolute;cursor:pointer;-webkit-transform-style:preserve-3d;transform-style:preserve-3d;';
    item._cfIdx = -1;
    vp.appendChild(item);
    items.push(item);
  }

  var startIdx = 0;
  if (currentSong) {
    for (var j = 0; j < _cfAlbums.length; j++) {
      if (_cfAlbums[j].name === currentSong.album && _cfAlbums[j].artist === currentSong.artist) {
        startIdx = j; break;
      }
    }
  }
  _cfCenterIdx = startIdx;

  _cfR = {
    pos: startIdx,
    velocity: 0,
    raf: 0,
    snapRaf: 0,
    items: items,
    sz: sz,
    refH: refH,
    floorY: floorY,
    stageW: stageW,
    positions: _cfBuildPositions(sz)
  };

  _cfDoRender();
  updateCfInfo(startIdx);
  updateCfGlow(startIdx);
  _cfAttachTouch();
  _cfPlaySwipeHint();
}

function _cfPlaySwipeHint() {
  var r = _cfR;
  if (!r || _cfAlbums.length < 3) return;
  if (localStorage.getItem('muzio_cfHint')) return;
  localStorage.setItem('muzio_cfHint', '1');
  var basePos = r.pos;
  var peak = basePos + 0.55;
  setTimeout(function() {
    if (!_cfR || _cfR.snapRaf) return;
    var step = 0;
    function hint() {
      if (!_cfR) return;
      step++;
      if (step <= 14) {
        r.pos += (peak - r.pos) * 0.18;
      } else {
        r.pos += (basePos - r.pos) * 0.16;
        if (Math.abs(r.pos - basePos) < 0.005) { r.pos = basePos; _cfDoRender(); return; }
      }
      _cfDoRender();
      r.snapRaf = requestAnimationFrame(hint);
    }
    r.snapRaf = requestAnimationFrame(hint);
  }, 900);
}

function _cfDoRender() {
  var r = _cfR;
  if (!r || !r.items) return;
  var sz = r.sz, refH = r.refH, stageW = r.stageW, floorY = r.floorY;
  var topY = floorY - sz;
  var centerIdx = Math.round(r.pos);

  for (var k = 0; k < 9; k++) {
    var slot = k - 4; // -4..+4
    var albumIdx = centerIdx + slot;
    var el = r.items[k];

    if (albumIdx < 0 || albumIdx >= _cfAlbums.length) {
      el.style.display = 'none';
      continue;
    }

    var relPos = albumIdx - r.pos; // fractional visual distance from center
    var absP = Math.abs(relPos);

    if (absP > 3.6) { el.style.display = 'none'; continue; }

    el.style.display = '';
    // Center-pivot positioning: r.positions gives visual center-X offset from stage center
    var signP = relPos >= 0 ? 1 : -1;
    var xOff = signP * _cfInterp(r.positions, absP);
    el.style.left = Math.round(stageW / 2 + xOff - sz / 2) + 'px';
    el.style.top = topY + 'px';
    el.style.width = sz + 'px';
    el.style.height = (sz + refH) + 'px';
    el.style.zIndex = Math.round(100 - absP * 10);

    // Center pivot for all items — position calculation and visual center both at CSS center
    el.style.webkitTransformOrigin = '50% 50%';
    el.style.transformOrigin = '50% 50%';
    var absAngle = _cfInterp(_CF_ANGLES, absP);
    // Right-side: rotateY(+) → left face toward viewer (inner face); Left-side: rotateY(-) → right face toward viewer
    var rotY = relPos >= 0 ? absAngle : -absAngle;
    var op = Math.max(0.28, 1 - absP * 0.18);
    // Push center album toward viewer; side albums recede naturally
    var tz = Math.round(Math.max(0, (1 - Math.min(absP, 1)) * 26));
    var xf = 'translateZ(' + tz + 'px) rotateY(' + rotY.toFixed(1) + 'deg)';
    el.style.webkitTransform = xf;
    el.style.transform = xf;
    el.style.opacity = op.toFixed(3);
    // Mark the active center album for the CSS glow ring
    if (absP < 0.25) el.classList.add('cf-item-active');
    else el.classList.remove('cf-item-active');

    if (el._cfIdx !== albumIdx) {
      el._cfIdx = albumIdx;
      _cfPaintItem(el, albumIdx, sz, refH);
    }
  }

  var ni = Math.round(r.pos);
  if (ni !== _cfCenterIdx) {
    _cfCenterIdx = ni;
    updateCfInfo(ni);
    updateCfGlow(ni);
  }
}

function _cfPaintItem(el, albumIdx, sz, refH) {
  var a = _cfAlbums[albumIdx];
  if (!a) return;
  var grad = getGrad(a.name);
  var init = escHtml(a.name.split(' ').map(function(w) { return w[0] || ''; }).join('').substring(0, 2).toUpperCase());
  var gradCss = 'linear-gradient(135deg,' + grad[0] + ',' + grad[1] + ')';
  var cached = (a.albumArtUri && artCacheHD[a.albumArtUri]) ? artCacheHD[a.albumArtUri]
             : (a.albumArtUri && artCache[a.albumArtUri]) ? artCache[a.albumArtUri] : '';
  var badge = (a.type && a.type !== 'Album') ? '<div class="cf-type-badge">' + escHtml(a.type) + '</div>' : '';
  var artHtml = cached
    ? '<img class="cf-item-art" src="' + cached + '" alt="" style="width:' + sz + 'px;height:' + sz + 'px;object-fit:cover;">'
    : '<div class="cf-item-placeholder" style="width:' + sz + 'px;height:' + sz + 'px;background:' + gradCss + ';display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:center;justify-content:center;font-size:' + Math.round(sz * 0.3) + 'px;font-weight:700;color:rgba(255,255,255,0.8);">' + init + '</div>';
  var refHtml = cached
    ? '<img src="' + cached + '" alt="" style="width:' + sz + 'px;height:' + sz + 'px;object-fit:cover;">'
    : '<div style="width:' + sz + 'px;height:' + sz + 'px;background:' + gradCss + ';"></div>';

  el.innerHTML = '<div class="cf-item-inner" style="width:' + sz + 'px;height:' + sz + 'px;overflow:hidden;border-radius:4px;position:relative;">' + artHtml + badge + '</div>'
    + '<div style="position:absolute;bottom:' + refH + 'px;left:0;right:0;height:16px;background:-webkit-linear-gradient(top,transparent,rgba(0,0,0,0.6));background:linear-gradient(to bottom,transparent,rgba(0,0,0,0.6));"></div>'
    + '<div class="cf-reflection-wrap" style="position:absolute;top:' + sz + 'px;left:0;width:' + sz + 'px;height:' + refH + 'px;overflow:hidden;-webkit-transform:scaleY(-1);transform:scaleY(-1);opacity:0.32;-webkit-mask-image:-webkit-linear-gradient(top,rgba(0,0,0,0.9),transparent);mask-image:linear-gradient(to bottom,rgba(0,0,0,0.9),transparent);">' + refHtml + '</div>';

  if (a.albumArtUri && !cached) {
    (function(capturedEl, capturedIdx, capturedSz, capturedRefH, capturedA, capturedBadge) {
      fetchThumbnail(capturedA.albumArtUri).then(function(data) {
        if (!data || capturedEl._cfIdx !== capturedIdx) return;
        var inner = capturedEl.querySelector('.cf-item-inner');
        if (inner) {
          inner.innerHTML = '<img class="cf-item-art" src="' + data + '" alt="" style="width:' + capturedSz + 'px;height:' + capturedSz + 'px;object-fit:cover;opacity:0;-webkit-transition:opacity 0.28s ease;transition:opacity 0.28s ease;">' + capturedBadge;
          var img = inner.querySelector('img');
          requestAnimationFrame(function() { if (img) img.style.opacity = '1'; });
        }
        var rw = capturedEl.querySelector('.cf-reflection-wrap');
        if (rw) rw.innerHTML = '<img src="' + data + '" alt="" style="width:' + capturedSz + 'px;height:' + capturedSz + 'px;object-fit:cover;">';
        if (_cfCenterIdx === capturedIdx) updateCfGlow(capturedIdx);
      });
    })(el, albumIdx, sz, refH, a, badge);
  }
}

function _cfAttachTouch() {
  var vp = document.getElementById('cfViewport');
  if (!vp) return;
  var r = _cfR;
  var startX, startT, lastX, lastT, startPos;

  function _cfHandleTap(touchX, touchY) {
    var el = document.elementFromPoint(touchX, touchY);
    while (el && !el.classList.contains('cf-item')) el = el && el.parentElement;
    if (!el || el._cfIdx === undefined || el._cfIdx < 0) return;
    var idx = el._cfIdx;
    if (idx !== _cfCenterIdx) { _cfSnapTo(idx); return; }
    var now = Date.now();
    if (now - _cfLastTap.time < 380 && _cfLastTap.idx === idx) {
      _cfLastTap.time = 0; _cfLastTap.idx = -1;
      if (_cfLastTap.timer) { clearTimeout(_cfLastTap.timer); _cfLastTap.timer = 0; }
      playCfAlbum(idx);
      return;
    }
    _cfLastTap.time = now; _cfLastTap.idx = idx;
    if (_cfLastTap.timer) clearTimeout(_cfLastTap.timer);
    _cfLastTap.timer = setTimeout(function() {
      _cfLastTap.timer = 0;
      if (!_cfR) return;
      cleanupCf();
      selectedAlbum = { name: _cfAlbums[idx].name, artist: _cfAlbums[idx].artist };
      render();
    }, 380);
  }

  vp.addEventListener('touchstart', function(e) {
    if (r.snapRaf) { cancelAnimationFrame(r.snapRaf); r.snapRaf = 0; }
    if (r.raf) { cancelAnimationFrame(r.raf); r.raf = 0; }
    r.velocity = 0;
    startX = lastX = e.touches[0].clientX;
    startT = lastT = Date.now();
    startPos = r.pos;
    e.preventDefault();
  }, { passive: false });

  vp.addEventListener('touchmove', function(e) {
    var x = e.touches[0].clientX;
    var dt = Math.max(1, Date.now() - lastT);
    r.velocity = -(x - lastX) / dt;
    lastX = x;
    lastT = Date.now();
    r.pos = Math.max(0, Math.min(_cfAlbums.length - 1, startPos - (x - startX) / r.sz));
    _cfDoRender();
    e.preventDefault();
  }, { passive: false });

  vp.addEventListener('touchend', function(e) {
    var touch = e.changedTouches[0];
    var isTap = Math.abs(touch.clientX - startX) < 12 && (Date.now() - startT) < 400;
    if (isTap) {
      r.velocity = 0;
      _cfHandleTap(touch.clientX, touch.clientY);
    } else {
      r.velocity = r.velocity * 16 / r.sz;
      _cfMomentum();
    }
    e.preventDefault();
  }, { passive: false });

  vp.addEventListener('touchcancel', function() {
    r.velocity = 0;
    _cfSnapTo(Math.round(r.pos));
  });

  // Desktop/mouse fallback
  vp.addEventListener('click', function(e) {
    _cfHandleTap(e.clientX, e.clientY);
  });
}

function _cfMomentum() {
  var r = _cfR;
  if (!r) return;
  if (Math.abs(r.velocity) < 0.008) {
    r.velocity = 0;
    _cfSnapTo(Math.round(r.pos));
    return;
  }
  r.pos = Math.max(0, Math.min(_cfAlbums.length - 1, r.pos + r.velocity));
  r.velocity *= 0.87;
  _cfDoRender();
  r.raf = requestAnimationFrame(_cfMomentum);
}

function _cfSnapTo(target) {
  var r = _cfR;
  if (!r) return;
  target = Math.max(0, Math.min(_cfAlbums.length - 1, target));
  var diff = target - r.pos;
  if (Math.abs(diff) < 0.003) {
    r.pos = target;
    _cfDoRender();
    return;
  }
  r.pos += diff * 0.22;
  _cfDoRender();
  r.snapRaf = requestAnimationFrame(function() { _cfSnapTo(target); });
}

function cleanupCf() {
  if (_cfLastTap) {
    if (_cfLastTap.timer) { clearTimeout(_cfLastTap.timer); _cfLastTap.timer = 0; }
    _cfLastTap.time = 0; _cfLastTap.idx = -1;
  }
  if (_cfInfoTimer) { clearTimeout(_cfInfoTimer); _cfInfoTimer = 0; }
  if (_cfR) {
    if (_cfR.raf) cancelAnimationFrame(_cfR.raf);
    if (_cfR.snapRaf) cancelAnimationFrame(_cfR.snapRaf);
    _cfR = null;
  }
  _cfAlbums = [];
  var main = document.getElementById('mainContent');
  if (main) main.classList.remove('albums-cf-mode');
}

function updateCfInfo(idx) {
  var ne = document.getElementById('cfAlbumName');
  var me = document.getElementById('cfAlbumMeta');
  if (!ne || !me) return;
  // Fade out, swap text, fade in
  ne.style.opacity = me.style.opacity = '0';
  if (_cfInfoTimer) clearTimeout(_cfInfoTimer);
  _cfInfoTimer = setTimeout(function() {
    _cfInfoTimer = 0;
    var a = _cfAlbums[idx];
    if (!a) return;
    ne.textContent = a.name;
    var parts = [a.artist];
    if (a.year) parts.push(a.year);
    parts.push(a.songCount + ' song' + (a.songCount !== 1 ? 's' : ''));
    me.textContent = parts.join(' • ');
    var ct = document.getElementById('cfCounter');
    if (ct) ct.textContent = (idx + 1) + ' / ' + _cfAlbums.length;
    var bar = document.getElementById('cfCollectionBar');
    if (bar && _cfAlbums.length > 1) {
      bar.style.width = Math.round((idx / (_cfAlbums.length - 1)) * 100) + '%';
    }
    ne.style.opacity = me.style.opacity = '1';
  }, 110);
}

function updateCfGlow(idx) {
  var glow = document.getElementById('cfGlow');
  if (!glow) return;
  var a = _cfAlbums[idx];
  if (!a) return;
  var g = getGrad(a.name);
  glow.style.background = 'radial-gradient(ellipse at center, ' + g[0] + ' 0%, ' + g[1] + ' 60%, transparent 100%)';
}

function playCfAlbum(idx) {
  var a = _cfAlbums[idx];
  if (!a) return;
  var albumSongs = getAlbumSongs(a.name, a.artist);
  if (!albumSongs.length) { showToast('No songs found'); return; }
  cleanupCf();
  playSong(albumSongs[0], albumSongs);
  showNowPlaying = true;
  renderNowPlaying();
  document.getElementById('nowPlaying').classList.remove('hidden');
}

// ─── Hardware Back Button (Android) ───

function handleHardwareBack() {
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
  if (selectedAlbum) { selectedAlbum = null; render(); return; }
  if (selectedArtist) { selectedArtist = null; render(); return; }

  // 8. Nothing to dismiss — exit app
  var plugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MediaStore;
  if (plugin && plugin.exitApp) {
    plugin.exitApp();
  }
}

// Fired by MainActivity.onBackPressed() via getBridge().triggerJSEvent()
document.addEventListener('capacitorBackButton', handleHardwareBack);
