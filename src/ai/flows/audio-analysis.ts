'use server';

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const AudioAnalysisInputSchema = z.object({
  filePath: z.string().describe('The path to the audio file.'),
});
export type AudioAnalysisInput = z.infer<typeof AudioAnalysisInputSchema>;

const AudioAnalysisOutputSchema = z.object({
    tempo: z.number().describe('The tempo of the song in BPM.'),
    key: z.string().describe('The musical key of the song.'),
    instrumentation: z.string().describe('The primary instruments in the song.'),
    enhancedAudioUrl: z.string().describe('The URL of the enhanced audio.'),
    audioVisualizationUrl: z.string().describe('The URL of the audio visualization.'),
});
export type AudioAnalysisOutput = z.infer<typeof AudioAnalysisOutputSchema>;
export async function audioAnalysis(input: AudioAnalysisInput): Promise<AudioAnalysisOutput> {
  return audioAnalysisFlow(input);
}
  
  async function extractAudioFeatures(input: AudioAnalysisInput): Promise<{ tempo: number; key: string; instrumentation: string }> {
  return { tempo:  120, key:  'C Major', instrumentation:  'Guitar, Drums, Bass', };
}
  
  async function enhanceAudio(input: AudioAnalysisInput): Promise<{ enhancedAudioUrl: string }> {
  return { enhancedAudioUrl:'https://example.com/enhanced-audio.mp3' };
}
  
  async function createAudioVisualization(input: AudioAnalysisInput): Promise<{ audioVisualizationUrl: string }> {
  return { audioVisualizationUrl: 'https://example.com/audio-visualization.gif' };
}
  const extractAudioFeaturesPrompt = ai.definePrompt({
  name: 'extractAudioFeaturesPrompt',
  input: {
    schema: z.object({
      filePath: z.string().describe('The path to the audio file.'),
    }),
  },
  output: {
        schema: z.object({ tempo: z.number().describe('The tempo of the song in BPM.'), key: z.string().describe('The musical key of the song.'), instrumentation: z.string().describe('The primary instruments in the song.') }),
    },
    prompt: `You are an AI music expert. Your job is to analyze a music file and provide its audio features. Extract the tempo, musical key, and predominant instruments. The only information you have is the file path: {{{filePath}}}.`,
});

const enhanceAudioPrompt = ai.definePrompt({
    name: 'enhanceAudioPrompt',
    input: { schema: z.object({ filePath: z.string().describe('The path to the audio file.') }) },
    output: { schema: z.object({ enhancedAudioUrl: z.string().describe('The URL of the enhanced audio.') }) },
    prompt: `You are an AI music expert. Your job is to enhance the audio quality of a music file. Improve the audio quality of the file located at the path: {{{filePath}}}. File path: {{{filePath}}}`,
});



const visualizeAudioPrompt = ai.definePrompt({
    name: 'visualizeAudioPrompt',
    input: { schema: z.object({ filePath: z.string().describe('The path to the audio file.') }) },
    output: { schema: z.object({ audioVisualizationUrl: z.string().describe('The URL of the audio visualization.') }) },
    prompt: `You are an AI expert at visualizing audio. Analyze the audio file at the given path and return the data needed to create a visualization: File path: {{{filePath}}}`,
});
const audioAnalysisFlow = ai.defineFlow <
  typeof AudioAnalysisInputSchema,
  typeof AudioAnalysisOutputSchema
>(
  {
    name: 'audioAnalysisFlow',
    inputSchema: AudioAnalysisInputSchema,
    outputSchema: AudioAnalysisOutputSchema,
  },
  async (input) => {
    const { tempo, key, instrumentation } = await extractAudioFeatures(input);

     const { enhancedAudioUrl } = await enhanceAudio(input);
    const { audioVisualizationUrl } = await createAudioVisualization(input);
    
        return {
            tempo,
            key,
            instrumentation,
            enhancedAudioUrl,
            audioVisualizationUrl,
        };
  }
);