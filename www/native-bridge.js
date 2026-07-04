// Native bridge — Capacitor APK only
// Uses Android MediaStore (same database Muzio/Spotify use) for instant all-library scanning

var NativeBridge = (function() {

  function isNative() {
    try {
      if (!window.Capacitor) return false;
      if (typeof window.Capacitor.isNativePlatform === 'function') return window.Capacitor.isNativePlatform();
      if (window.Capacitor.isNative === true) return true;
      if (typeof window.Capacitor.getPlatform === 'function') {
        var p = window.Capacitor.getPlatform();
        return p === 'android' || p === 'ios';
      }
      return false;
    } catch(e) { return false; }
  }

  function getPlugin(name) {
    try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]; }
    catch(e) { return null; }
  }

  // MediaStore: queries Android's music database directly
  // Covers internal storage + SD card, uses real ID3 metadata, instant results
  function scanWithMediaStore(onProgress) {
    var plugin = getPlugin('MediaStore');
    if (!plugin) return Promise.reject(new Error('MediaStore plugin not available'));

    return plugin.getAllAudioFiles().then(function(result) {
      var files = result.files || [];
      if (onProgress) onProgress(files.length);
      return files.map(function(f) {
        // Convert album art content:// URI to WebView-playable URL
        var artUrl = '';
        if (f.albumArtUri) {
          try { artUrl = window.Capacitor.convertFileSrc(f.albumArtUri); } catch(e) {}
        }
        return {
          name:        f.name,
          contentUri:  f.contentUri,
          nativePath:  f.path ? 'file://' + f.path : '',
          albumArtUri: f.albumArtUri || '',
          albumArtist: f.albumArtist || '',
          art:         artUrl,
          title:       f.title  || '',
          artist:      f.artist || 'Unknown Artist',
          album:       f.album  || 'Unknown Album',
          track:       f.track  || 0,
          year:        f.year   || '',
          genre:       f.genre  || '',
          dur:         f.dur    || 0,
        };
      });
    });
  }

  // Fallback: Filesystem directory scan (works on older Android, limited on Android 13+)
  function scanWithFilesystem(onProgress) {
    var Filesystem = getPlugin('Filesystem');
    if (!Filesystem) return Promise.reject(new Error('Filesystem plugin not available'));

    var AUDIO_EXTS = ['mp3','m4a','flac','ogg','wav','aac','wma','opus'];
    var SCAN_ROOTS = [
      'file:///storage/emulated/0/Music',
      'file:///storage/emulated/0/Download',
      'file:///storage/emulated/0/',
      'file:///sdcard/Music',
      'file:///sdcard/',
      'file:///storage/sdcard1/',
      'file:///storage/extSdCard/',
      'file:///storage/external_sd/',
    ];

    var results = [];
    var seen = {};

    function scanDir(uri) {
      return Filesystem.readdir({ path: uri }).then(function(res) {
        var entries = res.files || [];
        var promises = [];
        entries.forEach(function(entry) {
          var name = typeof entry === 'string' ? entry : (entry.name || '');
          var type = typeof entry === 'object' ? (entry.type || 'file') : 'file';
          var fullUri = uri.replace(/\/$/, '') + '/' + name;
          if (type === 'directory') {
            promises.push(scanDir(fullUri).catch(function() {}));
          } else {
            var ext = name.split('.').pop().toLowerCase();
            if (AUDIO_EXTS.indexOf(ext) !== -1 && !seen[fullUri]) {
              seen[fullUri] = true;
              results.push({ name: name, contentUri: '', nativePath: fullUri });
              if (onProgress) onProgress(results.length);
            }
          }
        });
        return Promise.all(promises);
      }).catch(function() {});
    }

    var chains = SCAN_ROOTS.map(function(root) { return scanDir(root).catch(function(){}); });
    return Promise.all(chains).then(function() { return results; });
  }

  function requestPermissions() {
    // Must request READ_MEDIA_AUDIO (Android 13+) via the MediaStore plugin — NOT Filesystem
    var plugin = getPlugin('MediaStore');
    if (plugin && plugin.requestPermissions) {
      return plugin.requestPermissions().catch(function() {});
    }
    return Promise.resolve();
  }

  function openAppSettings() {
    var plugin = getPlugin('MediaStore');
    if (plugin && plugin.openAppSettings) {
      plugin.openAppSettings();
    }
  }

  function scanAllMusic(onProgress) {
    if (!isNative()) return Promise.resolve([]);

    var plugin = getPlugin('MediaStore');
    if (!plugin) {
      return Promise.reject(new Error(
        'Native music plugin not found. Uninstall the app completely, then reinstall the APK.'
      ));
    }

    // Request audio permission first — this triggers the Android system dialog
    return requestPermissions().then(function() {
      return scanWithMediaStore(onProgress);
      // No silent filesystem fallback — it doesn't work on Android 13+ (scoped storage)
      // and would hide the real error from the user
    });
  }

  function toSong(fileInfo) {
    // If we have real metadata from MediaStore, use it directly
    // Otherwise parse the filename
    var title  = fileInfo.title;
    var artist = fileInfo.artist;
    var feat   = '';

    if (!title) {
      var parsed = typeof parseFileName === 'function'
        ? parseFileName(fileInfo.name)
        : { title: fileInfo.name.replace(/\.[^/.]+$/, ''), artist: 'Unknown Artist', feat: '' };
      title  = parsed.title;
      artist = parsed.artist || 'Unknown Artist';
      feat   = parsed.feat   || '';
    }

    // playable URL: content:// URI converted to localhost HTTP via Capacitor bridge
    var playUrl = '';
    if (fileInfo.contentUri) {
      try { playUrl = window.Capacitor.convertFileSrc(fileInfo.contentUri); } catch(e) {}
    }
    if (!playUrl && fileInfo.nativePath) {
      try { playUrl = window.Capacitor.convertFileSrc(fileInfo.nativePath.replace('file://', '')); } catch(e) {}
    }

    return {
      id:          (typeof genId === 'function') ? genId() : Date.now().toString(36) + Math.random().toString(36).slice(2,8),
      fn:          fileInfo.name,
      url:         playUrl,
      nativePath:  fileInfo.nativePath || '',
      contentUri:  fileInfo.contentUri || '',
      albumArtUri: fileInfo.albumArtUri || '',
      albumArtist: fileInfo.albumArtist || '',
      title:       title  || fileInfo.name.replace(/\.[^/.]+$/, ''),
      artist:      artist || 'Unknown Artist',
      album:       fileInfo.album || 'Unknown Album',
      track:       fileInfo.track || 0,
      year:        fileInfo.year  || '',
      genre:       fileInfo.genre || '',
      art:         fileInfo.art   || '',   // album art URL from MediaStore
      lyrics: '', syncedLyrics: '',
      dur:         fileInfo.dur || 0,
      tagging:     false, fav: false, type: '', feat: feat,
    };
  }

  function readAlbumArt(uri, size) {
    var plugin = getPlugin('MediaStore');
    if (!plugin || !uri) return Promise.resolve('');
    var params = { uri: uri };
    if (size) params.size = size;
    return plugin.readAlbumArt(params).then(function(r) {
      return (r && r.data) ? r.data : '';
    }).catch(function() { return ''; });
  }

  // Write ID3v2 tags to a physical music file on the device.
  // params: { contentUri, title, artist, album, year, genre, albumArtist, lyrics, artBase64 }
  // Returns a promise that resolves to { success, fileWritten, note? }.
  // On Android 11+, may show a one-time system dialog asking the user to grant write access.
  function writeFileTags(params) {
    var plugin = getPlugin('MediaStore');
    if (!plugin) return Promise.reject(new Error('MediaStore plugin not available'));
    if (!params || !params.contentUri) return Promise.reject(new Error('contentUri required'));
    return plugin.writeFileTags({
      contentUri:  String(params.contentUri  || ''),
      title:       String(params.title       || ''),
      artist:      String(params.artist      || ''),
      album:       String(params.album       || ''),
      year:        String(params.year        || ''),
      genre:       String(params.genre       || ''),
      albumArtist: String(params.albumArtist || ''),
      lyrics:      String(params.lyrics      || ''),
      artBase64:   String(params.artBase64   || ''),
    });
  }

  return { isNative: isNative, scanAllMusic: scanAllMusic, toSong: toSong,
           requestPermissions: requestPermissions, openAppSettings: openAppSettings,
           readAlbumArt: readAlbumArt, writeFileTags: writeFileTags };
})();
