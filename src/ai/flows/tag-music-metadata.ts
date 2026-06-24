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
  artist: z.string().optional().describe('The name of the artist.'),
  album: z.string().optional().describe('The name of the album.'),
  trackNumber: z.number().optional().describe('The track number of the song in the album.'),
  albumArtUrl: z.string().optional().describe('URL of the album art.'),
  year: z.string().optional().describe('The release year of the song.'),
  genre: z.string().optional().describe('The genre of the song.'),
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
      trackNumber: z.number().optional().describe('The track number of the song in the album.'),
    }),
  },
  output: {
    schema: z.object({
      title: z.string().optional().describe('The title of the song.'),
      artist: z.string().optional().describe('The name of the artist.'),
      album: z.string().optional().describe('The name of the album.'),
      trackNumber: z.number().optional().describe('The track number of the song in the album.'),
      albumArtUrl: z.string().optional().describe('A real, working URL to the album art image.'),
      year: z.string().optional().describe('The release year of the song or album.'),
      genre: z.string().optional().describe('The genre of the song (e.g. Hip-Hop, R&B, Pop, Rock, etc).'),
    }),
  },
  prompt: `You are a music metadata expert. Given a music file name, identify the song and provide complete, accurate metadata.

  Analyze the file name to determine the song. Look for patterns like "Artist - Title", "Artist_Title", or just the song title.
  Use your knowledge of music to fill in ALL metadata fields accurately.

  File name: {{{filePath}}}

  Existing metadata (use if available, correct if wrong):
  Title: {{{title}}}
  Artist: {{{artist}}}
  Album: {{{album}}}
  Track Number: {{{trackNumber}}}

  Instructions:
  - Identify the exact song from the file name
  - Provide the correct title, artist, album name, track number, release year, and genre
  - For albumArtUrl: provide a real, publicly accessible URL to the album cover image (e.g. from Wikipedia, MusicBrainz, or other public sources)
  - If you cannot determine a field with confidence, leave it blank
  - Be precise - use official song titles, album names, and artist names`,
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

