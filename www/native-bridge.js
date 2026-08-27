// Native bridge — Capacitor APK only
// Uses Android MediaStore (same database as Spotify) for instant all-library scanning

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
          disc:        f.disc   || 1,
          track:       f.track  || 0,
          year:        f.year   || '',
          genre:       f.genre  || '',
          dur:         f.dur    || 0,
          size:        typeof f.size === 'number' ? f.size : -1,
        };
      });
    });
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
      disc:        fileInfo.disc  || 1,
      track:       fileInfo.track || 0,
      year:        fileInfo.year  || '',
      genre:       fileInfo.genre || '',
      art:         fileInfo.art   || '',   // album art URL from MediaStore
      lyrics: '', syncedLyrics: '',
      dur:         fileInfo.dur || 0,
      size:        typeof fileInfo.size === 'number' ? fileInfo.size : -1,
      dateAdded:   fileInfo.dateAdded || 0,
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

  // Write tags to a physical music file on the device.
  // Supports MP3, FLAC, M4A/AAC, OGG via jaudiotagger.
  // For SD card files, requestSdCardAccess() must be called first.
  // Returns a promise that resolves to { success, fileWritten }.
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
      track:       String(params.track != null ? params.track : ''),
      lyrics:      String(params.lyrics      || ''),
      artBase64:   String(params.artBase64   || ''),
    });
  }

  // Ask the user ONCE for write access to a batch of MediaStore URIs
  // (Android 11+ MediaStore.createWriteRequest — one dialog for the whole batch).
  // Resolves { granted: true|false }. On old plugin builds / Android < 11 it
  // resolves granted:true and the per-file consent flow takes over.
  function requestWriteAccess(uris) {
    var plugin = getPlugin('MediaStore');
    if (!plugin || !plugin.requestWriteAccess) return Promise.resolve({ granted: true });
    return plugin.requestWriteAccess({ uris: uris })
      .catch(function() { return { granted: false }; });
  }

  // Request persistent write access to the SD card via SAF folder picker.
  // Must be called once; the chosen folder is remembered across app restarts.
  // Returns a promise resolving to { success, treeUri }.
  function requestSdCardAccess() {
    var plugin = getPlugin('MediaStore');
    if (!plugin) return Promise.reject(new Error('MediaStore plugin not available'));
    if (!plugin.requestSdCardAccess) return Promise.reject(new Error('requestSdCardAccess not available'));
    return plugin.requestSdCardAccess();
  }

  // Returns the stored SAF tree URI if SD card access was previously granted.
  function getSdCardTreeUri() {
    var plugin = getPlugin('MediaStore');
    if (!plugin || !plugin.getSdCardTreeUri) return Promise.resolve({ treeUri: '' });
    return plugin.getSdCardTreeUri();
  }

  // Show / update the native Android media notification in the notification shade and lock screen.
  // Passes current song metadata and playback state to the Java-side NotificationCompat builder.
  function updateMediaNotification(params) {
    var plugin = getPlugin('MediaStore');
    if (!plugin || !plugin.updateMediaNotification) return Promise.resolve();
    return plugin.updateMediaNotification({
      title:    String(params.title   || ''),
      artist:   String(params.artist  || ''),
      album:    String(params.album   || ''),
      art:      String(params.art     || ''),
      playing:  !!params.playing,
      position: Number(params.position || 0),
      duration: Number(params.duration || 0),
    }).catch(function(e) { console.warn('updateMediaNotification:', e); });
  }

  // Remove the media notification (e.g. when the user taps close or playback stops).
  function hideMediaNotification() {
    var plugin = getPlugin('MediaStore');
    if (!plugin || !plugin.hideMediaNotification) return;
    plugin.hideMediaNotification().catch(function() {});
  }

  // Ask Android for POST_NOTIFICATIONS permission (API 33+) before the first song plays.
  // Safe to call on older Android — the Java side no-ops if permission is not needed.
  function requestNotificationPermission() {
    var plugin = getPlugin('MediaStore');
    if (!plugin || !plugin.requestNotificationPermission) return Promise.resolve();
    return plugin.requestNotificationPermission().catch(function() {});
  }

  // Trigger a haptic vibration directly via Android's Vibrator API.
  // More reliable than navigator.vibrate inside a Capacitor WebView.
  function vibrate(duration) {
    var plugin = getPlugin('MediaStore');
    if (plugin && plugin.vibrate) {
      plugin.vibrate({ duration: duration || 50 }).catch(function() {});
    } else if (navigator.vibrate) {
      navigator.vibrate(duration || 50);
    }
  }

  // Open the Android share sheet for one or more audio content URIs.
  // The system chooser shows Quick Share, Bluetooth, and any installed app that handles audio.
  function shareFiles(uris, title) {
    var plugin = getPlugin('MediaStore');
    if (!plugin || !plugin.shareFiles) return Promise.reject(new Error('shareFiles not available'));
    return plugin.shareFiles({ uris: uris, title: title || 'Share Music' });
  }

  // Generate a QR code for the given text string, returned as a base64 PNG data URL.
  // Fully offline — generated natively by ZXing on the device.
  function generateQrCode(text, size) {
    var plugin = getPlugin('MediaStore');
    if (!plugin || !plugin.generateQrCode) return Promise.reject(new Error('generateQrCode not available'));
    return plugin.generateQrCode({ text: text, size: size || 300 }).then(function(r) { return r.data; });
  }

  // Start a temporary local WiFi HTTP server to share audio files via QR code.
  // songs: [{contentUri, fileName}]
  // Resolves { url } — the URL to encode in the QR code (requires both phones on same WiFi).
  function startShareServer(songs) {
    var plugin = getPlugin('MediaStore');
    if (!plugin || !plugin.startShareServer) return Promise.reject(new Error('startShareServer not available'));
    return plugin.startShareServer({ songs: songs });
  }

  // Stop the local WiFi share server.
  function stopShareServer() {
    var plugin = getPlugin('MediaStore');
    if (plugin && plugin.stopShareServer) plugin.stopShareServer({}).catch(function() {});
  }

  // Permanently delete audio files from the device by their MediaStore content URIs.
  // Android 10+: shows a system confirmation dialog. Android < 10: deletes directly.
  // Resolves { deleted: N } or rejects if cancelled.
  function deleteFiles(uris) {
    var plugin = getPlugin('MediaStore');
    if (!plugin || !plugin.deleteFiles) return Promise.reject(new Error('deleteFiles not available'));
    return plugin.deleteFiles({ uris: uris });
  }

  // Returns { exempt: boolean } — whether the app is already whitelisted from battery optimization.
  function isBatteryOptimizationExempt() {
    var plugin = getPlugin('MediaStore');
    if (!plugin || !plugin.isBatteryOptimizationExempt) return Promise.resolve({ exempt: true });
    return plugin.isBatteryOptimizationExempt().catch(function() { return { exempt: true }; });
  }

  // Opens the system dialog to whitelist the app from battery optimization.
  function requestBatteryOptimizationExemption() {
    var plugin = getPlugin('MediaStore');
    if (!plugin || !plugin.requestBatteryOptimizationExemption) return Promise.resolve();
    return plugin.requestBatteryOptimizationExemption().catch(function() {});
  }

  // Write a text file to the public Downloads folder (backups, playlist exports).
  function saveToDownloads(fileName, text, mimeType) {
    var plugin = getPlugin('MediaStore');
    if (!plugin || !plugin.saveToDownloads) return Promise.reject(new Error('saveToDownloads not available'));
    return plugin.saveToDownloads({ fileName: fileName, text: text, mimeType: mimeType || 'text/plain' });
  }

  // Installed version, used to tell whether a published release is newer.
  function getAppVersion() {
    var plugin = getPlugin('MediaStore');
    if (!plugin || !plugin.getAppVersion) return Promise.resolve(null);
    return plugin.getAppVersion().catch(function() { return null; });
  }

  // Open a link in the browser. An APK link opened inside the WebView does nothing.
  function openExternal(url) {
    var plugin = getPlugin('MediaStore');
    if (!plugin || !plugin.openExternal) return Promise.reject(new Error('openExternal not available'));
    return plugin.openExternal({ url: url });
  }

  return { isNative: isNative, scanAllMusic: scanAllMusic, toSong: toSong,
           saveToDownloads: saveToDownloads,
           getAppVersion: getAppVersion, openExternal: openExternal,
           requestPermissions: requestPermissions, openAppSettings: openAppSettings,
           readAlbumArt: readAlbumArt, writeFileTags: writeFileTags,
           vibrate: vibrate,
           requestWriteAccess: requestWriteAccess,
           requestSdCardAccess: requestSdCardAccess, getSdCardTreeUri: getSdCardTreeUri,
           updateMediaNotification: updateMediaNotification,
           hideMediaNotification: hideMediaNotification,
           requestNotificationPermission: requestNotificationPermission,
           isBatteryOptimizationExempt: isBatteryOptimizationExempt,
           requestBatteryOptimizationExemption: requestBatteryOptimizationExemption,
           deleteFiles: deleteFiles,
           shareFiles: shareFiles, generateQrCode: generateQrCode,
           startShareServer: startShareServer, stopShareServer: stopShareServer };
})();
