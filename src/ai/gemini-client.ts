import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI: GoogleGenerativeAI | null = null;

export function initGemini(apiKey: string) {
  genAI = new GoogleGenerativeAI(apiKey);
}

export function getGemini(): GoogleGenerativeAI {
  if (!genAI) throw new Error('Gemini not initialized. Call initGemini(apiKey) first.');
  return genAI;
}

export async function geminiTagMetadata(filePath: string, existing?: {
  title?: string; artist?: string; album?: string; trackNumber?: number;
}): Promise<{
  title?: string; artist?: string; album?: string; trackNumber?: number;
  albumArtUrl?: string; year?: string; genre?: string;
  releaseType?: string; featuredArtists?: string;
}> {
  const model = getGemini().getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `You are a music metadata expert with deep knowledge of hip-hop, rap, R&B, drill, trap, and mixtape culture — including underground artists.

Given this music file name, identify the song and return ONLY a JSON object with these fields:
- title, artist, album, trackNumber, albumArtUrl, year, genre, releaseType, featuredArtists

File: ${filePath}
Existing metadata: title=${existing?.title || ''}, artist=${existing?.artist || ''}, album=${existing?.album || ''}, trackNumber=${existing?.trackNumber || ''}

Rules:
- For loosies/singles not on any project, set releaseType to "Single"
- For mixtapes, set releaseType to "Mixtape"
- For official retail albums, set releaseType to "Album"
- Separate featured artists from main artist
- Handle underground artists (Stack Bundles, Max B, Chinx, Lloyd Banks mixtapes, etc.)
- Return ONLY the JSON, no markdown, no explanation`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = text.replace(/^```json?\s*/, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(jsonStr);
  } catch {
    return {};
  }
}

export async function geminiGenerateAlbumArt(songTitle: string, artistName: string, albumName?: string): Promise<string> {
  const model = getGemini().getGenerativeModel({ model: 'gemini-2.0-flash' });
  const prompt = `Find a real, publicly accessible URL for the album cover art of:
Song: ${songTitle}
Artist: ${artistName}
${albumName ? `Album: ${albumName}` : ''}

Return ONLY the URL, nothing else. If you cannot find one, return "none".`;

  const result = await model.generateContent(prompt);
  const url = result.response.text().trim();
  return url === 'none' ? '' : url;
}
