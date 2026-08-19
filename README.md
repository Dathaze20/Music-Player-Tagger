# Muzio — Smart Music Player

A local-first, dark-themed music player for Android with AI-powered auto-tagging. Point it at your music library and it automatically fills in artist, album, year, genre, and release type (Album / Mixtape / EP / Single) using MusicBrainz (free, no key required) and the Google Gemini API.

Built as **pure HTML/CSS/JavaScript with zero build tools** for the web layer, wrapped with **Capacitor 8 + a hand-written native Java plugin** for the Android app.

---

## Features

### Playback
- Full audio playback — play/pause, previous/next, seek bar, and playback speed control (0.5× – 2×)
- Shuffle with Fisher-Yates reshuffling of the remaining queue; three repeat modes (off / one / all)
- Gapless queue with crossfade support and drag-to-reorder
- Sleep timer with adjustable countdown
- Playback continues in the background via a foreground service — music keeps playing when the app is backgrounded or the screen is off
- Lyrics and playback position automatically sync when you return to the app after backgrounding

### Library
- **Artists** tab — virtual-scrolled list with circular album art mosaic; A–Z alphabet strip for instant jump; list / 2-column / 3-column grid view; multi-select for batch artist merge / edit
- **Songs** tab — virtual-scrolled list (handles 15,000+ songs at 60 fps); sortable by Title / Artist / Date Added (newest first) / Most Played
- **Albums** tab — 2-column virtual-scroll grid with square album art, bold name, artist and song count; filter chips (All / Albums / Mixtapes / EPs & Singles); A–Z alphabet strip
- **Playlists** tab — manual and smart playlists (Favorites, Top Played, Recently Added, by Genre, by Year)
- **Genres** tab — browse by genre with per-genre song counts
- **Favorites** — heart any song; access favorites from the side drawer

### Now Playing Screen
- Full-screen album art with ambient color breathing — art colors are sampled and pulse as animated radial gradients for a live feel
- Blurred dark background that matches the album art
- Tappable album name navigates to the full album; tappable artist name navigates to that artist's page
- Synced lyrics (LRC format) with real-time line highlighting — visible in both portrait and landscape orientation
- Lyrics resume at the correct position when you switch back to the app mid-song
- Playback speed, repeat, and shuffle toggles
- Portrait: large 72px play button with teal halo rings; landscape: scaled 64px play button with proportional halo, skip buttons sized to avoid overlap

### AI Auto-Tagging
- **MusicBrainz lookup** (free, no key) — queries the open music database for year, genre, release type, and artist credit; results take priority over AI guesses
- **Google Gemini** (optional, free tier available) — fills any gaps MusicBrainz didn't cover; identifies subgenre, featured artists, and release classification
- **Album batch editor** — edit all songs in an album at once; AI fills artist, album artist, year, genre, and release type with one tap; album artist field starts blank when all songs are untagged so saving never overwrites correctly-tagged songs with "Unknown Artist"
- **Song tag editor** — full per-song metadata editor with album art picker, AI fill, lyrics field (plain or LRC synced), and release type chips
- **Album name cleaning** — strips underscores and filename artifacts (e.g. `Album_-_Nickel_Bag_Ep` → `Album - Nickel Bag Ep`)
- **Year sanity filter** — suppresses the 1970 Unix-epoch default from corrupt ID3 tags in both MediaStore scanning and AI results
- Release type classification: Album / Mixtape / EP / Single with colored chip selectors

### Tag Writing
- Writes metadata directly into audio files on-device using jaudiotagger (MP3, FLAC, M4A, OGG, WAV, WMA, OPUS)
- Correct MIME type served per file format when sharing via WiFi QR code
- Album art embedded into files; existing art preserved when not changed
- Written tags immediately reflected in Android MediaStore so other apps stay in sync

### WiFi File Sharing (QR Code)
- Hosts an in-app HTTP server; displays a QR code any phone on the same WiFi can scan to download songs
- Single-file and ZIP batch download (album or selection)
- ZIP entries always closed properly so the archive is valid even when a read error occurs mid-file
- Server thread exits cleanly when a new share session starts, preventing CPU spin

### Android System Integration
- **Media notification** — lock screen and notification shade controls (play/pause, previous, next, seek) via `MediaSession` + foreground service; teal accent matches the app theme
- **Hardware and Bluetooth button support** — physical media keys and BT headset buttons routed through `MediaSession.Callback` to the JavaScript player
- **MediaStore scanning** — reads all audio from device storage (internal + SD card) without copying files; uses the correct runtime permission per API level (`READ_MEDIA_AUDIO` on API 33+, `READ_EXTERNAL_STORAGE` on API 32 and below); pulls `DATE_ADDED` so the "New" sort shows genuinely newest files
- **Album art** — decoded and downsampled natively (`BitmapFactory`) before being passed to JS as base64 JPEG, so large embedded art doesn't block the UI thread
- **Background persistence** — library, queue, playback position, and edits saved to IndexedDB + localStorage and restored between sessions

### Search
- Global search across songs, artists, and albums
- Tap any result to navigate directly to that artist, album, or song

### Playlists
- Create, rename, and delete playlists manually
- Add individual songs or entire albums to a playlist in one tap
- Smart playlists auto-populate: Favorites, Top 25, Recently Added, by Genre, by Year
- Queue management — add to queue, view and reorder the current queue

### Visual Design
- Dark OLED-friendly theme with teal (`#00a89e`) accent
- Tab bar with active pill glow and indicator underline
- Mini player with rounded album art, teal play button, and a teal top glow line
- Album grid: 2-column cards with square art, bold title, dimmed artist/count meta, ⋮ context menu, and A–Z alphabet strip on the right
- Smooth fade-in transition on every navigation
- Full landscape support: art panel on the left, controls on the right, synced lyrics visible alongside

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

Then open `http://localhost:8080` in Chrome or Edge. Tap **+** to import music files or a folder.

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
| Storage | IndexedDB (art cache, edits, full library), localStorage (settings, fast-start preview) |
| AI tagging | MusicBrainz API (free) + Google Gemini API (optional) |
| Tag writing | jaudiotagger (MP3, FLAC, M4A, OGG, WAV, WMA, OPUS) |
| Lyrics | LRC file parsing with time-aligned line highlighting |
| Mobile shell | Capacitor 8 |
| Native Android | Java — `MediaStorePlugin.java` (MediaStore, permissions, art decoding, tag writing, WiFi server) |
| Background audio | `MuzioPlaybackService.java` — foreground service with `MediaSession` and `Notification.MediaStyle` |
| CI/CD | GitHub Actions — debug APK, release APK, and AAB on every push |

---

## Architecture Notes

**Why not a simple WebView wrapper?**

The web layer uses the browser's File System Access API on desktop. Android can't use that — so instead of a weaker mobile experience, this repo includes a hand-written native plugin that:

- Queries `MediaStore` directly for every audio file on-device (no file copies); pulls `DATE_ADDED`, disc number, album artist, and genre in the same cursor pass
- Requests the correct runtime permission per API level (API 33+ vs API 32 and below)
- Decodes album art natively before handing it to JS as base64 JPEG
- Writes metadata back into files using jaudiotagger via a temp-file copy → modify → write-back pattern so the original is never partially overwritten
- Hosts a `MediaSession` + foreground service so playback continues in the background
- Routes hardware/BT button presses back to JS via local broadcasts

The same UI JavaScript runs unmodified in a desktop browser tab or as an installed Android app.

**Virtual scroll**

Song, artist, and album lists use a virtual scroll implementation that renders only the visible window plus a small buffer, regardless of library size. A 15,000-song library scrolls at 60 fps because only ~80 DOM nodes exist at any time. The album grid version renders rows (2 cards each) rather than individual items, using a single `agRows` container positioned with `top` offset inside a fixed-height outer element.

**Album art pipeline**

Art is decoded by `BitmapFactory` on the Java side, scaled to ≤512px, and JPEG-compressed before crossing the bridge as base64. A three-level cache (in-memory LRU → IndexedDB → native decode) ensures each piece of art is decoded at most once per session. `IntersectionObserver` drives lazy loading so only visible cards trigger a decode.

**Edit persistence**

User metadata edits are stored in a separate IndexedDB object store (`muzio_art`) and re-applied on top of every fresh MediaStore scan. This means edits survive a full library rescan and are never overwritten by Android's stale MediaStore cache.

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
