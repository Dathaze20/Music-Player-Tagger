// Native bridge — runs only when app is installed as APK via Capacitor
// Gives real file system access: no picker needed, scans all music automatically

var NativeBridge = (function() {

  var AUDIO_EXTS = ['mp3','m4a','flac','ogg','wav','aac','wma','opus'];
  var SCAN_ROOTS = [
    'file:///storage/emulated/0/Music',
    'file:///storage/emulated/0/Download',
    'file:///storage/emulated/0/',
    'file:///sdcard/Music',
    'file:///sdcard/',
  ];

  var Filesystem = null;
  var FilesystemDirectory = null;

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNative);
  }

  function init() {
    if (!isNative()) return;
    try {
      Filesystem = Capacitor.Plugins.Filesystem;
    } catch(e) {}
  }

  function isAudio(name) {
    var ext = name.split('.').pop().toLowerCase();
    return AUDIO_EXTS.indexOf(ext) !== -1;
  }

  function scanDir(uri, results, progress) {
    if (!Filesystem) return Promise.resolve();
    return Filesystem.readdir({ path: uri }).then(function(res) {
      var entries = res.files || [];
      var promises = [];
      entries.forEach(function(entry) {
        var name = typeof entry === 'string' ? entry : (entry.name || entry.uri || '');
        var fullUri = uri.replace(/\/$/, '') + '/' + name;
        var type = typeof entry === 'object' ? (entry.type || '') : '';

        if (type === 'directory' || (!type && !name.includes('.'))) {
          promises.push(scanDir(fullUri, results, progress).catch(function() {}));
        } else if (isAudio(name)) {
          var nativeUrl = window.Capacitor.convertFileSrc(fullUri.replace('file://', ''));
          results.push({ name: name, uri: fullUri, nativeUrl: nativeUrl });
          if (progress) progress(results.length);
        }
      });
      return Promise.all(promises);
    }).catch(function() {});
  }

  function requestPermissions() {
    if (!isNative()) return Promise.resolve(false);
    // Capacitor 6 permissions API
    if (Filesystem && Filesystem.requestPermissions) {
      return Filesystem.requestPermissions().then(function(res) {
        return res && (res.publicStorage === 'granted' || res.publicStorage === 'prompt-with-rationale');
      }).catch(function() { return true; });
    }
    return Promise.resolve(true);
  }

  function scanAllMusic(onProgress) {
    if (!isNative() || !Filesystem) return Promise.resolve([]);
    return requestPermissions().then(function() {
      var results = [];
      var seen = {};
      var chains = SCAN_ROOTS.map(function(root) {
        return scanDir(root, results, onProgress).catch(function() {});
      });
      return Promise.all(chains).then(function() {
        // Deduplicate by filename
        var deduped = [];
        results.forEach(function(f) {
          if (!seen[f.name]) { seen[f.name] = true; deduped.push(f); }
        });
        return deduped;
      });
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
