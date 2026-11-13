# Case Study: My Music

*Facts below describe **v1.9.13** (November 2026). Test counts and release numbers will change as the app does; the [README](README.md) and [CHANGELOG](CHANGELOG.md) are always current.*

## The problem

I have a personal music collection of more than 15,000 songs, much of it ripped from YouTube, Spotify and SoundCloud. Rips like that arrive with the artist, album, year and genre missing or wrong, and a library full of them cannot be browsed. The players I tried would play the files but left the mess alone. The tag editors fixed tags but were not players I wanted to live in.

## The solution

A local-first Android music player that repairs its own library while you use it. It plays what is already on the phone, with background playback, lock-screen controls, playlists, an equalizer and synced lyrics. It fills missing metadata from MusicBrainz (free, no key) and optionally Google Gemini, then writes the corrected tags back into the files themselves. Nothing is uploaded and there is no account.

The interface is plain HTML, CSS and JavaScript. Android features come from a hand-written Capacitor plugin in Java (about 2,100 lines) that handles media scanning, tag writing, artwork decoding, deletion, sharing and the background playback service.

## The engineering challenges

- **Scale.** A 15,000-song library on a phone needs virtual scrolling, a three-level artwork cache and a startup that shows something immediately instead of waiting for the whole library.
- **Files that will not play.** Android's WebView served songs with no Content-Type, so some valid files failed. The fix retries by real file path and reports the actual reason when a file is damaged.
- **Resuming after a phone call** without fighting the WebView for audio focus. The solution watches the phone's audio state instead of claiming it.
- **Metadata that is wrong in many different ways.** Genre spelling, album names with uploader labels, artists split across joint credits, and the 1970 dates corrupt tags produce.
- **A security flaw found in review.** A song's own tags could run code inside the app. The class of problem was removed rather than patched, and six tests pin it.
- **Keeping edits safe.** Manual edits survive rescans, reinstalls and backups. Imports merge and never wipe.

## The development process

I direct the development with AI tools, mainly Claude Code, from my Samsung Galaxy A17. I define what the app should do, judge the proposed solutions, test every release on my own phone against my real library, and decide what ships. The commit history shows the AI involvement openly.

Decisions that came from daily use rather than from the code:

- **Rejecting a fix that passed its tests.** Versions 1.9.4 and 1.9.5 held the first screen back until the library had fully loaded, so the song count would be right first time. On my library that meant about a second of empty screen. I had it reverted ([#100](https://github.com/Dathaze20/Music-Player-Tagger/pull/100)), keeping the parts that genuinely helped. Opening fast mattered more than a count settling a moment later.
- **Lyrics that did not follow the music.** I noticed songs whose lyrics sat still. Once a song held any plain lyrics, it could never get a timed version. That became the Resynchronize button ([#102](https://github.com/Dathaze20/Music-Player-Tagger/pull/102)).
- **Startup problems on a large library.** The screen rebuilt itself six times on launch, and the app sometimes compared a partial preview against the phone and decided songs were missing. Both were traced and fixed ([#98](https://github.com/Dathaze20/Music-Player-Tagger/pull/98), [#99](https://github.com/Dathaze20/Music-Player-Tagger/pull/99)).

## The results

- 267 commits and 71 tagged releases since April 2025.
- Running daily on my own phone with a library of 15,231 songs, 2,417 artists and 3,475 albums, as shown in the README screenshots.
- 102 automated tests, run in CI on every push with linting.
- Signed releases built by GitHub Actions, which refuses to publish anything unsigned. The app finds, downloads and installs its own updates.

## The lessons

- Passing tests is not the same as a better experience. Some decisions can only be made by using the software.
- A large real dataset finds problems a small test library never will.
- Writing down *why* something was built a certain way, in the README and the commits, is what makes it maintainable later.

## The next steps

- Automated tests cover the helper functions only. Playback, scanning and the native layer are still verified by hand on a device.
- Writing tags to an SD card is implemented but has no button to grant permission yet.
- Startup time has been improved by observation, not measured with repeatable benchmarks.
