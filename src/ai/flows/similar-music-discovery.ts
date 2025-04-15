'use server';

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const SongSchema = z.object({
  name: z.string(),
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  genre: z.string(),
  mood: z.string(),
  tempo: z.string(),
  key: z.string(),
});

const SimilarMusicDiscoveryInputSchema = z.object({
  metadata: z.object({
    title: z.string(),
    artist: z.string(),
    album: z.string(),
    genre: z.string(),
  }),
  audioAnalysis: z.object({
    tempo: z.number(),
    key: z.string(),
    instrumentation: z.string(),
  }),
});
export type SimilarMusicDiscoveryInput = z.infer<typeof SimilarMusicDiscoveryInputSchema>;

const SimilarMusicDiscoveryOutputSchema = z.array(SongSchema);
export type SimilarMusicDiscoveryOutput = z.infer<typeof SimilarMusicDiscoveryOutputSchema>;

const getSimilarSongsPrompt = ai.definePrompt({
  name: 'getSimilarSongsPrompt',
  input: {
    schema: SimilarMusicDiscoveryInputSchema,
  },
  output: {
    schema: SimilarMusicDiscoveryOutputSchema,
  },
  prompt: `You are an AI music expert. Your job is to find similar songs to a given song, based on its metadata and audio features. You need to return a list of 3 similar songs. The metadata is: {{{metadata}}} and the audio analysis is: {{{audioAnalysis}}}. Return a list of similar songs, the similar songs should be returned as an array of JSON objects, each object should have the properties: name, title, artist, album, genre, mood, tempo, key. The response MUST be a JSON array of JSON objects.`,
});

async function getSimilarSongs(input: SimilarMusicDiscoveryInput): Promise<SimilarMusicDiscoveryOutput> {
  const similarSongs = await getSimilarSongsPrompt(input);

  return JSON.parse(similarSongs.text);
}

const similarMusicDiscoveryFlow = ai.defineFlow<
  typeof SimilarMusicDiscoveryInputSchema,
  typeof SimilarMusicDiscoveryOutputSchema
>(
  {
    name: 'similarMusicDiscoveryFlow',
    inputSchema: SimilarMusicDiscoveryInputSchema,
    outputSchema: SimilarMusicDiscoveryOutputSchema,
  },
  async (input) => {
    return await getSimilarSongs(input);
  }
);

export async function similarMusicDiscovery(input: SimilarMusicDiscoveryInput): Promise<SimilarMusicDiscoveryOutput> {
  return similarMusicDiscoveryFlow(input);
}