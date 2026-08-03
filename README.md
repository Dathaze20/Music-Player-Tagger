# My Music — Smart Music Player

A local-first, dark-themed music player for Android with AI-powered auto-tagging. Point it at your music library and it automatically fills in artist, album, year, genre, and release type (Album / Mixtape / EP / Single) using Google MusicBrainz (free, no key required) and the Google Gemini API.

Built as **pure HTML/CSS/JavaScript with zero build tools** for the web layer, wrapped with **Capacitor + a hand-written native Java plugin** for the Android app.

---

## Features

### Playback
- Full audio playback with play/pause, previous/next, seek bar, and playback speed control (0.5× – 2×)
- Shuffle and three repeat modes (off / one / all)
- Gapless queue with drag-to-reorder
- Sleep timer with adjustable countdown
- Playback persists in the background via a foreground service — music keeps playing when the app is backgrounded or the screen is off

### Library
- **Artists** tab — virtual-scrolled list with circular album art mosaic; A–Z alphabet strip for fast jump; grid view (1, 2, or 3 columns); multi-select for batch artist merge
- **Songs** tab — virtual-scrolled list (handles 15,000+ songs instantly); sortable by Title / Artist / Recently Added / Most Played
- **Albums** tab — cover-flow grid with filter buttons (All / Albums / Mixtapes / EPs & Singles)
- **Playlists** tab — manual and AI-generated smart playlists (Favorites, Top Played, Recently Added, by Genre/Year)
- **Genres** tab — browse by genre with per-genre song counts
- **Favorites** — heart any song and access it from the side drawer

### Now Playing Screen
- Full-screen album art with `object-fit: cover`
- Ambient color breathing — album art colors are sampled and pulse as two animated radial gradients behind the art for a "alive" feel
- Blurred dark background that matches the album art
- Tappable album name navigates to the full album; tappable artist name navigates to that artist
- Synced lyrics (`.lrc` files) with real-time word highlighting
- Playback speed, repeat, and shuffle toggles

### AI Auto-Tagging
- **MusicBrainz lookup** (free, no API key needed) — queries the open music database for year, genre, release type, and artist credit; results are used first and win over AI guesses
- **Google Gemini** (optional, free tier available) — fills any gaps MusicBrainz didn't cover; identifies subgenre, featured artists, and release classification
- **Album name cleaning** — removes underscores and filename artifacts from AI-returned names (e.g. `Album_-_Nickel_Bag_Ep` → `Album - Nickel Bag Ep`)
- **Year sanity filter** — suppresses the 1970 Unix-epoch default that corrupt ID3 tags produce, both in the Android MediaStore scanner and in the AI fill results
- **Batch album editor** — edit all songs in an album at once; AI fills artist, album artist, year, genre, and release type with a single tap
- **Song editor** — per-song metadata editing with album art picker and AI fill button
- Supports Album / Mixtape / EP / Single release type classification with colored chip selectors

### Android System Integration
- **Media notification** — lock screen and notification shade controls (play/pause, previous, next, seek bar) via `MediaSession` and a foreground service; teal accent color matches the app theme
- **Hardware and Bluetooth button support** — physical media keys and BT headset buttons are routed through `MediaSession.Callback` to the JavaScript player
- **MediaStore scanning** — reads all audio files from device storage (internal and SD card) without requiring file copies; uses the correct runtime permission for the Android version (`READ_MEDIA_AUDIO` on API 33+, `READ_EXTERNAL_STORAGE` on API 32 and below)
- **Album art** — decoded and downsampled on the native side (`BitmapFactory`) before being passed to JS as base64 JPEG, so large embedded art doesn't block the UI thread
- **Background persistence** — library is saved to IndexedDB and localStorage so song history, queue, and playback position are restored between sessions

### Search
- Global search across songs, artists, and albums
- Tap any result to navigate directly to that artist, album, or song

### Playlists
- Create and rename playlists manually
- Add individual songs or entire albums to a playlist in one tap
- Smart playlists auto-populate: Favorites, Top 25, Recently Added, by Genre, by Year
- Queue management — add to queue, view and reorder the current queue

### Visual Design
- Dark OLED-friendly theme with teal (`#00a89e`) accent
- Tab bar with active pill glow and indicator bar
- Mini player with rounded album art, teal play button, and a teal top glow line
- Artist rows with round art, clean typography
- Album grid cards with consistent aspect ratio
- Smooth fade-in transition on every navigation

---

## Getting a Free Gemini API Key

1. Go to **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)**
2. Sign in with a Google account and create a free key
3. In the app: open the side drawer → tap **Set Gemini API Key** → paste the key

The free tier provides enough quota for tagging a large collection. MusicBrainz lookups are always free and require no key.

---

## Running in a Browser

No build step required.

```bash
git clone https://github.com/dathaze20/music-player-tagger.git
cd music-player-tagger
# Open index.html directly, or serve with:
python3 -m http.server 8080
```

Then open `http://localhost:8080` in Chrome or Edge (Firefox has limited File System Access API support). Tap **+** to import music files or a folder.

---

## Building the Android APK

The Android project lives in `android/` and is driven by Capacitor 8. GitHub Actions builds it automatically on every push — download the latest APK from the **Actions** tab → most recent workflow run → **Artifacts**.

### Local build

```bash
npm install
mkdir -p android/app/src/main/assets/public
cp -r www/. android/app/src/main/assets/public/
cp capacitor.config.json android/app/src/main/assets/capacitor.config.json
cd android
./gradlew assembleDebug
```

Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`

### Signed release build

Set these environment variables (or GitHub Actions secrets) and run `./gradlew assembleRelease bundleRelease`:

| Variable | Description |
|---|---|
| `KEYSTORE_BASE64` | Base64-encoded keystore file |
| `STORE_PASSWORD` | Keystore password |
| `KEY_ALIAS` | Key alias inside the keystore |
| `KEY_PASSWORD` | Key password |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JavaScript — no framework, no bundler |
| Storage | IndexedDB (art cache, library), localStorage (settings, UI state) |
| AI tagging | Google MusicBrainz API (free) + Google Gemini API (optional) |
| Lyrics | LRC file parsing with time-aligned highlighting |
| Mobile shell | Capacitor 8 |
| Native Android | Java — `MediaStorePlugin.java` (MediaStore, permissions, art decoding, MediaSession) |
| Background audio | `MuzioPlaybackService.java` — foreground service with `MediaSession` and `Notification.MediaStyle` |
| CI/CD | GitHub Actions — debug APK, release APK, and AAB on every push |

---

## Architecture Notes

**Why not a simple WebView wrapper?**

The web layer talks to the filesystem through the browser's File System Access API. Android can't use that — so instead of a weaker mobile experience, this repo includes a hand-written native plugin that:

- Queries `MediaStore` directly for every audio file on-device (no file copies)
- Requests the correct runtime permission per API level (API 33+ vs API 32 and below)
- Decodes album art natively before handing it to JS as base64 JPEG
- Hosts a `MediaSession` + foreground service so playback continues in background
- Routes hardware/BT button presses back to JS via local broadcasts
- Exposes `openAppSettings` so users can re-grant permissions without hunting Android's UI

The same UI JavaScript runs unmodified in a desktop browser tab or as an installed Android app.

**Virtual scroll**

Song and artist lists use a virtual scroll implementation that renders only the visible window (~60 rows) regardless of library size. A 15,000-song library scrolls at 60 fps because only ~80 DOM nodes exist at any time.

**Album art pipeline**

Art is decoded by `BitmapFactory` on the Java side, scaled to ≤512px, and JPEG-compressed before crossing the bridge as base64. A three-level cache (in-memory LRU → IndexedDB → native decode) ensures each piece of art is decoded at most once per session.

---

## Tests

```bash
npm install
npm test
```

Unit tests cover filename parsing, LRC lyric parsing, and time formatting helpers — see `tests/`.

---

## License

MIT — see [LICENSE](LICENSE).
