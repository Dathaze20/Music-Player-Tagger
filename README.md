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
- Picks itself back up after a phone call or another app borrowing the speaker, without needing the app reopened. Handing over to another music app stays handed over, and unplugging headphones does not restart the song out loud
- Swipe a song row right to queue it, left to favorite it
- Synced lyrics and playback position restore correctly when you return to the app

### Library
- **Artists** — virtual-scrolled list with a circular album-art mosaic, an A–Z jump strip, and list / 2-column / 3-column views. Sort A–Z, Z–A, or by song count
- **Songs** — virtual-scrolled list built for libraries in the tens of thousands. Sort by title, artist, or date added
- **Albums** — 2-column virtual-scroll grid with filter chips (All / Albums / Mixtapes / EPs & Singles) and an A–Z strip. Sort A–Z, by year, or by song count
- **Playlists** — manual playlists, plus four that build themselves: Top Tracks, Last Added, Recently Played, Favorites
- **Genres** — browse by genre with per-genre counts
- **Favorites** — heart any song; available as its own view
- **Search** — across title, artist, album, album artist, genre, and featured artists. Artists first, then albums as cover cards, then songs, with All / Artists / Albums / Songs filters carrying their counts. Albums match on the artist as well as the title, so searching a name finds their records rather than only the one album whose title contains it, and on a guest credit or featured-artist field too, so a verse can be followed to the record it lives on. Album results run in three tiers — records filed under that exact name, then names that merely start the same way, then records they only guest on — and oldest first within each, the same order the artist's own page uses. A name has to match a whole word or the start of one, so searching "Nas" leads with *Illmatic* rather than *Aijuswanaseing*, while a half-typed "Illm" still finds it. Covers come ten to a view, five to a row, and the Albums tab spreads out to three across with the artist and song count under each. The mixed list shows a handful of each kind with a See all beneath, so an artist with 47 albums does not bury the songs. Enter dismisses the keyboard rather than leaving it over the results

### Now Playing
- Full-screen album art with ambient colour sampled from the artwork
- Blurred background matched to the current cover
- Tap the album or artist name to jump straight to that page
- Synced lyrics (LRC) with live line highlighting, in portrait and landscape
- Repeat and shuffle toggles, with speed, add-to-playlist, the equalizer and the tag editor behind one menu in the header
- Use the song as your ringtone, notification sound or alarm, from that same menu. The first time on a phone Android has to be told to allow it; the app completes the job on the way back from that screen rather than making you press the same button a second time, which reads as the first press having failed
- Swipe the artwork left or right to change track. Swiping up and down still scrolls the lyrics, and a tap still shows and hides them

### Tagging
- **MusicBrainz lookup** — free, no key; year, genre, release type, and artist credit. Results take priority over AI guesses. The release group is looked up in full, so the year is the record's original release date rather than the date of whichever pressing a search happened to return, and the genre is the album's own. Falls back to the artist's genre when a release is too obscure to be in the database
- **Both lookups run at once**, and both are given the tidied album name, so a file called `Album_-_II` is searched for as `II`
- **Google Gemini** (optional) — fills whatever MusicBrainz didn't, including subgenre and featured artists
- **The artist is filled from whoever the record is by** when a song has none of its own. MusicBrainz credits a release rather than a track, so it only ever returns an album artist; without this an album that arrived completely untagged came back with a year and a genre but no artist, which is the one case where there is nothing in the library to copy from either
- **AI Fill says what it found**, and says "no year found" when it could not find one, so an empty field always means something definite
- **Album batch editor** — retag every song in an album at once, including the one currently playing and any track carrying a guest credit. The album-artist field starts blank when songs are untagged, so saving never overwrites correct tags with "Unknown Artist", and a guest's name is never overwritten with the lead artist's
- **Per-song editor** — full metadata, album art picker, AI fill, and a lyrics field (plain or LRC)
- **Filename parsing** for untagged files — strips track numbers, `(prod. by …)`, and `(Official Audio)`-style noise, splits `Artist_-_Title` into its parts, converts underscores back to spaces, and pulls featured artists out into their own field
- **Album name cleaning** — strips an uploader's `Album -` or `Mixtape -` label and tags like `[320kbps]`, so `Album_-_The_Blixky_Tape` becomes `The Blixky Tape`. Real names such as `The Album`, `LP1` and `Aquemini (Deluxe Edition)` are left alone
- **Look up every untagged album at once** — one pass over every album with no artist, paced to MusicBrainz's roughly one request a second, with a progress bar and a Stop that keeps whatever has been found so far. Each album is saved as it completes, and only empty fields are filled — including the artist, since an album can be filed under no album artist while its tracks are correctly credited, and an album is only counted as untagged when a song on it genuinely has no artist
- **The artist is read out of the album title** when nothing else knows it. A bootleg compilation like "Best of Nas - Anniversary Edition" is in no database and has no tagged track to copy from, but names its artist in the title. Matched whole-word against artists already in the library, longest name first, so "Nashville" is never read as Nas and "Lil Wayne" beats "Lil"
- **Unfinished downloads are marked in the song list** — Android reports the file as empty or a few KB, which is knowable from the scan rather than by tapping it and waiting for the error. Albums made up entirely of them are skipped by the bulk lookup
- **Fix unknown artists from their albums** — a file with an empty artist tag lands under "Unknown Artist" even when the rest of its album is tagged, splitting one record between a real artist and the unknown pile. The overflow menu offers to give those songs the name the rest of their album agrees on, reporting the count and the albums first. Only where there is one clear answer: a vague album title, two artists sharing a title, or an album with nobody named on it are all left alone, and a guest credit does not count as a disagreement
- **Junk value filters** — the 1970 Unix-epoch year that corrupt ID3 tags produce, and genre fields holding `Genre:` or `Unknown`, are treated as empty rather than shown as values
- Custom album art applies everywhere it should: song rows, album grid, artist mosaic, and artist avatars — in an avatar it takes its own album's place among the four rather than replacing them

### Sharing
- **Android share sheet** — send a song, an album, or a selection to any app that handles audio, including Bluetooth and Quick Share
- **WiFi sharing** — an on-device HTTP server plus a natively generated QR code, so any phone on the same network can download the actual audio files. Multiple songs are streamed as a ZIP

### Backup and Restore
- **Export** writes a JSON backup to your Downloads folder containing every manual edit, your playlists, favorites, profile name, and profile photo
- **Import** merges a backup back in — safe to run repeatedly, and it never wipes what's already there
- Designed so your tagging work survives reinstalling the app

### Staying Current
- **Check for Updates** in the side drawer compares the installed version code against the latest GitHub release, then **downloads and installs it in the app** — no browser, and no download left sitting at 100% waiting on a scan that never finishes
- The first update asks for Android's permission to install apps. That is a one-time switch; after that updating is two taps

---

## Android Integration

Everything below is implemented in the hand-written plugin (`MediaStorePlugin.java`, ~1,700 lines) and its playback service — not through an off-the-shelf wrapper.

- **MediaStore scanning** — reads every audio file on the device without copying anything, pulling name, path, duration, disc, album artist, genre, size, and date added in a single cursor pass. Requests the correct runtime permission per API level (`READ_MEDIA_AUDIO` on API 33+, `READ_EXTERNAL_STORAGE` below). Includes files Android does not flag as music, which is where most downloaded tracks land
- **Media notification** — lock-screen and shade controls via `MediaSession` and a foreground service
- **Hardware and Bluetooth buttons** routed through `MediaSession.Callback` into the web player
- **Native artwork decoding** — `BitmapFactory` decodes and scales covers off the UI thread before handing JavaScript a base64 JPEG
- **Tag writing** — metadata written directly into files with jaudiotagger (MP3, FLAC, M4A/AAC, OGG, OPUS, WAV, WMA), then pushed back into MediaStore so other apps stay in sync
- **Permanent delete** — removes the file through MediaStore with Android's own confirmation dialog, frees the space, and clears every trace from the library
- **File save** — backups are written to Downloads through MediaStore, because a WebView has no download handler and `<a download>` silently does nothing
- **QR generation** and a **local HTTP file server** for WiFi sharing
- **Update download and install** — fetches the APK itself, following GitHub's redirect to its asset host by hand, checks the length, and hands it to Android's installer through a `FileProvider`
- **Dead-file sweep** — `findDeadFiles` checks a batch of songs for files nothing can open and reports a reason for each. Conservative by design, because the caller offers to delete what it returns: a file is condemned only when it cannot be opened, has no bytes, starts with HTML/JSON/a script, or when nothing including `MediaMetadataRetriever` can find a duration in it. An unrecognised signature is never proof — plenty of real containers are missing from the list, so those are handed to the extractor to decide
- **File inspection** — `inspectAudioFile` opens a song the player refused and reports what it actually is: whether the content URI opens, whether the path exists and its real size, the first bytes' signature, and what `MediaMetadataRetriever` makes of it. The WebView returns one error code for every failure to start, so "format not supported" was a guess that read as nonsense on an `.mp3`; this replaces it with the real reason. Read-only, and it never touches playback
- **Clipboard read** — an Android WebView does not implement `navigator.clipboard.readText()`, so the API-key screen asks Android directly and can tell you what you actually copied
- **Ringtone, notification and alarm** — `RingtoneManager.setActualDefaultRingtoneUri` against the song's MediaStore URI, behind the `WRITE_SETTINGS` special permission (explained in-app before the system screen is opened). The file's own `IS_RINGTONE`/`IS_NOTIFICATION`/`IS_ALARM` flags are deliberately left alone: the library scan filters those out to keep system sounds off the shelves, so flagging a song would delete it from the library on the next scan
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

**How songs are grouped into albums**

An album is keyed by its name plus its album artist, with a featured artist stripped. A track credited to two people — "Sheek Louch/Dave East" on an otherwise solo EP — used to key differently from the rest of the record and became a one-song album sitting beside it, which is where most stray one-song albums in a large library come from.

A joint credit is now folded into the lead name, but only where the same album already exists under that lead. That guard is what makes splitting on `/` safe: "Back in Black" by "AC/DC" would need an album of that name by "AC" to fold into, so real names containing a separator — AC/DC, "Earth, Wind & Fire", "Tyler, The Creator" — are never touched. The fold is computed once per library into a lookup table, and every album view reads its key from the same function, because two callers deriving it differently is exactly how an album splits in half.

An artist's album card carries the album's own key rather than that artist's name, so a guest verse on somebody else's record opens that record. Handing back the wrong key was what produced a card reading "1 song" that opened onto "0 songs". The album view also re-resolves a key that finds nothing, so no route can reach an empty album page.

**Resuming after an interruption**

Playback happens in the WebView, and Chromium requests audio focus for the element it plays. A second request from the playback service revoked Chromium's, Chromium paused on the loss, and a press of play started and stopped the song in one go — so the service must not request focus, and cannot use an `OnAudioFocusChangeListener`.

Resuming was therefore tied to the app becoming visible again, which never happens: nobody reopens their music app after hanging up the phone. The service now watches instead of claiming, polling two readings that need neither a permission nor a focus request — `getMode()` returns to `MODE_NORMAL` once a call ends, and `isMusicActive()` goes false once nothing else holds the speaker. When both clear it broadcasts a resume into the WebView. If another music app took over for good, `isMusicActive()` stays true and playback is never taken back.

`ACTION_AUDIO_BECOMING_NOISY` is watched alongside it, because a headphone or Bluetooth disconnect looks identical to the end of an interruption from these two readings, and resuming there would play the track out loud on the speaker. A disconnect cancels the watch and blocks a new one briefly, in case the two arrive in the other order. If that receiver cannot be registered the watch does not run at all.

**Where an artist's four covers come from**

The circle beside an artist and the mosaic on their page are built from the same albums, sorted by year, because they were once built from different things and disagreed. `artistCollageHTML` took the first four of `getArtistAlbums`; `getArtists` took the first four distinct covers in raw `songs` order, which is no order at all — so tagging a 24-track compilation to an artist put its cover at the front of their circle.

A cover the user picked by hand was worse: it was handled by a branch that ran *before* the mosaic and drew that one cover alone at full size, so one custom cover anywhere in a catalogue became the whole avatar and no amount of ordering the data behind it made any difference. There is now a single path — `avatarUris` prefers an album's hand-picked cover over its MediaStore URI and returns four in album order — and `fetchThumbnail` resolves a `data:` URI straight through so a hand-picked cover renders inside the mosaic rather than being sent round a cache that would lose it.

**Why a song is asked for twice**

Playback goes through Capacitor's local HTTP server, which derives the Content-Type of what it serves from the URL path alone. `convertFileSrc` turns a content:// URI into `/_capacitor_content_/media/external/audio/media/1234` — no file extension — so `URLConnection.guessContentTypeFromName` returns null and the stream sniffer behind it recognises neither MP3, M4A, FLAC, OGG nor WMA. Every song is therefore served with no Content-Type at all, leaving Chromium to identify the file from its bytes. It manages for most and gives up on the rest with `MEDIA_ERR_SRC_NOT_SUPPORTED`, which is why a file that plays in every other player on the phone could fail here: a native player decodes it directly and no Content-Type is ever involved.

A song whose element errors is retried against `convertFileSrc(nativePath)`, whose path ends in `.mp3` or `.m4a` and so gets a real type. The content URI stays the primary route because it is the one Android guarantees, while path access depends on the media permission reaching that file; the fallback only ever runs after a failure, so nothing that already works changes. `_nextPlaybackUrl` tracks which URLs a song has been through, so each is tried once and "can't play" means every route failed.

**Writing tags to a file that is playing**

Android will not let the app rewrite a file the media player currently has open, so retagging an album used to write every file in it except the one being listened to — and the failure was discarded, so the only sign was that one song staying behind. A write that fails on the playing file is now held and retried once playback moves on, which is when the file is released. The queue is keyed by content URI, gives up after three attempts, and lives in memory: the edit itself is already in the edits store, so the worst case is a file whose tag catches up on the next run rather than immediately.

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

Download the latest signed APK from the [**Releases**](https://github.com/dathaze20/music-player-tagger/releases) page and open it. Android will warn that your browser is not allowed to install apps — tap Settings, allow it, go back, and install.

After that first install the app updates itself: **Check for Updates** in the side drawer fetches and installs new versions without leaving the app. Updates install straight over the top; nothing is lost.

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
npm test     # vitest — filename/LRC parsing, time formatting, HTML escaping, album grouping
npm run lint # eslint over the shipped app in www/
```

Both run in CI on every push.

---

## Known Limitations

- **SD card tag writing** is implemented natively but no UI triggers the permission request, so it cannot currently be used.
- **Damaged audio files** cannot be played. The WebView uses Chromium's decoders, which reject some truncated or malformed downloads. The app reports the reason and the file's extension, including the file size when a download is incomplete, so a broken file is easy to tell apart from an unsupported format. A file that fails is retried by its real path first — see the architecture note on Content-Type below — so only files Chromium genuinely cannot decode reach this state.
- **Crossfade and the equalizer** rely on the Web Audio API and are unavailable on files the WebView cannot decode.
- **Automated tests cover the pure helper functions only** — filename, LRC and time parsing, plus album grouping and artist-page navigation, which are lifted out of `app.js` by name since it has no exports. Playback, scanning, and the native layer are verified by hand on a device.
- **AI Fill cannot always find a year.** A release missing from MusicBrainz, or one whose title is too short or generic to search on, may come back with a genre but no year. The app leaves the field empty and says "no year found" rather than estimating, since a confident wrong year is worse than a blank one — type it in yourself in that case.
- **A tag write deferred while a song is playing is lost if the app closes first.** The change is still saved in the app and the library stays correct; only the tag inside the file waits for the next edit. The pending queue is deliberately in memory rather than persisted.
- **Android only.** The web layer runs in any Chromium browser, but every native capability is Android-specific.

---

## License

MIT — see [LICENSE](LICENSE).
