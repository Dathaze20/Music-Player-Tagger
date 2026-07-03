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

function imgOrArt(url, text, size, round, cls) {
  if (url) {
    var r = round ? 'border-radius:50%;' : 'border-radius:8px;';
    return '<img src="' + url + '" class="song-art' + (cls ? ' ' + cls : '') + '" style="width:' + size + 'px;height:' + size + 'px;' + r + 'object-fit:cover;" onerror="this.outerHTML=artHTML(\'' + escHtml(text).replace(/'/g,"\\'") + '\',' + size + ',' + round + ')">';
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

function saveLibrary() {
  try {
    var data = songs.map(function(s) {
      return {
        fn: s.fn, title: s.title, artist: s.artist, album: s.album,
        year: s.year, genre: s.genre, track: s.track, art: s.art,
        lyrics: s.lyrics, syncedLyrics: s.syncedLyrics,
        dur: s.dur, fav: s.fav, type: s.type, feat: s.feat,
        nativePath: s.nativePath || '',
        contentUri: s.contentUri || ''
      };
    });
    localStorage.setItem('muzio_library', JSON.stringify(data));
    localStorage.setItem('muzio_library_count', songs.length.toString());
  } catch (e) {}
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
var nativeScanning = false;
var nativeScanCount = 0;
var nativeScanError = '';

var audio = document.getElementById('audioEl');

// ─── Derived Data ───

function getArtists() {
  var map = {};
  songs.forEach(function(s) {
    if (!map[s.artist]) map[s.artist] = { albums: {}, count: 0, arts: [] };
    map[s.artist].albums[s.album] = true;
    map[s.artist].count++;
    if (s.art && map[s.artist].arts.indexOf(s.art) === -1) map[s.artist].arts.push(s.art);
  });
  return Object.keys(map).sort().map(function(name) {
    return { name: name, albumCount: Object.keys(map[name].albums).length, songCount: map[name].count, arts: map[name].arts };
  });
}

function getAlbums(filter) {
  var map = {};
  songs.forEach(function(s) {
    var key = s.album + '|||' + s.artist;
    if (!map[key]) map[key] = { artist: s.artist, year: s.year, art: s.art, count: 0, type: s.type || 'Album' };
    map[key].count++;
    if (s.art && !map[key].art) map[key].art = s.art;
  });
  var all = Object.keys(map).map(function(key) {
    var name = key.split('|||')[0];
    var d = map[key];
    return { name: name, artist: d.artist, year: d.year, art: d.art, songCount: d.count, type: d.type };
  }).sort(function(a, b) { return a.name.localeCompare(b.name); });

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
    if (!map[s.album]) map[s.album] = { year: s.year, art: s.art, count: 0, type: s.type };
    map[s.album].count++;
    if (s.art && !map[s.album].art) map[s.album].art = s.art;
  });
  return Object.keys(map).map(function(a) {
    return { name: a, artist: name, year: map[a].year, art: map[a].art, songCount: map[a].count, type: map[a].type };
  });
}

function getFavorites() {
  return songs.filter(function(s) { return s.fav; });
}

function getSongCounts() {
  var artists = {};
  var albums = {};
  songs.forEach(function(s) {
    artists[s.artist] = true;
    albums[s.album + '|||' + s.artist] = true;
  });
  return { songs: songs.length, artists: Object.keys(artists).length, albums: Object.keys(albums).length, favs: getFavorites().length };
}

// ─── Render ───

function render() {
  var main = document.getElementById('mainContent');
  var tabBar = document.getElementById('tabBar');
  var header = document.getElementById('headerTitle');
  var fab = document.getElementById('fabBtn');
  var menuBtn = document.getElementById('menuBtn');
  var searchBar = document.getElementById('searchBar');

  searchBar.classList.add('hidden');
  tabBar.classList.remove('hidden');
  menuBtn.innerHTML = '&#9776;';
  menuBtn.onclick = function() { toggleDrawer(true); };
  fab.classList.remove('hidden');

  var counts = getSongCounts();
  var tabs = tabBar.querySelectorAll('button');
  tabs[0].innerHTML = 'Artists<span class="tab-count">' + counts.artists + '</span>';
  tabs[1].innerHTML = 'Songs<span class="tab-count">' + counts.songs + '</span>';
  tabs[2].innerHTML = 'Albums<span class="tab-count">' + counts.albums + '</span>';
  tabs[3].innerHTML = 'Playlists';

  if (selectedAlbum) {
    tabBar.classList.add('hidden');
    fab.classList.add('hidden');
    header.textContent = selectedAlbum.name;
    menuBtn.innerHTML = '&#8249;';
    menuBtn.onclick = function() { selectedAlbum = null; render(); };
    renderAlbumDetail(main);
  } else if (selectedArtist) {
    tabBar.classList.add('hidden');
    fab.classList.add('hidden');
    header.textContent = selectedArtist;
    menuBtn.innerHTML = '&#8249;';
    menuBtn.onclick = function() { selectedArtist = null; render(); };
    renderArtistDetail(main);
  } else {
    header.textContent = 'Muzio AI';
    if (currentTab === 'artists') renderArtists(main);
    else if (currentTab === 'songs') renderSongs(main);
    else if (currentTab === 'albums') renderAlbums(main);
    else if (currentTab === 'playlists') renderPlaylists(main);
    else if (currentTab === 'favorites') renderFavorites(main);
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
        + '<p class="welcome-text" style="margin-bottom:20px">' + nativeScanError + '</p>'
        + '<button class="welcome-btn" id="welcomeRetryBtn" style="max-width:220px">&#8635; Try Again</button>'
        + '<p class="welcome-hint">Or go to Settings → Apps → Muzio AI → Permissions → Files and media</p>'
        + '</div>';
      document.getElementById('welcomeRetryBtn').onclick = function() {
        nativeScanError = '';
        nativeAutoScan();
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

// ─── Tab Renderers ───

function renderArtists(el) {
  var artists = getArtists();
  if (artists.length === 0) { renderWelcome(el); renderReconnectBanner(); return; }
  var html = '';
  artists.forEach(function(a) {
    var artEl = a.arts.length > 0
      ? '<img src="' + a.arts[0] + '" style="width:56px;height:56px;border-radius:50%;object-fit:cover;" onerror="this.outerHTML=artHTML(\'' + escHtml(a.name).replace(/'/g,"\\'") + '\',56,true)">'
      : artHTML(a.name, 56, true);
    html += '<div class="artist-row" data-artist="' + escHtml(a.name) + '">'
      + artEl
      + '<div class="song-info">'
      + '<div class="artist-name">' + escHtml(a.name) + '</div>'
      + '<div class="artist-meta">' + a.albumCount + ' ' + (a.albumCount === 1 ? 'Album' : 'Albums') + ' &bull; ' + a.songCount + ' ' + (a.songCount === 1 ? 'Song' : 'Songs') + '</div>'
      + '</div>'
      + '<span style="color:var(--text-faint);padding:8px;">&#8942;</span>'
      + '</div>';
  });
  el.innerHTML = html;
  el.querySelectorAll('.artist-row').forEach(function(row) {
    row.onclick = function() { selectedArtist = row.dataset.artist; render(); };
  });
}

function renderSongs(el) {
  if (songs.length === 0) { renderWelcome(el); renderReconnectBanner(); return; }
  var sorted = songs.slice();
  if (sortMode === 'title') sorted.sort(function(a, b) { return a.title.localeCompare(b.title); });
  else if (sortMode === 'artist') sorted.sort(function(a, b) { return a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title); });
  else if (sortMode === 'recent') sorted.reverse();

  var html = '<div class="sort-bar">'
    + '<span class="sort-label">' + songs.length + ' songs</span>'
    + '<div class="sort-btns">'
    + '<button class="sort-btn' + (sortMode==='title'?' active':'') + '" data-sort="title">A-Z</button>'
    + '<button class="sort-btn' + (sortMode==='artist'?' active':'') + '" data-sort="artist">Artist</button>'
    + '<button class="sort-btn' + (sortMode==='recent'?' active':'') + '" data-sort="recent">Recent</button>'
    + '</div></div>';

  sorted.forEach(function(s) {
    var playing = currentSong && currentSong.id === s.id;
    html += songRowHTML(s, playing, true);
  });
  el.innerHTML = html;

  el.querySelectorAll('.sort-btn').forEach(function(btn) {
    btn.onclick = function(e) { e.stopPropagation(); sortMode = btn.dataset.sort; render(); };
  });
  bindSongRows(el, sorted);
}

function renderAlbums(el) {
  if (songs.length === 0) { renderWelcome(el); renderReconnectBanner(); return; }
  var allAlbums = getAlbums('all');
  var filtered = getAlbums(albumFilter);
  var counts = {
    all: allAlbums.length,
    albums: allAlbums.filter(function(a){return a.type==='Album';}).length,
    mixtapes: allAlbums.filter(function(a){return a.type==='Mixtape';}).length,
    eps: allAlbums.filter(function(a){return a.type==='EP'||a.type==='Single';}).length,
  };
  var chips = [['all','All'],['albums','Albums'],['mixtapes','Mixtapes'],['eps','EPs & Singles']];
  var html = '<div class="filter-chips">';
  chips.forEach(function(c) {
    html += '<button class="chip' + (albumFilter === c[0] ? ' active' : '') + '" data-filter="' + c[0] + '">' + c[1] + '<span class="count">' + counts[c[0]] + '</span></button>';
  });
  html += '</div><div class="album-grid">';
  filtered.forEach(function(a) {
    var badge = '';
    if (a.type === 'Mixtape') badge = '<span class="release-badge mixtape">Mixtape</span>';
    else if (a.type === 'EP') badge = '<span class="release-badge ep">EP</span>';
    else if (a.type === 'Single') badge = '<span class="release-badge single">Single</span>';

    html += '<div class="album-card" data-album="' + escHtml(a.name) + '" data-artist="' + escHtml(a.artist) + '">'
      + '<div class="album-art-wrap">'
      + (a.art ? '<img src="' + a.art + '" onerror="this.style.display=\'none\'">' : artHTML(a.name, 200))
      + badge
      + '</div>'
      + '<div class="album-name">' + escHtml(a.name) + '</div>'
      + '<div class="album-meta">' + escHtml(a.artist) + ' &bull; ' + (a.year || '—') + '</div>'
      + '</div>';
  });
  html += '</div>';
  el.innerHTML = html;

  el.querySelectorAll('.chip').forEach(function(btn) {
    btn.onclick = function() { albumFilter = btn.dataset.filter; render(); };
  });
  el.querySelectorAll('.album-card').forEach(function(card) {
    card.onclick = function() {
      selectedAlbum = { name: card.dataset.album, artist: card.dataset.artist };
      render();
    };
  });
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
  bindSongRows(el, favs);
}

// ─── Song Row HTML ───

function songRowHTML(s, playing, showEdit) {
  return '<div class="song-row' + (playing ? ' playing' : '') + (s.tagging ? ' tagging' : '') + '" data-id="' + s.id + '">'
    + imgOrArt(s.art, s.album || s.title, 48)
    + '<div class="song-info">'
    + '<div class="song-title' + (playing ? ' playing' : '') + '">' + escHtml(s.title)
    + (s.feat ? '<span class="feat"> ft. ' + escHtml(s.feat) + '</span>' : '')
    + '</div>'
    + '<div class="song-meta">' + escHtml(s.artist) + (s.album && s.album !== 'Unknown Album' ? ' &bull; ' + escHtml(s.album) : '')
    + (s.type === 'Mixtape' ? '<span class="mixtape-tag"> &bull; Mixtape</span>' : '')
    + '</div></div>'
    + (s.tagging ? '<div class="tagging-spinner" style="width:20px;height:20px;"></div>' : '')
    + '<span class="song-duration">' + fmtTime(s.dur) + '</span>'
    + '<button class="song-fav' + (s.fav ? ' active' : '') + '" data-fav="' + s.id + '">' + (s.fav ? '&#10084;' : '&#9825;') + '</button>'
    + (showEdit ? '<button class="song-edit" data-edit="' + s.id + '">&#8942;</button>' : '')
    + '</div>';
}

// ─── Detail Views ───

function renderArtistDetail(el) {
  var artistSongs = getArtistSongs(selectedArtist);
  var artistAlbums = getArtistAlbums(selectedArtist);
  var totalDur = artistSongs.reduce(function(sum, s) { return sum + (s.dur || 0); }, 0);

  var html = '<div class="detail-header">'
    + artHTML(selectedArtist, 120, true, 'large')
    + '<div class="detail-title">' + escHtml(selectedArtist) + '</div>'
    + '<div class="detail-artist">' + artistAlbums.length + ' ' + (artistAlbums.length === 1 ? 'Album' : 'Albums') + ' &bull; ' + artistSongs.length + ' Songs &bull; ' + fmtTime(totalDur) + '</div>'
    + '<div class="detail-actions">'
    + '<button class="btn btn-primary" id="playAllBtn">&#9654; Play All</button>'
    + '<button class="btn btn-secondary" id="shuffleAllBtn">&#8645; Shuffle</button>'
    + '</div></div>';

  if (artistAlbums.length > 0) {
    html += '<div class="section-label">Albums &amp; Projects</div><div class="album-scroll">';
    artistAlbums.forEach(function(a) {
      var badge = '';
      if (a.type === 'Mixtape') badge = '<span class="release-badge mixtape" style="font-size:8px;padding:1px 6px;">Mixtape</span>';
      else if (a.type === 'EP') badge = '<span class="release-badge ep" style="font-size:8px;padding:1px 6px;">EP</span>';
      html += '<div class="album-scroll-item" data-album="' + escHtml(a.name) + '" data-artist="' + escHtml(a.artist) + '">'
        + '<div class="album-scroll-art">'
        + (a.art ? '<img src="' + a.art + '">' : artHTML(a.name, 128))
        + badge
        + '</div>'
        + '<div class="album-scroll-name">' + escHtml(a.name) + '</div>'
        + '<div class="album-scroll-year">' + (a.year || '') + ' &bull; ' + a.songCount + ' songs</div>'
        + '</div>';
    });
    html += '</div>';
  }

  html += '<div class="section-label">All Songs</div>';
  artistSongs.forEach(function(s, i) {
    var playing = currentSong && currentSong.id === s.id;
    html += '<div class="song-row' + (playing ? ' playing' : '') + '" data-id="' + s.id + '">'
      + '<span class="track-num">' + (i + 1) + '</span>'
      + '<div class="song-info">'
      + '<div class="song-title' + (playing ? ' playing' : '') + '">' + escHtml(s.title)
      + (s.feat ? '<span class="feat"> ft. ' + escHtml(s.feat) + '</span>' : '') + '</div>'
      + '<div class="song-meta">' + escHtml(s.album) + '</div>'
      + '</div>'
      + '<span class="song-duration">' + fmtTime(s.dur) + '</span>'
      + '<button class="song-edit" data-edit="' + s.id + '">&#8942;</button>'
      + '</div>';
  });

  el.innerHTML = html;

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

  var html = '<div class="detail-header">'
    + '<div style="width:200px;height:200px;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.5);">'
    + (first.art ? '<img src="' + first.art + '" style="width:100%;height:100%;object-fit:cover;">' : artHTML(selectedAlbum.name, 200, false, 'xl'))
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

  albumSongs.forEach(function(s, i) {
    var playing = currentSong && currentSong.id === s.id;
    html += '<div class="song-row' + (playing ? ' playing' : '') + '" data-id="' + s.id + '">'
      + '<span class="track-num">' + (s.track || i + 1) + '</span>'
      + '<div class="song-info">'
      + '<div class="song-title' + (playing ? ' playing' : '') + '">' + escHtml(s.title)
      + (s.feat ? '<span class="feat"> ft. ' + escHtml(s.feat) + '</span>' : '') + '</div>'
      + '</div>'
      + (s.tagging ? '<div class="tagging-spinner" style="width:20px;height:20px;"></div>' : '')
      + '<span class="song-duration">' + fmtTime(s.dur) + '</span>'
      + '<button class="song-fav' + (s.fav ? ' active' : '') + '" data-fav="' + s.id + '">' + (s.fav ? '&#10084;' : '&#9825;') + '</button>'
      + '<button class="song-edit" data-edit="' + s.id + '">&#8942;</button>'
      + '</div>';
  });

  el.innerHTML = html;

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
  el.querySelectorAll('.song-row').forEach(function(row) {
    row.onclick = function(e) {
      if (e.target.closest('.song-fav') || e.target.closest('.song-edit')) return;
      var s = songs.find(function(x) { return x.id === row.dataset.id; });
      if (s) {
        if (!s.url) { showToast('Re-import your music folder to enable playback'); return; }
        playSong(s, songList);
      }
    };
  });
  el.querySelectorAll('.song-fav').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      var s = songs.find(function(x) { return x.id === btn.dataset.fav; });
      if (s) { s.fav = !s.fav; saveLibrary(); render(); }
    };
  });
  el.querySelectorAll('.song-edit').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      openSongEditModal(btn.dataset.edit);
    };
  });
}

// ─── Mini Player ───

function updateMiniPlayer() {
  var mp = document.getElementById('miniPlayer');
  if (!currentSong) { mp.classList.add('hidden'); return; }
  if (showNowPlaying) { mp.classList.add('hidden'); return; }
  mp.classList.remove('hidden');
  document.getElementById('miniArt').innerHTML = imgOrArt(currentSong.art, currentSong.album || currentSong.title, 48);
  document.getElementById('miniTitle').textContent = currentSong.title;
  document.getElementById('miniArtist').textContent = currentSong.artist;
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

  var typeClass = (currentSong.type || '').toLowerCase();
  var html = '<div class="np-header">'
    + '<button id="npClose">&#8744;</button>'
    + '<div class="np-label">Now Playing</div>'
    + '<button id="npEditBtn">&#9998;</button>'
    + '</div>'
    + '<div class="np-art-container">'
    + '<div class="np-art' + (isPlaying ? ' spinning' : '') + '">'
    + (currentSong.art ? '<img src="' + currentSong.art + '">' : artHTML(currentSong.album || currentSong.title, 288, false, 'xxl'))
    + '</div>'
    + '<div class="np-song-title">' + escHtml(currentSong.title)
    + (currentSong.feat ? '<span class="feat"> ft. ' + escHtml(currentSong.feat) + '</span>' : '')
    + '</div>'
    + '<div class="np-song-artist">' + escHtml(currentSong.artist) + '</div>'
    + (currentSong.album && currentSong.album !== 'Unknown Album' ? '<div class="np-song-album">' + escHtml(currentSong.album) + (currentSong.year ? ' (' + currentSong.year + ')' : '') + '</div>' : '')
    + '</div>'
    + '<div class="np-controls">'
    + '<div class="np-progress">'
    + '<input type="range" id="npSeek" min="0" max="' + (duration || 0) + '" value="' + currentTime + '" step="0.1">'
    + '<div class="np-times"><span>' + fmtTime(currentTime) + '</span><span>' + fmtTime(duration) + '</span></div>'
    + '</div>'
    + '<div class="np-main-controls">'
    + '<button id="npShuffle" class="np-ctrl' + (isShuffled ? ' active' : '') + '">&#8645;</button>'
    + '<button id="npPrev" class="np-ctrl">&#9198;</button>'
    + '<button class="np-play-btn" id="npPlay">' + (isPlaying ? '&#10074;&#10074;' : '&#9654;') + '</button>'
    + '<button id="npNext" class="np-ctrl">&#9197;</button>'
    + '<button id="npRepeat" class="np-ctrl' + (repeatMode !== 'off' ? ' active' : '') + '">&#128257;' + (repeatMode === 'one' ? '<sub>1</sub>' : '') + '</button>'
    + '</div>'
    + '<div class="np-bottom">'
    + '<button id="npFav" class="np-ctrl' + (currentSong.fav ? ' fav-active' : '') + '">' + (currentSong.fav ? '&#10084;' : '&#9825;') + '</button>'
    + '<div class="volume-control">'
    + '<button id="npMute" class="np-ctrl">' + (isMuted ? '&#128263;' : '&#128266;') + '</button>'
    + '<input type="range" id="npVolume" min="0" max="1" step="0.01" value="' + (isMuted ? 0 : volume) + '">'
    + '</div>'
    + '</div>';

  if (currentSong.genre || currentSong.year || currentSong.type) {
    html += '<div class="np-badges">';
    if (currentSong.genre) html += '<span class="np-badge">' + currentSong.genre + '</span>';
    if (currentSong.year) html += '<span class="np-badge">' + currentSong.year + '</span>';
    if (currentSong.type && currentSong.type !== 'Album') html += '<span class="np-badge ' + typeClass + '">' + currentSong.type + '</span>';
    html += '</div>';
  }

  html += '<button class="lyrics-toggle" id="npLyricsToggle">&#9835; Lyrics</button>';
  html += '</div>';

  lyricsLines = parseLRC(currentSong.syncedLyrics);
  var hasLyrics = lyricsLines.length > 0 || (currentSong.lyrics && currentSong.lyrics.trim());

  html += '<div class="lyrics-fullscreen hidden" id="lyricsFullscreen">';
  html += '<div class="lyrics-fs-header">'
    + '<button id="lyricsBack">&#8744;</button>'
    + '<div class="lyrics-fs-song">' + escHtml(currentSong.title) + '</div>'
    + '<div class="lyrics-fs-artist">' + escHtml(currentSong.artist) + '</div>'
    + '</div>';

  if (lyricsLines.length > 0) {
    html += buildSyncedLyricsHTML();
  } else if (currentSong.lyrics && currentSong.lyrics.trim()) {
    html += '<div class="plain-lyrics-scroll"><div class="lyrics-text">'
      + escHtml(currentSong.lyrics).replace(/\\n/g, '<br>').replace(/\n/g, '<br>')
      + '</div></div>';
  } else {
    html += '<div class="lyrics-empty-fs"><div class="lyrics-empty-icon">&#9835;</div>'
      + '<p>No lyrics available</p>'
      + '<p class="sub">Lyrics are fetched automatically during AI tagging</p></div>';
  }

  html += '<div class="lyrics-fs-controls">'
    + '<div class="lyrics-fs-mini-art">' + imgOrArt(currentSong.art, currentSong.album || currentSong.title, 40) + '</div>'
    + '<div class="lyrics-fs-info"><div class="lyrics-fs-title">' + escHtml(currentSong.title) + '</div>'
    + '<div class="lyrics-fs-meta">' + escHtml(currentSong.artist) + '</div></div>'
    + '<button class="lyrics-fs-play" id="lyricsFsPlay">' + (isPlaying ? '&#10074;&#10074;' : '&#9654;') + '</button>'
    + '</div>';
  html += '</div>';

  np.innerHTML = html;

  document.getElementById('npClose').onclick = function() { showNowPlaying = false; np.classList.add('hidden'); updateMiniPlayer(); };
  document.getElementById('npPlay').onclick = togglePlay;
  document.getElementById('npPrev').onclick = handlePrev;
  document.getElementById('npNext').onclick = handleNext;
  document.getElementById('npEditBtn').onclick = function() { openSongEditModal(currentSong.id); };
  document.getElementById('npShuffle').onclick = function() { isShuffled = !isShuffled; renderNowPlaying(); };
  document.getElementById('npRepeat').onclick = function() {
    repeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
    renderNowPlaying();
  };
  document.getElementById('npFav').onclick = function() {
    var s = songs.find(function(x) { return x.id === currentSong.id; });
    if (s) { s.fav = !s.fav; currentSong.fav = s.fav; saveLibrary(); renderNowPlaying(); }
  };
  document.getElementById('npSeek').oninput = function(e) { audio.currentTime = parseFloat(e.target.value); };
  document.getElementById('npVolume').oninput = function(e) { volume = parseFloat(e.target.value); isMuted = false; audio.volume = volume; };
  document.getElementById('npMute').onclick = function() { isMuted = !isMuted; audio.volume = isMuted ? 0 : volume; renderNowPlaying(); };
  document.getElementById('npLyricsToggle').onclick = function() {
    var fs = document.getElementById('lyricsFullscreen');
    fs.classList.remove('hidden');
    lyricsVisible = true;
    currentLyricIdx = -1;
    updateSyncedLyrics(currentTime);
  };
  document.getElementById('lyricsBack').onclick = function() {
    document.getElementById('lyricsFullscreen').classList.add('hidden');
    lyricsVisible = false;
  };
  document.getElementById('lyricsFsPlay').onclick = function(e) {
    e.stopPropagation();
    togglePlay();
    document.getElementById('lyricsFsPlay').innerHTML = isPlaying ? '&#10074;&#10074;' : '&#9654;';
  };
  var syncContainer = document.getElementById('syncedLyricsContainer');
  if (syncContainer) {
    syncContainer.querySelectorAll('.lyric-line').forEach(function(line) {
      line.onclick = function() {
        var t = parseFloat(line.dataset.time);
        if (!isNaN(t) && currentSong && currentSong.url) {
          audio.currentTime = t;
          if (!isPlaying) { audio.play().then(function() { isPlaying = true; }).catch(function(){}); }
        }
      };
    });
  }

  // Swipe down to close
  var startY = 0;
  np.ontouchstart = function(e) { startY = e.touches[0].clientY; };
  np.ontouchend = function(e) {
    var diff = e.changedTouches[0].clientY - startY;
    if (diff > 80) { showNowPlaying = false; np.classList.add('hidden'); updateMiniPlayer(); }
  };
}

// ─── Playback ───

function playSong(song, songList) {
  currentSong = song;
  queue = songList || songs;
  currentTime = 0;
  duration = song.dur || 0;
  if (song.url) {
    audio.src = song.url;
    audio.play().then(function() { isPlaying = true; render(); }).catch(function() {});
  } else {
    isPlaying = false;
    showToast('Re-import folder to play');
  }
  if (showNowPlaying) renderNowPlaying();
  else render();
}

function togglePlay() {
  if (!currentSong || !currentSong.url) return;
  if (isPlaying) { audio.pause(); isPlaying = false; }
  else { audio.play().then(function() { isPlaying = true; }).catch(function() {}); }
  if (showNowPlaying) renderNowPlaying();
  updateMiniPlayer();
}

function handleNext() {
  if (!currentSong || queue.length === 0) return;
  if (repeatMode === 'one') { audio.currentTime = 0; audio.play(); return; }
  var idx = queue.findIndex(function(s) { return s.id === currentSong.id; });
  var next;
  if (isShuffled) next = Math.floor(Math.random() * queue.length);
  else next = idx >= queue.length - 1 ? 0 : idx + 1;
  if (idx >= queue.length - 1 && repeatMode === 'off' && !isShuffled) { isPlaying = false; render(); return; }
  playSong(queue[next], queue);
}

function handlePrev() {
  if (!currentSong || queue.length === 0) return;
  if (currentTime > 3) { audio.currentTime = 0; return; }
  var idx = queue.findIndex(function(s) { return s.id === currentSong.id; });
  var prev = idx <= 0 ? queue.length - 1 : idx - 1;
  playSong(queue[prev], queue);
}

audio.addEventListener('timeupdate', function() {
  currentTime = audio.currentTime;
  if (showNowPlaying) {
    var seek = document.getElementById('npSeek');
    if (seek) { seek.value = currentTime; seek.max = duration || 0; }
    var times = document.querySelectorAll('.np-times span');
    if (times[0]) times[0].textContent = fmtTime(currentTime);
    updateSyncedLyrics(currentTime);
    var fsPlay = document.getElementById('lyricsFsPlay');
    if (fsPlay) fsPlay.innerHTML = isPlaying ? '&#10074;&#10074;' : '&#9654;';
  }
  updateMiniPlayer();
});
audio.addEventListener('loadedmetadata', function() {
  duration = audio.duration;
  if (currentSong && (!currentSong.dur || currentSong.dur < 1)) {
    currentSong.dur = audio.duration;
    saveLibrary();
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
    var tempAudio = new Audio();
    tempAudio.preload = 'metadata';
    tempAudio.src = s.url;
    tempAudio.onloadedmetadata = function() {
      s.dur = tempAudio.duration;
      saveLibrary();
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
  var song = songs.find(function(s) { return s.id === songId; });
  if (!song) return;
  var modal = document.getElementById('editModal');
  var overlay = document.getElementById('editOverlay');

  modal.innerHTML = '<div class="edit-modal-header"><div><h3>Edit Song</h3>'
    + '<p>' + escHtml(song.title) + '</p></div>'
    + '<button id="editClose">&times;</button></div>'
    + '<div class="edit-modal-body">'
    + '<div class="edit-field"><label>Title</label><input id="editTitle" value="' + escHtml(song.title) + '"></div>'
    + '<div class="edit-field"><label>Artist</label><input id="editArtist" value="' + escHtml(song.artist) + '"></div>'
    + '<div class="edit-field"><label>Album / Mixtape</label><input id="editAlbum" value="' + escHtml(song.album) + '"></div>'
    + '<div class="edit-row">'
    + '<div class="edit-field"><label>Year</label><input id="editYear" value="' + escHtml(song.year) + '" placeholder="2024"></div>'
    + '<div class="edit-field"><label>Genre</label><input id="editGenre" value="' + escHtml(song.genre) + '" placeholder="Hip-Hop"></div>'
    + '</div>'
    + '<div class="edit-row">'
    + '<div class="edit-field"><label>Track #</label><input id="editTrack" type="number" value="' + (song.track || '') + '" placeholder="1"></div>'
    + '<div class="edit-field"><label>Featured</label><input id="editFeat" value="' + escHtml(song.feat) + '" placeholder="Artist name"></div>'
    + '</div>'
    + '<div class="edit-field"><label>Release Type</label><div class="type-buttons">'
    + ['Album','Mixtape','EP','Single'].map(function(t) {
        var cls = (song.type || 'Album') === t ? ' active-' + t.toLowerCase() : '';
        return '<button class="type-btn' + cls + '" data-type="' + t + '">' + t + '</button>';
      }).join('')
    + '</div></div>'
    + '<div class="edit-field"><label>Lyrics</label><textarea id="editLyrics" rows="4" placeholder="Paste lyrics here..." style="width:100%;padding:10px 12px;background:var(--bg-secondary);border:none;border-radius:12px;color:var(--text);font-size:13px;outline:none;resize:vertical;font-family:inherit;">' + escHtml(song.lyrics || '') + '</textarea></div>'
    + '</div>'
    + '<div class="edit-modal-footer">'
    + '<button class="btn-cancel" id="editCancelBtn">Cancel</button>'
    + '<button class="btn-save" id="editSaveBtn">&#10003; Save</button>'
    + '</div>';

  modal.classList.remove('hidden');
  overlay.classList.remove('hidden');

  var selectedType = song.type || 'Album';
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
    song.title = document.getElementById('editTitle').value.trim() || song.title;
    song.artist = document.getElementById('editArtist').value.trim() || song.artist;
    song.album = document.getElementById('editAlbum').value.trim() || song.album;
    song.year = document.getElementById('editYear').value.trim();
    song.genre = document.getElementById('editGenre').value.trim();
    song.track = parseInt(document.getElementById('editTrack').value) || 0;
    song.feat = document.getElementById('editFeat').value.trim();
    song.type = selectedType;
    song.lyrics = document.getElementById('editLyrics').value.trim();
    closeEditModal();
    saveLibrary();
    render();
    if (showNowPlaying && currentSong && currentSong.id === song.id) {
      currentSong = song;
      renderNowPlaying();
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
    var newArtist = document.getElementById('editArtist').value.trim();
    var newAlbum = document.getElementById('editAlbum').value.trim();
    var newYear = document.getElementById('editYear').value.trim();
    var newGenre = document.getElementById('editGenre').value.trim();

    songs.forEach(function(s) {
      if (s.album === albumName && s.artist === artistName) {
        if (newArtist) s.artist = newArtist;
        if (newAlbum) s.album = newAlbum;
        if (newYear) s.year = newYear;
        if (newGenre) s.genre = newGenre;
        s.type = selectedType;
      }
    });

    if (selectedAlbum) {
      selectedAlbum = { name: newAlbum || albumName, artist: newArtist || artistName };
    }
    closeEditModal();
    saveLibrary();
    render();
  };
}

function closeEditModal() {
  document.getElementById('editModal').classList.add('hidden');
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
  var html = '<div class="section-header"><h3>Results</h3><span class="section-count">' + filtered.length + ' found</span></div>';
  filtered.forEach(function(s) {
    html += songRowHTML(s, currentSong && currentSong.id === s.id, true);
  });
  main.innerHTML = html;
  bindSongRows(main, filtered);
}

// ─── Event Bindings ───

document.querySelectorAll('.tabs button').forEach(function(btn) {
  btn.onclick = function() {
    currentTab = btn.dataset.tab;
    document.querySelectorAll('.tabs button').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    selectedArtist = null;
    selectedAlbum = null;
    render();
  };
});

document.getElementById('searchBtn').onclick = function() {
  var bar = document.getElementById('searchBar');
  bar.classList.toggle('hidden');
  var input = document.getElementById('searchInput');
  if (!bar.classList.contains('hidden')) {
    input.focus();
    input.value = '';
  }
  input.oninput = function() { doSearch(input.value); };
};

document.getElementById('miniPlayerContent').onclick = function() { renderNowPlaying(); };
document.getElementById('miniPlayBtn').onclick = function(e) { e.stopPropagation(); togglePlay(); };
document.getElementById('miniNextBtn').onclick = function(e) { e.stopPropagation(); handleNext(); };

document.getElementById('fabBtn').onclick = function() {
  if (!pickFolderWithHandle()) document.getElementById('folderInput').click();
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
      scroll: document.getElementById('mainContent').scrollTop,
      time: currentTime,
      shuffled: isShuffled,
      repeat: repeatMode,
      vol: volume,
      muted: isMuted
    };
    localStorage.setItem('muzio_ui_state', JSON.stringify(state));
  } catch (e) {}
}

function restoreUIState() {
  try {
    var raw = localStorage.getItem('muzio_ui_state');
    if (!raw) return;
    var state = JSON.parse(raw);
    if (state.tab) currentTab = state.tab;
    if (state.artist) selectedArtist = state.artist;
    if (state.album) selectedAlbum = state.album;
    if (state.albumFilter) albumFilter = state.albumFilter;
    if (state.sortMode) sortMode = state.sortMode;
    if (state.shuffled) isShuffled = state.shuffled;
    if (state.repeat) repeatMode = state.repeat;
    if (typeof state.vol === 'number') volume = state.vol;
    if (state.muted) isMuted = state.muted;

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
        document.getElementById('mainContent').scrollTop = state.scroll;
      }, 50);
    }

    if (state.nowPlaying && currentSong) {
      setTimeout(function() { renderNowPlaying(); }, 100);
    }
  } catch (e) {}
}

document.addEventListener('visibilitychange', function() {
  if (document.hidden) saveUIState();
});
window.addEventListener('beforeunload', saveUIState);
window.addEventListener('pagehide', saveUIState);

// ─── Init ───

restoreUIState();

if (songs.length === 0 || (currentTab === 'artists' && !selectedArtist && !selectedAlbum)) {
  render();
}

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
    var reconnected = 0;
    songs.forEach(function(s) {
      if (!s.url) {
        try {
          if (s.contentUri) {
            s.url = window.Capacitor.convertFileSrc(s.contentUri);
            reconnected++;
          } else if (s.nativePath) {
            s.url = window.Capacitor.convertFileSrc(s.nativePath.replace('file://', ''));
            reconnected++;
          }
        } catch(e) {}
      }
    });
    if (reconnected > 0) {
      render();
      renderReconnectBanner();
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
setTimeout(nativeAutoScan, 500);
setTimeout(nativeAutoScan, 2000);
