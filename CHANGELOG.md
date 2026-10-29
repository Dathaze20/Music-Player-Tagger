# Changelog

What changed in each release, in plain language. The release workflow reads the
section matching the tag it is building and publishes it as the release notes,
so this file is what people see on the download page.

Add a `## vX.Y.Z` section before tagging. Without one, the notes fall back to
the commit subjects since the previous tag.

## v1.9.9

Updating takes you to the newest version in one go.

- **Check for Updates goes straight to the latest release.** It asked GitHub
  for its "latest" pointer, which means most recently *created* — not the
  highest version number, and it reorders if a release is edited or
  re-published. It now reads the release list and picks the highest version
  that actually has an APK attached, so however many versions have come out
  since yours, one update gets you all the way there. If you are several
  behind it says so. It also refuses to use a cached answer, which could only
  ever be out of date
- **If the newest release has no APK yet**, it offers the newest one that does,
  instead of telling you there is nothing to install
- **Resynchronize also fills in lyrics that were never there.** It would find
  an untimed version, decline to use it and say so — right for a song whose
  lyrics you have already corrected, wrong for a song with no lyrics at all,
  where having the words beats having none. An empty lyrics box now gets
  filled; one that already has something is still left alone

The README now covers everything added recently, and leads with what the app
actually is: a music player that keeps your library tidy while you listen.

## v1.9.8

A Resynchronize button in the tag editor, for lyrics that sit still.

- **Lyrics that do not follow the song can be fixed from the tag editor.**
  Words only move with the music when they are stored with a timestamp on each
  line. Lyrics that came off the file's own tags, or that the lyrics service
  only had a plain copy of, have no timestamps and just sit there. There was no
  way to ask again either: the automatic lookup gives up on a song the moment it
  has any lyrics at all, so one untimed copy meant that song would never be
  offered a timed one again

  **Resynchronize** sits on the Release Type line, in the space beside the last
  chip, in amber so it cannot be mistaken for a fifth release type. It looks the
  song up again on purpose and drops the timed version into the lyrics box ready
  to save. It searches with the title and artist as they are in the form, so
  correcting a misspelled title and then pressing it finds the right song

  When there is only an untimed version it says so and leaves your lyrics alone,
  rather than replacing what you have with another copy that will not move
  either. With no connection it says that, instead of sending you off to check
  tags that were never the problem

## v1.9.7

New downloads turn up on their own, and a clear-out of code that did nothing.

- **A mixtape you just downloaded is there when you open the app.** The launch
  check only rebuilt the library when your phone had *materially* more songs
  than the app did — more than five per cent plus ten. A handful of new tracks
  never came close, so they stayed invisible until you went and ran a rescan by
  hand. Anything on the phone the library has not seen is now added on the spot,
  with its tags and artwork, and it sorts to the top of "Last Added" where you
  can get at it

  Adding only, never the reverse. A memory card that has not mounted yet, or a
  scan that comes back short, would otherwise read as thousands of deletions,
  and a song wrongly dropped takes your tag edits with it. Songs that have
  genuinely gone are still cleared by the dead-file sweep

- **Dead code removed.** About 140 lines that nothing could reach: a lyrics
  panel with "Search Lyrics" and "Add Manually" buttons that no screen ever
  showed, leftover state from a crossfade feature that is no longer there, and
  several variables written but never read, plus the styling that went with
  them. Nothing visible changes — automatic lyrics still work the way they do
  now, from the Now Playing screen

Startup speed was measured again and left alone: at fifteen thousand songs the
launch is more than half spent waiting on storage, not running code, so there
was no honest gain to be had without changing how the library is stored.

## v1.9.6

Opening is instant again.

- **The app shows your library the moment it opens.** v1.9.4 and v1.9.5 held
  the first screen back so the song count would be right the first time, which
  meant staring at an empty screen for about a second on a large library. That
  is a worse trade than the thing it was fixing. The library goes up
  immediately again, as it did before, and the count settles a moment later

Everything else from those two releases stays, because none of it is about
waiting — the launch no longer redraws the screen six times, the bridge check
runs once instead of four times, and it no longer compares a part-loaded
library against your phone and concludes songs went missing.

Measured against the build from before any of this work, on a fifteen-thousand
song library on a slow phone: the list is on screen at 207ms, against 217ms
before; the full library is complete at 1.9 seconds, against 2.1 before.
Nothing opens slower than it used to and the rest is a little faster.

## v1.9.5

The app no longer opens on the wrong library and then corrects itself.

- **It opens on your whole library, once.** Only part of a large library fits
  in the quick store, so the app put that part on screen immediately and
  replaced it a second later with the real thing out of the main store. You saw
  the wrong song count, the wrong album count and tags without your latest
  edits, and then watched them change. That is the "restoring" everyone kept
  seeing. The short version is no longer painted at all: the screen below the
  tabs stays empty for the moment it takes to load the real library, and what
  you see first is correct

v1.9.4 aimed at this and missed. Its quarter-second wait was measured against a
four-thousand-song library on a fast machine, where storage always won the race.
On a phone with fifteen thousand songs storage takes about a second, so the wait
expired every time and the swap was still there. It is measured against a
full-size library on phone-speed storage now, and the swap does not happen in
either case.

Searching while the app is still opening works throughout, as before.

## v1.9.4

Opening the app stops looking like it is putting itself back together.

- **One paint on launch instead of six.** Every stage of startup redrew the
  whole screen — the saved view, the library coming out of IndexedDB, the
  stored artwork, and then the bridge check firing four separate times, each
  one re-converting every playback address and re-asking Android for the song
  list from scratch. Six teardowns and rebuilds of the list you were looking
  at, which is the flicker. The bridge check now runs once per launch, the
  redraws that would have drawn the identical screen are dropped, and a redraw
  nobody can see — a playback address refreshed behind the scenes, a missing
  date filled in — no longer repaints anything
- **The library arrives whole.** The first screen used to be the two thousand
  songs that fit in the small store, with the real library replacing them a
  moment later; that swap, with the counts changing underneath, is what read as
  "restoring". The first paint now waits a quarter-second for the full library,
  which almost always beats it, so the first thing you see is everything. If it
  is slow, the preview goes up as before and nothing is worse than it was
- **Safer while it loads.** One of those early bridge checks ran before the
  library had finished loading, compared the two thousand songs against your
  phone, concluded the library had been truncated and rebuilt it from Android's
  copy — with the metadata of thirteen thousand songs missing from the
  comparison. It no longer runs until the real library is in

Searching while the app is still opening still works, and still survives
everything finishing behind it.

## v1.9.3

Two fixes from the bug sweep, both chosen for being contained.

- **A part-finished delete no longer throws away the songs it did not delete.**
  Android can refuse some files and remove others in the same batch — a file
  another app owns, or one on a card that is being awkward. The app was told
  only how many went, not which, so it forgot the whole selection and wiped
  their saved tag edits with it. The files still on your phone then came back
  on the next scan stripped of every correction you had made. Android now
  reports which files it actually removed, and only those are forgotten
- **"Last Added" shows what you actually added last.** It was reverse
  alphabetical. Android hands the library over sorted by title and the playlist
  simply flipped that round, so a mixtape downloaded an hour ago sat wherever
  its name happened to fall. It sorts by the date the file arrived now, the
  same date the Songs tab uses

## v1.9.2

Security fix. Worth installing even though nothing was going wrong for you.

- **A song's own tags could run code inside the app.** When a cover failed to
  load, the app fell back to a coloured placeholder, and it did that by pasting
  the song's title into a small piece of JavaScript written directly into the
  page. Apostrophes in the title were handled; backslashes were not — so a
  title containing the right pair of characters stopped being text and started
  being instructions. Anything a file was tagged with could then run with the
  app's own access, including the saved API key. Files downloaded from random
  sites can be tagged with anything at all
- **The same was true of album art carried in a backup file.** Anything
  beginning "data:" was accepted whole, and could close the attribute it sat in
  and open one of its own
- There is no JavaScript written into that markup any more, so the whole class
  of problem is gone rather than patched. Covers that fail to load still fall
  back to the placeholder exactly as before
- Six tests now cover this. Putting the old version back fails four of them

## v1.9.1

- **The flicker on opening the app is gone.** Startup finishes in stages — the
  quick preview of the library, your saved edits, the real library, the covers,
  the scan — and each one asked for the screen to be redrawn when it landed. A
  redraw tears the list down and builds it again, so three or four of them
  arriving over a second or two is the flashing you see. Measured on a cold
  open, every one of those redraws drew exactly the same thing. A stage that
  genuinely changed something still redraws; the rest now do nothing
- **Searching while the app is still loading works.** Those background redraws
  closed the search bar and threw the results away, so typing into search in
  the first second or two was undone two or three times over. A redraw nobody
  asked for no longer disturbs a search in progress
- **Back from a search result returns to the search.** Opening an artist or an
  album from the results and then going back landed on whichever tab was
  underneath, so editing a run of albums found by one search meant retyping it
  every time. It goes back to the results, with the query and the filter you
  had. Going back out of an album opened from an artist page still lands on the
  artist page first
- Dependencies brought up to date, which clears a high-severity advisory in a
  build tool. Nothing that ships inside the app has a known vulnerability

## v1.9.0

**This one installs as a separate app. Read this before you install it.**

The app's internal Android identity was `com.muzioai.app`. "Muzio" is an
unrelated music player with over a hundred million installs on Google Play, and
that identity is permanent once an app is published there — Google will not let
it be changed afterwards, and an app cannot be published under a name that
leans on somebody else's. It is now `io.github.dathaze20.mymusic`, which is
unambiguously yours.

Android treats a changed identity as a different app, so:

- **It will not install over the old one.** You will have My Music twice until
  you remove the old one
- **The new app cannot see the old one's data.** Your music files are untouched
  and rescan by themselves, but tags you have fixed, favourites, playlists and
  play history live in the old app's private storage

So: export a backup from the old app first, install this, then import it. The
previous release added play history to the backup, so nothing is lost.

- Check for Updates works exactly as before once you are on this version. It
  reads the installed version at runtime rather than from a fixed name, so
  every update after this one installs over the top normally. Only this single
  crossover behaves as a fresh install

## v1.8.4

- **Export Backup now saves your play counts and play history too.** It already
  carried every tag you had fixed, your favourites, playlists, profile and any
  album art you had chosen — but not how often you had played things, so a
  restore brought everything back except "Most played", which came back empty.
  Older backup files still import; they simply have no play history in them

Worth taking a fresh backup from the menu after installing this one.

## v1.8.3

- **"Date added" keeps working after a restart.** The previous release taught
  the app to read the date Android records for each file, but the main library
  store was still not saving it — the date reached the small quick-access copy
  and was dropped on the way into the real one. It survived each session only
  because the app rebuilt it from scratch during the next scan, so the sort was
  wrong for the first few seconds of every launch. It is stored properly now
- A set of tests now compares the lists of fields a song is written out with,
  in each of the places that write one. Both of the dropped-field bugs from the
  last two releases are caught by them

## v1.8.2

Now Playing screen.

- **The arrow at the top left points back**, which is what it does. It was a
  downward chevron, which says "put this away downwards" and reads as nothing
  much at all
- **Repeat and shuffle are labelled buttons instead of two bare arrows.** They
  sit where the symbols sat and say what they are, and when one is on it fills
  in solid rather than changing to a slightly different shade of grey. Repeat
  reads "Repeat 1" when it is repeating the one track. Both are a fixed width,
  so the row no longer shifts sideways under your thumb as the label changes
- **The three-line button beside the song title is gone.** It opened the queue,
  which is not what three lines next to an album title look like they do. The
  queue is in the ⋮ menu as "Up next", and the title gets the room back
- The equalizer gets its own icon in that menu rather than sharing one with the
  queue

Shuffle shows as on because it is on: the big shuffle button on the Songs list
turns it on and it stays on until you turn it off. That has not changed — it is
just possible to see now.

## v1.8.1

- **"Date added" works.** It never did. Android tells the app when it first saw
  each file, but the step that turns a scan result into a song was quietly
  dropping that date, so every song in the library was stored as having been
  added at the same moment. The sort then had nothing to sort by: it ran, it
  reordered nothing, and a mixtape downloaded an hour ago sat wherever it
  happened to land. Newly downloaded music now appears at the top where you can
  get at it
- **Dates are filled in for music you already have**, not just for anything
  downloaded from here on, so the list is useful immediately
- **"Most played" now means most played.** It was sorting by when you last
  played something, so a song played once yesterday beat one played two hundred
  times last week
- **Sorting by album keeps a two-disc album in order** — disc one, then disc
  two, instead of interleaving both
- **Every sort now has a fixed order for ties.** Songs that match on the thing
  being sorted fall back to the title, so the list no longer shuffles items
  around between visits

## v1.8.0

Maintenance release: four bugs and a dependency refresh.

- **The music no longer dies when you switch apps.** Android kills this app's
  web view whenever another app wants the memory — a camera or a video does it
  readily — and rebuilding it leaves the song showing in the mini player but
  without the address it plays from. Tapping play did nothing at all: no error,
  no message, nothing to do but force-quit. The address is rebuilt from the
  song's own file reference now, on the spot, and playback carries on from
  where it stopped. If a file genuinely cannot be reopened it says so instead
  of sitting there
- **The song you were playing is found again even in a big library.** It was
  looked up only among the first two thousand songs, and nothing looked again
  once the rest had loaded
- **No more "Library restored" notice, and no more song count stuck at 2000.**
  Both had the same cause. The library is too big for the browser's small
  storage, so the first two thousand songs load instantly and the rest arrive
  from the database a moment later — but anything that saved in between wrote
  those two thousand over the full copy. Backgrounding the app was enough. From
  then on every launch found the library short, rebuilt it from scratch, and
  announced it. Saving is now refused until the real library is in, and the
  rebuild, when it is needed, is silent
- **Genres are spelled properly and consistently.** "RB", "rnb", "R&b" and
  "Rhythm and Blues" were four different genres of the same music, and the
  music database's lowercase tags were capitalised one letter deep, so "r&b"
  became "R&b" and "edm" became "Edm". Every genre is now written one way
  wherever it comes from — the file, the database, or the AI — and the genres
  already in your library are corrected once, automatically and silently
- **AI Fill finds more years.** The lookup asked for three matching releases
  and read the date off one of them. It now asks for five and takes the
  earliest date any of them carries, which costs nothing — they all arrive in
  the same answer — and rescues the common case where the best match has no
  date but an older pressing beside it does
- Capacitor updated to 8.5.2, test and lint tooling brought up to date, and a
  critical advisory in a build dependency cleared. Nothing that ships inside
  the app has a known vulnerability

## v1.7.21

- **Disconnecting Bluetooth headphones now pauses instead of switching to the
  phone's loudspeaker.** Android announces the change a moment before it moves
  the sound, so an app can stop itself — it does not stop anything for you. The
  app was listening for that announcement but only using it to make sure the
  song was not resumed later; nothing actually paused, so the music carried on
  out loud through the phone. Unplugging wired headphones was the same
- **It stays paused.** Coming back to the app, or Android reporting that an
  interruption is over, will not start it again — a disconnect is not an
  interruption that ends, and there is nothing left to play it through
- Picking back up after a phone call is unchanged

## v1.7.20

- **AI Fill finds the year on the first tap.** It used to take three or four
  goes while the album name came straight back — and that difference was the
  clue. The name is in the first thing the app asks MusicBrainz for; the year is
  only in the second. MusicBrainz allows one request a second and refuses the
  rest, and the app was firing two or three at once, so the request carrying the
  year was the one being turned away. Nothing retried it, so the field just
  stayed empty. Requests now queue a second apart and a refusal is waited out
  and asked again
- **A fill takes about a second longer and works, instead of being instant and
  empty three times over.** The button still says "Looking up…" while it waits
- **The same album is never looked up twice.** Answers are kept for the session,
  so the second song off a record fills instantly
- **"AI Fill all unknown albums" is roughly twice as fast.** It had its own
  one-second pause between albums, added to slow it down — but that only spaced
  out the albums while the requests inside each one still went out together,
  which was the part being refused. The queue handles pacing properly now, so
  the extra pause is gone
- With no signal, a fill still fails immediately rather than sitting through
  retries that cannot leave the phone

## v1.7.19

- **Search album results start with the artist's own records again.** Searching
  "Nas" led with *Aijuswanaseing* and *Against All Odds* instead of *Illmatic*:
  the letters n-a-s sit inside both, and a plain substring match counted them as
  his. A name now has to match a whole word, or the start of one, and the two
  rank differently — so *Illmatic* beats *Nasheim Myrick* beats a guest verse.
  Half-typed searches still work: "Illm" finds *Illmatic*
- **Within each of those, oldest first**, the same order the artist's own page
  uses, so a search lands at the start of their run of albums rather than in the
  middle of it alphabetically
- **Ten album covers, five to a row.** The cards were a fixed size that only fit
  two across on a phone, which turned the album results back into the list they
  were meant to replace. The Albums tab spreads out to three across and keeps the
  artist and song count under each cover
- **Artists in search are ordered too** — an exact match first, and within that
  whoever you have the most songs by, instead of whoever happened to be earliest
  in the library

## v1.7.18

- **Search now finds the albums an artist is featured on**, not just their own.
  Searching a name already brought up their guest verses as songs; the records
  those verses live on were the one thing it would not show
- Their own albums come first, so a compilation carrying a single guest verse
  never outranks the records they made. A guest album is listed under whoever it
  actually belongs to, so it is obvious which is which

## v1.7.17

- **Searching an artist finds their albums.** It was only matching album titles,
  so "2Pac" turned up one album — the one with "2pac" in its name — while his
  other thirteen were ignored. It now matches the artist too
- **"See all" under each section.** The mixed list shows a handful of each so
  nothing buries anything else, and one tap opens the full set. An artist with
  47 albums no longer pushes the songs off the bottom of the screen
- **An artist in search says how many albums as well as songs**, the same as the
  main artists list

## v1.7.16

- **The keyboard goes away when you press enter.** It was staying up and
  covering the results you had just asked for
- **Artists come first in search, then albums, then songs.** Searching a name is
  nearly always looking for the person or the record, and those were buried
  under twenty song rows
- **Albums in search are cards with the cover at a proper size**, like on an
  artist page, instead of a small thumbnail in a list row
- **All / Artists / Albums / Songs buttons at the top of the results**, each with
  its count, so you can go straight to the kind you are after. Picking one shows
  many more of that kind than the mixed list does
- Tapping an album in search opens the right record. It was keyed to the song's
  own artist, so an album reached through a track with a guest credit could open
  onto nothing

## v1.7.15

- **Setting a ringtone is one tap now.** The first time on a phone, Android has
  to be told to allow it — and after you allowed it you had to go back and press
  the same button again, which looks exactly like the first press not working.
  It now finishes by itself when you come back from that screen
- If you come back without turning the switch on, it says so instead of leaving
  you wondering

## v1.7.14

- **The artist circle fix from the last version did not work** — there was a
  second piece of code in front of it that I missed. When any album had a cover
  you had picked by hand, that cover was drawn on its own and filled the whole
  circle, so the album order never got a look in. Nas's picture stayed a DJ Clue
  tape
- There is now one way the circle is built, for everyone. Albums oldest first,
  and a cover you chose by hand takes that album's place in the four rather than
  replacing them

## v1.7.13

- **An artist's circle shows their own albums again.** It was picking the first
  four covers in file order, which is no order at all — so tagging a 24-track
  compilation to an artist put that cover at the front, and when it was the only
  one that loaded it filled the whole circle. Nas's picture became a DJ Clue
  tape. It now uses their earliest albums, the same four the artist page shows

## v1.7.12

- **Find dead files is now on the Unknown Artist page too**, next to the album
  lookup, instead of only on the main list. That is where you go looking for it
- **The untagged-album count was too high, and the lookup could have overwritten
  good tags.** An album whose album-artist field says "unknown" was counted as
  untagged even when every song on it was correctly credited — and the lookup
  would then have replaced those real artist names with what it found. It now
  only counts an album that genuinely has songs with no artist, and only ever
  writes to a song that has none

## v1.7.11

- **Find dead files.** In the ⋮ menu. It checks every song in your library for
  files nothing can open — downloads that never wrote a byte, files cut off part
  way, and error pages saved with a song's name — then tells you how many of
  each it found and offers to delete them. Progress bar, and you can stop it
  whenever you like
- It only condemns a file on proof: nothing opens it, it has no bytes, it starts
  with a web page instead of audio, or nothing on the phone — including
  Android's own reader — can work out how long it is. A format it does not
  recognise is never assumed to be broken
- Nothing is deleted without you saying so, and Android asks again on top of that

## v1.7.10

- A voice message is no longer called a script. AMR recordings — what Samsung
  Messages saves — begin with the same two characters a shell script does, and
  the check that spotted fake downloads was catching them too
- A file in a format the app genuinely cannot decode now says so honestly,
  instead of implying the file is broken. AMR and WMA play on Android but not in
  the browser engine the app is built on; that is a limit of the app, not a
  fault in the file

## v1.7.9

- **"Format not supported" now tells you what is actually wrong.** That message
  was a guess — the player reports the same error for everything it could not
  start, and calling an .mp3 an unsupported format is plainly wrong. The app now
  opens the file and looks, then says which it is: the file is gone, the file is
  empty, Android will not let it be read, the download saved a web page instead
  of a song, or the file is genuinely damaged
- **"Why won't this play?" in a song's ⋮ menu** gives the same answer for any
  song, whenever you want it
- If Android can play a file and the app cannot, it now says so outright rather
  than blaming the file

## v1.7.8

- **Songs that said "format not supported" should play now.** The app asked
  Android for each song in a way that never mentioned what kind of file it was,
  so the player had to work it out from the contents — which it managed for most
  songs and gave up on for the rest. Those same files play in other music apps,
  which is exactly what you would expect, because other apps never have to guess.
  A song that will not play is now asked for a second time by its real filename,
  which says .mp3 or .m4a on the end and settles it
- When a song genuinely cannot be played, the message now says which kind of
  file it was, rather than just "format not supported"

## v1.7.7

- The untagged-album lookup is now offered on the Unknown Artist page itself,
  which is where you go looking for it. The dots at the top of an artist page
  open that artist's menu rather than the main one, so it was only reachable
  from the main list — the one place you would not think to look

## v1.7.6

- **Look up every untagged album in one go.** The ⋮ menu offers it with the
  count in the label. It works through them one at a time with a progress bar,
  and you can stop it whenever you like and keep whatever it found
- **The artist is taken from the album's own name when nothing else knows it.**
  "Best of Nas - Anniversary Edition" says who it is by right there, and a
  compilation like that is in no music database — so the answer was sitting in
  the title while every lookup came back empty. It only matches whole words
  against artists already in your library, so "Nashville" is not read as Nas
- **A song that will not play says so in the list** instead of waiting to be
  found out when you tap it. Android reports the file as empty or a few
  kilobytes, which means the download never finished
- Albums made up entirely of unfinished downloads are left out of the bulk
  lookup — there is nothing there worth tagging

## v1.7.5

- **AI Fill now fills in the artist on an album that came in untagged.** The
  music database says who a record is by, but files that under album artist —
  so the Artist box was left empty unless the AI happened to answer as well.
  Whoever the record is by is now used for its songs. This is the one that
  matters for an album where nothing is tagged, since there is no artist
  anywhere in it to copy from

## v1.7.4

- **Fix unknown artists from their albums.** A song whose artist tag is empty
  goes to Unknown Artist even when the rest of its album is tagged properly. The
  ⋮ menu at the top now offers to give those songs the artist the rest of their
  album names — it says how many and on which albums, and asks before doing
  anything
- It only does this where there is one clear answer. An album whose name
  identifies nothing ("Unknown Album", "Greatest Hits") is skipped, so is an
  album title two different artists share, and a guest credit is not treated as
  a disagreement. Anything it does can be changed in the tag editor like any
  other edit

## v1.7.3

- **Use any song as your ringtone, notification sound or alarm.** The three are
  in the ⋮ menu on the Now Playing screen. The first time, Android will ask you
  to allow My Music to change system settings — that is a one-time switch, and
  the app tells you what it is for before sending you there
- The song stays in your library afterwards. Android marks a ringtone as not
  being music, which would have made the track vanish from My Music, so the file
  itself is left alone and only the ringtone setting is changed

## v1.7.2

- A featured artist no longer splits a song off its own album. A track credited
  to "Sheek Louch/Dave East" was filed as an album of its own, one song long,
  next to the album it belongs to — and it stayed behind when you edited the
  real one. It is part of the album again, and editing the album covers it.
  This is where a lot of the stray one-song albums came from
- Editing an album keeps the guest's name. "Sheek Louch/Dave East" stays as it
  is instead of being overwritten with "Sheek Louch"
- Albums on an artist's page open properly. A guest verse on somebody else's
  record — one Fabolous song on a DJ Clue tape — showed a card saying "1 song"
  that opened onto an empty album. It now opens the record the song is on, so
  you can follow a feature across to where it lives
- An album no longer comes up empty right after you save it, which happened
  whenever the album artist differed from the artist
- Go to artist from a mixtape or compilation goes to someone who is actually on
  it, instead of an empty page
- **Music picks itself back up after a phone call**, without having to open the
  app again. Same after another app borrows the speaker for a video. If you
  properly hand over to another music app it stays handed over, and pulling out
  your headphones will not start the song again out loud

## v1.7.1

- The year is far more reliable. AI Fill was reading it off whichever single
  pressing of a record the search happened to return — often a reissue years
  later, and frequently carrying no date at all. It now asks the music database
  for the record itself, which is where the original release date lives
- The genre now comes from the album where the database has one, instead of
  always falling back to the artist's genre
- The Year box no longer shows a greyed-out "2024" when it is empty. That is a
  hint, not a value, but it reads exactly like a filled-in year. It says "Not
  set" now
- AI Fill says "no year found" when it could not find one, rather than leaving
  an empty box to be interpreted

## v1.7.0

- Editing an album no longer skips the song you are playing. Android will not
  let the file be rewritten while the player has it open, so that one song kept
  its old tags and the failure was never reported. The change is now held and
  written by itself as soon as you move to another song — no need to go and play
  something else first
- Nothing flickers over albums that have no artwork. A moving band of light was
  sweeping across every art-less tile, forever, which on a page full of them was
  the whole screen moving at once. It is a plain still colour now

## v1.6.9

- The year fills in again. The lookup was being run on the raw album name from
  the file rather than the tidied one, so "Album_-_II" matched no record
  anywhere and a famous album came back with no year
- AI Fill is roughly twice as fast. It was asking the music database and the AI
  one after the other; they do not depend on each other, so now it asks both at
  once

## v1.6.8

- AI Fill finds a genre far more often. When the music database has never heard
  of a mixtape it now asks who the artist is, instead of giving up — small
  releases are usually missing while the artist is not
- A broken genre tag reading "Genre:" or "Unknown" no longer sits in the editor
  looking like a real value
- AI Fill will give the genre it would expect from the artist when it does not
  know a specific release. It still will not guess at the year, since a wrong
  year is worse than none

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
