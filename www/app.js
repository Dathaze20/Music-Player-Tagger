// ═══════════════════════════════════════════════════════
// Muzio AI - Smart Music Player
// Pure HTML/CSS/JS - No build tools needed
// Open index.html in any browser or Web Code on Android
// ═══════════════════════════════════════════════════════

// ─── Utilities ───

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

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
function safeArtUrl(url) {
  if (!url) return '';
  if (typeof NativeBridge !== 'undefined' && NativeBridge.isNative() && !url.startsWith('http://localhost')) return '';
  return url;
}

function applyArt(el, dataUrls) {
  var valid = dataUrls.filter(Boolean);
  if (!valid.length || !el.parentNode) return;
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

function fetchThumbnail(uri) {
  if (artCache[uri]) return Promise.resolve(artCache[uri]);
  if (artInFlight[uri]) return artInFlight[uri];
  var p = NativeBridge.readAlbumArt(uri).then(function(data) {
    delete artInFlight[uri];
    if (data) {
      artCache[uri] = data;
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

function loadLazyEl(el) {
  var urisStr = el.dataset.lazyUri || '';
  var uris = urisStr.split('|').filter(Boolean);
  if (!uris.length) return;
  if (uris.every(function(u) { return artCache[u]; })) {
    applyArt(el, uris.map(function(u) { return artCache[u]; }));
    return;
  }
  Promise.all(uris.map(fetchThumbnail)).then(function(dataUrls) { applyArt(el, dataUrls); });
}

function initLazyArt(container) {
  if (typeof NativeBridge === 'undefined' || !NativeBridge.isNative()) return;

  // Disconnect previous observer so stale elements don't hold memory
  if (_lazyArtObs) { _lazyArtObs.disconnect(); _lazyArtObs = null; }

  var lazies = container.querySelectorAll('.art-lazy[data-lazy-uri]');
  if (!lazies.length) return;

  if (!window.IntersectionObserver) {
    lazies.forEach(loadLazyEl);
    return;
  }
  _lazyArtObs = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) { _lazyArtObs.unobserve(entry.target); loadLazyEl(entry.target); }
    });
  }, { rootMargin: '700px' });

  lazies.forEach(function(el) {
    var uris = (el.dataset.lazyUri || '').split('|').filter(Boolean);
    if (uris.length && uris.every(function(u) { return artCache[u]; })) {
      applyArt(el, uris.map(function(u) { return artCache[u]; }));
    } else {
      _lazyArtObs.observe(el);
    }
  });
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
        _miniLastSongId = ''; // force art refresh next updateMiniPlayer (no-op since we set it directly)
      }
    }
    updateMediaSession();
  });
  // 600px HD → Now Playing hero + media session
  if (!artCacheHD[uri]) {
    NativeBridge.readAlbumArt(uri, 600).then(function(data) {
      if (!data) return;
      artCacheHD[uri] = data;
      if (currentSong && currentSong.albumArtUri === uri) updateMediaSession();
      if (showNowPlaying && currentSong && currentSong.albumArtUri === uri) {
        var el = document.getElementById('npArtImg');
        if (el) el.innerHTML = '<img src="' + data + '" style="width:100%;height:100%;object-fit:cover;display:block;">';
      }
    }).catch(function() {});
  }
}

// ─── LRClib Lyrics Fetch ───

function fetchLRCLibLyrics(song) {
  var artist = (song.albumArtist || song.artist || '').trim();
  // Strip feat. from title for cleaner matching
  var title = (song.title || '').replace(/\s+[\(\[]?(?:ft\.?|feat\.?|featuring)[^\)\]\n]*/i, '').trim();
  if (!artist || !title) return Promise.resolve(null);
  var url = 'https://lrclib.net/api/get'
    + '?artist_name=' + encodeURIComponent(artist)
    + '&track_name=' + encodeURIComponent(title)
    + (song.dur ? '&duration=' + Math.round(song.dur) : '');
  var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function() { ctrl.abort(); }, 8000) : null;
  return fetch(url, ctrl ? { signal: ctrl.signal } : {})
    .then(function(res) {
      if (timer) clearTimeout(timer);
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    })
    .then(function(data) {
      if (!data) return null;
      if (data.syncedLyrics) return { syncedLyrics: data.syncedLyrics, plainLyrics: data.plainLyrics || '' };
      if (data.plainLyrics) return { syncedLyrics: '', plainLyrics: data.plainLyrics };
      return null;
    })
    .catch(function() { if (timer) clearTimeout(timer); return null; });
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
        if (!isPlaying) { audio.play().then(function() { isPlaying = true; }).catch(function(){}); }
      }
    };
  });
}

function noLyricsPanelHTML() {
  return '<div class="lyrics-empty-np">'
    + '<div class="lyrics-empty-icon">&#9835;</div>'
    + '<p>No lyrics found</p>'
    + '<button class="add-lyrics-btn" id="addLyricsBtn">&#9998; Add Lyrics</button>'
    + '</div>';
}

function bindAddLyricsBtn(panel, song) {
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
  var panel = document.querySelector('.np-lyrics-panel');
  if (!panel) return;
  var newLines = parseLRC(song.syncedLyrics);
  lyricsLines = newLines;
  currentLyricIdx = -1;
  lyricsVisible = newLines.length > 0;
  if (newLines.length > 0) {
    panel.innerHTML = buildSyncedLyricsHTML();
    bindSyncedLyricsClicks(panel);
    updateSyncedLyrics(currentTime);
  } else if (song.lyrics && song.lyrics.trim()) {
    panel.innerHTML = '<div class="plain-lyrics-scroll"><div class="lyrics-text">'
      + escHtml(song.lyrics).replace(/\\n/g, '<br>').replace(/\n/g, '<br>')
      + '</div></div>';
  } else {
    panel.innerHTML = noLyricsPanelHTML();
    bindAddLyricsBtn(panel, song);
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

// ─── Persistence (localStorage) ───

var _saveLibraryTimer = null;
function saveLibraryLater() {
  clearTimeout(_saveLibraryTimer);
  _saveLibraryTimer = setTimeout(saveLibrary, 1000);
}

function saveLibrary() {
  _countsCache = null;
  songMap = Object.create(null);
  songs.forEach(function(s) { songMap[s.id] = s; });
  try {
    var data = songs.map(function(s) {
      return {
        fn: s.fn, title: s.title, artist: s.artist, album: s.album,
        year: s.year, genre: s.genre, track: s.track, art: s.art,
        lyrics: s.lyrics, syncedLyrics: s.syncedLyrics,
        dur: s.dur, fav: s.fav, type: s.type, feat: s.feat,
        nativePath:  s.nativePath  || '',
        contentUri:  s.contentUri  || '',
        albumArtUri: s.albumArtUri || '',
        albumArtist: s.albumArtist || ''
      };
    });
    localStorage.setItem('muzio_library', JSON.stringify(data));
    localStorage.setItem('muzio_library_count', songs.length.toString());
  } catch (e) {
    showToast('Warning: library could not be saved (' + (e && e.name ? e.name : 'storage error') + ')');
  }
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
  } catch (e) { return []; }
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
var _lazyArtObs = null;

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
var showNowPlaying = false;
var selectedArtist = null;
var selectedAlbum = null;
var albumFilter = 'all';
var queue = [];
var tagging = { total: 0, done: 0, current: '', active: false, paused: false, queue: [] };
var apiKey = localStorage.getItem('gemini_api_key') || '';
var sortMode = 'title';
var artistSortMode = 'az';
var albumSortMode = 'az';
var artistViewMode = 'list';   // 'list' | 'grid2' | 'grid3'
var albumArtistsOnly = true;
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
    if (!map[key]) map[key] = { artist: s.artist, year: s.year, art: art, count: 0, type: s.type || 'Album', albumArtUri: '' };
    map[key].count++;
    if (art && !map[key].art) map[key].art = art;
    if (s.albumArtUri && !map[key].albumArtUri) map[key].albumArtUri = s.albumArtUri;
  });
  var all = Object.keys(map).map(function(key) {
    var name = key.split('|||')[0];
    var d = map[key];
    return { name: name, artist: d.artist, year: d.year, art: d.art, albumArtUri: d.albumArtUri || '', songCount: d.count, type: d.type };
  });

  if (!filter || filter === 'all') return all;
  if (filter === 'albums') return all.filter(function(a) { return a.type === 'Album'; });
  if (filter === 'mixtapes') return all.filter(function(a) { return a.type === 'Mixtape'; });
  if (filter === 'eps') return all.filter(function(a) { return a.type === 'EP' || a.type === 'Single'; });
  return all;
}

function getAlbumSongs(albumName, artistName) {
  return songs.filter(function(s) { return s.album === albumName && s.artist === artistName; })
    .sort(function(a, b) { return (a.track || 0) - (b.track || 0); });
}

function getArtistSongs(name) {
  return songs.filter(function(s) { return s.artist === name; })
    .sort(function(a, b) { return a.album === b.album ? (a.track||0) - (b.track||0) : a.album.localeCompare(b.album); });
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

function render() {
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
  tabs[0].innerHTML = 'Artists<span class="tab-count">' + counts.artists + '</span>';
  tabs[1].innerHTML = 'Songs<span class="tab-count">' + counts.songs + '</span>';
  tabs[2].innerHTML = 'Albums<span class="tab-count">' + counts.albums + '</span>';
  tabs[3].innerHTML = 'Playlists';

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
    } else if (currentTab === 'favorites') {
      renderFavorites(main);
    }
  }

  updateMiniPlayer();
  if (typeof renderReconnectBanner === 'function') renderReconnectBanner();
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

  if (!apiKey) {
    html += '<p class="welcome-api-note" id="welcomeApiLink">&#9881; Set up AI auto-tagging</p>';
  } else {
    html += '<p class="welcome-api-set">&#10003; AI auto-tagging enabled</p>';
  }

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

function renderReconnectBanner() {
  var banner = document.getElementById('reconnectBanner');
  if (!banner) return;
  var needsReconnect = songs.length > 0 && !songs.some(function(s) { return !!s.url; });
  if (needsReconnect) {
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
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

// ─── Custom Scroll Indicator ───

var _scrollInd = null;
var _scrollIndTimer = null;

function initScrollIndicator() {
  // Create indicator element once
  if (!_scrollInd) {
    _scrollInd = document.createElement('div');
    _scrollInd.className = 'scroll-indicator';
    document.getElementById('app').appendChild(_scrollInd);
  }
  var mc = document.getElementById('mainContent');
  // Re-attach listener each time (safe — removeEventListener is a no-op if not added)
  mc.removeEventListener('scroll', _onScrollIndicator, false);
  mc.addEventListener('scroll', _onScrollIndicator, { passive: true });
  // Initialise position immediately (handle case where list is short enough to not scroll)
  _updateScrollIndicator();
}

function _updateScrollIndicator() {
  var ind = _scrollInd;
  var mc = document.getElementById('mainContent');
  if (!ind || !mc) return;
  var scrollTop    = mc.scrollTop;
  var scrollHeight = mc.scrollHeight;
  var clientHeight = mc.clientHeight;
  if (scrollHeight <= clientHeight + 4) { ind.style.opacity = '0'; return; }
  // Track area = between header+tabs and mini-player
  var topOff    = 108; // header (~56) + tabs (~44) + a little breathing room
  var bottomOff = 72;  // mini-player height
  var trackH    = window.innerHeight - topOff - bottomOff;
  var thumbH    = Math.max(36, Math.round(trackH * clientHeight / scrollHeight));
  var ratio     = scrollTop / (scrollHeight - clientHeight);
  var thumbTop  = topOff + Math.round(ratio * (trackH - thumbH));
  ind.style.height = thumbH + 'px';
  ind.style.top    = thumbTop + 'px';
  ind.style.opacity = '1';
}

function _onScrollIndicator() {
  _updateScrollIndicator();
  clearTimeout(_scrollIndTimer);
  _scrollIndTimer = setTimeout(function() { if (_scrollInd) _scrollInd.style.opacity = '0'; }, 1200);
}

function removeScrollIndicator() {
  var mc = document.getElementById('mainContent');
  if (mc) mc.removeEventListener('scroll', _onScrollIndicator, false);
  if (_scrollInd) _scrollInd.style.opacity = '0';
}

// ─── Tab Renderers ───

function renderArtists(el) {
  var artists = getArtists();
  if (artists.length === 0) { renderWelcome(el); renderReconnectBanner(); return; }

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
  if (songs.length === 0) { renderWelcome(el); renderReconnectBanner(); return; }
  var sorted = songs.slice();
  if (sortMode === 'title') sorted.sort(function(a, b) { return a.title.localeCompare(b.title); });
  else if (sortMode === 'artist') sorted.sort(function(a, b) { return a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title); });
  else if (sortMode === 'recent') sorted.reverse();

  var parts = ['<div class="sort-bar">'
    + '<span class="sort-label">' + songs.length + ' songs</span>'
    + '<div class="sort-btns">'
    + '<button class="sort-btn' + (sortMode==='title'?' active':'') + '" data-sort="title">A-Z</button>'
    + '<button class="sort-btn' + (sortMode==='artist'?' active':'') + '" data-sort="artist">Artist</button>'
    + '<button class="sort-btn' + (sortMode==='recent'?' active':'') + '" data-sort="recent">Recent</button>'
    + '</div></div>'];

  sorted.forEach(function(s) {
    parts.push(songRowHTML(s, currentSong && currentSong.id === s.id, true));
  });
  el.innerHTML = parts.join('');
  initLazyArt(el);

  el.querySelectorAll('.sort-btn').forEach(function(btn) {
    btn.onclick = function(e) { e.stopPropagation(); sortMode = btn.dataset.sort; render(); };
  });
  bindSongRows(el, sorted);
  initScrollIndicator();
}

function renderAlbums(el) {
  if (songs.length === 0) { renderWelcome(el); renderReconnectBanner(); return; }
  var allAlbums = getAlbums('all');
  var filtered = getAlbums(albumFilter);
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
  var parts = ['<div class="filter-chips">'];
  chips.forEach(function(c) {
    parts.push('<button class="chip' + (albumFilter === c[0] ? ' active' : '') + '" data-filter="' + c[0] + '">' + c[1] + '<span class="count">' + counts[c[0]] + '</span></button>');
  });
  parts.push('</div><div class="album-grid">');
  filtered.forEach(function(a) {
    var badge = '';
    if (a.type === 'Mixtape') badge = '<span class="release-badge mixtape">Mixtape</span>';
    else if (a.type === 'EP') badge = '<span class="release-badge ep">EP</span>';
    else if (a.type === 'Single') badge = '<span class="release-badge single">Single</span>';

    var aGrad = (function(){ var g = getGrad(a.name); return 'linear-gradient(135deg,' + g[0] + ',' + g[1] + ')'; })();
    var aInit = escHtml(a.name.split(' ').map(function(w){return w[0]||'';}).join('').substring(0,2).toUpperCase());
    var artEl = '<div style="position:absolute;top:0;left:0;right:0;bottom:0;background:' + aGrad + ';display:-webkit-box;display:-webkit-flex;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;font-size:48px;font-weight:700;color:#fff;">' + aInit + '</div>'
      + (a.albumArtUri ? '<div class="art-lazy" data-lazy-uri="' + escHtml(a.albumArtUri) + '" data-fill="1" style="position:absolute;top:0;left:0;right:0;bottom:0;"></div>' : '');
    parts.push('<div class="album-card" data-album="' + escHtml(a.name) + '" data-artist="' + escHtml(a.artist) + '">'
      + '<div class="album-art-wrap">'
      + artEl
      + badge
      + '</div>'
      + '<div class="album-name">' + escHtml(a.name) + '</div>'
      + '<div class="album-meta">' + escHtml(a.artist) + ' &bull; ' + a.songCount + ' Song' + (a.songCount !== 1 ? 's' : '') + '</div>'
      + '</div>');
  });
  parts.push('</div>');
  el.innerHTML = parts.join('');

  initLazyArt(el);
  el.querySelectorAll('.chip').forEach(function(btn) {
    btn.onclick = function() { albumFilter = btn.dataset.filter; render(); };
  });
  el.querySelectorAll('.album-card').forEach(function(card) {
    card.onclick = function() {
      selectedAlbum = { name: card.dataset.album, artist: card.dataset.artist };
      render();
    };
  });
  initScrollIndicator();
}

function renderPlaylists(el) {
  var favCount = getFavorites().length;
  el.innerHTML = '<div style="padding:16px;">'
    + '<div class="playlist-item" id="goFavs">'
    + '<div class="playlist-icon fav-icon">&#10084;</div>'
    + '<div class="song-info"><div class="artist-name">Favorites</div><div class="artist-meta">' + favCount + ' songs</div></div>'
    + '<span style="color:var(--text-faint);">&#8250;</span>'
    + '</div>'
    + '</div>'
    + '<div class="empty-state" style="padding-top:40px;">'
    + '<div class="empty-icon">&#9835;</div>'
    + '<p>More playlists coming soon</p>'
    + '<p class="sub">Use Favorites to save your top tracks</p>'
    + '</div>';
  document.getElementById('goFavs').onclick = function() {
    currentTab = 'favorites';
    render();
  };
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
    + '<button class="song-fav' + (s.fav ? ' active' : '') + '" data-fav="' + s.id + '">' + (s.fav ? '&#10084;' : '&#9825;') + '</button>'
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
  albumSongs.forEach(function(s, i) {
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
      + '<button class="song-fav' + (s.fav ? ' active' : '') + '" data-fav="' + s.id + '">' + (s.fav ? '&#10084;' : '&#9825;') + '</button>'
      + '<button class="song-edit" data-song-menu="' + s.id + '">&#8942;</button>'
      + '</div>');
  });

  el.innerHTML = html + albumRowParts.join('');
  initLazyArt(el);

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
  if (!currentSong) { mp.classList.add('hidden'); return; }
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
      ? '<img src="' + cached + '" style="width:48px;height:48px;object-fit:cover;border-radius:6px;flex-shrink:0;">'
      : artHTML(currentSong.album || currentSong.title, 48);
    if (uri && !cached) loadCurrentSongArt(currentSong);
  }

  document.getElementById('miniPlayBtn').innerHTML = isPlaying ? '&#10074;&#10074;' : '&#9654;';
  var pct = duration > 0 ? (currentTime / duration * 100) : 0;
  document.getElementById('miniProgressBar').style.width = pct + '%';
}

// ─── Synced Lyrics ───

var lyricsLines = [];
var currentLyricIdx = -1;
var lyricsVisible = false;

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
      items[j].classList.add('active');
      items[j].classList.remove('past', 'future');
    } else if (j < currentLyricIdx) {
      items[j].classList.add('past');
      items[j].classList.remove('active', 'future');
    } else {
      items[j].classList.add('future');
      items[j].classList.remove('active', 'past');
    }
  }
  if (currentLyricIdx >= 0 && items[currentLyricIdx]) {
    items[currentLyricIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    ? '<img src="' + artData + '" style="width:100%;height:100%;object-fit:cover;display:block;">'
    : artHTML(currentSong.album || currentSong.title, 300, false, 'xxl');

  var html = '<div class="np-bg-blur" id="npBgBlur"' + (artData ? ' style="background-image:url(' + artData + ')"' : '') + '></div>'
    + '<div class="np-content">'
    + '<div class="np-header">'
    + '<button id="npClose">&#8744;</button>'
    + '<div class="np-header-center"><div class="np-label">Playing From</div>'
    + '<div class="np-header-album">' + escHtml(currentSong.album && currentSong.album !== 'Unknown Album' ? currentSong.album : currentSong.artist) + '</div></div>'
    + '<button id="npEditBtn">&#9998;</button>'
    + '</div>'
    + '<div class="np-art-full" id="npArtImg">' + artContent + '</div>'
    + '<div class="np-info-row">'
    + '<button id="npFav" class="' + (currentSong.fav ? 'fav-active' : '') + '">' + (currentSong.fav ? '&#10084;' : '&#9825;') + '</button>'
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
    + '</div>';

  if (currentSong.genre || currentSong.year || currentSong.type) {
    html += '<div class="np-badges">';
    if (currentSong.genre) html += '<span class="np-badge">' + escHtml(currentSong.genre) + '</span>';
    if (currentSong.year) html += '<span class="np-badge">' + currentSong.year + '</span>';
    if (currentSong.type && currentSong.type !== 'Album') html += '<span class="np-badge ' + (currentSong.type || '').toLowerCase() + '">' + currentSong.type + '</span>';
    html += '</div>';
  }

  html += '</div>';  // end np-controls

  // Inline lyrics panel — always visible, no button tap required
  html += '<div class="np-lyrics-panel">';
  if (lyricsLines.length > 0) {
    html += buildSyncedLyricsHTML();
  } else if (currentSong.lyrics && currentSong.lyrics.trim()) {
    html += '<div class="plain-lyrics-scroll"><div class="lyrics-text">'
      + escHtml(currentSong.lyrics).replace(/\\n/g, '<br>').replace(/\n/g, '<br>')
      + '</div></div>';
  } else if (!currentSong._lyricsFetched) {
    // LRClib fetch will run after render (no API key needed)
    html += '<div class="lyrics-empty-np" id="lyricsFetchMsg">'
      + '<div class="lyrics-empty-icon" style="animation:spin 1.5s linear infinite;display:inline-block;">&#9835;</div>'
      + '<p>Fetching lyrics...</p>'
      + '</div>';
  } else {
    html += noLyricsPanelHTML();
  }
  html += '</div>';  // end np-lyrics-panel
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

  // Load HD art in-place if not yet cached
  if (artUri && !artCacheHD[artUri] && typeof NativeBridge !== 'undefined' && NativeBridge.isNative()) {
    NativeBridge.readAlbumArt(artUri, 600).then(function(data) {
      if (!data) return;
      artCacheHD[artUri] = data;
      if (showNowPlaying && currentSong && currentSong.albumArtUri === artUri) {
        var el = document.getElementById('npArtImg');
        if (el) el.innerHTML = '<img src="' + data + '" style="width:100%;height:100%;object-fit:cover;display:block;">';
        var bg = document.getElementById('npBgBlur');
        if (bg) bg.style.backgroundImage = 'url(' + data + ')';
      }
    }).catch(function() {});
  }

  document.getElementById('npClose').onclick = function() {
    showNowPlaying = false; np.classList.add('hidden');
    _npSeekEl = null; _npFillEl = null; _npTime0El = null;
    updateMiniPlayer();
  };
  document.getElementById('npPlay').onclick = togglePlay;
  document.getElementById('npPrev').onclick = handlePrev;
  document.getElementById('npNext').onclick = handleNext;
  document.getElementById('npEditBtn').onclick = function() { openSongEditModal(currentSong.id); };
  document.getElementById('npRepeat').onclick = function() {
    repeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
    renderNowPlaying();
  };
  document.getElementById('npShuffle').onclick = function() { isShuffled = !isShuffled; renderNowPlaying(); };
  document.getElementById('npFav').onclick = function() {
    var s = songMap[currentSong.id];
    if (s) { s.fav = !s.fav; currentSong.fav = s.fav; _countsCache = null; saveLibrary(); renderNowPlaying(); }
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

  // Wire synced lyric line clicks if already showing (re-open NP case)
  var syncContainer = document.getElementById('syncedLyricsContainer');
  if (syncContainer) {
    bindSyncedLyricsClicks(np);
    updateSyncedLyrics(currentTime);
  }

  // Wire "Add Lyrics" button if already in no-lyrics state
  var npPanel = np.querySelector('.np-lyrics-panel');
  bindAddLyricsBtn(npPanel, currentSong);

  // Auto-fetch lyrics: LRClib first (free, no key), Gemini fallback if key set.
  // _lyricsFetched flag prevents re-firing on every renderNowPlaying() call.
  if (!lyricsVisible && !currentSong.lyrics && !currentSong._lyricsFetched) {
    currentSong._lyricsFetched = true;
    var fetchSong = currentSong;
    fetchLRCLibLyrics(fetchSong).then(function(result) {
      if (result) {
        // LRClib found lyrics — apply directly (accurate real timestamps)
        if (result.syncedLyrics) fetchSong.syncedLyrics = result.syncedLyrics;
        if (result.plainLyrics)  fetchSong.lyrics       = result.plainLyrics;
        saveLibraryLater();
        applyLyricsToNPPanel(fetchSong);
        return;
      }
      // LRClib miss — fall back to Gemini if key available
      if (!apiKey) { applyLyricsToNPPanel(fetchSong); return; }
      callGeminiTag(fetchSong.fn).then(function(meta) {
        if (meta.syncedLyrics) fetchSong.syncedLyrics = meta.syncedLyrics;
        if (meta.lyrics)       fetchSong.lyrics       = meta.lyrics;
        if (meta.genre && !fetchSong.genre) fetchSong.genre = meta.genre;
        if (meta.year  && !fetchSong.year)  fetchSong.year  = String(meta.year);
        if (meta.releaseType && !fetchSong.type) fetchSong.type = meta.releaseType;
        saveLibrary();
        applyLyricsToNPPanel(fetchSong);
      }).catch(function() { applyLyricsToNPPanel(fetchSong); });
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
    'divider',
    { icon: '&#9998;', label: 'Tag editor',        action: function() { openSongEditModal(songId); } },
    { icon: '&#9835;', label: 'Go to album',       action: function() { selectedAlbum = { name: song.album, artist: song.artist }; render(); } },
    { icon: '&#9834;', label: 'Go to artist',      action: function() { selectedAlbum = null; selectedArtist = song.artist; render(); } },
  ]);
}

document.getElementById('bsOverlay').onclick = closeBottomSheet;

// ─── Playback ───

function playSong(song, songList) {
  currentSong = song;
  preloadedUrl = '';
  preloadedSong = null;
  _miniLastSongId = '';
  loadCurrentSongArt(song);
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

function togglePlay() {
  if (!currentSong || !currentSong.url) return;
  if (isPlaying) {
    audio.pause();
    isPlaying = false;
  } else {
    audio.play().then(function() { isPlaying = true; }).catch(function() {});
  }
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
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
  updateMiniPlayer();
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
  var idx = queue.findIndex(function(s) { return s.id === currentSong.id; });
  var prev = idx <= 0 ? queue.length - 1 : idx - 1;
  playSong(queue[prev], queue);
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
  renderReconnectBanner();

  if (added > 0 && !hadSongsBefore) {
    setTimeout(function() { showScanMorePrompt(songs.length); }, 1500);
  }

  if (newSongs.length > 0 && apiKey) {
    newSongs.forEach(function(s) { s.tagging = true; });
    tagging = { total: newSongs.length, done: 0, current: newSongs[0].title, active: true, paused: false, queue: newSongs };
    updateTaggingBanner();
    tagNextSong(newSongs, 0);
  }
}

// ─── AI Auto-Tagging ───

function tagNextSong(songList, idx) {
  if (tagging.paused) return;
  if (idx >= songList.length) {
    tagging.active = false;
    updateTaggingBanner();
    saveLibrary();
    render();
    showToast('AI tagging complete!');
    return;
  }
  var song = songList[idx];
  tagging.current = song.title;
  tagging.done = idx;
  updateTaggingBanner();

  callGeminiTag(song.fn).then(function(meta) {
    if (meta.title) song.title = meta.title;
    if (meta.artist) song.artist = meta.artist;
    if (meta.album) song.album = meta.album;
    if (meta.year) song.year = String(meta.year);
    if (meta.genre) song.genre = meta.genre;
    if (meta.trackNumber) song.track = parseInt(meta.trackNumber) || 0;
    if (meta.releaseType) song.type = meta.releaseType;
    if (meta.featuredArtists) song.feat = meta.featuredArtists;
    if (meta.albumArtUrl) song.art = meta.albumArtUrl;
    if (meta.syncedLyrics) song.syncedLyrics = meta.syncedLyrics;
    if (meta.lyrics) song.lyrics = meta.lyrics;
    song.tagging = false;
    if (idx % 10 === 0) { saveLibrary(); render(); }
    setTimeout(function() { tagNextSong(songList, idx + 1); }, 200);
  }).catch(function(err) {
    song.tagging = false;
    setTimeout(function() { tagNextSong(songList, idx + 1); }, 500);
  });
}

function updateTaggingBanner() {
  var banner = document.getElementById('taggingBanner');
  if (!tagging.active) { banner.classList.add('hidden'); return; }
  banner.classList.remove('hidden');
  document.getElementById('taggingCurrent').textContent = tagging.current;
  document.getElementById('taggingCount').textContent = (tagging.done + 1) + ' / ' + tagging.total;
  document.getElementById('taggingBar').style.width = ((tagging.done + 1) / tagging.total * 100) + '%';
}

// ─── Gemini API ───

function callGeminiTag(fileName) {
  if (!apiKey) return Promise.resolve({});
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
  var prompt = 'You are a music metadata expert with encyclopedic knowledge of hip-hop, rap, R&B, drill, trap, boom-bap, G-funk, cloud rap, and mixtape culture.\n\n'
    + 'You know underground and mainstream artists including: Stack Bundles, Max B, Chinx, Lloyd Banks (Cold Corner 1-3, Halloween Havoc), Styles P (Ghost stories), Jadakiss (Champ Is Here 1-3), Fabolous (Soul Tape, No Competition), Dave East (Kairi Chanel, Paranoia), Griselda (Westside Gunn, Conway, Benny), Roc Marciano, Chief Keef (Back From The Dead, Finally Rich), King Von, Pop Smoke, Lil Wayne (Da Drought 3, No Ceilings, Dedication), Future (Monster, 56 Nights, Beast Mode), Young Thug, Gucci Mane, Jeezy, T.I., Nipsey Hussle (Crenshaw, Victory Lap), Curren$y (Pilot Talk, Jet Files), Wiz Khalifa (Kush & OJ, Taylor Allderdice), Mac Miller (K.I.D.S., Faces), Kevin Gates (Luca Brasi), J. Cole (Friday Night Lights, Truly Yours), Drake (So Far Gone, Room for Improvement), Chance the Rapper (Acid Rap, 10 Day), and all major label releases.\n\n'
    + 'Given this music file name, identify the song and return ONLY a JSON object:\n'
    + '{"title":"","artist":"","album":"","trackNumber":0,"albumArtUrl":"","year":"","genre":"","releaseType":"","featuredArtists":"","syncedLyrics":""}\n\n'
    + 'Rules:\n'
    + '- releaseType must be one of: Album, Mixtape, EP, Single\n'
    + '- For loosies/SoundCloud tracks not on any project, use "Single"\n'
    + '- For DJ-hosted tapes (Gangsta Grillz, Drama, etc), use "Mixtape"\n'
    + '- albumArtUrl should be a real working image URL for the album cover if possible\n'
    + '- genre should be specific: Hip-Hop, Trap, Drill, Boom-Bap, G-Funk, R&B, Cloud Rap, etc\n'
    + '- syncedLyrics: provide the FULL song lyrics in LRC timed format. Each line must have a timestamp like [mm:ss.xx]. Example: "[00:12.50]First line\\n[00:16.20]Second line\\n[00:20.00]Third line". Estimate timestamps based on typical song structure and tempo. Use \\n between lines. If you do not know the lyrics, leave empty.\n'
    + '- Return ONLY the JSON object, no markdown, no explanation\n\n'
    + 'File: ' + fileName;

  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  }).then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.candidates || !data.candidates[0]) throw new Error('No response');
      var text = data.candidates[0].content.parts[0].text.trim();
      text = text.replace(/^```json?\s*/, '').replace(/```\s*$/, '');
      return JSON.parse(text);
    });
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
    ? (song.art && song.art.startsWith('http://localhost') ? song.art : '')
    : (song.art || '');

  // Full-screen mode: add tag-editor class, hide the dim overlay
  modal.classList.add('tag-editor');
  modal.classList.remove('hidden');
  overlay.classList.add('hidden');

  modal.innerHTML =
    '<div class="te-header">'
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
  +       '<input class="te-input" id="teTitle" value="' + escHtml(song.title) + '"></div>'
  +     '<div class="te-field"><div class="te-label">Artist</div>'
  +       '<input class="te-input" id="teArtist" value="' + escHtml(song.artist) + '"></div>'
  +     '<div class="te-field"><div class="te-label">Album</div>'
  +       '<input class="te-input" id="teAlbum" value="' + escHtml(song.album) + '"></div>'
  +     '<div class="te-field"><div class="te-label">Album Artist</div>'
  +       '<input class="te-input" id="teAlbumArtist" value="' + escHtml(song.albumArtist || '') + '"></div>'
  +     '<div class="te-row">'
  +       '<div class="te-field"><div class="te-label">Year</div>'
  +         '<input class="te-input" id="teYear" value="' + escHtml(song.year || '') + '" placeholder="2024"></div>'
  +       '<div class="te-field"><div class="te-label">Genre</div>'
  +         '<input class="te-input" id="teGenre" value="' + escHtml(song.genre || '') + '" placeholder="Hip-Hop"></div>'
  +     '</div>'
  +     '<div class="te-row">'
  +       '<div class="te-field"><div class="te-label">Track #</div>'
  +         '<input class="te-input" id="teTrack" type="number" value="' + (song.track || '') + '" placeholder="1" min="1"></div>'
  +       '<div class="te-field"><div class="te-label">Featured</div>'
  +         '<input class="te-input" id="teFeat" value="' + escHtml(song.feat || '') + '" placeholder="Artist name"></div>'
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
    closeEditModal();
    saveLibrary();
    render();
    if (showNowPlaying && currentSong && currentSong.id === song.id) {
      currentSong = song;
      renderNowPlaying();
    }
  }

  document.getElementById('teSaveBtn').onclick = function() {
    applyFormToSong();
    finishSave();

    // On native, always write tags to the physical file permanently
    if (isNat && song.contentUri) {
      showToast('Saving to file…');

      var artPromise;
      if (pendingArt && pendingArt.startsWith('data:')) {
        artPromise = Promise.resolve(pendingArt);
      } else if (song.art && song.art.startsWith('data:')) {
        artPromise = Promise.resolve(song.art);
      } else if (song.albumArtUri) {
        artPromise = NativeBridge.readAlbumArt(song.albumArtUri, 500).catch(function() { return ''; });
      } else {
        artPromise = Promise.resolve('');
      }

      artPromise.then(function(artBase64) {
        return NativeBridge.writeFileTags({
          contentUri:  song.contentUri,
          title:       song.title,
          artist:      song.artist,
          album:       song.album,
          year:        song.year        || '',
          genre:       song.genre       || '',
          albumArtist: song.albumArtist || '',
          lyrics:      song.lyrics      || '',
          artBase64:   artBase64        || '',
        });
      }).then(function(result) {
        if (result && result.fileWritten) {
          showToast('Saved to file permanently ✓');
        } else {
          showToast('Saved — metadata updated in library');
        }
      }).catch(function(err) {
        showToast('File write failed: ' + (err && err.message ? err.message : String(err)));
      });
    }
  };
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
          lyrics:      s.lyrics      || '',
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

function closeEditModal() {
  var m = document.getElementById('editModal');
  m.classList.add('hidden');
  m.classList.remove('tag-editor');
  document.getElementById('editOverlay').classList.add('hidden');
}

// ─── Drawer ───

function toggleDrawer(show) {
  document.getElementById('drawer').classList.toggle('hidden', !show);
  document.getElementById('drawerOverlay').classList.toggle('hidden', !show);
}

// ─── Settings ───

function openSettings() {
  document.getElementById('settingsModal').classList.remove('hidden');
  document.getElementById('settingsOverlay').classList.remove('hidden');
  document.getElementById('apiKeyInput').value = apiKey;
}

function closeSettings() {
  document.getElementById('settingsModal').classList.add('hidden');
  document.getElementById('settingsOverlay').classList.add('hidden');
}

// ─── Queue Panel ───

function openQueuePanel() {
  var panel = document.getElementById('queuePanel');
  var listEl = document.getElementById('queueList');
  if (!queue || !queue.length) { showToast('Queue is empty'); return; }

  var curIdx = currentSong ? queue.findIndex(function(s) { return s.id === currentSong.id; }) : -1;
  var rows = [];
  queue.forEach(function(s, i) {
    var isCurrent = i === curIdx;
    rows.push('<div class="queue-row' + (isCurrent ? ' queue-now' : '') + '" data-queue-idx="' + i + '">'
      + '<div class="queue-row-num">' + (isCurrent ? '&#9654;' : (i + 1)) + '</div>'
      + '<div class="queue-row-art art-lazy" data-lazy-uri="' + escHtml(s.art || '') + '">'
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

  listEl.onclick = function(e) {
    var row = e.target.closest('[data-queue-idx]');
    if (!row) return;
    var idx = parseInt(row.dataset.queueIdx);
    if (!isNaN(idx) && queue[idx]) {
      closeQueuePanel();
      playSong(queue[idx], queue);
    }
  };

  initLazyArt(listEl);
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
  q = q.toLowerCase();
  var filtered = songs.filter(function(s) {
    return s.title.toLowerCase().indexOf(q) !== -1
      || s.artist.toLowerCase().indexOf(q) !== -1
      || s.album.toLowerCase().indexOf(q) !== -1
      || (s.feat && s.feat.toLowerCase().indexOf(q) !== -1);
  });
  var main = document.getElementById('mainContent');
  if (filtered.length === 0) {
    main.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128269;</div><p>No results for "' + escHtml(q) + '"</p></div>';
    return;
  }
  var parts = ['<div class="section-header"><h3>Results</h3><span class="section-count">' + filtered.length + ' found</span></div>'];
  filtered.forEach(function(s) {
    parts.push(songRowHTML(s, currentSong && currentSong.id === s.id, true));
  });
  main.innerHTML = parts.join('');
  initLazyArt(main);
  bindSongRows(main, filtered);
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

document.getElementById('reconnectBanner').onclick = function() {
  if (!pickFolderWithHandle()) document.getElementById('folderInput').click();
};
document.getElementById('menuBtn').onclick = function() { toggleDrawer(true); };
document.getElementById('drawerOverlay').onclick = function() { toggleDrawer(false); };

document.getElementById('settingsBtn').onclick = function() { toggleDrawer(false); openSettings(); };
document.getElementById('settingsClose').onclick = closeSettings;
document.getElementById('settingsOverlay').onclick = closeSettings;
document.getElementById('settingsCancelBtn').onclick = closeSettings;
document.getElementById('settingsSaveBtn').onclick = function() {
  apiKey = document.getElementById('apiKeyInput').value.trim();
  localStorage.setItem('gemini_api_key', apiKey);
  closeSettings();
  showToast('API key saved!');
};

document.getElementById('testApiKeyBtn').onclick = function() {
  var key = document.getElementById('apiKeyInput').value.trim();
  var resultEl = document.getElementById('testKeyResult');
  if (!key) { resultEl.style.color = 'var(--red)'; resultEl.textContent = 'Enter a key first'; return; }
  resultEl.style.color = 'var(--text-dim)';
  resultEl.textContent = 'Testing...';
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + key;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with just the word: OK' }] }] })
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.candidates && d.candidates[0]) {
      resultEl.style.color = 'var(--emerald)';
      resultEl.textContent = '✓ Key is valid and working';
    } else if (d.error) {
      resultEl.style.color = 'var(--red)';
      resultEl.textContent = '✗ ' + (d.error.message || 'Invalid key');
    }
  })
  .catch(function() {
    resultEl.style.color = 'var(--red)';
    resultEl.textContent = '✗ Network error — check connection';
  });
};

document.getElementById('retagLibBtn').onclick = function() {
  var key = document.getElementById('apiKeyInput').value.trim() || apiKey;
  if (!key) { showToast('Save an API key first'); return; }
  if (tagging.active) { showToast('Tagging already in progress'); return; }
  var toTag = songs.filter(function(s) { return !s.genre || !s.art || !s.year; });
  if (toTag.length === 0) { showToast('All songs already tagged!'); return; }
  apiKey = key;
  localStorage.setItem('gemini_api_key', apiKey);
  closeSettings();
  toTag.forEach(function(s) { s.tagging = true; });
  tagging = { total: toTag.length, done: 0, current: toTag[0].title, active: true, paused: false, queue: toTag };
  updateTaggingBanner();
  tagNextSong(toTag, 0);
  showToast('Re-tagging ' + toTag.length + ' song' + (toTag.length !== 1 ? 's' : '') + '...');
};

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
  } else {
    // App came to foreground — re-render so the UI matches current state
    // (handles cases where Android briefly destroys and recreates the activity)
    render();
    if (showNowPlaying && currentSong) renderNowPlaying();
  }
});
window.addEventListener('beforeunload', saveUIState);
window.addEventListener('pagehide', saveUIState);

// ─── Init ───

restoreUIState();

// Always render on startup — restoreUIState only calls render() when saved state exists,
// so a cold first-launch (no saved state) would otherwise show a blank screen.
render();

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

  // Already have songs — reconnect URLs using saved contentUri or nativePath
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
    // Render and stop whether we reconnected some URLs or all songs already had them.
    // Also stop if songs have saved native paths — reconnected===0 just means the
    // Capacitor bridge isn't ready yet (100ms timer fires too early on some devices).
    // The 500ms/2000ms retries will reconnect URLs. Never fall through to a full rescan
    // in this case, which would wipe all user edits.
    var hasNativePaths = songs.some(function(s) { return s.contentUri || s.nativePath; });
    if (reconnected > 0 || needsUrl.length === 0 || hasNativePaths) {
      render();
      if (reconnected > 0 || needsUrl.length === 0) {
        renderReconnectBanner();
      }

      // If library is missing album art metadata (old scan), refresh silently in background
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
      return;
    }
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
    songs = newSongs;
    saveLibrary();
    render();
    showToast('Loaded ' + newSongs.length + ' songs!', 3000);
    if (newSongs.length > 0 && apiKey) {
      var untagged = newSongs.filter(function(s) { return !s.genre && !s.art; });
      if (untagged.length > 0) {
        untagged.forEach(function(s) { s.tagging = true; });
        tagging = { total: untagged.length, done: 0, current: untagged[0].title, active: true, paused: false, queue: untagged };
        updateTaggingBanner();
        tagNextSong(untagged, 0);
      }
    }
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

// ─── Hardware Back Button (Android) ───

function handleHardwareBack() {
  // 1. Close any overflow/context menu
  var overflowMenu = document.getElementById('overflowMenu');
  if (overflowMenu) { overflowMenu.remove(); return; }

  // 1b. Close bottom sheet
  var bs = document.getElementById('bottomSheet');
  if (bs && !bs.classList.contains('hidden')) { closeBottomSheet(); return; }

  // 1c. Close queue panel
  var queuePanel = document.getElementById('queuePanel');
  if (queuePanel && !queuePanel.classList.contains('hidden')) {
    queuePanel.classList.add('hidden');
    return;
  }

  // 2. Close settings modal
  var settingsModal = document.getElementById('settingsModal');
  if (settingsModal && !settingsModal.classList.contains('hidden')) {
    settingsModal.classList.add('hidden');
    document.getElementById('settingsOverlay').classList.add('hidden');
    return;
  }

  // 3. Close edit modal
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
