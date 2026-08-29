# My Music — Smart Music Player

A local-first music player for Android. It scans the audio already on your phone, plays it, and cleans up the metadata — filling in artist, album, year, genre, and release type (Album / Mixtape / EP / Single) from MusicBrainz (free, no key) and, optionally, Google Gemini.

It is a full player, not a tag editor with a play button: browse by artist, album, genre or playlist, queue and shuffle, background playback with lock-screen controls, an equalizer, synced lyrics, favorites, search, and artwork throughout.

Built as **pure HTML/CSS/JavaScript with zero build tools** for the web layer, wrapped with **Capacitor 8 and a hand-written native Java plugin** for Android.

Tested against a real 15,000-song library on a physical device.

---

## Screenshots

*No screenshots are committed yet.* The three that would show the most, in order:

| Slot | Screen | Why it earns the space |
|---|---|---|
| 1 | **Artists tab** with the library loaded | Shows the scale it handles and the album-art mosaic — the strongest evidence this is a real player |
| 2 | **Now Playing**, full screen, mid-track | Ambient colour sampled from the cover, synced lyrics, transport controls |
| 3 | **Tag editor** with AI fill applied | The feature the project is named for, and the least obvious from a feature list |

Drop the files in a `screenshots/` folder and link them here.

---

## Features

### Playback
- Play/pause, previous/next, seek, and playback speed (0.75× / 1× / 1.25× / 1.5× / 2×)
- Shuffle with Fisher–Yates reshuffling of the remaining queue; repeat off / one / all
- The next track is preloaded for a seamless handoff, with an optional crossfade up to 8 seconds
- Queue panel — see what's next, add to queue, clear
- 5-band equalizer (60 Hz – 14 kHz) with presets
- Background playback via a foreground service; keeps going with the screen off
- Swipe a song row right to queue it, left to favorite it
- Synced lyrics and playback position restore correctly when you return to the app

### Library
- **Artists** — virtual-scrolled list with a circular album-art mosaic, an A–Z jump strip, and list / 2-column / 3-column views. Sort A–Z, Z–A, or by song count
- **Songs** — virtual-scrolled list built for libraries in the tens of thousands. Sort by title, artist, or date added
- **Albums** — 2-column virtual-scroll grid with filter chips (All / Albums / Mixtapes / EPs & Singles) and an A–Z strip. Sort A–Z, by year, or by song count
- **Playlists** — manual playlists, plus four that build themselves: Top Tracks, Last Added, Recently Played, Favorites
- **Genres** — browse by genre with per-genre counts
- **Favorites** — heart any song; available as its own view
- **Search** — across title, artist, album, album artist, genre, and featured artists

### Now Playing
- Full-screen album art with ambient colour sampled from the artwork
- Blurred background matched to the current cover
- Tap the album or artist name to jump straight to that page
- Synced lyrics (LRC) with live line highlighting, in portrait and landscape
- Speed, repeat, and shuffle toggles

### Tagging
- **MusicBrainz lookup** — free, no key; year, genre, release type, and artist credit. Results take priority over AI guesses
- **Google Gemini** (optional) — fills whatever MusicBrainz didn't, including subgenre and featured artists
- **Album batch editor** — retag every song in an album at once. The album-artist field starts blank when songs are untagged, so saving never overwrites correct tags with "Unknown Artist"
- **Per-song editor** — full metadata, album art picker, AI fill, and a lyrics field (plain or LRC)
- **Filename parsing** for untagged files — strips track numbers, `(prod. by …)`, and `(Official Audio)`-style noise, splits `Artist_-_Title` into its parts, converts underscores back to spaces, and pulls featured artists out into their own field
- **Year sanity filter** — suppresses the 1970 Unix-epoch default that corrupt ID3 tags produce
- Custom album art applies everywhere it should: song rows, album grid, artist mosaic, and artist avatars

### Sharing
- **Android share sheet** — send a song, an album, or a selection to any app that handles audio, including Bluetooth and Quick Share
- **WiFi sharing** — an on-device HTTP server plus a natively generated QR code, so any phone on the same network can download the actual audio files. Multiple songs are streamed as a ZIP

### Backup and Restore
- **Export** writes a JSON backup to your Downloads folder containing every manual edit, your playlists, favorites, profile name, and profile photo
- **Import** merges a backup back in — safe to run repeatedly, and it never wipes what's already there
- Designed so your tagging work survives reinstalling the app

### Staying Current
- **Check for Updates** in the side drawer compares the installed version code against the latest GitHub release and offers the download, so there is no need to visit the repository

---

## Android Integration

Everything below is implemented in the hand-written plugin (`MediaStorePlugin.java`, ~1,500 lines) and its playback service — not through an off-the-shelf wrapper.

- **MediaStore scanning** — reads every audio file on the device without copying anything, pulling name, path, duration, disc, album artist, genre, size, and date added in a single cursor pass. Requests the correct runtime permission per API level (`READ_MEDIA_AUDIO` on API 33+, `READ_EXTERNAL_STORAGE` below). Includes files Android does not flag as music, which is where most downloaded tracks land
- **Media notification** — lock-screen and shade controls via `MediaSession` and a foreground service
- **Hardware and Bluetooth buttons** routed through `MediaSession.Callback` into the web player
- **Native artwork decoding** — `BitmapFactory` decodes and scales covers off the UI thread before handing JavaScript a base64 JPEG
- **Tag writing** — metadata written directly into files with jaudiotagger (MP3, FLAC, M4A/AAC, OGG, OPUS, WAV, WMA), then pushed back into MediaStore so other apps stay in sync
- **Permanent delete** — removes the file through MediaStore with Android's own confirmation dialog, frees the space, and clears every trace from the library
- **File save** — backups are written to Downloads through MediaStore, because a WebView has no download handler and `<a download>` silently does nothing
- **QR generation** and a **local HTTP file server** for WiFi sharing
- **Clipboard read** — an Android WebView does not implement `navigator.clipboard.readText()`, so the API-key screen asks Android directly and can tell you what you actually copied
- **Battery optimisation prompt** — offers the exemption once, since Android otherwise kills background playback
- **Notification permission** requested on Android 13+, plus haptics and an external-link handler

---

## Architecture Notes

**Why a native plugin instead of a plain WebView wrapper**

The web layer uses the File System Access API on desktop, which Android does not support. Rather than ship a weaker mobile experience, the repo includes a plugin that owns scanning, permissions, artwork, tag writing, deletion, sharing and background audio. The same UI JavaScript runs unchanged in a desktop browser tab and in the installed app.

**Virtual scroll**

Song, artist, and album lists render only the visible window plus a buffer — about 70 rows exist in the DOM at any moment regardless of library size. The album grid renders rows of two cards inside a single offset container rather than positioning each card.

**Album art pipeline**

Art is decoded natively, scaled, and JPEG-compressed before crossing the bridge. A three-level cache — in-memory LRU, then IndexedDB, then native decode — means each cover is decoded at most once per session, and `IntersectionObserver` ensures only visible cards trigger a decode.

**Edit persistence**

Manual edits live in their own IndexedDB store (`manual_edits`), keyed by content URI with a filename fallback, and are re-applied on top of every fresh MediaStore scan. Edits therefore survive a full rescan and are never clobbered by Android's stale metadata. Deleting a song also deletes its saved edits, so a file later downloaded under the same name does not silently inherit them.

**Activity results**

Capacitor routes an Android activity result to a plugin only if the request code is declared in the `requestCodes` element of `@CapacitorPlugin`, which defaults to empty. Every flow that needs a system dialog — delete, tag-write consent, storage access — declares its code there. Without it those calls hang forever with no error, since neither the success nor the failure path is ever reached.

**Surviving Google's API changes**

The Gemini integration is built to absorb changes rather than break on them, after Google changed both the key format and the endpoint mid-2026:

- Keys are sent in the `x-goog-api-key` header, which carries both the newer `AQ.` auth keys and the older `AIza` standard keys. The query parameter remains only as a fallback
- The model is discovered from the API and ranked rather than hardcoded, with a built-in list as backup so a failed listing call cannot end the check
- A model that refuses `:generateContent` and names the Interactions API is retried there. The endpoint that answered is remembered, but treated as a shortcut — if another model will not answer there, the other endpoint is tried and relearned
- The Interactions request shape is negotiated: Google names the field it rejects, so the plausible shapes are tried in order and the accepted one is kept
- The key's state is shown permanently in the menu with the reason in plain words, not in a tooltip a phone cannot display

**Release automation**

Tagging a version, or dispatching the release workflow, decrypts the signing keystore from a repository secret, builds a signed APK and AAB, verifies the signature with `apksigner`, and publishes a GitHub Release. Release notes come from the matching `CHANGELOG.md` section, falling back to commit subjects if none exists. The workflow is re-runnable against an existing tag. It refuses to publish anything unsigned.

---

## Getting a Free Gemini API Key

1. Visit **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)**
2. Sign in and create a free key — use the copy button rather than selecting it by hand
3. In the app: side drawer → **Set Gemini API Key** → paste

The setup screen reads your clipboard, says whether what it found looks like a key, and tests it against Google before saving. The menu then shows whether the key is working and, if not, why.

MusicBrainz needs no key at all.

---

## Install

Download the latest signed APK from the [**Releases**](https://github.com/dathaze20/music-player-tagger/releases) page and open it. Android will warn that your browser is not allowed to install apps — tap Settings, allow it, go back, and install. Updates install straight over the top; nothing is lost.

Requires **Android 7.0 (API 24)** or newer.

---

## Running in a Browser

No build step. The web layer runs unmodified in any Chromium browser — you just won't get the native features (MediaStore scanning, tag writing, delete, sharing).

```bash
git clone https://github.com/dathaze20/music-player-tagger.git
cd music-player-tagger/www
python3 -m http.server 8080
```

Open `http://localhost:8080` and use **Pick Files** to import.

---

## Building the Android APK

Every push builds debug and release artifacts — grab them from the **Actions** tab → latest run → **Artifacts**.

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

Signing is read entirely from the environment. Without these, release builds fall back to unsigned rather than failing the build.

| Variable | Description |
|---|---|
| `KEYSTORE_PATH` | Path to the keystore file |
| `STORE_PASSWORD` | Keystore password |
| `KEY_ALIAS` | Key alias |
| `KEY_PASSWORD` | Key password |
| `APP_VERSION_NAME` | Version name, e.g. `1.5.4` |
| `APP_VERSION_CODE` | Integer version code — Android decides upgrades on this alone |

Then `./gradlew assembleRelease bundleRelease`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JavaScript — no framework, no bundler |
| Storage | IndexedDB (`muzio_library_idb` for the library and manual edits, `muzio_art` for the art cache); localStorage for settings and a fast-start library preview |
| Tagging | MusicBrainz API (free) + Google Gemini API (optional) |
| Tag writing | jaudiotagger — MP3, FLAC, M4A/AAC, OGG, OPUS, WAV, WMA |
| Lyrics | LRC parsing with time-aligned highlighting |
| QR codes | ZXing, generated natively |
| Mobile shell | Capacitor 8 (min SDK 24, target SDK 36) |
| Native Android | `MediaStorePlugin.java` — scanning, permissions, art decoding, tag writing, delete, file save, clipboard, sharing, WiFi server |
| Background audio | `MuzioPlaybackService.java` — foreground service with `MediaSession` |
| CI | GitHub Actions — lint and unit tests on every push; debug/release APK + AAB builds; signed GitHub Releases |

---

## Tests and Linting

```bash
npm install
npm test     # vitest — filename parsing, LRC parsing, time formatting, HTML escaping
npm run lint # eslint over the shipped app in www/
```

Both run in CI on every push.

---

## Known Limitations

- **SD card tag writing** is implemented natively but no UI triggers the permission request, so it cannot currently be used.
- **Damaged audio files** cannot be played. The WebView uses Chromium's decoders, which reject some truncated or malformed downloads. The app reports the reason, including the file size when a download is incomplete, so a broken file is easy to tell apart from an unsupported format.
- **Crossfade and the equalizer** rely on the Web Audio API and are unavailable on files the WebView cannot decode.
- **Automated tests cover the pure helper functions only** — filename, LRC and time parsing. Playback, scanning, and the native layer are verified by hand on a device.
- **Android only.** The web layer runs in any Chromium browser, but every native capability is Android-specific.

---

## License

MIT — see [LICENSE](LICENSE).
