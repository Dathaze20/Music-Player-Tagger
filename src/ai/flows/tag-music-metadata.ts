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
  prompt: `You are a music metadata expert specializing in hip-hop, rap, R&B, and mixtape culture. Given a music file name, identify the song and provide complete, accurate metadata.

  IMPORTANT: You must handle MIXTAPES correctly. Mixtapes are very common in hip-hop and often have different naming conventions than studio albums.

  Common mixtape patterns in file names:
  - "Artist - Mixtape Name - Track Title.mp3"
  - "01 Artist - Track Title.mp3" (numbered tracks)
  - "DJ Drama - Gangsta Grillz - Artist - Track.mp3" (DJ-hosted tapes)
  - "Artist - Track Title (Prod. by Producer).mp3"
  - "Artist - Track Title ft. Other Artist.mp3"
  - Track numbers at the start: "01.", "01 -", "Track 01"
  - DJ tags: "DJ Khaled presents", "DJ Drama presents"

  Well-known mixtapes you should recognize:
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
  - Curren$y: Pilot Talk, Jet Life, Cigarette Boats
  - Logic: Young Sinatra, Welcome to Forever
  - J. Cole: Friday Night Lights, The Warm Up, Truly Yours
  - Drake: So Far Gone, Room for Improvement, Comeback Season
  - Nipsey Hussle: Bullets Ain't Got No Name, Crenshaw, Mailbox Money
  - And many more...

  File name: {{{filePath}}}

  Existing metadata (use if available, correct if wrong):
  Title: {{{title}}}
  Artist: {{{artist}}}
  Album: {{{album}}}
  Track Number: {{{trackNumber}}}

  Instructions:
  - Identify the exact song from the file name
  - Strip track numbers, DJ tags, producer credits, and file extensions to get the clean title
  - Separate featured artists (ft., feat., featuring) from the main artist
  - Determine if this is from an Album, Mixtape, EP, or Single
  - For releaseType: use "Mixtape" for unofficial/free releases, hosted tapes, street albums. Use "Album" for official retail releases
  - Provide the correct title, artist, album/mixtape name, track number, release year, and genre
  - For albumArtUrl: provide a real, publicly accessible URL to the cover art (check Wikipedia, MusicBrainz, or other public sources)
  - For mixtape cover art: these often have unique covers - try to find the actual mixtape cover, not just the artist's most popular album
  - If you cannot determine a field with confidence, leave it blank
  - Be precise with official song titles, album/mixtape names, and artist names`,
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
