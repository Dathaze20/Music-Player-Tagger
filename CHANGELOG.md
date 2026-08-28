# Changelog

What changed in each release, in plain language. The release workflow reads the
section matching the tag it is building and publishes it as the release notes,
so this file is what people see on the download page.

Add a `## vX.Y.Z` section before tagging. Without one, the notes fall back to
the commit subjects since the previous tag.

## v1.5.4

- The app no longer gets stuck on the wrong Google endpoint. It remembers which
  one answered, but now treats that as a shortcut rather than a rule: if a
  different model will not answer there, it tries the other one and relearns

## v1.5.3

- Auto-tagging now picks a proper Flash model. A date inside a model's name was
  being read as a very high version number, so a preview model was winning over
  the stable ones. Preview models have much tighter free limits, which would
  have stopped tagging part-way through a large library

## v1.5.2

- Google has not published the details of its new text endpoint, so rather than
  guess once, the app now tries the possible request formats and keeps the one
  Google accepts

## v1.5.1

- Auto-tagging works with the models Google issues alongside its new API keys.
  Those models do not answer on the old endpoint at all, and the app now uses
  the new one when a model asks for it
- Models built for deep research are skipped: they take minutes to answer, which
  is the wrong tool for tagging a single song

## v1.5.0

- **Fixes Gemini API keys that would not work.** Google changed the format:
  keys now start with `AQ.` instead of `AIza`, and must be sent a different way.
  A correctly created key was being rejected. Both kinds now work
- This also matters for existing keys — Google stops accepting the older `AIza`
  keys in September 2026
- The menu no longer claims a key must start with `AIza`

## v1.4.4

- The key setup screen reads your clipboard and tells you what is on it, so a
  copy that caught a link instead of the key is obvious before you save it

## v1.4.3

- Setting the API key is a proper screen instead of a one-line box: the whole
  key is visible, there is a Paste button, and it says whether the key looks
  right as you type
- A key pasted with a label or stray characters around it is now recovered
  instead of rejected

## v1.4.2

- When a key does not work, the menu says why in plain words instead of only
  showing a warning symbol

## v1.4.1

- The Gemini key check no longer gives up after a single failed request, and a
  key that failed once is checked again on the next launch instead of being
  written off for good

## v1.4.0

- Deleting a song removes the file and frees the space, instead of leaving it
  behind to reappear on the next scan
- Deleting the song that is playing moves to the next one and leaves nothing
  behind
- Export Backup writes a real file to your Downloads folder
- Import Backup restores your edits, playlists and artwork
- Album art you choose shows everywhere: song rows, album grid, artist pages
  and artist avatars
- Songs Android does not label as music, which is where most downloaded tracks
  land, are picked up by the scanner
- Error messages say why a file will not play, including whether the download
  is incomplete
- Check for Updates in the menu, so there is no need to visit the website
- The alphabet strip down the side spreads across the full height
