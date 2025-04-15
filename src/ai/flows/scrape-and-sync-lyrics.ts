'use server';
/**
 * @fileOverview This file defines a Genkit flow for scraping and synchronizing lyrics for a given song.
 *
 * scrapeAndSyncLyrics - A function that handles the process of scraping and synchronizing lyrics.
 * ScrapeAndSyncLyricsInput - The input type for the scrapeAndSyncLyrics function.
 * ScrapeAndSyncLyricsOutput - The return type for the scrapeAndSyncLyrics function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';
import {getLyrics, Lyrics} from '@/services/lyrics';

const ScrapeAndSyncLyricsInputSchema = z.object({
  title: z.string().describe('The title of the song.'),
  artist: z.string().describe('The artist of the song.'),
});
export type ScrapeAndSyncLyricsInput = z.infer<typeof ScrapeAndSyncLyricsInputSchema>;

const ScrapeAndSyncLyricsOutputSchema = z.object({
  lyrics: z.object({
    text: z.string().describe('The lyrics of the song.'),
  }).describe('The lyrics object containing the lyrics text.'),
});
export type ScrapeAndSyncLyricsOutput = z.infer<typeof ScrapeAndSyncLyricsOutputSchema>;

export async function scrapeAndSyncLyrics(input: ScrapeAndSyncLyricsInput): Promise<ScrapeAndSyncLyricsOutput> {
  return scrapeAndSyncLyricsFlow(input);
}

const scrapeLyricsPrompt = ai.definePrompt({
  name: 'scrapeLyricsPrompt',
  input: {
    schema: z.object({
      title: z.string().describe('The title of the song.'),
      artist: z.string().describe('The artist of the song.'),
    }),
  },
  output: {
    schema: z.object({
      lyrics: z.object({
        text: z.string().describe('The lyrics of the song.'),
      }).describe('The lyrics object containing the lyrics text.'),
    }),
  },
  prompt: `You are an AI expert at finding song lyrics, given a song title and artist.

  Find the lyrics for the song with the following information:

  Title: {{{title}}}
  Artist: {{{artist}}}

  Return the lyrics in the 'lyrics.text' field. Be as accurate as possible.
  `,
});

const scrapeAndSyncLyricsFlow = ai.defineFlow<
  typeof ScrapeAndSyncLyricsInputSchema,
  typeof ScrapeAndSyncLyricsOutputSchema
>({
  name: 'scrapeAndSyncLyricsFlow',
  inputSchema: ScrapeAndSyncLyricsInputSchema,
  outputSchema: ScrapeAndSyncLyricsOutputSchema,
}, async (input) => {
  // Use the getLyrics service to fetch lyrics.
  const lyrics: Lyrics = await getLyrics(input.title, input.artist);

  // If lyrics are successfully fetched, return them. Otherwise, use the prompt.
  if (lyrics && lyrics.text) {
    return {
      lyrics: {
        text: lyrics.text,
      },
    };
  } else {
    const {output} = await scrapeLyricsPrompt(input);
    return output!;
  }
});