"use client";

import { useState, useRef, useEffect } from 'react';
import songsData from '../../songs.json';
import { ArrowLeft, Pause, Play, ChevronRight } from 'lucide-react';

// Import the music metadata service
import { fetchMusicMetadata } from '@/services/music-metadata';
// Import the AI flows
import { tagMusicMetadata } from '@/ai/flows/tag-music-metadata';
import { generateAlbumArt } from '@/ai/flows/generate-album-art';
import { scrapeAndSyncLyrics } from '@/ai/flows/scrape-and-sync-lyrics';
// Import the audio analysis flow
import { audioAnalysis } from '@/ai/flows/audio-analysis';
// Import the similar music discovery flow
import { similarMusicDiscovery } from '@/ai/flows/similar-music-discovery';

type Song = { name: string; title: string; url: string; };

  
const MusicPlayer = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1); 
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [songs, setSongs] = useState<Song[]>(songsData);

  const [selectedSong, setSelectedSong] = useState<Song>(songs[0]);
  const [audioAnalysisResult, setAudioAnalysisResult] = useState<{ tempo: number; key: string; instrumentation: string; enhancedAudioUrl: string; audioVisualizationUrl: string; } | null>(null);
  const [similarSongs, setSimilarSongs] = useState<{ name: string; title: string; artist: string; album: string; genre: string; mood: string; tempo: string; key: string; }[]>([]);

  const [metadata, setMetadata] = useState({
    title: 'Unknown Title',
    artist: 'Unknown Artist',
    album: 'Unknown Album',
    albumArtUrl: 'https://picsum.photos/200/200', // Placeholder image
    lyrics: 'Loading lyrics...',
  });

  const audioRef = useRef<HTMLAudioElement>(null);
  
  const updateSong = async (name:string) => {
    const taggedMusicMetadata = await tagMusicMetadata({filePath: name});
    // Reset previous data
    setMetadata({
      title: taggedMusicMetadata.title || "Loading...",
      artist: taggedMusicMetadata.artist || "",
      album: 'Loading...',
      albumArtUrl: 'https://picsum.photos/200/200',
      lyrics:""});
    // Generate the album art
    if (taggedMusicMetadata.albumArtUrl === undefined) {
      const albumArt = await generateAlbumArt({
        songTitle: taggedMusicMetadata.title || "",
        artistName: taggedMusicMetadata.artist || "",
        albumName: taggedMusicMetadata.album || undefined,
      });
        taggedMusicMetadata.albumArtUrl = albumArt.albumArtUrl;
    }
    const lyrics = await scrapeAndSyncLyrics({
      title: taggedMusicMetadata.title || "", 
      artist: taggedMusicMetadata.artist || "",
    });
    setMetadata({
      title: taggedMusicMetadata.title || "",
      artist: taggedMusicMetadata.artist || "",
      album: taggedMusicMetadata.album || "",

      albumArtUrl: taggedMusicMetadata.albumArtUrl || "https://picsum.photos/200/200",
      lyrics: lyrics.lyrics.text,
    });
    setAudioAnalysisResult(await audioAnalysis({filePath: name}));
    if(audioAnalysisResult){
      setSimilarSongs(await similarMusicDiscovery({
        metadata: {title:metadata.title, artist: metadata.artist, album: metadata.album, genre:""},
        audioAnalysis:{tempo: audioAnalysisResult.tempo, key: audioAnalysisResult.key, instrumentation: audioAnalysisResult.instrumentation}
      }));
    }


  };

  useEffect(() => {
    updateSong(selectedSong.name);
  }, []);
  

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(event.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };



  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };  
    const handleProgressChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(event.target.value);
    setCurrentTime(newTime);
    if(audioRef.current){
      audioRef.current.currentTime = newTime;
    }
  };
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleSongChange = (song: {name:string}) => {
    if (isPlaying) {
      togglePlay();
    }
    const selected = songs.find((s) => s.name === song.name);

    if(selected){
      setSelectedSong(selected);
      updateSong(selected.name);
    }
  }

  const handlePreviousSong = () => {
    const currentIndex = songs.indexOf(selectedSong);
    const previousIndex = currentIndex === 0 ? songs.length - 1 : currentIndex - 1;
    setSelectedSong(songs[previousIndex]);
    updateSong(songs[previousIndex].name);

  };
  
  const handleNextSong = () => {
    const currentIndex = songs.indexOf(selectedSong);
    const nextIndex = currentIndex === songs.length - 1 ? 0 : currentIndex + 1;

    setSelectedSong(songs[nextIndex]);
    updateSong(songs[nextIndex].name);


  }

  return (
    <div className="bg-card rounded-lg p-6 shadow-md w-full max-w-4xl mx-auto">
      {/* Album Art and Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center mb-6">
        <div className="w-full">
            <img
              src={metadata.albumArtUrl}
              alt="Album Art"
              className="w-64 h-64 rounded-md shadow-md object-cover"
            />          
          </div>
        <div className="text-center md:text-left">
          <h2 className="text-xl font-semibold">{metadata.title}</h2>
          <p className="text-muted-foreground">{metadata.artist}</p>
          <p className="text-muted-foreground">{metadata.album}</p>
        </div>
      </div>

      
      {/* Audio Controls */}
      <div className="flex items-center justify-between mb-4">
      <button onClick={handlePreviousSong} className="p-2 rounded-full hover:bg-secondary">
          <ArrowLeft />
        </button>
          <button onClick={togglePlay} className="p-2 rounded-full hover:bg-secondary"> 
            {isPlaying ? <Pause /> : <Play />}
          </button><button onClick={handleNextSong} className="p-2 rounded-full hover:bg-secondary"> <ChevronRight />
        </button>
        <div className="flex-grow mx-4">
          <input
            type="range"
            min="0"
            max={duration.toString()}
            value={currentTime}
            className="w-full"
            onChange={handleProgressChange}
          /> 
        
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>          

          
        </div>
        <div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={handleVolumeChange}
          />
        </div>
      </div>
        
       {/* Songs Display */}
      <div className="text-sm text-muted-foreground mb-4 max-h-40 overflow-y-auto">
        {songs.map((song) => (

          <p key={song.name} className="cursor-pointer" onClick={() => handleSongChange(song)}>
            {song.name}
          </p>
            ))}
      </div>

      {/* Lyrics Display */}
        <div className="bg-secondary rounded-lg p-4 mb-4">
          <h3 className="text-lg font-semibold mb-2">Lyrics</h3>
          <div className="text-sm text-muted-foreground whitespace-pre-wrap">
            <p>{metadata.lyrics}</p>
          </div>
      </div>

      {/* Audio Visualization */}
      <div>
        {audioAnalysisResult && <img src={audioAnalysisResult.audioVisualizationUrl} alt="Audio Visualization" />}
      </div>
      {/* Similar Songs */}

      {similarSongs && (
        <div>
          <h2 className="text-xl font-semibold">Similar Songs</h2>
          <div className="grid grid-cols-3 gap-4">
            {similarSongs.map((song) => (
              <div key={song.name} className="p-2 border rounded-md">
                <p>{song.title}</p>
              </div>
            ))}
          </div>
        </div>
      )}

          
      {/* Hidden audio element */}
      <audio
       ref={audioRef}
       src={selectedSong.url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
      />
    </div>
  );
};

export default MusicPlayer;
