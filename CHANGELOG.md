# Changelog

What changed in each release, in plain language. The release workflow reads the
section matching the tag it is building and publishes it as the release notes,
so this file is what people see on the download page.

Add a `## vX.Y.Z` section before tagging. Without one, the notes fall back to
the commit subjects since the previous tag.

## v1.6.7

- Opening the tag editor now shows the tidied album name straight away, so
  pressing Save is enough. Before, the tidying only happened if you ran AI
  Fill, so opening the editor and saving kept the messy name

## v1.6.6

- AI Fill now strips the uploader's label off an album name. "Album_-_The
  Blixky_Tape" becomes "The Blixky Tape" instead of "Album - The Blixky Tape",
  and tags like [320kbps] or [Explicit] come off too. Real names such as "The
  Album", "LP1" or "Aquemini (Deluxe Edition)" are left exactly as they are

## v1.6.5

- AI Fill now knows every genre, not just hip-hop. It was being told it
  specialised in rap, so it leaned that way on folk, soul, rock and everything
  else in a mixed library
- Genres like "american", "90s" or "female vocalists" no longer come back as a
  song's genre. Those come from the free-text side of the music database and
  were being taken at face value
- AI Fill is now asked for the year of the original release rather than a
  reissue or remaster

## v1.6.4

- The album art is bigger, filling the width of the screen the way it should

## v1.6.3

- Nothing moves when the song changes. The artwork keeps the same size whether
  a song has a sleeve or not, so the buttons stay exactly where they were
- Speed, add to playlist, the equalizer and the tag editor have moved into a
  menu behind the dots at the top right. All four still work the same; the
  player itself is now just the artwork and the controls

## v1.6.2

- The album art shows whole again, corner to corner, instead of having the top
  and bottom trimmed off. The parental advisory strip is back
- The A-Z strip no longer shows through on the Now Playing screen
- Speed, add-to-playlist and EQ sit together as one tidy row instead of being
  pushed into the corners. All three still do exactly what they did

## v1.6.1

- The play button works again. It was starting the song and stopping it in the
  same press, and staying on pause
- Swiping the album art forward changes song instead of dropping back to the
  mini player, and swiping back moves exactly one song

## v1.6.0

- **Updates download inside the app.** Press Update and it fetches the new
  version itself, shows the progress, and opens the installer. No browser, so
  no more downloads stuck at 100%
- The first update will ask you to allow My Music to install apps. That is a
  one-time Android switch; after that updating is two taps

## v1.5.10

- Swiping the album art moves one song, not two, and no longer drops you back
  to the mini player when the swipe drifts downward
- The play button no longer shows paused over music that is playing, after
  skipping tracks quickly

## v1.5.9

- Swipe across the album art to move to the next or previous song. Swiping up
  and down still scrolls the lyrics, and tapping still shows and hides them

## v1.5.8

- Music no longer stops for good when you switch to another app. The app now
  claims the speaker properly and picks the song back up when a temporary
  interruption ends. Opening another music app still hands it over for good,
  as it should
- Coming back after Android has cleared the app from memory, the song is ready
  to play again from where it left off, instead of showing a song that would
  not start

## v1.5.7

- The lock-screen progress bar follows the song instead of standing still. It
  also holds position while paused, and keeps up at other playback speeds

## v1.5.6

- Playback no longer goes silent while the song appears to keep running. If
  anything interrupts the audio it now recovers by itself within a second

## v1.5.5

- Tapping the album name opens that artist's album, not another artist's album
  that happens to share the title

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
