import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.aac', '.wma'];

const MUSIC_DIRS = [
  'Music',
  'Download',
  'Downloads',
  'MUSIC',
  'media/audio',
];

export interface ScannedFile {
  name: string;
  path: string;
  uri: string;
}

export async function scanMusicFiles(): Promise<ScannedFile[]> {
  if (!isNativePlatform()) return [];

  const files: ScannedFile[] = [];

  for (const dir of MUSIC_DIRS) {
    try {
      await scanDirectory(dir, files);
    } catch {}
  }

  return files;
}

async function scanDirectory(path: string, results: ScannedFile[]): Promise<void> {
  try {
    const listing = await Filesystem.readdir({
      path,
      directory: Directory.ExternalStorage,
    });

    for (const entry of listing.files) {
      const fullPath = `${path}/${entry.name}`;
      if (entry.type === 'directory') {
        await scanDirectory(fullPath, results);
      } else if (AUDIO_EXTENSIONS.some(ext => entry.name.toLowerCase().endsWith(ext))) {
        const uri = await Filesystem.getUri({
          path: fullPath,
          directory: Directory.ExternalStorage,
        });
        results.push({
          name: entry.name,
          path: fullPath,
          uri: Capacitor.convertFileSrc(uri.uri),
        });
      }
    }
  } catch {}
}

export async function readFileAsArrayBuffer(path: string): Promise<ArrayBuffer> {
  const result = await Filesystem.readFile({
    path,
    directory: Directory.ExternalStorage,
  });

  const base64 = result.data as string;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function writeFileFromArrayBuffer(path: string, buffer: ArrayBuffer): Promise<void> {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.ExternalStorage,
  });
}
