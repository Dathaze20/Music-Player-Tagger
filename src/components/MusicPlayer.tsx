
"use client";

import { useState, useRef, useEffect } from 'react';
import { Icons } from '@/components/icons';

const MusicPlayer = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [metadata, setMetadata] = useState({
    title: 'Unknown Title',
    artist: 'Unknown Artist',
    album: 'Unknown Album',
    albumArtUrl: 'https://picsum.photos/200/200', // Placeholder image
    lyrics: 'Loading lyrics...',
  });

  const audioRef = useRef<HTMLAudioElement>(null);

  // Placeholder for loading music and metadata
  useEffect(() => {
    // Simulate loading metadata
    setTimeout(() => {
      setMetadata({
        title: 'Sample Track',
        artist: 'Test Artist',
        album: 'Demo Album',
        albumArtUrl: 'https://picsum.photos/200/200',
        lyrics: 'Here are some sample lyrics...\nMore lyrics here.',
      });
      setDuration(300); // Simulate duration
    }, 1000);
  }, []);

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    setCurrentTime(audioRef.current?.currentTime || 0);
  };

  const handleLoadedMetadata = () => {
    setDuration(audioRef.current?.duration || 0);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div className="bg-card rounded-lg p-6 shadow-md w-full max-w-md">
      {/* Album Art and Metadata */}
      <div className="flex items-center space-x-4 mb-4">
        <img
          src={metadata.albumArtUrl}
          alt="Album Art"
          className="w-24 h-24 rounded-md shadow-sm"
        />
        <div>
          <h2 className="text-xl font-semibold">{metadata.title}</h2>
          <p className="text-muted-foreground">{metadata.artist}</p>
          <p className="text-muted-foreground">{metadata.album}</p>
        </div>
      </div>

      {/* Audio Controls */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={togglePlay} className="p-2 rounded-full hover:bg-secondary">
          {isPlaying ? <Icons.pause /> : <Icons.play />}
        </button>
        <div className="flex-grow mx-4">
          <input
            type="range"
            min="0"
            max={duration}
            value={currentTime}
            className="w-full"
            onChange={() => {}} // Placeholder
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Lyrics Display */}
      <div className="text-sm text-muted-foreground">
        <p>{metadata.lyrics}</p>
      </div>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src="" // Placeholder audio source
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
      />
    </div>
  );
};

export default MusicPlayer;
