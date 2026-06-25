// ═══════════════════════════════════════════════════════
// Muzio AI - Pure JavaScript Music Player
// Open this index.html in any browser - no build tools needed
// ═══════════════════════════════════════════════════════

// ─── Utility Functions ───

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  var m = Math.floor(s / 60);
  var sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function parseFileName(name) {
  name = name.replace(/\.[^/.]+$/, '');
  name = name.replace(/^(?:Track\s*)?(\d{1,3})\s*[-.)]\s*/i, '');
  name = name.replace(/[\[(]prod\.?\s*(?:by\s*)?[^\])]+[\])]/gi, '').trim();
  var feat = '';
  var featMatch = name.match(/\s+(?:ft\.?|feat\.?|featuring)\s+(.+?)(?:\s*[-]|$)/i);
  if (featMatch) {
    feat = featMatch[1].trim();
    name = name.replace(featMatch[0], featMatch[0].endsWith('-') ? ' -' : '');
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
    return '<img src="' + url + '" class="song-art' + (cls ? ' ' + cls : '') + '" style="width:' + size + 'px;height:' + size + 'px;' + r + '" onerror="this.style.display=\'none\'">';
  }
  return artHTML(text, size, round, cls);
}

// ─── Song Library (starts empty - import your music) ───

var songs = [];

// ─── State ───

var currentTab = 'artists';
var currentSong = null;
var isPlaying = false;
var currentTime = 0;
var duration = 0;
var volume = 0.8;
var isMuted = false;
var isShuffled = false;
var repeatMode = 'off'; // off, all, one
var showNowPlaying = false;
var selectedArtist = null;
var selectedAlbum = null; // {name, artist}
var albumFilter = 'all';
var queue = [];
var tagging = { total: 0, done: 0, current: '', active: false };
var apiKey = localStorage.getItem('gemini_api_key') || '';

var audio = document.getElementById('audioEl');

// ─── Derived Data Functions ───

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
    .sort(function(a, b) { return a.track - b.track; });
}

function getArtistSongs(name) {
  return songs.filter(function(s) { return s.artist === name; })
    .sort(function(a, b) { return a.album === b.album ? a.track - b.track : a.album.localeCompare(b.album); });
}

function getArtistAlbums(name) {
  var map = {};
  songs.forEach(function(s) {
    if (s.artist !== name) return;
    if (!map[s.album]) map[s.album] = { year: s.year, art: s.art, count: 0, type: s.type };
    map[s.album].count++;
  });
  return Object.keys(map).map(function(a) {
    return { name: a, artist: name, year: map[a].year, art: map[a].art, songCount: map[a].count, type: map[a].type };
  });
}

// ─── Render Functions ───

function render() {
  var main = document.getElementById('mainContent');
  var tabBar = document.getElementById('tabBar');
  var header = document.getElementById('headerTitle');
  var fab = document.getElementById('fabBtn');
  var menuBtn = document.getElementById('menuBtn');
  var searchBar = document.getElementById('searchBar');

  // Reset
  searchBar.classList.add('hidden');
  tabBar.classList.remove('hidden');
  menuBtn.innerHTML = '&#9776;';
  menuBtn.onclick = function() { toggleDrawer(true); };
  fab.classList.remove('hidden');

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
  }

  updateMiniPlayer();
}

function renderWelcome(el) {
  el.innerHTML = '<div class="welcome-screen">'
    + '<div class="welcome-icon">&#127925;</div>'
    + '<h2 class="welcome-title">Welcome to Muzio AI</h2>'
    + '<p class="welcome-text">Import your music to get started. Tap below to select your music folder and Muzio AI will scan all your songs.</p>'
    + '<button class="welcome-btn" id="welcomeFolderBtn">&#128193; Select Music Folder</button>'
    + '<button class="welcome-btn-alt" id="welcomeFilesBtn">&#127926; Or Pick Individual Files</button>'
    + '<div class="welcome-hint">'
    + '<p>&#9881; Tip: Set your Gemini API key in the menu for automatic AI tagging of artist, album, year, genre, and album art.</p>'
    + '</div>'
    + '</div>';
  document.getElementById('welcomeFolderBtn').onclick = function() {
    document.getElementById('folderInput').click();
  };
  document.getElementById('welcomeFilesBtn').onclick = function() {
    document.getElementById('fileInput').click();
  };
}

function renderArtists(el) {
  var artists = getArtists();
  if (artists.length === 0) { renderWelcome(el); return; }
  var html = '';
  artists.forEach(function(a) {
    var artEl = a.arts.length > 0
      ? '<img src="' + a.arts[0] + '" style="width:56px;height:56px;border-radius:50%;object-fit:cover;" onerror="this.style.display=\'none\'">'
      : artHTML(a.name, 56, true);
    html += '<div class="artist-row" data-artist="' + a.name + '">'
      + artEl
      + '<div class="song-info">'
      + '<div class="artist-name">' + a.name + '</div>'
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
  if (songs.length === 0) { renderWelcome(el); return; }
  var sorted = songs.slice().sort(function(a, b) { return a.title.localeCompare(b.title); });
  var html = '';
  sorted.forEach(function(s) {
    var playing = currentSong && currentSong.id === s.id;
    html += '<div class="song-row' + (playing ? ' playing' : '') + '" data-id="' + s.id + '">'
      + imgOrArt(s.art, s.album || s.title, 48)
      + '<div class="song-info">'
      + '<div class="song-title' + (playing ? ' playing' : '') + '">' + s.title
      + (s.feat ? '<span class="feat"> ft. ' + s.feat + '</span>' : '')
      + '</div>'
      + '<div class="song-meta">' + s.artist + (s.album ? ' &bull; ' + s.album : '')
      + (s.type === 'Mixtape' ? '<span class="mixtape-tag"> &bull; Mixtape</span>' : '')
      + '</div>'
      + '</div>'
      + (s.tagging ? '<div class="tagging-spinner"></div>' : '')
      + '<span class="song-duration">' + fmtTime(s.dur) + '</span>'
      + '<button class="song-fav' + (s.fav ? ' active' : '') + '" data-fav="' + s.id + '">' + (s.fav ? '&#10084;' : '&#9825;') + '</button>'
      + '<button class="song-edit" data-edit="' + s.id + '" style="background:none;border:none;color:var(--text-faint);padding:4px 8px;cursor:pointer;font-size:16px;">&#8942;</button>'
      + '</div>';
  });
  el.innerHTML = html;
  bindSongRows(el, sorted);
}

function renderAlbums(el) {
  if (songs.length === 0) { renderWelcome(el); return; }
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

    html += '<div class="album-card" data-album="' + a.name + '" data-artist="' + a.artist + '">'
      + '<div class="album-art-wrap">'
      + (a.art ? '<img src="' + a.art + '" onerror="this.style.display=\'none\'">' : artHTML(a.name, 200))
      + badge
      + '</div>'
      + '<div class="album-name">' + a.name + '</div>'
      + '<div class="album-meta">' + a.artist + ' &bull; ' + (a.year || '—') + '</div>'
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
  el.innerHTML = '<div class="empty-state">'
    + '<div class="empty-icon">&#9835;</div>'
    + '<p>No playlists yet</p>'
    + '<p class="sub">Create a playlist to organize your music</p>'
    + '</div>';
}

function renderArtistDetail(el) {
  var artistSongs = getArtistSongs(selectedArtist);
  var artistAlbums = getArtistAlbums(selectedArtist);
  var html = '<div class="detail-header">'
    + artHTML(selectedArtist, 120, true, 'large')
    + '<div class="detail-title">' + selectedArtist + '</div>'
    + '<div class="detail-artist">' + artistAlbums.length + ' ' + (artistAlbums.length === 1 ? 'Album' : 'Albums') + ' &bull; ' + artistSongs.length + ' Songs</div>'
    + '<div class="detail-actions">'
    + '<button class="btn btn-primary" id="playAllBtn">&#9654; Play All</button>'
    + '<button class="btn btn-secondary">&#8645; Shuffle</button>'
    + '</div></div>';

  if (artistAlbums.length > 0) {
    html += '<div class="section-label">Albums</div><div class="album-scroll">';
    artistAlbums.forEach(function(a) {
      var badge = '';
      if (a.type === 'Mixtape') badge = '<span class="release-badge mixtape" style="font-size:8px;padding:1px 6px;">Mixtape</span>';
      else if (a.type === 'EP') badge = '<span class="release-badge ep" style="font-size:8px;padding:1px 6px;">EP</span>';
      html += '<div class="album-scroll-item" data-album="' + a.name + '" data-artist="' + a.artist + '">'
        + '<div class="album-scroll-art">'
        + (a.art ? '<img src="' + a.art + '">' : artHTML(a.name, 128))
        + badge
        + '</div>'
        + '<div class="album-scroll-name">' + a.name + '</div>'
        + '<div class="album-scroll-year">' + (a.year || '') + '</div>'
        + '</div>';
    });
    html += '</div>';
  }

  html += '<div class="section-label">Songs</div>';
  artistSongs.forEach(function(s, i) {
    var playing = currentSong && currentSong.id === s.id;
    html += '<div class="song-row' + (playing ? ' playing' : '') + '" data-id="' + s.id + '">'
      + '<span class="track-num">' + (i + 1) + '</span>'
      + '<div class="song-info">'
      + '<div class="song-title' + (playing ? ' playing' : '') + '">' + s.title + '</div>'
      + '<div class="song-meta">' + s.album + '</div>'
      + '</div>'
      + '<span class="song-duration">' + fmtTime(s.dur) + '</span>'
      + '<span style="color:var(--text-faint);padding:8px;">&#8942;</span>'
      + '</div>';
  });

  el.innerHTML = html;

  document.getElementById('playAllBtn').onclick = function() {
    if (artistSongs.length > 0) playSong(artistSongs[0], artistSongs);
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

  var html = '<div class="detail-header">'
    + '<div style="width:192px;height:192px;border-radius:12px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.5);">'
    + (first.art ? '<img src="' + first.art + '" style="width:100%;height:100%;object-fit:cover;">' : artHTML(selectedAlbum.name, 192, false, 'xl'))
    + '</div>'
    + '<div class="detail-title">' + selectedAlbum.name + '</div>'
    + '<div class="detail-artist">' + selectedAlbum.artist + '</div>'
    + '<div class="detail-info">';
  if (first.type) html += '<span class="detail-type ' + typeClass + '">' + first.type + '</span>';
  if (first.year) html += '<span>' + first.year + '</span>';
  if (first.genre) html += '<span>&bull; ' + first.genre + '</span>';
  html += '</div>'
    + '<div class="detail-actions">'
    + '<button class="btn btn-primary" id="playAlbumBtn">&#9654; Play</button>'
    + '<button class="btn btn-secondary">&#8645; Shuffle</button>'
    + '<button class="btn btn-secondary" id="editAlbumBtn">&#9998; Edit</button>'
    + '</div></div>';

  albumSongs.forEach(function(s, i) {
    var playing = currentSong && currentSong.id === s.id;
    html += '<div class="song-row' + (playing ? ' playing' : '') + '" data-id="' + s.id + '">'
      + '<span class="track-num">' + (s.track || i + 1) + '</span>'
      + '<div class="song-info">'
      + '<div class="song-title' + (playing ? ' playing' : '') + '">' + s.title
      + (s.feat ? '<span class="feat"> ft. ' + s.feat + '</span>' : '') + '</div>'
      + '</div>'
      + (s.tagging ? '<div class="tagging-spinner"></div>' : '')
      + '<span class="song-duration">' + fmtTime(s.dur) + '</span>'
      + '<button class="song-fav' + (s.fav ? ' active' : '') + '" data-fav="' + s.id + '">' + (s.fav ? '&#10084;' : '&#9825;') + '</button>'
      + '</div>';
  });

  el.innerHTML = html;

  document.getElementById('playAlbumBtn').onclick = function() {
    if (albumSongs.length > 0) playSong(albumSongs[0], albumSongs);
  };
  document.getElementById('editAlbumBtn').onclick = function() {
    openEditModal(selectedAlbum.name, selectedAlbum.artist);
  };
  bindSongRows(el, albumSongs);
}

function bindSongRows(el, songList) {
  el.querySelectorAll('.song-row').forEach(function(row) {
    row.onclick = function(e) {
      if (e.target.closest('.song-fav')) return;
      if (e.target.closest('.song-edit')) return;
      var s = songs.find(function(x) { return x.id === row.dataset.id; });
      if (s) playSong(s, songList);
    };
  });
  el.querySelectorAll('.song-fav').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      var s = songs.find(function(x) { return x.id === btn.dataset.fav; });
      if (s) { s.fav = !s.fav; render(); }
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
    + '<button>&#8942;</button>'
    + '</div>'
    + '<div class="np-art-container">'
    + '<div class="np-art">'
    + (currentSong.art ? '<img src="' + currentSong.art + '">' : artHTML(currentSong.album || currentSong.title, 288, false, 'xxl'))
    + '</div>'
    + '<div class="np-song-title">' + currentSong.title
    + (currentSong.feat ? '<span class="feat"> ft. ' + currentSong.feat + '</span>' : '')
    + '</div>'
    + '<div class="np-song-artist">' + currentSong.artist + '</div>'
    + (currentSong.album ? '<div class="np-song-album">' + currentSong.album + (currentSong.year ? ' (' + currentSong.year + ')' : '') + '</div>' : '')
    + '</div>'
    + '<div class="np-controls">'
    + '<div class="np-progress">'
    + '<input type="range" id="npSeek" min="0" max="' + (duration || 0) + '" value="' + currentTime + '">'
    + '<div class="np-times"><span>' + fmtTime(currentTime) + '</span><span>' + fmtTime(duration) + '</span></div>'
    + '</div>'
    + '<div class="np-main-controls">'
    + '<button id="npShuffle" class="' + (isShuffled ? 'active' : '') + '">&#8645;</button>'
    + '<button id="npPrev">&#9198;</button>'
    + '<button class="np-play-btn" id="npPlay">' + (isPlaying ? '&#10074;&#10074;' : '&#9654;') + '</button>'
    + '<button id="npNext">&#9197;</button>'
    + '<button id="npRepeat" class="' + (repeatMode !== 'off' ? 'active' : '') + '">&#128257;' + (repeatMode === 'one' ? '<span style="position:absolute;font-size:9px;top:-2px;right:-2px;">1</span>' : '') + '</button>'
    + '</div>'
    + '<div class="np-bottom">'
    + '<button id="npFav">' + (currentSong.fav ? '&#10084;' : '&#9825;') + '</button>'
    + '<div class="volume-control">'
    + '<button id="npMute">' + (isMuted ? '&#128263;' : '&#128266;') + '</button>'
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
  html += '</div>';

  np.innerHTML = html;

  document.getElementById('npClose').onclick = function() { showNowPlaying = false; np.classList.add('hidden'); updateMiniPlayer(); };
  document.getElementById('npPlay').onclick = togglePlay;
  document.getElementById('npPrev').onclick = handlePrev;
  document.getElementById('npNext').onclick = handleNext;
  document.getElementById('npShuffle').onclick = function() { isShuffled = !isShuffled; renderNowPlaying(); };
  document.getElementById('npRepeat').onclick = function() {
    repeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
    renderNowPlaying();
  };
  document.getElementById('npFav').onclick = function() {
    var s = songs.find(function(x) { return x.id === currentSong.id; });
    if (s) { s.fav = !s.fav; currentSong.fav = s.fav; renderNowPlaying(); }
  };
  document.getElementById('npSeek').oninput = function(e) {
    audio.currentTime = parseFloat(e.target.value);
  };
  document.getElementById('npVolume').oninput = function(e) {
    volume = parseFloat(e.target.value);
    isMuted = false;
    audio.volume = volume;
  };
  document.getElementById('npMute').onclick = function() {
    isMuted = !isMuted;
    audio.volume = isMuted ? 0 : volume;
    renderNowPlaying();
  };
}

// ─── Audio Playback ───

function playSong(song, songList) {
  currentSong = song;
  queue = songList || songs;
  currentTime = 0;
  duration = 0;
  if (song.url) {
    audio.src = song.url;
    audio.play().then(function() { isPlaying = true; render(); }).catch(function() {});
  } else {
    isPlaying = false;
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
  }
  updateMiniPlayer();
});
audio.addEventListener('loadedmetadata', function() { duration = audio.duration; });
audio.addEventListener('ended', handleNext);

// ─── File Import & Auto-Tagging ───

function handleFileImport(files) {
  var newSongs = [];
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    if (!file.type || !file.type.startsWith('audio/')) {
      var ext = file.name.split('.').pop().toLowerCase();
      if (['mp3','m4a','flac','ogg','wav','aac','wma','opus'].indexOf(ext) === -1) continue;
    }
    var url = URL.createObjectURL(file);
    var parsed = parseFileName(file.name);
    newSongs.push({
      id: genId(), fn: file.name, url: url,
      title: parsed.title, artist: parsed.artist, album: 'Unknown Album',
      year: '', genre: '', track: 0, art: '', lyrics: '', dur: 0,
      tagging: false, fav: false, type: '', feat: parsed.feat
    });
  }
  if (newSongs.length === 0) return;

  // Show import count
  var toast = document.createElement('div');
  toast.className = 'import-count';
  toast.textContent = newSongs.length + ' songs imported!';
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 2500);

  songs = songs.concat(newSongs);
  render();

  if (!apiKey) return;

  // Start AI tagging
  newSongs.forEach(function(s) { s.tagging = true; });
  tagging = { total: newSongs.length, done: 0, current: newSongs[0].title, active: true };
  updateTaggingBanner();
  tagNextSong(newSongs, 0);
}

function tagNextSong(songList, idx) {
  if (idx >= songList.length) {
    tagging.active = false;
    updateTaggingBanner();
    render();
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
    if (meta.year) song.year = meta.year;
    if (meta.genre) song.genre = meta.genre;
    if (meta.trackNumber) song.track = meta.trackNumber;
    if (meta.releaseType) song.type = meta.releaseType;
    if (meta.featuredArtists) song.feat = meta.featuredArtists;
    if (meta.albumArtUrl) song.art = meta.albumArtUrl;
    song.tagging = false;
    render();
    tagNextSong(songList, idx + 1);
  }).catch(function() {
    song.tagging = false;
    render();
    tagNextSong(songList, idx + 1);
  });
}

function updateTaggingBanner() {
  var banner = document.getElementById('taggingBanner');
  if (!tagging.active) { banner.classList.add('hidden'); return; }
  banner.classList.remove('hidden');
  document.getElementById('taggingCurrent').textContent = tagging.current;
  document.getElementById('taggingCount').textContent = tagging.done + '/' + tagging.total;
  document.getElementById('taggingBar').style.width = (tagging.done / tagging.total * 100) + '%';
}

// ─── Gemini AI API ───

function callGeminiTag(fileName) {
  if (!apiKey) return Promise.resolve({});
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
  var prompt = 'You are a music metadata expert with deep knowledge of hip-hop, rap, R&B, drill, trap, and mixtape culture including underground artists like Stack Bundles, Max B, Chinx, Lloyd Banks, Styles P, Jadakiss, Fabolous, Dave East, Griselda, etc.\n\nGiven this file name, identify the song and return ONLY a JSON object with: title, artist, album, trackNumber, albumArtUrl, year, genre, releaseType (Album/Mixtape/EP/Single), featuredArtists\n\nFile: ' + fileName + '\n\nFor loosies not on any project, set releaseType to "Single". Return ONLY JSON.';

  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  }).then(function(res) { return res.json(); })
    .then(function(data) {
      var text = data.candidates[0].content.parts[0].text.trim();
      text = text.replace(/^```json?\s*/, '').replace(/```\s*$/, '');
      return JSON.parse(text);
    });
}

// ─── Edit Modal ───

function openEditModal(albumName, artistName) {
  var albumSongs = getAlbumSongs(albumName, artistName);
  var first = albumSongs[0] || {};
  var modal = document.getElementById('editModal');
  var overlay = document.getElementById('editOverlay');

  modal.innerHTML = '<div class="edit-modal-header"><div><h3>Edit Album</h3>'
    + '<p>Changes apply to all ' + albumSongs.length + ' songs</p></div>'
    + '<button id="editClose">&times;</button></div>'
    + '<div class="edit-modal-body">'
    + '<div class="edit-field"><label>Artist</label><input id="editArtist" value="' + artistName + '"></div>'
    + '<div class="edit-field"><label>Album / Mixtape Name</label><input id="editAlbum" value="' + albumName + '"></div>'
    + '<div class="edit-row">'
    + '<div class="edit-field"><label>Year</label><input id="editYear" value="' + (first.year || '') + '" placeholder="2024"></div>'
    + '<div class="edit-field"><label>Genre</label><input id="editGenre" value="' + (first.genre || '') + '" placeholder="Hip-Hop"></div>'
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
    render();
  };
}

function openSongEditModal(songId) {
  var song = songs.find(function(s) { return s.id === songId; });
  if (!song) return;
  var modal = document.getElementById('editModal');
  var overlay = document.getElementById('editOverlay');

  modal.innerHTML = '<div class="edit-modal-header"><div><h3>Edit Song</h3>'
    + '<p>' + song.title + '</p></div>'
    + '<button id="editClose">&times;</button></div>'
    + '<div class="edit-modal-body">'
    + '<div class="edit-field"><label>Title</label><input id="editTitle" value="' + (song.title || '') + '"></div>'
    + '<div class="edit-field"><label>Artist</label><input id="editArtist" value="' + (song.artist || '') + '"></div>'
    + '<div class="edit-field"><label>Album / Mixtape</label><input id="editAlbum" value="' + (song.album || '') + '"></div>'
    + '<div class="edit-row">'
    + '<div class="edit-field"><label>Year</label><input id="editYear" value="' + (song.year || '') + '" placeholder="2024"></div>'
    + '<div class="edit-field"><label>Genre</label><input id="editGenre" value="' + (song.genre || '') + '" placeholder="Hip-Hop"></div>'
    + '</div>'
    + '<div class="edit-row">'
    + '<div class="edit-field"><label>Track #</label><input id="editTrack" type="number" value="' + (song.track || '') + '" placeholder="1"></div>'
    + '<div class="edit-field"><label>Featured</label><input id="editFeat" value="' + (song.feat || '') + '" placeholder="ft. Artist"></div>'
    + '</div>'
    + '<div class="edit-field"><label>Release Type</label><div class="type-buttons">'
    + ['Album','Mixtape','EP','Single'].map(function(t) {
        var cls = (song.type || 'Album') === t ? ' active-' + t.toLowerCase() : '';
        return '<button class="type-btn' + cls + '" data-type="' + t + '">' + t + '</button>';
      }).join('')
    + '</div></div>'
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
    closeEditModal();
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

// ─── Event Bindings ───

// Tabs
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

// Search
document.getElementById('searchBtn').onclick = function() {
  document.getElementById('searchBar').classList.toggle('hidden');
  var input = document.getElementById('searchInput');
  input.focus();
  input.oninput = function() {
    var q = input.value.toLowerCase();
    if (!q) { render(); return; }
    var filtered = songs.filter(function(s) {
      return s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q) || s.album.toLowerCase().includes(q);
    });
    var main = document.getElementById('mainContent');
    if (filtered.length === 0) { main.innerHTML = '<div style="text-align:center;padding:48px;color:var(--text-faint);">No results</div>'; return; }
    var html = '';
    filtered.forEach(function(s) {
      html += '<div class="song-row" data-id="' + s.id + '">'
        + imgOrArt(s.art, s.album || s.title, 48)
        + '<div class="song-info"><div class="song-title">' + s.title + '</div><div class="song-meta">' + s.artist + ' &bull; ' + s.album + '</div></div>'
        + '<span class="song-duration">' + fmtTime(s.dur) + '</span></div>';
    });
    main.innerHTML = html;
    bindSongRows(main, filtered);
  };
};

// Mini player
document.getElementById('miniPlayerContent').onclick = function() { renderNowPlaying(); };
document.getElementById('miniPlayBtn').onclick = function(e) { e.stopPropagation(); togglePlay(); };
document.getElementById('miniNextBtn').onclick = function(e) { e.stopPropagation(); handleNext(); };

// FAB & file imports
document.getElementById('fabBtn').onclick = function() { document.getElementById('fileInput').click(); };
document.getElementById('importFilesBtn').onclick = function() { toggleDrawer(false); document.getElementById('fileInput').click(); };
document.getElementById('importFolderBtn').onclick = function() { toggleDrawer(false); document.getElementById('folderInput').click(); };
document.getElementById('fileInput').onchange = function(e) { if (e.target.files) handleFileImport(e.target.files); e.target.value = ''; };
document.getElementById('folderInput').onchange = function(e) { if (e.target.files) handleFileImport(e.target.files); e.target.value = ''; };

// Drawer
document.getElementById('drawerOverlay').onclick = function() { toggleDrawer(false); };

// Settings
document.getElementById('settingsBtn').onclick = function() { toggleDrawer(false); openSettings(); };
document.getElementById('settingsClose').onclick = closeSettings;
document.getElementById('settingsOverlay').onclick = closeSettings;
document.getElementById('settingsCancelBtn').onclick = closeSettings;
document.getElementById('settingsSaveBtn').onclick = function() {
  apiKey = document.getElementById('apiKeyInput').value.trim();
  localStorage.setItem('gemini_api_key', apiKey);
  closeSettings();
};

// Drag and drop
var app = document.getElementById('app');
app.addEventListener('dragover', function(e) { e.preventDefault(); });
app.addEventListener('drop', function(e) {
  e.preventDefault();
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    handleFileImport(e.dataTransfer.files);
  }
});

// ─── Initial Render ───
render();
