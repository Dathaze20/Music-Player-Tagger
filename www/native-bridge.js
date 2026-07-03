// Native bridge — runs only when app is installed as APK via Capacitor
// Gives real file system access: no picker needed, scans all music automatically

var NativeBridge = (function() {

  var AUDIO_EXTS = ['mp3','m4a','flac','ogg','wav','aac','wma','opus'];

  // Primary storage + common Samsung SD card mounts
  var SCAN_ROOTS = [
    'file:///storage/emulated/0/Music',
    'file:///storage/emulated/0/Download',
    'file:///storage/emulated/0/Downloads',
    'file:///storage/emulated/0/',
    'file:///sdcard/Music',
    'file:///sdcard/',
    'file:///storage/sdcard1/',
    'file:///storage/sdcard1/Music',
    'file:///storage/extSdCard/',
    'file:///storage/extSdCard/Music',
    'file:///storage/external_sd/',
    'file:///storage/external_sd/Music',
    'file:///mnt/sdcard/',
    'file:///mnt/extSdCard/',
    'file:///mnt/external_sd/',
  ];

  var Filesystem = null;

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

  function ensureFilesystem() {
    if (!Filesystem && window.Capacitor && window.Capacitor.Plugins) {
      try { Filesystem = window.Capacitor.Plugins.Filesystem; } catch(e) {}
    }
    return !!Filesystem;
  }

  function init() {
    if (!isNative()) return;
    ensureFilesystem();
  }

  function isAudio(name) {
    var ext = name.split('.').pop().toLowerCase();
    return AUDIO_EXTS.indexOf(ext) !== -1;
  }

  // Try to find Samsung-style UUID SD card paths under /storage/
  function discoverSdCard() {
    if (!ensureFilesystem()) return Promise.resolve([]);
    return Filesystem.readdir({ path: 'file:///storage' }).then(function(res) {
      var extras = [];
      (res.files || []).forEach(function(entry) {
        var name = typeof entry === 'string' ? entry : (entry.name || '');
        // Samsung SD cards show as XXXX-XXXX (hex UUID format)
        if (name && name !== 'emulated' && name !== 'self' && /^[A-F0-9]{4}-[A-F0-9]{4}$/i.test(name)) {
          extras.push('file:///storage/' + name + '/Music');
          extras.push('file:///storage/' + name + '/Download');
          extras.push('file:///storage/' + name + '/');
        }
      });
      return extras;
    }).catch(function() { return []; });
  }

  function scanDir(uri, results, seen, progress) {
    if (!ensureFilesystem()) return Promise.resolve();
    return Filesystem.readdir({ path: uri }).then(function(res) {
      var entries = res.files || [];
      var promises = [];
      entries.forEach(function(entry) {
        var name = typeof entry === 'string' ? entry : (entry.name || entry.uri || '');
        var fullUri = uri.replace(/\/$/, '') + '/' + name;
        var type = typeof entry === 'object' ? (entry.type || '') : '';

        if (type === 'directory' || (!type && !name.includes('.'))) {
          promises.push(scanDir(fullUri, results, seen, progress).catch(function() {}));
        } else if (isAudio(name)) {
          if (!seen[fullUri]) {
            seen[fullUri] = true;
            var nativeUrl = window.Capacitor.convertFileSrc(fullUri.replace('file://', ''));
            results.push({ name: name, uri: fullUri, nativeUrl: nativeUrl });
            if (progress) progress(results.length);
          }
        }
      });
      return Promise.all(promises);
    }).catch(function() {});
  }

  function requestPermissions() {
    if (!isNative()) return Promise.resolve(false);
    if (ensureFilesystem() && Filesystem.requestPermissions) {
      return Filesystem.requestPermissions().then(function(res) {
        return !res || res.publicStorage === 'granted' || res.publicStorage === 'prompt-with-rationale' || true;
      }).catch(function() { return true; });
    }
    return Promise.resolve(true);
  }

  function scanAllMusic(onProgress) {
    if (!isNative()) return Promise.resolve([]);
    if (!ensureFilesystem()) return Promise.resolve([]);

    return requestPermissions().then(function() {
      return discoverSdCard();
    }).then(function(sdRoots) {
      var allRoots = SCAN_ROOTS.concat(sdRoots || []);
      var results = [];
      var seen = {};
      var chains = allRoots.map(function(root) {
        return scanDir(root, results, seen, onProgress).catch(function() {});
      });
      return Promise.all(chains).then(function() { return results; });
    });
  }

  function toSong(fileInfo) {
    var parsed = typeof parseFileName === 'function'
      ? parseFileName(fileInfo.name)
      : { artist: 'Unknown Artist', title: fileInfo.name.replace(/\.[^/.]+$/, ''), feat: '' };
    return {
      id: (typeof genId === 'function') ? genId() : Date.now().toString(36) + Math.random().toString(36).slice(2),
      fn: fileInfo.name,
      url: fileInfo.nativeUrl,
      nativePath: fileInfo.uri,
      title: parsed.title,
      artist: parsed.artist,
      album: 'Unknown Album',
      year: '', genre: '', track: 0, art: '', lyrics: '', syncedLyrics: '',
      dur: 0, tagging: false, fav: false, type: '', feat: parsed.feat
    };
  }

  init();

  return {
    isNative: isNative,
    scanAllMusic: scanAllMusic,
    toSong: toSong,
    requestPermissions: requestPermissions
  };
})();
