import { readFileAsArrayBuffer, writeFileFromArrayBuffer } from './native-music';

export interface ID3Tags {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  genre?: string;
  trackNumber?: number;
  picture?: ArrayBuffer;
}

export async function readID3Tags(filePath: string): Promise<ID3Tags> {
  try {
    const buffer = await readFileAsArrayBuffer(filePath);
    const jsmediatags = (await import('jsmediatags')).default;

    return new Promise((resolve) => {
      jsmediatags.read(new Blob([buffer]), {
        onSuccess: (tag: any) => {
          const tags = tag.tags || {};
          let picture: ArrayBuffer | undefined;
          if (tags.picture) {
            const picData = tags.picture.data;
            const picBuffer = new Uint8Array(picData.length);
            for (let i = 0; i < picData.length; i++) {
              picBuffer[i] = picData[i];
            }
            picture = picBuffer.buffer;
          }
          resolve({
            title: tags.title,
            artist: tags.artist,
            album: tags.album,
            year: tags.year,
            genre: tags.genre,
            trackNumber: tags.track ? parseInt(tags.track, 10) : undefined,
            picture,
          });
        },
        onError: () => resolve({}),
      });
    });
  } catch {
    return {};
  }
}

export async function writeID3Tags(
  filePath: string,
  tags: {
    title?: string;
    artist?: string;
    album?: string;
    year?: string;
    genre?: string;
    trackNumber?: number;
    coverArtBuffer?: ArrayBuffer;
    coverArtMimeType?: string;
  }
): Promise<void> {
  const buffer = await readFileAsArrayBuffer(filePath);
  const ID3Writer = (await import('browser-id3-writer')).default;

  const writer = new ID3Writer(buffer);

  if (tags.title) writer.setFrame('TIT2', tags.title);
  if (tags.artist) writer.setFrame('TPE1', [tags.artist]);
  if (tags.album) writer.setFrame('TALB', tags.album);
  if (tags.year) writer.setFrame('TYER', Number(tags.year) || 0);
  if (tags.genre) writer.setFrame('TCON', [tags.genre]);
  if (tags.trackNumber) writer.setFrame('TRCK', String(tags.trackNumber));

  if (tags.coverArtBuffer) {
    writer.setFrame('APIC', {
      type: 3,
      data: tags.coverArtBuffer,
      description: 'Cover',
      useUnicodeEncoding: false,
    });
  }

  writer.addTag();

  await writeFileFromArrayBuffer(filePath, writer.arrayBuffer);
}

export async function fetchCoverArtAsBuffer(url: string): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const mimeType = response.headers.get('content-type') || 'image/jpeg';
    return { buffer, mimeType };
  } catch {
    return null;
  }
}
