'use server';

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';
import {fetchMusicMetadata} from '@/services/music-metadata';

const TagMusicMetadataInputSchema = z.object({
  filePath: z.string().describe('The file name or path of the audio file.'),
});
export type TagMusicMetadataInput = z.infer<typeof TagMusicMetadataInputSchema>;

const TagMusicMetadataOutputSchema = z.object({
  title: z.string().optional().describe('The title of the song.'),
  artist: z.string().optional().describe('The name of the primary artist.'),
  album: z.string().optional().describe('The name of the album or mixtape.'),
  trackNumber: z.number().optional().describe('The track number of the song.'),
  albumArtUrl: z.string().optional().describe('URL of the album/mixtape cover art.'),
  year: z.string().optional().describe('The release year.'),
  genre: z.string().optional().describe('The genre of the song.'),
  releaseType: z.string().optional().describe('The release type: Album, Mixtape, EP, or Single.'),
  featuredArtists: z.string().optional().describe('Featured artists, comma-separated.'),
});
export type TagMusicMetadataOutput = z.infer<typeof TagMusicMetadataOutputSchema>;

export async function tagMusicMetadata(input: TagMusicMetadataInput): Promise<TagMusicMetadataOutput> {
  return tagMusicMetadataFlow(input);
}

const prompt = ai.definePrompt({
  name: 'tagMusicMetadataPrompt',
  input: {
    schema: z.object({
      filePath: z.string().describe('The file name or path of the audio file.'),
      title: z.string().optional().describe('The title of the song.'),
      artist: z.string().optional().describe('The name of the artist.'),
      album: z.string().optional().describe('The name of the album.'),
      trackNumber: z.number().optional().describe('The track number.'),
    }),
  },
  output: {
    schema: z.object({
      title: z.string().optional().describe('The title of the song.'),
      artist: z.string().optional().describe('The primary performing artist.'),
      album: z.string().optional().describe('The album or mixtape name.'),
      trackNumber: z.number().optional().describe('The track number.'),
      albumArtUrl: z.string().optional().describe('A real, publicly accessible URL to the album/mixtape cover image.'),
      year: z.string().optional().describe('The release year.'),
      genre: z.string().optional().describe('The genre (e.g. Hip-Hop, R&B, Pop, Rock, Trap, Drill, etc).'),
      releaseType: z.string().optional().describe('Album, Mixtape, EP, or Single.'),
      featuredArtists: z.string().optional().describe('Featured artists, comma-separated.'),
    }),
  },
  prompt: `You are a music metadata expert with DEEP knowledge of hip-hop, rap, R&B, drill, trap, and mixtape culture — including underground, independent, and street-level artists. Given a music file name, identify the song and provide complete, accurate metadata.

  CRITICAL: Many songs in hip-hop exist OUTSIDE of traditional albums. You MUST handle:
  - Loosies / one-off singles never released on a project
  - SoundCloud/YouTube-only tracks
  - Freestyles over other artists' beats
  - Songs from compilations, DJ compilations, blog exclusives
  - Street singles and promo tracks
  - Songs that only appeared on a DJ's mixtape (e.g., DJ Clue, DJ Kay Slay, DJ Whoo Kid compilations)
  - Leaked/unreleased tracks that circulated online
  - For songs NOT on any album/mixtape, set releaseType to "Single" and leave album as the single name or the artist name

  IMPORTANT: Handle MIXTAPES correctly. Mixtapes are very common in hip-hop:
  - "Artist - Mixtape Name - Track Title.mp3"
  - "01 Artist - Track Title.mp3" (numbered tracks)
  - "DJ Drama - Gangsta Grillz - Artist - Track.mp3" (DJ-hosted tapes)
  - "Artist - Track Title (Prod. by Producer).mp3"
  - "Artist - Track Title ft. Other Artist.mp3"
  - Track numbers at the start: "01.", "01 -", "Track 01"
  - DJ tags: "DJ Khaled presents", "DJ Drama presents"

  UNDERGROUND / INDEPENDENT ARTISTS you should know:
  - Stack Bundles: Far Rockaway rapper (RIP 2007). Mixtapes: Library of a Rockstar, Salute Me, A Grand Hustle
  - Max B: Wave god. Mixtapes: Million Dollar Baby 1-3, Public Domain 1-3, Wavie Crockett
  - Vado: Slime Flu series, Sinatra
  - Chinx (Chinx Drugz): Cocaine Riot 1-4, Hurry Up & Die
  - Fred The Godson: God Level, Gordo
  - Lloyd Banks: The Cold Corner 1-3, Halloween Havoc 1-3, V5/V6
  - Styles P: Ghost in the Machine, The Ghost That Sat by the Door, Float
  - Jadakiss: Kiss of Death, Kiss Tha Game Goodbye, The Champ Is Here 1-3
  - Jim Jones: Harlem's American Gangster, El Capo
  - Fabolous: There Is No Competition 1-3, Soul Tape 1-3, Friday Night Freestyles
  - Juelz Santana: Back Like Cooked Crack 1-3
  - Dave East: Kairi Chanel, Paranoia 1-3, Karma 1-3
  - Don Q: Corner Stories, Don Season 1-2
  - A Boogie Wit Da Hoodie: Artist, TBA
  - Lil Durk: Signed to the Streets 1-3, Remember My Name
  - G Herbo: Welcome to Fazoland, Pistol P Project, Ballin Like I'm Kobe
  - Chief Keef: Back From the Dead 1-3, Bang 1-3, Almighty So
  - King Von: Grandson Vol. 1-2, Levon James
  - Pop Smoke: Meet the Woo 1-2, Shoot for the Stars
  - Griselda (Westside Gunn, Conway, Benny): Hitler Wears Hermes 1-8, Flygod, TPOTIC, Burden of Proof
  - Roc Marciano: Marcberg, Reloaded, Rosebudd's Revenge
  - Curren$y: Pilot Talk, Jet Life, Cigarette Boats, Verde Terrace
  - Nipsey Hussle: Bullets Ain't Got No Name 1-3, Crenshaw, Mailbox Money
  - Rick Ross: Rich Forever, Black Market
  - And many more underground/street artists...

  Well-known mixtapes:
  - Lil Wayne: Da Drought 3, Dedication 1-6, No Ceilings, Sorry 4 the Wait
  - Gucci Mane: Trap House, Trap God, World War 3, Burrprint 3D
  - Future: Monster, Beast Mode, 56 Nights, Purple Reign
  - Young Jeezy: Trap or Die, The Real Is Back
  - Wiz Khalifa: Kush & OJ, Taylor Allderdice, Cabin Fever
  - Chance the Rapper: Acid Rap, 10 Day, Coloring Book
  - Mac Miller: K.I.D.S., Best Day Ever, Macadelic
  - A$AP Rocky: Live.Love.A$AP
  - Meek Mill: Dreamchasers 1-4
  - Kevin Gates: Luca Brasi Story, By Any Means, Stranger Than Fiction
  - Logic: Young Sinatra, Welcome to Forever
  - J. Cole: Friday Night Lights, The Warm Up, Truly Yours
  - Drake: So Far Gone, Room for Improvement, Comeback Season

  File name: {{{filePath}}}

  Existing metadata (use if available, correct if wrong):
  Title: {{{title}}}
  Artist: {{{artist}}}
  Album: {{{album}}}
  Track Number: {{{trackNumber}}}

  Instructions:
  - Identify the exact song from the file name — even if it's obscure or underground
  - Strip track numbers, DJ tags, producer credits, and file extensions to get the clean title
  - Separate featured artists (ft., feat., featuring) from the main artist
  - Determine if this is from an Album, Mixtape, EP, or Single
  - For releaseType: use "Mixtape" for unofficial/free releases, hosted tapes, street albums. Use "Album" for official retail releases. Use "Single" for loosies/one-offs not on any project
  - If a song is NOT from any known project, set album to the song title and releaseType to "Single"
  - Provide the correct title, artist, album/mixtape name, track number, release year, and genre
  - For albumArtUrl: provide a real, publicly accessible URL to the cover art
  - For mixtape cover art: these often have unique covers - find the actual mixtape/project cover
  - If you cannot determine a field with confidence, leave it blank
  - Be precise with official song titles, album/mixtape names, and artist names
  - For genre: be specific — use subgenres like Drill, Trap, Boom-Bap, Conscious, G-Funk, Cloud Rap, etc.`,
});

const tagMusicMetadataFlow = ai.defineFlow<
  typeof TagMusicMetadataInputSchema,
  typeof TagMusicMetadataOutputSchema
>({
  name: 'tagMusicMetadataFlow',
  inputSchema: TagMusicMetadataInputSchema,
  outputSchema: TagMusicMetadataOutputSchema,
}, async input => {
  const existingMetadata = await fetchMusicMetadata(input.filePath);
  const {output} = await prompt({
    filePath: input.filePath,
    title: existingMetadata.title,
    artist: existingMetadata.artist,
    album: existingMetadata.album,
    trackNumber: existingMetadata.trackNumber,
  });
  return output!;
});
