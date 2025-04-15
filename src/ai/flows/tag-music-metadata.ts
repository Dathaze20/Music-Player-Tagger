'use server';
/**
 * @fileOverview This file defines a Genkit flow for automatically tagging music metadata using AI analysis of the audio file.
 *
 * - tagMusicMetadata - A function that handles the music metadata tagging process.
 * - TagMusicMetadataInput - The input type for the tagMusicMetadata function.
 * - TagMusicMetadataOutput - The return type for the tagMusicMetadata function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';
import {getMusicMetadata} from '@/services/music-metadata';

const TagMusicMetadataInputSchema = z.object({
  filePath: z.string().describe('The path to the audio file.'),
});
export type TagMusicMetadataInput = z.infer<typeof TagMusicMetadataInputSchema>;

const TagMusicMetadataOutputSchema = z.object({
  title: z.string().optional().describe('The title of the song.'),
  artist: z.string().optional().describe('The name of the artist.'),
  album: z.string().optional().describe('The name of the album.'),
  trackNumber: z.number().optional().describe('The track number of the song in the album.'),
  albumArtUrl: z.string().optional().describe('URL of the album art.'),
});
export type TagMusicMetadataOutput = z.infer<typeof TagMusicMetadataOutputSchema>;

export async function tagMusicMetadata(input: TagMusicMetadataInput): Promise<TagMusicMetadataOutput> {
  return tagMusicMetadataFlow(input);
}

const prompt = ai.definePrompt({
  name: 'tagMusicMetadataPrompt',
  input: {
    schema: z.object({
      filePath: z.string().describe('The path to the audio file.'),
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
      albumArtUrl: z.string().optional().describe('URL of the album art.'),
    }),
  },
  prompt: `You are an AI tasked with identifying and tagging music metadata.
  You will be provided with the file path of the music, along with any existing metadata.
  Use your AI capabilities to analyze the audio file and accurately identify the missing metadata, including title, artist, album, and track number.
  If the information is already available in the existing metadata, do not change it.

  File Path: {{{filePath}}}
  Existing Metadata:
  Title: {{{title}}}
  Artist: {{{artist}}}
  Album: {{{album}}}
  Track Number: {{{trackNumber}}}
  Based on your analysis, provide the complete and accurate music metadata.
  If you are unable to determine a piece of information, leave it blank.
  Include a URL to album art, if it can be found.
  `,
});

const tagMusicMetadataFlow = ai.defineFlow<
  typeof TagMusicMetadataInputSchema,
  typeof TagMusicMetadataOutputSchema
>({
  name: 'tagMusicMetadataFlow',
  inputSchema: TagMusicMetadataInputSchema,
  outputSchema: TagMusicMetadataOutputSchema,
}, async input => {
  const existingMetadata = await getMusicMetadata(input.filePath);
  const {output} = await prompt({
    filePath: input.filePath,
    title: existingMetadata.title,
    artist: existingMetadata.artist,
    album: existingMetadata.album,
    trackNumber: existingMetadata.trackNumber,
  });
  return output!;
});

