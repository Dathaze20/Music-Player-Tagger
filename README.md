# Muzio AI — Smart Music Player

A local-first, dark-themed music player for the web and Android with AI-powered
auto-tagging: point it at a folder of loosely-named MP3s and it fills in artist,
album, year, genre, and release type (Album / Mixtape / EP / Single) using the
Google Gemini API.

It's built as **pure HTML/CSS/JavaScript with zero build tools** for the web
version, wrapped with **Capacitor + a native Java plugin** for the Android app.

## Why this is more than a "wrapped webpage"

The web build talks to the filesystem through the browser's File System Access
API. The Android build can't use that — so instead of shipping a weaker mobile
experience, this repo includes a real native plugin
(`android/app/src/main/java/com/muzioai/app/MediaStorePlugin.java`) that:

- Queries Android's `MediaStore` directly for every audio file on-device
  (title, artist, album, duration, track number, album art URI).
- Requests the *correct* runtime permission for the OS version it's running
  on — `READ_MEDIA_AUDIO` on Android 13+ (API 33+) vs. `READ_EXTERNAL_STORAGE`
  on Android 12 and below — since Google changed the media permission model
  in API 33 and a single hardcoded permission string doesn't work across
  versions.
- Decodes and downsamples embedded album art on the native side (via
  `BitmapFactory`) before handing it back to the web layer as a base64 JPEG,
  so large embedded art doesn't get parsed in JS.
- Exposes a settings deep-link (`openAppSettings`) so a user who denied the
  permission can re-grant it without hunting through Android's UI.

That plugin, plus the JS-side bridge in `www/native-bridge.js`, is what lets
the exact same UI code run unmodified in a browser tab or as an installed
Android app.

## Features

- Dark-themed player UI — Artists, Albums, Songs, Playlists, and Favorites tabs.
- AI auto-tagging via Gemini: artist, album, year, genre, and Album/Mixtape/EP/Single
  classification, with batch editing across an entire album at once.
- Robust filename parsing (`parseFileName` in `app.js`) that untangles messy
  real-world names — `"DJ Whoever - Gangsta Grillz - Artist - Title (feat. X) [Official Audio].mp3"`
  style — into clean artist/title/feat fields as a fallback before AI tagging runs.
- Synced lyrics (`.lrc` parsing) with time-aligned highlighting during playback.
- Library persistence via IndexedDB, with folder re-linking on the web build
  so you don't have to re-import every session.
- Installable as a PWA (manifest + service worker) or as a native Android APK.

## Screenshots

_Add a screenshot or short screen recording here — this is the single highest-leverage
thing you can do to make this repo's quality obvious at a glance to anyone
browsing GitHub._

## Running it in a browser

No build step required.

1. Clone the repo.
2. Open `index.html` directly in a browser (or serve the folder with any
   static file server — some browsers restrict the File System Access API
   over the `file://` protocol).
3. Tap **+** to import music files or a folder.
4. Open the side menu → AI Settings and add your own [Gemini API key](https://ai.google.dev/)
   to enable auto-tagging.

## Building the Android app

The Android project lives in `android/` and is driven by Capacitor. CI builds
it automatically on every push via `.github/workflows/build-apk.yml`, which
produces a debug APK, a release APK, and a release AAB (Play Store bundle) as
downloadable build artifacts.

To build locally:

```bash
npm install
mkdir -p android/app/src/main/assets/public
cp -r www/. android/app/src/main/assets/public/
cp capacitor.config.json android/app/src/main/assets/capacitor.config.json
cd android
./gradlew assembleDebug
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.

To build a signed release build, set the `KEYSTORE_BASE64`, `STORE_PASSWORD`,
`KEY_ALIAS`, and `KEY_PASSWORD` secrets (locally as env vars, or as GitHub
Actions secrets for CI) and run `./gradlew assembleRelease bundleRelease`.

## Tech stack

- **Frontend:** vanilla HTML/CSS/JavaScript (no framework, no bundler)
- **Storage:** IndexedDB (library), File System Access API (web folder access)
- **AI tagging:** Google Gemini API
- **Mobile shell:** Capacitor
- **Native Android:** Java (`MediaStorePlugin.java`) for MediaStore queries,
  runtime permissions, and native album-art decoding
- **CI/CD:** GitHub Actions — builds debug/release APKs and an AAB on every push

## Tests

```bash
npm install
npm test
```

Unit tests cover the pure parsing/formatting helpers (filename parsing, LRC
lyric parsing, time formatting) — see `tests/`.

## License

MIT — see [LICENSE](LICENSE).
