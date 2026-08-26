# Muzio — Smart Music Player

A local-first, dark-themed music player for Android with AI-assisted auto-tagging. Point it at your music library and it fills in artist, album, year, genre, and release type (Album / Mixtape / EP / Single) using MusicBrainz (free, no key) and, optionally, the Google Gemini API.

Built as **pure HTML/CSS/JavaScript with zero build tools** for the web layer, wrapped with **Capacitor 8 and a hand-written native Java plugin** for Android.

Tested against a real 15,000-song library.

---

## Screenshots

<!-- Add screenshots here — Artists tab, Now Playing, and the tag editor make the strongest first impression. -->

---

## Features

### Playback
- Play/pause, previous/next, seek, and playback speed (0.5×–2×)
- Shuffle with Fisher–Yates reshuffling of the remaining queue; repeat off / one / all
- Gapless playback with optional crossfade
- Queue panel — view what's next, add to queue, clear
- 5-band equalizer with presets
- Background playback via a foreground service; continues with the screen off
- Synced lyrics and playback position restore correctly when you return to the app

### Library
- **Artists** — virtual-scrolled list with a circular album-art mosaic, an A–Z jump strip, and list / 2-column / 3-column views
- **Songs** — virtual-scrolled list handling 15,000+ songs at 60 fps; sort by title, artist, album, year, date added, most played, or duration
- **Albums** — 2-column virtual-scroll grid with filter chips (All / Albums / Mixtapes / EPs & Singles) and an A–Z strip
- **Playlists** — manual playlists plus smart ones that populate themselves (Favorites, Top Played, Recently Added, by Genre, by Year)
- **Genres** — browse by genre with per-genre counts
- **Favorites** — heart any song; available as its own view
- **Search** — across songs, artists, albums, genre, and album artist

### Now Playing
- Full-screen album art with ambient colour sampled from the art
- Blurred background matched to the current cover
- Tap the album or artist name to jump straight to that page
- Synced lyrics (LRC) with live line highlighting, in portrait and landscape
- Speed, repeat, and shuffle toggles

### Tagging
- **MusicBrainz lookup** — free, no key; year, genre, release type, and artist credit. Results take priority over AI guesses.
- **Google Gemini** (optional) — fills whatever MusicBrainz didn't, including subgenre and featured artists
- **Album batch editor** — retag every song in an album at once. The album-artist field starts blank when songs are untagged, so saving never overwrites correct tags with "Unknown Artist".
- **Per-song editor** — full metadata, album art picker, AI fill, and a lyrics field (plain or LRC)
- **Album name cleaning** — `Album_-_Nickel_Bag_Ep` becomes `Album - Nickel Bag Ep`
- **Year sanity filter** — suppresses the 1970 Unix-epoch default that corrupt ID3 tags produce
- Custom album art applies everywhere it should: song rows, album grid, artist mosaic, and artist avatars

### Backup and Restore
- **Export** writes a JSON backup to your Downloads folder containing every manual edit, your playlists, favourites, profile name, and profile photo
- **Import** merges a backup back in — safe to run repeatedly, and it never wipes what's already there
- Designed so your tagging work survives reinstalling the app

### Android Integration
- **Media notification** — lock-screen and shade controls via `MediaSession` and a foreground service
- **Hardware and Bluetooth buttons** routed through `MediaSession.Callback` into the web player
- **MediaStore scanning** — reads every audio file on the device without copying anything, using the right runtime permission per API level (`READ_MEDIA_AUDIO` on API 33+, `READ_EXTERNAL_STORAGE` below). Includes files that Android does not flag as music, which is where most downloaded tracks land.
- **Tag writing** — metadata written directly into files with jaudiotagger, then pushed back into MediaStore so other apps stay in sync
- **Permanent delete** — removes the file through MediaStore with Android's own confirmation dialog, frees the space, and clears every trace from the library
- **WiFi sharing** — an in-app HTTP server plus a QR code, so any phone on the same network can download a song, an album, or a ZIP selection

---

## Getting a Free Gemini API Key

1. Visit **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)**
2. Sign in and create a free key
3. In the app: side drawer → **Set Gemini API Key** → paste

The free tier covers a large collection. MusicBrainz needs no key at all.

---

## Running in a Browser

No build step. The web layer runs unmodified in any Chromium browser — you just won't get the native features (MediaStore scanning, tag writing, delete).

```bash
git clone https://github.com/dathaze20/music-player-tagger.git
cd music-player-tagger/www
python3 -m http.server 8080
```

Open `http://localhost:8080` and use **Select Music Files** to import.

---

## Building the Android APK

GitHub Actions builds on every push — grab the APK from the **Actions** tab → latest run → **Artifacts**.

### Local build

```bash
npm install
mkdir -p android/app/src/main/assets/public
cp -r www/. android/app/src/main/assets/public/
cp capacitor.config.json android/app/src/main/assets/capacitor.config.json
cd android
./gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### Signed release

Set the following, then run `./gradlew assembleRelease bundleRelease`:

| Variable | Description |
|---|---|
| `KEYSTORE_BASE64` | Base64-encoded keystore |
| `STORE_PASSWORD` | Keystore password |
| `KEY_ALIAS` | Key alias |
| `KEY_PASSWORD` | Key password |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JavaScript — no framework, no bundler |
| Storage | IndexedDB (`muzio_library_idb` for the library and manual edits, `muzio_art` for the art cache); localStorage for settings and a fast-start preview |
| Tagging | MusicBrainz API (free) + Google Gemini API (optional) |
| Tag writing | jaudiotagger — MP3, FLAC, M4A, OGG, WAV, OPUS |
| Lyrics | LRC parsing with time-aligned highlighting |
| Mobile shell | Capacitor 8 |
| Native Android | `MediaStorePlugin.java` — scanning, permissions, art decoding, tag writing, delete, file save, WiFi server |
| Background audio | `MuzioPlaybackService.java` — foreground service with `MediaSession` |
| CI | GitHub Actions — lint, unit tests, and debug/release APK + AAB on every push |

---

## Architecture Notes

**Why a native plugin instead of a plain WebView wrapper**

The web layer uses the File System Access API on desktop, which Android does not support. Rather than ship a weaker mobile experience, the repo includes a hand-written plugin that:

- Queries `MediaStore` directly for every audio file, pulling name, path, duration, disc, album artist, genre, size, and date added in a single cursor pass
- Requests the correct runtime permission for the API level
- Decodes album art natively with `BitmapFactory` before handing JS a base64 JPEG, so large embedded art never blocks the UI thread
- Writes tags through a temp-file copy → modify → write-back pattern, so an interrupted write cannot corrupt the original
- Runs a `MediaSession` and foreground service for background playback
- Routes hardware and Bluetooth buttons back to JS via local broadcasts

The same UI JavaScript runs unchanged in a desktop browser tab and in the installed app.

**Virtual scroll**

Song, artist, and album lists render only the visible window plus a small buffer. A 15,000-song library scrolls at 60 fps because roughly 80 DOM nodes exist at any moment. The album grid renders rows of two cards inside a single offset container rather than positioning each card.

**Album art pipeline**

Art is decoded natively, scaled to ≤512px, and JPEG-compressed before crossing the bridge. A three-level cache — in-memory LRU, then IndexedDB, then native decode — means each cover is decoded at most once per session, and `IntersectionObserver` ensures only visible cards trigger a decode.

**Edit persistence**

Manual edits live in their own IndexedDB store (`manual_edits`), keyed by content URI with a filename fallback, and are re-applied on top of every fresh MediaStore scan. Edits therefore survive a full rescan and are never clobbered by Android's stale metadata. Deleting a song also deletes its saved edits, so a file later downloaded under the same name does not silently inherit them.

**Activity results**

Capacitor routes an Android activity result to a plugin only if the request code is declared in the `requestCodes` element of `@CapacitorPlugin`, which defaults to empty. Every flow that needs a system dialog — delete, tag-write consent, storage access — declares its code there. Without it those calls hang forever with no error, since neither the success nor the failure path is ever reached.

---

## Tests and Linting

```bash
npm install
npm test     # vitest — filename parsing, LRC parsing, time formatting
npm run lint # eslint over the shipped app in www/
```

Both run in CI on every push.

---

## Known Limitations

- **SD card tag writing** is implemented natively but no UI triggers the permission request, so it cannot currently be used.
- **Damaged audio files** cannot be played. The WebView uses Chromium's decoders, which reject some truncated or malformed downloads. The app reports the reason, including the file size when a download is incomplete, so a broken file is easy to tell apart from an unsupported format.
- **Crossfade and the equalizer** rely on the Web Audio API and are unavailable on files the WebView cannot decode.

---

## License

MIT — see [LICENSE](LICENSE).
