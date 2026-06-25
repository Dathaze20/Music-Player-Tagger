"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Menu, Search, MoreVertical, Play, Pause, SkipBack, SkipForward,
  Repeat, Shuffle, Volume2, VolumeX, ChevronLeft, ChevronDown,
  Music, Disc3, Users, ListMusic, Heart, Plus, FileAudio, X,
  Loader2, Mic2, FolderOpen, Clock, Library, Settings,
  Import, Upload, Edit3, Save, Check
} from 'lucide-react';
import { tagMusicMetadata } from '@/ai/flows/tag-music-metadata';
import { generateAlbumArt } from '@/ai/flows/generate-album-art';
import { scrapeAndSyncLyrics } from '@/ai/flows/scrape-and-sync-lyrics';

// ═══════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════

interface Song {
  id: string;
  fileName: string;
  url: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  genre: string;
  trackNumber: number;
  albumArtUrl: string;
  lyrics: string;
  duration: number;
  isTagging: boolean;
  isFavorite: boolean;
  releaseType: string;
  featuredArtists: string;
}

interface TaggingStatus {
  total: number;
  completed: number;
  current: string;
  isActive: boolean;
}

type Tab = 'artists' | 'songs' | 'albums' | 'playlists';
type AlbumFilter = 'all' | 'albums' | 'mixtapes' | 'eps';

interface ArtistInfo {
  name: string;
  albumCount: number;
  songCount: number;
  artUrls: string[];
}

interface AlbumInfo {
  name: string;
  artist: string;
  year: string;
  artUrl: string;
  songCount: number;
  releaseType: string;
}

// ═══════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function parseFileName(fileName: string): { artist: string; title: string; featuredArtists: string } {
  let name = fileName.replace(/\.[^/.]+$/, '');

  // Strip leading track numbers: "01 - ", "01. ", "Track 01 - "
  name = name.replace(/^(?:Track\s*)?(\d{1,3})\s*[-.)]\s*/i, '');

  // Strip producer credits: "(Prod. by X)" or "[Prod. X]"
  name = name.replace(/[\[(]prod\.?\s*(?:by\s*)?[^\])]+[\])]/gi, '').trim();

  // Extract featured artists from title portion
  let featuredArtists = '';
  const featMatch = name.match(/\s+(?:ft\.?|feat\.?|featuring)\s+(.+?)(?:\s*[-]|$)/i);
  if (featMatch) {
    featuredArtists = featMatch[1].trim();
    name = name.replace(featMatch[0], featMatch[0].endsWith('-') ? ' -' : '');
  }

  // Strip DJ tags: "DJ Drama - Gangsta Grillz - " prefix
  const djMatch = name.match(/^DJ\s+\w+(?:\s+\w+)?\s*-\s*(?:Gangsta Grillz|presents?)\s*-\s*/i);
  if (djMatch) {
    name = name.substring(djMatch[0].length);
  }

  if (name.includes(' - ')) {
    const parts = name.split(' - ');
    let title = parts.slice(1).join(' - ').trim();
    const titleFeatMatch = title.match(/\s+(?:ft\.?|feat\.?|featuring)\s+(.+)/i);
    if (titleFeatMatch) {
      featuredArtists = titleFeatMatch[1].trim();
      title = title.replace(titleFeatMatch[0], '').trim();
    }
    return { artist: parts[0].trim(), title, featuredArtists };
  }
  if (name.includes('_-_')) {
    const parts = name.split('_-_');
    return { artist: parts[0].replace(/_/g, ' ').trim(), title: parts.slice(1).join(' - ').replace(/_/g, ' ').trim(), featuredArtists };
  }
  return { artist: 'Unknown Artist', title: name.replace(/_/g, ' ').trim(), featuredArtists };
}

const GRADIENTS: [string, string][] = [
  ['#667eea', '#764ba2'], ['#f093fb', '#f5576c'], ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'], ['#fa709a', '#fee140'], ['#a18cd1', '#fbc2eb'],
  ['#fccb90', '#d57eeb'], ['#e0c3fc', '#8ec5fc'], ['#f5576c', '#ff6a00'],
  ['#667eea', '#43e97b'], ['#fa709a', '#764ba2'], ['#4facfe', '#f5576c'],
  ['#38f9d7', '#fbc2eb'], ['#fee140', '#d57eeb'], ['#ff6a00', '#8ec5fc'],
];

function getGradient(str: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

function ArtPlaceholder({ text, size, round }: { text: string; size: number; round?: boolean }) {
  const [c1, c2] = getGradient(text);
  const initials = text.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  return (
    <div
      className={`flex items-center justify-center flex-shrink-0 ${round ? 'rounded-full' : 'rounded-lg'}`}
      style={{
        width: size, height: size,
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
      }}
    >
      <span className="text-white font-bold select-none" style={{ fontSize: size * 0.35 }}>{initials}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Demo Data
// ═══════════════════════════════════════════════════════

const DEMO_SONGS: Song[] = [
  // ── Albums ──
  { id: 'd1', fileName: '2Pac - California Love.mp3', url: '', title: 'California Love', artist: '2Pac', album: 'All Eyez on Me', year: '1996', genre: 'Hip-Hop', trackNumber: 1, albumArtUrl: '', lyrics: '', duration: 265, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd2', fileName: '2Pac - Dear Mama.mp3', url: '', title: 'Dear Mama', artist: '2Pac', album: 'Me Against the World', year: '1995', genre: 'Hip-Hop', trackNumber: 9, albumArtUrl: '', lyrics: '', duration: 285, isTagging: false, isFavorite: true, releaseType: 'Album', featuredArtists: '' },
  { id: 'd3', fileName: '2Pac - Changes.mp3', url: '', title: 'Changes', artist: '2Pac', album: 'Greatest Hits', year: '1998', genre: 'Hip-Hop', trackNumber: 1, albumArtUrl: '', lyrics: '', duration: 269, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd4', fileName: '2Pac - Hit Em Up.mp3', url: '', title: 'Hit \'Em Up', artist: '2Pac', album: 'All Eyez on Me', year: '1996', genre: 'Hip-Hop', trackNumber: 2, albumArtUrl: '', lyrics: '', duration: 312, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd5', fileName: '2Pac - Ambitionz Az a Ridah.mp3', url: '', title: 'Ambitionz Az a Ridah', artist: '2Pac', album: 'All Eyez on Me', year: '1996', genre: 'Hip-Hop', trackNumber: 3, albumArtUrl: '', lyrics: '', duration: 279, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd6', fileName: '2Pac - So Many Tears.mp3', url: '', title: 'So Many Tears', artist: '2Pac', album: 'Me Against the World', year: '1995', genre: 'Hip-Hop', trackNumber: 5, albumArtUrl: '', lyrics: '', duration: 254, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd7', fileName: '2Pac - Hail Mary.mp3', url: '', title: 'Hail Mary', artist: '2Pac', album: 'The Don Killuminati', year: '1996', genre: 'Hip-Hop', trackNumber: 1, albumArtUrl: '', lyrics: '', duration: 313, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd8', fileName: '2Pac - Keep Ya Head Up.mp3', url: '', title: 'Keep Ya Head Up', artist: '2Pac', album: 'Strictly 4 My N.I.G.G.A.Z.', year: '1993', genre: 'Hip-Hop', trackNumber: 12, albumArtUrl: '', lyrics: '', duration: 283, isTagging: false, isFavorite: true, releaseType: 'Album', featuredArtists: '' },
  { id: 'd10', fileName: '50 Cent - In Da Club.mp3', url: '', title: 'In Da Club', artist: '50 Cent', album: "Get Rich or Die Tryin'", year: '2003', genre: 'Hip-Hop', trackNumber: 5, albumArtUrl: '', lyrics: '', duration: 193, isTagging: false, isFavorite: true, releaseType: 'Album', featuredArtists: '' },
  { id: 'd11', fileName: '50 Cent - 21 Questions.mp3', url: '', title: '21 Questions', artist: '50 Cent', album: "Get Rich or Die Tryin'", year: '2003', genre: 'Hip-Hop', trackNumber: 6, albumArtUrl: '', lyrics: '', duration: 263, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: 'Nate Dogg' },
  { id: 'd12', fileName: '50 Cent - Candy Shop.mp3', url: '', title: 'Candy Shop', artist: '50 Cent', album: 'The Massacre', year: '2005', genre: 'Hip-Hop', trackNumber: 3, albumArtUrl: '', lyrics: '', duration: 215, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: 'Olivia' },
  { id: 'd13', fileName: '50 Cent - Many Men.mp3', url: '', title: 'Many Men', artist: '50 Cent', album: "Get Rich or Die Tryin'", year: '2003', genre: 'Hip-Hop', trackNumber: 4, albumArtUrl: '', lyrics: '', duration: 249, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd14', fileName: '50 Cent - P.I.M.P.mp3', url: '', title: 'P.I.M.P.', artist: '50 Cent', album: "Get Rich or Die Tryin'", year: '2003', genre: 'Hip-Hop', trackNumber: 8, albumArtUrl: '', lyrics: '', duration: 234, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd20', fileName: 'Eminem - Lose Yourself.mp3', url: '', title: 'Lose Yourself', artist: 'Eminem', album: '8 Mile Soundtrack', year: '2002', genre: 'Hip-Hop', trackNumber: 1, albumArtUrl: '', lyrics: '', duration: 326, isTagging: false, isFavorite: true, releaseType: 'Album', featuredArtists: '' },
  { id: 'd21', fileName: 'Eminem - The Real Slim Shady.mp3', url: '', title: 'The Real Slim Shady', artist: 'Eminem', album: 'The Marshall Mathers LP', year: '2000', genre: 'Hip-Hop', trackNumber: 8, albumArtUrl: '', lyrics: '', duration: 284, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd22', fileName: 'Eminem - Without Me.mp3', url: '', title: 'Without Me', artist: 'Eminem', album: 'The Eminem Show', year: '2002', genre: 'Hip-Hop', trackNumber: 6, albumArtUrl: '', lyrics: '', duration: 290, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd23', fileName: 'Eminem - Stan.mp3', url: '', title: 'Stan', artist: 'Eminem', album: 'The Marshall Mathers LP', year: '2000', genre: 'Hip-Hop', trackNumber: 3, albumArtUrl: '', lyrics: '', duration: 404, isTagging: false, isFavorite: true, releaseType: 'Album', featuredArtists: 'Dido' },
  { id: 'd24', fileName: 'Eminem - Mockingbird.mp3', url: '', title: 'Mockingbird', artist: 'Eminem', album: 'Encore', year: '2004', genre: 'Hip-Hop', trackNumber: 13, albumArtUrl: '', lyrics: '', duration: 250, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd30', fileName: 'Kendrick Lamar - HUMBLE.mp3', url: '', title: 'HUMBLE.', artist: 'Kendrick Lamar', album: 'DAMN.', year: '2017', genre: 'Hip-Hop', trackNumber: 8, albumArtUrl: '', lyrics: '', duration: 177, isTagging: false, isFavorite: true, releaseType: 'Album', featuredArtists: '' },
  { id: 'd31', fileName: 'Kendrick Lamar - DNA.mp3', url: '', title: 'DNA.', artist: 'Kendrick Lamar', album: 'DAMN.', year: '2017', genre: 'Hip-Hop', trackNumber: 2, albumArtUrl: '', lyrics: '', duration: 186, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd32', fileName: 'Kendrick Lamar - Alright.mp3', url: '', title: 'Alright', artist: 'Kendrick Lamar', album: 'To Pimp a Butterfly', year: '2015', genre: 'Hip-Hop', trackNumber: 7, albumArtUrl: '', lyrics: '', duration: 219, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd33', fileName: 'Kendrick Lamar - Swimming Pools.mp3', url: '', title: 'Swimming Pools (Drank)', artist: 'Kendrick Lamar', album: 'good kid, m.A.A.d city', year: '2012', genre: 'Hip-Hop', trackNumber: 8, albumArtUrl: '', lyrics: '', duration: 313, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd40', fileName: 'Nas - N.Y. State of Mind.mp3', url: '', title: 'N.Y. State of Mind', artist: 'Nas', album: 'Illmatic', year: '1994', genre: 'Hip-Hop', trackNumber: 2, albumArtUrl: '', lyrics: '', duration: 293, isTagging: false, isFavorite: true, releaseType: 'Album', featuredArtists: '' },
  { id: 'd41', fileName: 'Nas - If I Ruled the World.mp3', url: '', title: 'If I Ruled the World', artist: 'Nas', album: 'It Was Written', year: '1996', genre: 'Hip-Hop', trackNumber: 5, albumArtUrl: '', lyrics: '', duration: 280, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: 'Lauryn Hill' },
  { id: 'd42', fileName: 'Nas - One Mic.mp3', url: '', title: 'One Mic', artist: 'Nas', album: 'Stillmatic', year: '2001', genre: 'Hip-Hop', trackNumber: 7, albumArtUrl: '', lyrics: '', duration: 290, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd50', fileName: 'Dr. Dre - Still D.R.E.mp3', url: '', title: 'Still D.R.E.', artist: 'Dr. Dre', album: '2001', year: '1999', genre: 'Hip-Hop', trackNumber: 2, albumArtUrl: '', lyrics: '', duration: 271, isTagging: false, isFavorite: true, releaseType: 'Album', featuredArtists: 'Snoop Dogg' },
  { id: 'd51', fileName: 'Dr. Dre - The Next Episode.mp3', url: '', title: 'The Next Episode', artist: 'Dr. Dre', album: '2001', year: '1999', genre: 'Hip-Hop', trackNumber: 17, albumArtUrl: '', lyrics: '', duration: 155, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: 'Snoop Dogg' },
  { id: 'd52', fileName: 'Dr. Dre - Forgot About Dre.mp3', url: '', title: 'Forgot About Dre', artist: 'Dr. Dre', album: '2001', year: '1999', genre: 'Hip-Hop', trackNumber: 9, albumArtUrl: '', lyrics: '', duration: 223, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: 'Eminem' },
  { id: 'd60', fileName: 'J. Cole - No Role Modelz.mp3', url: '', title: 'No Role Modelz', artist: 'J. Cole', album: '2014 Forest Hills Drive', year: '2014', genre: 'Hip-Hop', trackNumber: 12, albumArtUrl: '', lyrics: '', duration: 293, isTagging: false, isFavorite: true, releaseType: 'Album', featuredArtists: '' },
  { id: 'd61', fileName: 'J. Cole - Middle Child.mp3', url: '', title: 'Middle Child', artist: 'J. Cole', album: 'Revenge of the Dreamers III', year: '2019', genre: 'Hip-Hop', trackNumber: 1, albumArtUrl: '', lyrics: '', duration: 213, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd62', fileName: 'J. Cole - Power Trip.mp3', url: '', title: 'Power Trip', artist: 'J. Cole', album: 'Born Sinner', year: '2013', genre: 'Hip-Hop', trackNumber: 3, albumArtUrl: '', lyrics: '', duration: 240, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: 'Miguel' },
  { id: 'd70', fileName: '112 - Peaches & Cream.mp3', url: '', title: 'Peaches & Cream', artist: '112', album: 'Part III', year: '2001', genre: 'R&B', trackNumber: 3, albumArtUrl: '', lyrics: '', duration: 245, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd71', fileName: '112 - Cupid.mp3', url: '', title: 'Cupid', artist: '112', album: '112', year: '1996', genre: 'R&B', trackNumber: 5, albumArtUrl: '', lyrics: '', duration: 268, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd72', fileName: '112 - Only You.mp3', url: '', title: 'Only You', artist: '112', album: '112', year: '1996', genre: 'R&B', trackNumber: 2, albumArtUrl: '', lyrics: '', duration: 260, isTagging: false, isFavorite: true, releaseType: 'Album', featuredArtists: '' },
  { id: 'd80', fileName: '22Gz - Suburban.mp3', url: '', title: 'Suburban', artist: '22Gz', album: 'The Blixky Tape', year: '2019', genre: 'Drill', trackNumber: 1, albumArtUrl: '', lyrics: '', duration: 198, isTagging: false, isFavorite: false, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'd81', fileName: '22Gz - Sniper Gang Freestyle.mp3', url: '', title: 'Sniper Gang Freestyle', artist: '22Gz', album: 'Growth & Development', year: '2020', genre: 'Drill', trackNumber: 2, albumArtUrl: '', lyrics: '', duration: 180, isTagging: false, isFavorite: false, releaseType: 'Album', featuredArtists: '' },
  { id: 'd90', fileName: '38 Spesh - 6 Summers.mp3', url: '', title: '6 Summers', artist: '38 Spesh', album: '6 Shots', year: '2020', genre: 'Hip-Hop', trackNumber: 1, albumArtUrl: '', lyrics: '', duration: 210, isTagging: false, isFavorite: false, releaseType: 'EP', featuredArtists: '' },
  { id: 'd91', fileName: '38 Spesh - Dangerous.mp3', url: '', title: 'Dangerous', artist: '38 Spesh', album: '6 Shots', year: '2020', genre: 'Hip-Hop', trackNumber: 3, albumArtUrl: '', lyrics: '', duration: 195, isTagging: false, isFavorite: false, releaseType: 'EP', featuredArtists: '' },

  // ── Mixtapes ──
  { id: 'm1', fileName: 'Lil Wayne - A Milli.mp3', url: '', title: 'A Milli', artist: 'Lil Wayne', album: 'Da Drought 3', year: '2007', genre: 'Hip-Hop', trackNumber: 1, albumArtUrl: '', lyrics: '', duration: 228, isTagging: false, isFavorite: true, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm2', fileName: 'Lil Wayne - Ride 4 My Niggas.mp3', url: '', title: 'Ride 4 My Niggas', artist: 'Lil Wayne', album: 'Da Drought 3', year: '2007', genre: 'Hip-Hop', trackNumber: 5, albumArtUrl: '', lyrics: '', duration: 245, isTagging: false, isFavorite: false, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm3', fileName: 'Lil Wayne - Sportscenter.mp3', url: '', title: 'Sportscenter', artist: 'Lil Wayne', album: 'Da Drought 3', year: '2007', genre: 'Hip-Hop', trackNumber: 8, albumArtUrl: '', lyrics: '', duration: 210, isTagging: false, isFavorite: false, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm4', fileName: 'Lil Wayne - Ice Cream Paint Job.mp3', url: '', title: 'Ice Cream Paint Job', artist: 'Lil Wayne', album: 'No Ceilings', year: '2009', genre: 'Hip-Hop', trackNumber: 3, albumArtUrl: '', lyrics: '', duration: 198, isTagging: false, isFavorite: false, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm5', fileName: 'Lil Wayne - Watch My Shoes.mp3', url: '', title: 'Watch My Shoes', artist: 'Lil Wayne', album: 'No Ceilings', year: '2009', genre: 'Hip-Hop', trackNumber: 6, albumArtUrl: '', lyrics: '', duration: 262, isTagging: false, isFavorite: true, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm6', fileName: 'Lil Wayne - Dedication 2 Intro.mp3', url: '', title: 'Dedication 2 Intro', artist: 'Lil Wayne', album: 'Dedication 2', year: '2006', genre: 'Hip-Hop', trackNumber: 1, albumArtUrl: '', lyrics: '', duration: 180, isTagging: false, isFavorite: false, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm10', fileName: 'Future - Codeine Crazy.mp3', url: '', title: 'Codeine Crazy', artist: 'Future', album: 'Monster', year: '2014', genre: 'Trap', trackNumber: 1, albumArtUrl: '', lyrics: '', duration: 290, isTagging: false, isFavorite: true, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm11', fileName: 'Future - My Savages.mp3', url: '', title: 'My Savages', artist: 'Future', album: 'Monster', year: '2014', genre: 'Trap', trackNumber: 4, albumArtUrl: '', lyrics: '', duration: 215, isTagging: false, isFavorite: false, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm12', fileName: 'Future - 56 Nights.mp3', url: '', title: '56 Nights', artist: 'Future', album: '56 Nights', year: '2015', genre: 'Trap', trackNumber: 1, albumArtUrl: '', lyrics: '', duration: 232, isTagging: false, isFavorite: false, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm13', fileName: 'Future - March Madness.mp3', url: '', title: 'March Madness', artist: 'Future', album: '56 Nights', year: '2015', genre: 'Trap', trackNumber: 5, albumArtUrl: '', lyrics: '', duration: 246, isTagging: false, isFavorite: true, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm20', fileName: 'Wiz Khalifa - Mezmorized.mp3', url: '', title: 'Mezmorized', artist: 'Wiz Khalifa', album: 'Kush & OJ', year: '2010', genre: 'Hip-Hop', trackNumber: 2, albumArtUrl: '', lyrics: '', duration: 189, isTagging: false, isFavorite: false, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm21', fileName: 'Wiz Khalifa - Still Blazin.mp3', url: '', title: 'Still Blazin', artist: 'Wiz Khalifa', album: 'Kush & OJ', year: '2010', genre: 'Hip-Hop', trackNumber: 5, albumArtUrl: '', lyrics: '', duration: 220, isTagging: false, isFavorite: true, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm22', fileName: 'Wiz Khalifa - Cabin Fever.mp3', url: '', title: 'Cabin Fever', artist: 'Wiz Khalifa', album: 'Cabin Fever', year: '2011', genre: 'Hip-Hop', trackNumber: 1, albumArtUrl: '', lyrics: '', duration: 195, isTagging: false, isFavorite: false, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm30', fileName: 'Chance the Rapper - Cocoa Butter Kisses.mp3', url: '', title: 'Cocoa Butter Kisses', artist: 'Chance the Rapper', album: 'Acid Rap', year: '2013', genre: 'Hip-Hop', trackNumber: 6, albumArtUrl: '', lyrics: '', duration: 275, isTagging: false, isFavorite: true, releaseType: 'Mixtape', featuredArtists: 'Vic Mensa, Twista' },
  { id: 'm31', fileName: 'Chance the Rapper - Juice.mp3', url: '', title: 'Juice', artist: 'Chance the Rapper', album: 'Acid Rap', year: '2013', genre: 'Hip-Hop', trackNumber: 2, albumArtUrl: '', lyrics: '', duration: 198, isTagging: false, isFavorite: false, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm40', fileName: 'Mac Miller - Nikes on My Feet.mp3', url: '', title: 'Nikes on My Feet', artist: 'Mac Miller', album: 'K.I.D.S.', year: '2010', genre: 'Hip-Hop', trackNumber: 3, albumArtUrl: '', lyrics: '', duration: 230, isTagging: false, isFavorite: false, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm41', fileName: 'Mac Miller - Best Day Ever.mp3', url: '', title: 'Best Day Ever', artist: 'Mac Miller', album: 'Best Day Ever', year: '2011', genre: 'Hip-Hop', trackNumber: 1, albumArtUrl: '', lyrics: '', duration: 243, isTagging: false, isFavorite: true, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm50', fileName: 'Kevin Gates - Paper Chasers.mp3', url: '', title: 'Paper Chasers', artist: 'Kevin Gates', album: 'Luca Brasi Story', year: '2013', genre: 'Hip-Hop', trackNumber: 2, albumArtUrl: '', lyrics: '', duration: 248, isTagging: false, isFavorite: false, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm51', fileName: 'Kevin Gates - Wylin.mp3', url: '', title: 'Wylin', artist: 'Kevin Gates', album: 'Stranger Than Fiction', year: '2013', genre: 'Hip-Hop', trackNumber: 4, albumArtUrl: '', lyrics: '', duration: 225, isTagging: false, isFavorite: false, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm60', fileName: 'J. Cole - Before I\'m Gone.mp3', url: '', title: "Before I'm Gone", artist: 'J. Cole', album: 'Friday Night Lights', year: '2010', genre: 'Hip-Hop', trackNumber: 1, albumArtUrl: '', lyrics: '', duration: 260, isTagging: false, isFavorite: false, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm61', fileName: 'J. Cole - Too Deep for the Intro.mp3', url: '', title: 'Too Deep for the Intro', artist: 'J. Cole', album: 'Friday Night Lights', year: '2010', genre: 'Hip-Hop', trackNumber: 2, albumArtUrl: '', lyrics: '', duration: 238, isTagging: false, isFavorite: true, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm70', fileName: 'Drake - Successful.mp3', url: '', title: 'Successful', artist: 'Drake', album: 'So Far Gone', year: '2009', genre: 'Hip-Hop', trackNumber: 4, albumArtUrl: '', lyrics: '', duration: 247, isTagging: false, isFavorite: true, releaseType: 'Mixtape', featuredArtists: 'Trey Songz, Lil Wayne' },
  { id: 'm71', fileName: 'Drake - Best I Ever Had.mp3', url: '', title: 'Best I Ever Had', artist: 'Drake', album: 'So Far Gone', year: '2009', genre: 'Hip-Hop', trackNumber: 2, albumArtUrl: '', lyrics: '', duration: 262, isTagging: false, isFavorite: false, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm80', fileName: 'Nipsey Hussle - Hussle in the House.mp3', url: '', title: 'Hussle in the House', artist: 'Nipsey Hussle', album: 'Crenshaw', year: '2013', genre: 'Hip-Hop', trackNumber: 1, albumArtUrl: '', lyrics: '', duration: 218, isTagging: false, isFavorite: false, releaseType: 'Mixtape', featuredArtists: '' },
  { id: 'm81', fileName: 'Nipsey Hussle - Face the World.mp3', url: '', title: 'Face the World', artist: 'Nipsey Hussle', album: 'Crenshaw', year: '2013', genre: 'Hip-Hop', trackNumber: 5, albumArtUrl: '', lyrics: '', duration: 237, isTagging: false, isFavorite: false, releaseType: 'Mixtape', featuredArtists: '' },
];

// ═══════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════

export default function MusicPlayerApp() {
  // State
  const [songs, setSongs] = useState<Song[]>(DEMO_SONGS);
  const [activeTab, setActiveTab] = useState<Tab>('artists');
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<{ name: string; artist: string } | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [taggingStatus, setTaggingStatus] = useState<TaggingStatus>({ total: 0, completed: 0, current: '', isActive: false });
  const [queue, setQueue] = useState<Song[]>([]);
  const [albumFilter, setAlbumFilter] = useState<AlbumFilter>('all');
  const [isDragging, setIsDragging] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<{ name: string; artist: string } | null>(null);
  const [editForm, setEditForm] = useState({ artist: '', album: '', year: '', genre: '', releaseType: '' });

  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // ─── Derived data ───

  const artists = useMemo<ArtistInfo[]>(() => {
    const map = new Map<string, { albums: Set<string>; count: number; artUrls: string[] }>();
    songs.forEach(s => {
      const entry = map.get(s.artist) || { albums: new Set<string>(), count: 0, artUrls: [] };
      entry.albums.add(s.album);
      entry.count++;
      if (s.albumArtUrl && !entry.artUrls.includes(s.albumArtUrl)) entry.artUrls.push(s.albumArtUrl);
      map.set(s.artist, entry);
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, albumCount: data.albums.size, songCount: data.count, artUrls: data.artUrls.slice(0, 4) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [songs]);

  const allAlbums = useMemo<AlbumInfo[]>(() => {
    const map = new Map<string, { artist: string; year: string; artUrl: string; count: number; releaseType: string }>();
    songs.forEach(s => {
      const key = `${s.album}|||${s.artist}`;
      if (!map.has(key)) {
        map.set(key, { artist: s.artist, year: s.year, artUrl: s.albumArtUrl, count: 0, releaseType: s.releaseType || 'Album' });
      }
      map.get(key)!.count++;
    });
    return Array.from(map.entries())
      .map(([key, data]) => {
        const [name] = key.split('|||');
        return { name, artist: data.artist, year: data.year, artUrl: data.artUrl, songCount: data.count, releaseType: data.releaseType };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [songs]);

  const albums = useMemo<AlbumInfo[]>(() => {
    if (albumFilter === 'all') return allAlbums;
    const typeMap: Record<AlbumFilter, string[]> = {
      all: [],
      albums: ['Album'],
      mixtapes: ['Mixtape'],
      eps: ['EP', 'Single'],
    };
    return allAlbums.filter(a => typeMap[albumFilter].includes(a.releaseType));
  }, [allAlbums, albumFilter]);

  const filteredSongs = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    return songs.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.artist.toLowerCase().includes(q) ||
      s.album.toLowerCase().includes(q) ||
      s.genre.toLowerCase().includes(q)
    );
  }, [songs, searchQuery]);

  const artistSongs = useMemo(() => {
    if (!selectedArtist) return [];
    return songs.filter(s => s.artist === selectedArtist).sort((a, b) => {
      if (a.album !== b.album) return a.album.localeCompare(b.album);
      return a.trackNumber - b.trackNumber;
    });
  }, [songs, selectedArtist]);

  const artistAlbums = useMemo(() => {
    if (!selectedArtist) return [];
    const map = new Map<string, { year: string; artUrl: string; count: number }>();
    artistSongs.forEach(s => {
      if (!map.has(s.album)) map.set(s.album, { year: s.year, artUrl: s.albumArtUrl, count: 0 });
      map.get(s.album)!.count++;
    });
    return Array.from(map.entries()).map(([name, data]) => ({
      name, artist: selectedArtist, year: data.year, artUrl: data.artUrl, songCount: data.count,
    }));
  }, [artistSongs, selectedArtist]);

  const albumSongs = useMemo(() => {
    if (!selectedAlbum) return [];
    return songs.filter(s => s.album === selectedAlbum.name && s.artist === selectedAlbum.artist)
      .sort((a, b) => a.trackNumber - b.trackNumber);
  }, [songs, selectedAlbum]);

  // ─── Audio handlers ───

  const handleNextRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const playSong = useCallback((song: Song, songList?: Song[]) => {
    if (!song.url) {
      setCurrentSong(song);
      setIsPlaying(false);
      return;
    }
    setCurrentSong(song);
    setQueue(songList || songs);
    setCurrentTime(0);
    setDuration(0);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }, 100);
  }, [songs]);

  const togglePlay = useCallback(() => {
    if (!audioRef.current || !currentSong?.url) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [isPlaying, currentSong]);

  const handleSeek = useCallback((value: number) => {
    setCurrentTime(value);
    if (audioRef.current) audioRef.current.currentTime = value;
  }, []);

  const handlePrev = useCallback(() => {
    if (!currentSong || queue.length === 0) return;
    if (currentTime > 3 && audioRef.current) {
      audioRef.current.currentTime = 0;
      return;
    }
    const idx = queue.findIndex(s => s.id === currentSong.id);
    const prevIdx = idx <= 0 ? queue.length - 1 : idx - 1;
    playSong(queue[prevIdx], queue);
  }, [currentSong, queue, currentTime, playSong]);

  const handleNext = useCallback(() => {
    if (!currentSong || queue.length === 0) return;
    if (repeatMode === 'one') {
      if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play(); }
      return;
    }
    const idx = queue.findIndex(s => s.id === currentSong.id);
    let nextIdx: number;
    if (isShuffled) {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else {
      nextIdx = idx >= queue.length - 1 ? 0 : idx + 1;
    }
    if (idx >= queue.length - 1 && repeatMode === 'off' && !isShuffled) {
      setIsPlaying(false);
      return;
    }
    playSong(queue[nextIdx], queue);
  }, [currentSong, queue, repeatMode, isShuffled, playSong]);

  handleNextRef.current = handleNext;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onEnded = () => handleNextRef.current();
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
    };
  }, [currentSong]);

  const toggleFavorite = useCallback((songId: string) => {
    setSongs(prev => prev.map(s => s.id === songId ? { ...s, isFavorite: !s.isFavorite } : s));
  }, []);

  // ─── File import & auto-tagging ───

  const handleFileImport = useCallback(async (files: FileList) => {
    const newSongs: Song[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('audio/')) continue;
      const url = URL.createObjectURL(file);
      const parsed = parseFileName(file.name);
      newSongs.push({
        id: generateId(),
        fileName: file.name,
        url,
        title: parsed.title,
        artist: parsed.artist,
        album: 'Unknown Album',
        year: '',
        genre: '',
        trackNumber: 0,
        albumArtUrl: '',
        lyrics: '',
        duration: 0,
        isTagging: true,
        isFavorite: false,
        releaseType: '',
        featuredArtists: parsed.featuredArtists,
      });
    }
    if (newSongs.length === 0) return;
    setSongs(prev => [...prev, ...newSongs]);
    setTaggingStatus({ total: newSongs.length, completed: 0, current: newSongs[0].title, isActive: true });

    for (let i = 0; i < newSongs.length; i++) {
      const song = newSongs[i];
      setTaggingStatus(prev => ({ ...prev, current: song.title, completed: i }));
      try {
        const metadata = await tagMusicMetadata({ filePath: song.fileName });
        let albumArtUrl = metadata.albumArtUrl || '';
        if (!albumArtUrl && metadata.title && metadata.artist) {
          try {
            const artResult = await generateAlbumArt({
              songTitle: metadata.title,
              artistName: metadata.artist,
              albumName: metadata.album || undefined,
            });
            albumArtUrl = artResult.albumArtUrl || '';
          } catch {}
        }
        let lyrics = '';
        if (metadata.title && metadata.artist) {
          try {
            const lyricsResult = await scrapeAndSyncLyrics({
              title: metadata.title,
              artist: metadata.artist,
            });
            lyrics = lyricsResult.lyrics.text || '';
          } catch {}
        }
        setSongs(prev => prev.map(s => s.id === song.id ? {
          ...s,
          title: metadata.title || s.title,
          artist: metadata.artist || s.artist,
          album: metadata.album || s.album,
          year: metadata.year || s.year,
          genre: metadata.genre || s.genre,
          trackNumber: metadata.trackNumber || s.trackNumber,
          albumArtUrl,
          lyrics,
          isTagging: false,
          releaseType: metadata.releaseType || s.releaseType,
          featuredArtists: metadata.featuredArtists || s.featuredArtists,
        } : s));
      } catch {
        setSongs(prev => prev.map(s => s.id === song.id ? { ...s, isTagging: false } : s));
      }
    }
    setTaggingStatus(prev => ({ ...prev, isActive: false, completed: prev.total }));
  }, []);

  // ─── Fetch lyrics on demand ───

  const fetchLyrics = useCallback(async (song: Song) => {
    if (song.lyrics) return;
    try {
      const result = await scrapeAndSyncLyrics({ title: song.title, artist: song.artist });
      setSongs(prev => prev.map(s => s.id === song.id ? { ...s, lyrics: result.lyrics.text } : s));
      if (currentSong?.id === song.id) {
        setCurrentSong(prev => prev ? { ...prev, lyrics: result.lyrics.text } : prev);
      }
    } catch {}
  }, [currentSong]);

  // ─── Batch album editing ───

  const startAlbumEdit = useCallback((albumName: string, artistName: string) => {
    const firstSong = songs.find(s => s.album === albumName && s.artist === artistName);
    setEditForm({
      artist: artistName,
      album: albumName,
      year: firstSong?.year || '',
      genre: firstSong?.genre || '',
      releaseType: firstSong?.releaseType || 'Album',
    });
    setEditingAlbum({ name: albumName, artist: artistName });
  }, [songs]);

  const saveAlbumEdit = useCallback(() => {
    if (!editingAlbum) return;
    setSongs(prev => prev.map(s => {
      if (s.album === editingAlbum.name && s.artist === editingAlbum.artist) {
        return {
          ...s,
          artist: editForm.artist || s.artist,
          album: editForm.album || s.album,
          year: editForm.year || s.year,
          genre: editForm.genre || s.genre,
          releaseType: editForm.releaseType || s.releaseType,
        };
      }
      return s;
    }));
    if (selectedAlbum?.name === editingAlbum.name && selectedAlbum?.artist === editingAlbum.artist) {
      setSelectedAlbum({ name: editForm.album || editingAlbum.name, artist: editForm.artist || editingAlbum.artist });
    }
    setEditingAlbum(null);
  }, [editingAlbum, editForm, selectedAlbum]);

  // ─── Navigation ───

  const goBack = useCallback(() => {
    if (selectedAlbum) { setSelectedAlbum(null); return; }
    if (selectedArtist) { setSelectedArtist(null); return; }
    if (showSearch) { setShowSearch(false); setSearchQuery(''); return; }
  }, [selectedAlbum, selectedArtist, showSearch]);

  const currentView = selectedAlbum ? 'album' : selectedArtist ? 'artist' : showSearch ? 'search' : 'library';

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileImport(e.dataTransfer.files);
    }
  }, [handleFileImport]);

  // ═══════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════

  return (
    <div
      className="relative w-full max-w-md mx-auto h-screen flex flex-col bg-background overflow-hidden select-none"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >

      {/* ─── Header ─── */}
      <header className="flex items-center justify-between px-4 py-3 z-20">
        {currentView !== 'library' ? (
          <button onClick={goBack} className="p-2 -ml-2 text-foreground/80 hover:text-foreground transition-colors">
            <ChevronLeft size={24} />
          </button>
        ) : (
          <button onClick={() => setShowDrawer(true)} className="p-2 -ml-2 text-foreground/80 hover:text-foreground transition-colors">
            <Menu size={24} />
          </button>
        )}
        <h1 className="text-lg font-semibold tracking-wide">
          {currentView === 'artist' ? selectedArtist :
           currentView === 'album' ? selectedAlbum?.name :
           currentView === 'search' ? 'Search' :
           'Muzio AI'}
        </h1>
        <div className="flex items-center gap-1">
          {currentView === 'library' && (
            <button onClick={() => setShowSearch(true)} className="p-2 text-foreground/80 hover:text-foreground transition-colors">
              <Search size={20} />
            </button>
          )}
          <button className="p-2 text-foreground/80 hover:text-foreground transition-colors">
            <MoreVertical size={20} />
          </button>
        </div>
      </header>

      {/* ─── Tab Bar (library view only) ─── */}
      {currentView === 'library' && (
        <div className="flex border-b border-border/30 px-2">
          {(['artists', 'songs', 'albums', 'playlists'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium capitalize transition-colors relative ${
                activeTab === tab ? 'text-foreground' : 'text-foreground/50 hover:text-foreground/70'
              }`}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-2 right-2 h-[3px] bg-amber-400 rounded-full" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* ─── Search Bar ─── */}
      {currentView === 'search' && (
        <div className="px-4 py-3">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" />
            <input
              type="text"
              placeholder="Search songs, artists, albums..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
              className="w-full pl-10 pr-4 py-2.5 bg-secondary rounded-xl text-sm text-foreground placeholder:text-foreground/40 outline-none focus:ring-2 focus:ring-primary/50"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40">
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── Main Content ─── */}
      <main className="flex-1 overflow-y-auto scrollbar-hide pb-24">

        {/* Library: Artists Tab */}
        {currentView === 'library' && activeTab === 'artists' && (
          <div className="divide-y divide-border/20">
            {artists.map(artist => (
              <button
                key={artist.name}
                onClick={() => setSelectedArtist(artist.name)}
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
              >
                <div className="relative">
                  {artist.artUrls.length > 0 ? (
                    <img src={artist.artUrls[0]} alt={artist.name} className="w-14 h-14 rounded-full object-cover" />
                  ) : (
                    <ArtPlaceholder text={artist.name} size={56} round />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-foreground truncate">{artist.name}</p>
                  <p className="text-[13px] text-primary/80 mt-0.5">
                    {artist.albumCount} {artist.albumCount === 1 ? 'Album' : 'Albums'} • {artist.songCount} {artist.songCount === 1 ? 'Song' : 'Songs'}
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); }}
                  className="p-2 text-foreground/40 hover:text-foreground/70 transition-colors"
                >
                  <MoreVertical size={18} />
                </button>
              </button>
            ))}
          </div>
        )}

        {/* Library: Songs Tab */}
        {currentView === 'library' && activeTab === 'songs' && (
          <div className="divide-y divide-border/20">
            {songs.sort((a, b) => a.title.localeCompare(b.title)).map(song => (
              <button
                key={song.id}
                onClick={() => playSong(song)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left ${
                  currentSong?.id === song.id ? 'bg-primary/10' : ''
                }`}
              >
                {song.albumArtUrl ? (
                  <img src={song.albumArtUrl} alt={song.album} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <ArtPlaceholder text={song.album || song.title} size={48} />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-[14px] font-medium truncate ${currentSong?.id === song.id ? 'text-primary' : 'text-foreground'}`}>
                    {song.title}
                    {song.featuredArtists && <span className="text-foreground/40 font-normal"> ft. {song.featuredArtists}</span>}
                  </p>
                  <p className="text-[12px] text-foreground/50 truncate mt-0.5">
                    {song.artist} {song.album ? `• ${song.album}` : ''}
                    {song.releaseType === 'Mixtape' && <span className="text-amber-400/70"> • Mixtape</span>}
                  </p>
                </div>
                {song.isTagging && <Loader2 size={16} className="animate-spin text-primary flex-shrink-0" />}
                <span className="text-[11px] text-foreground/40 flex-shrink-0">{formatTime(song.duration)}</span>
                <button
                  onClick={e => { e.stopPropagation(); toggleFavorite(song.id); }}
                  className="p-1.5 flex-shrink-0"
                >
                  <Heart size={16} className={song.isFavorite ? 'fill-red-500 text-red-500' : 'text-foreground/30'} />
                </button>
              </button>
            ))}
          </div>
        )}

        {/* Library: Albums Tab */}
        {currentView === 'library' && activeTab === 'albums' && (
          <div>
            {/* Filter chips */}
            <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
              {([
                ['all', 'All'],
                ['albums', 'Albums'],
                ['mixtapes', 'Mixtapes'],
                ['eps', 'EPs & Singles'],
              ] as [AlbumFilter, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAlbumFilter(key)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    albumFilter === key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-foreground/60 hover:text-foreground/80'
                  }`}
                >
                  {label}
                  <span className="ml-1.5 opacity-60">
                    {key === 'all' ? allAlbums.length :
                     key === 'albums' ? allAlbums.filter(a => a.releaseType === 'Album').length :
                     key === 'mixtapes' ? allAlbums.filter(a => a.releaseType === 'Mixtape').length :
                     allAlbums.filter(a => a.releaseType === 'EP' || a.releaseType === 'Single').length}
                  </span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4 px-4 pb-4">
              {albums.map(album => (
                <button
                  key={`${album.name}-${album.artist}`}
                  onClick={() => setSelectedAlbum({ name: album.name, artist: album.artist })}
                  className="text-left group"
                >
                  <div className="aspect-square rounded-xl overflow-hidden mb-2 shadow-lg relative">
                    {album.artUrl ? (
                      <img src={album.artUrl} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : (
                      <ArtPlaceholder text={album.name} size={200} />
                    )}
                    {album.releaseType && album.releaseType !== 'Album' && (
                      <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide shadow-md ${
                        album.releaseType === 'Mixtape' ? 'bg-amber-500/90 text-black' :
                        album.releaseType === 'EP' ? 'bg-violet-500/90 text-white' :
                        'bg-emerald-500/90 text-white'
                      }`}>
                        {album.releaseType}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] font-medium text-foreground truncate">{album.name}</p>
                  <p className="text-[11px] text-foreground/50 truncate">{album.artist} • {album.year || '—'}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Library: Playlists Tab */}
        {currentView === 'library' && activeTab === 'playlists' && (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-4">
              <ListMusic size={32} className="text-foreground/40" />
            </div>
            <p className="text-foreground/60 text-sm mb-1">No playlists yet</p>
            <p className="text-foreground/40 text-xs mb-6">Create a playlist to organize your music</p>
            <button className="px-6 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/90 transition-colors">
              Create Playlist
            </button>
          </div>
        )}

        {/* Search Results */}
        {currentView === 'search' && searchQuery && (
          <div>
            {filteredSongs.length === 0 ? (
              <div className="text-center py-12 text-foreground/40 text-sm">No results found</div>
            ) : (
              <div className="divide-y divide-border/20">
                {filteredSongs.map(song => (
                  <button
                    key={song.id}
                    onClick={() => playSong(song, filteredSongs)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
                  >
                    {song.albumArtUrl ? (
                      <img src={song.albumArtUrl} alt={song.album} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <ArtPlaceholder text={song.album || song.title} size={48} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-foreground truncate">{song.title}</p>
                      <p className="text-[12px] text-foreground/50 truncate mt-0.5">{song.artist} • {song.album}</p>
                    </div>
                    <span className="text-[11px] text-foreground/40">{formatTime(song.duration)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Artist Detail View */}
        {currentView === 'artist' && selectedArtist && (
          <div>
            {/* Artist header */}
            <div className="flex flex-col items-center py-6 px-4">
              <ArtPlaceholder text={selectedArtist} size={120} round />
              <h2 className="text-xl font-bold mt-4">{selectedArtist}</h2>
              <p className="text-primary/80 text-sm mt-1">
                {artistAlbums.length} {artistAlbums.length === 1 ? 'Album' : 'Albums'} • {artistSongs.length} {artistSongs.length === 1 ? 'Song' : 'Songs'}
              </p>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => { if (artistSongs.length > 0) playSong(artistSongs[0], artistSongs); }}
                  className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium"
                >
                  <Play size={16} fill="currentColor" /> Play All
                </button>
                <button className="flex items-center gap-2 px-6 py-2 bg-secondary text-foreground rounded-full text-sm font-medium">
                  <Shuffle size={16} /> Shuffle
                </button>
              </div>
            </div>
            {/* Albums */}
            {artistAlbums.length > 0 && (
              <div className="px-4 mb-4">
                <h3 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-3">Albums</h3>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  {artistAlbums.map(album => {
                    const releaseType = songs.find(s => s.album === album.name && s.artist === album.artist)?.releaseType || '';
                    return (
                      <button
                        key={album.name}
                        onClick={() => setSelectedAlbum({ name: album.name, artist: album.artist })}
                        className="flex-shrink-0 w-32 text-left"
                      >
                        <div className="w-32 h-32 rounded-xl overflow-hidden mb-2 shadow-lg relative">
                          {album.artUrl ? (
                            <img src={album.artUrl} alt={album.name} className="w-full h-full object-cover" />
                          ) : (
                            <ArtPlaceholder text={album.name} size={128} />
                          )}
                          {releaseType && releaseType !== 'Album' && (
                            <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase shadow-md ${
                              releaseType === 'Mixtape' ? 'bg-amber-500/90 text-black' :
                              releaseType === 'EP' ? 'bg-violet-500/90 text-white' :
                              'bg-emerald-500/90 text-white'
                            }`}>
                              {releaseType}
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] font-medium text-foreground truncate">{album.name}</p>
                        <p className="text-[11px] text-foreground/50">{album.year}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Songs */}
            <div className="px-4">
              <h3 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider mb-2">Songs</h3>
            </div>
            <div className="divide-y divide-border/20">
              {artistSongs.map((song, idx) => (
                <button
                  key={song.id}
                  onClick={() => playSong(song, artistSongs)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left ${
                    currentSong?.id === song.id ? 'bg-primary/10' : ''
                  }`}
                >
                  <span className="w-6 text-center text-[12px] text-foreground/40 flex-shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[14px] font-medium truncate ${currentSong?.id === song.id ? 'text-primary' : 'text-foreground'}`}>
                      {song.title}
                    </p>
                    <p className="text-[12px] text-foreground/50 truncate mt-0.5">{song.album}</p>
                  </div>
                  <span className="text-[11px] text-foreground/40 flex-shrink-0">{formatTime(song.duration)}</span>
                  <MoreVertical size={16} className="text-foreground/30 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Album Detail View */}
        {currentView === 'album' && selectedAlbum && (
          <div>
            <div className="flex flex-col items-center py-6 px-4">
              <div className="w-48 h-48 rounded-xl overflow-hidden shadow-2xl">
                {(() => {
                  const firstSong = albumSongs[0];
                  return firstSong?.albumArtUrl ? (
                    <img src={firstSong.albumArtUrl} alt={selectedAlbum.name} className="w-full h-full object-cover" />
                  ) : (
                    <ArtPlaceholder text={selectedAlbum.name} size={192} />
                  );
                })()}
              </div>
              <h2 className="text-lg font-bold mt-4 text-center">{selectedAlbum.name}</h2>
              <p className="text-primary/80 text-sm mt-1">{selectedAlbum.artist}</p>
              <div className="flex items-center gap-2 mt-1">
                {albumSongs[0]?.releaseType && (
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                    albumSongs[0].releaseType === 'Mixtape' ? 'bg-amber-500/20 text-amber-400' :
                    albumSongs[0].releaseType === 'EP' ? 'bg-violet-500/20 text-violet-400' :
                    albumSongs[0].releaseType === 'Single' ? 'bg-emerald-500/20 text-emerald-400' :
                    'bg-primary/20 text-primary'
                  }`}>
                    {albumSongs[0].releaseType}
                  </span>
                )}
                {albumSongs[0]?.year && <span className="text-foreground/40 text-xs">{albumSongs[0].year}</span>}
                {albumSongs[0]?.genre && <span className="text-foreground/40 text-xs">• {albumSongs[0].genre}</span>}
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => { if (albumSongs.length > 0) playSong(albumSongs[0], albumSongs); }}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-full text-sm font-medium"
                >
                  <Play size={16} fill="currentColor" /> Play
                </button>
                <button className="flex items-center gap-2 px-5 py-2 bg-secondary text-foreground rounded-full text-sm font-medium">
                  <Shuffle size={16} /> Shuffle
                </button>
                <button
                  onClick={() => startAlbumEdit(selectedAlbum.name, selectedAlbum.artist)}
                  className="flex items-center gap-2 px-5 py-2 bg-secondary text-foreground rounded-full text-sm font-medium"
                >
                  <Edit3 size={16} /> Edit
                </button>
              </div>
            </div>
            <div className="divide-y divide-border/20">
              {albumSongs.map((song, idx) => (
                <button
                  key={song.id}
                  onClick={() => playSong(song, albumSongs)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left ${
                    currentSong?.id === song.id ? 'bg-primary/10' : ''
                  }`}
                >
                  <span className="w-6 text-center text-[13px] text-foreground/40 flex-shrink-0">
                    {song.trackNumber || idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[14px] font-medium truncate ${currentSong?.id === song.id ? 'text-primary' : 'text-foreground'}`}>
                      {song.title}
                    </p>
                  </div>
                  {song.isTagging && <Loader2 size={14} className="animate-spin text-primary flex-shrink-0" />}
                  <span className="text-[11px] text-foreground/40 flex-shrink-0">{formatTime(song.duration)}</span>
                  <button
                    onClick={e => { e.stopPropagation(); toggleFavorite(song.id); }}
                    className="p-1 flex-shrink-0"
                  >
                    <Heart size={14} className={song.isFavorite ? 'fill-red-500 text-red-500' : 'text-foreground/30'} />
                  </button>
                </button>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ─── Tagging Progress Banner ─── */}
      {taggingStatus.isActive && (
        <div className="absolute top-14 left-4 right-4 z-30 bg-card border border-border/50 rounded-xl p-3 shadow-xl animate-slide-down">
          <div className="flex items-center gap-3">
            <Loader2 size={18} className="animate-spin text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground/70">Auto-tagging music...</p>
              <p className="text-[11px] text-foreground/40 truncate">{taggingStatus.current}</p>
            </div>
            <span className="text-xs text-primary font-medium">{taggingStatus.completed}/{taggingStatus.total}</span>
          </div>
          <div className="mt-2 h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${(taggingStatus.completed / taggingStatus.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ─── Mini Player ─── */}
      {currentSong && !showNowPlaying && (
        <div className="absolute bottom-0 left-0 right-0 z-20">
          <button
            onClick={() => setShowNowPlaying(true)}
            className="w-full bg-card/95 backdrop-blur-lg border-t border-border/30 px-4 py-3 flex items-center gap-3 text-left"
          >
            {currentSong.albumArtUrl ? (
              <img src={currentSong.albumArtUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <ArtPlaceholder text={currentSong.album || currentSong.title} size={48} />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground truncate">{currentSong.title}</p>
              <p className="text-[11px] text-foreground/50 truncate">{currentSong.artist}</p>
            </div>
            <button
              onClick={e => { e.stopPropagation(); togglePlay(); }}
              className="p-2 text-foreground hover:text-primary transition-colors"
            >
              {isPlaying ? <Pause size={22} /> : <Play size={22} fill="currentColor" />}
            </button>
            <button
              onClick={e => { e.stopPropagation(); handleNext(); }}
              className="p-2 text-foreground/60 hover:text-foreground transition-colors"
            >
              <SkipForward size={20} />
            </button>
          </button>
          {/* Progress line */}
          <div className="h-[2px] bg-border/30">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* ─── Now Playing Full Screen ─── */}
      {showNowPlaying && currentSong && (
        <div className="absolute inset-0 z-40 bg-background flex flex-col animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => { setShowNowPlaying(false); setShowLyrics(false); }} className="p-2 -ml-2">
              <ChevronDown size={24} className="text-foreground/80" />
            </button>
            <div className="text-center">
              <p className="text-[11px] text-foreground/50 uppercase tracking-wider">Now Playing</p>
            </div>
            <button className="p-2 -mr-2">
              <MoreVertical size={20} className="text-foreground/80" />
            </button>
          </div>

          {showLyrics ? (
            /* Lyrics View */
            <div className="flex-1 flex flex-col px-6 overflow-hidden">
              <div className="flex items-center gap-3 mb-4">
                {currentSong.albumArtUrl ? (
                  <img src={currentSong.albumArtUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
                ) : (
                  <ArtPlaceholder text={currentSong.album || currentSong.title} size={48} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{currentSong.title}</p>
                  <p className="text-xs text-foreground/50 truncate">{currentSong.artist}</p>
                </div>
                <button onClick={() => setShowLyrics(false)} className="p-2 text-primary text-xs font-medium">
                  Art
                </button>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-hide pb-4">
                {currentSong.lyrics ? (
                  <p className="text-[15px] leading-relaxed text-foreground/80 whitespace-pre-wrap">{currentSong.lyrics}</p>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <Mic2 size={40} className="text-foreground/20 mb-4" />
                    <p className="text-foreground/40 text-sm mb-3">No lyrics available</p>
                    <button
                      onClick={() => fetchLyrics(currentSong)}
                      className="px-4 py-2 bg-primary/20 text-primary rounded-full text-xs font-medium"
                    >
                      Fetch Lyrics with AI
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Album Art View */
            <div className="flex-1 flex flex-col items-center justify-center px-8">
              <div className="w-72 h-72 rounded-2xl overflow-hidden shadow-2xl mb-8 np-art">
                {currentSong.albumArtUrl ? (
                  <img src={currentSong.albumArtUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ArtPlaceholder text={currentSong.album || currentSong.title} size={288} />
                )}
              </div>
              <div className="w-full text-center mb-2">
                <h2 className="text-xl font-bold truncate">
                  {currentSong.title}
                  {currentSong.featuredArtists && (
                    <span className="text-foreground/40 text-base font-normal"> ft. {currentSong.featuredArtists}</span>
                  )}
                </h2>
                <p className="text-foreground/60 text-sm mt-1">{currentSong.artist}</p>
                {currentSong.album && (
                  <div className="flex items-center justify-center gap-2 mt-0.5">
                    <p className="text-foreground/40 text-xs">{currentSong.album} {currentSong.year ? `(${currentSong.year})` : ''}</p>
                    {currentSong.releaseType && currentSong.releaseType !== 'Album' && (
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-semibold ${
                        currentSong.releaseType === 'Mixtape' ? 'bg-amber-500/20 text-amber-400' :
                        currentSong.releaseType === 'EP' ? 'bg-violet-500/20 text-violet-400' :
                        'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {currentSong.releaseType}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="px-6 pb-8">
            {/* Progress */}
            <div className="mb-4">
              <input
                type="range"
                min={0}
                max={duration || 0}
                value={currentTime}
                onChange={e => handleSeek(parseFloat(e.target.value))}
                className="w-full h-1 progress-slider"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[11px] text-foreground/40">{formatTime(currentTime)}</span>
                <span className="text-[11px] text-foreground/40">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Main controls */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setIsShuffled(!isShuffled)}
                className={`p-2 transition-colors ${isShuffled ? 'text-primary' : 'text-foreground/40'}`}
              >
                <Shuffle size={20} />
              </button>
              <button onClick={handlePrev} className="p-2 text-foreground hover:text-foreground/80 transition-colors">
                <SkipBack size={28} fill="currentColor" />
              </button>
              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors shadow-lg"
              >
                {isPlaying ? <Pause size={28} /> : <Play size={28} fill="currentColor" className="ml-1" />}
              </button>
              <button onClick={handleNext} className="p-2 text-foreground hover:text-foreground/80 transition-colors">
                <SkipForward size={28} fill="currentColor" />
              </button>
              <button
                onClick={() => setRepeatMode(m => m === 'off' ? 'all' : m === 'all' ? 'one' : 'off')}
                className={`p-2 relative transition-colors ${repeatMode !== 'off' ? 'text-primary' : 'text-foreground/40'}`}
              >
                <Repeat size={20} />
                {repeatMode === 'one' && (
                  <span className="absolute -top-0.5 -right-0.5 text-[9px] font-bold text-primary">1</span>
                )}
              </button>
            </div>

            {/* Bottom row */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => toggleFavorite(currentSong.id)}
                className="p-2"
              >
                <Heart size={20} className={
                  songs.find(s => s.id === currentSong.id)?.isFavorite
                    ? 'fill-red-500 text-red-500'
                    : 'text-foreground/40'
                } />
              </button>
              <button
                onClick={() => { setShowLyrics(!showLyrics); if (!showLyrics && !currentSong.lyrics) fetchLyrics(currentSong); }}
                className={`p-2 transition-colors ${showLyrics ? 'text-primary' : 'text-foreground/40'}`}
              >
                <Mic2 size={20} />
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsMuted(!isMuted)} className="p-1 text-foreground/40">
                  {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={e => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
                  className="w-20 h-1 progress-slider"
                />
              </div>
            </div>

            {/* Song info badges */}
            {(currentSong.genre || currentSong.year || currentSong.releaseType) && (
              <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
                {currentSong.genre && (
                  <span className="px-3 py-1 bg-secondary rounded-full text-[10px] text-foreground/60">{currentSong.genre}</span>
                )}
                {currentSong.year && (
                  <span className="px-3 py-1 bg-secondary rounded-full text-[10px] text-foreground/60">{currentSong.year}</span>
                )}
                {currentSong.releaseType && (
                  <span className={`px-3 py-1 rounded-full text-[10px] font-medium ${
                    currentSong.releaseType === 'Mixtape' ? 'bg-amber-500/15 text-amber-400' :
                    currentSong.releaseType === 'EP' ? 'bg-violet-500/15 text-violet-400' :
                    'bg-secondary text-foreground/60'
                  }`}>{currentSong.releaseType}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Side Drawer ─── */}
      {showDrawer && (
        <>
          <div className="absolute inset-0 bg-black/60 z-40 animate-fade-in" onClick={() => setShowDrawer(false)} />
          <div className="absolute top-0 left-0 bottom-0 w-72 bg-card z-50 shadow-2xl animate-slide-right flex flex-col">
            <div className="p-6 pb-4 border-b border-border/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
                  <Music size={20} className="text-primary-foreground" />
                </div>
                <div>
                  <h2 className="font-bold text-lg">Muzio AI</h2>
                  <p className="text-[11px] text-foreground/50">Smart Music Player</p>
                </div>
              </div>
            </div>
            <nav className="flex-1 py-2">
              <button
                onClick={() => { fileInputRef.current?.click(); setShowDrawer(false); }}
                className="w-full flex items-center gap-4 px-6 py-3.5 text-left hover:bg-secondary/50 transition-colors"
              >
                <Upload size={20} className="text-primary" />
                <span className="text-sm font-medium">Import Files</span>
              </button>
              <button
                onClick={() => { folderInputRef.current?.click(); setShowDrawer(false); }}
                className="w-full flex items-center gap-4 px-6 py-3.5 text-left hover:bg-secondary/50 transition-colors"
              >
                <FolderOpen size={20} className="text-primary" />
                <span className="text-sm font-medium">Import Folder</span>
              </button>
              <button className="w-full flex items-center gap-4 px-6 py-3.5 text-left hover:bg-secondary/50 transition-colors">
                <Heart size={20} className="text-foreground/60" />
                <span className="text-sm">Favorites</span>
              </button>
              <button className="w-full flex items-center gap-4 px-6 py-3.5 text-left hover:bg-secondary/50 transition-colors">
                <Clock size={20} className="text-foreground/60" />
                <span className="text-sm">Recently Played</span>
              </button>
              <div className="my-2 mx-6 border-t border-border/30" />
              <button className="w-full flex items-center gap-4 px-6 py-3.5 text-left hover:bg-secondary/50 transition-colors">
                <Settings size={20} className="text-foreground/60" />
                <span className="text-sm">Settings</span>
              </button>
            </nav>
            <div className="p-4 border-t border-border/30">
              <p className="text-[10px] text-foreground/30 text-center">Muzio AI v1.0 • AI-Powered Music Tagging</p>
            </div>
          </div>
        </>
      )}

      {/* ─── Import FAB (when library is empty or on library view) ─── */}
      {currentView === 'library' && !showNowPlaying && (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="absolute bottom-20 right-4 z-10 w-14 h-14 rounded-full bg-primary shadow-lg flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-all hover:scale-105 active:scale-95"
        >
          <Plus size={24} />
        </button>
      )}

      {/* ─── Batch Album Edit Modal ─── */}
      {editingAlbum && (
        <>
          <div className="absolute inset-0 bg-black/70 z-[55] animate-fade-in" onClick={() => setEditingAlbum(null)} />
          <div className="absolute inset-x-4 top-[15%] z-[56] bg-card rounded-2xl shadow-2xl overflow-hidden animate-slide-up">
            <div className="p-5 border-b border-border/30">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-bold">Edit Album</h3>
                <button onClick={() => setEditingAlbum(null)} className="p-1 text-foreground/40 hover:text-foreground">
                  <X size={20} />
                </button>
              </div>
              <p className="text-xs text-foreground/50">
                Changes apply to all {songs.filter(s => s.album === editingAlbum.name && s.artist === editingAlbum.artist).length} songs
              </p>
            </div>
            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-hide">
              <div>
                <label className="text-[11px] text-foreground/50 uppercase tracking-wider block mb-1.5">Artist</label>
                <input
                  value={editForm.artist}
                  onChange={e => setEditForm(f => ({ ...f, artist: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-secondary rounded-xl text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-[11px] text-foreground/50 uppercase tracking-wider block mb-1.5">Album / Mixtape Name</label>
                <input
                  value={editForm.album}
                  onChange={e => setEditForm(f => ({ ...f, album: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-secondary rounded-xl text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-foreground/50 uppercase tracking-wider block mb-1.5">Year</label>
                  <input
                    value={editForm.year}
                    onChange={e => setEditForm(f => ({ ...f, year: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-secondary rounded-xl text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="2024"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-foreground/50 uppercase tracking-wider block mb-1.5">Genre</label>
                  <input
                    value={editForm.genre}
                    onChange={e => setEditForm(f => ({ ...f, genre: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-secondary rounded-xl text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Hip-Hop"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-foreground/50 uppercase tracking-wider block mb-1.5">Release Type</label>
                <div className="flex gap-2">
                  {['Album', 'Mixtape', 'EP', 'Single'].map(type => (
                    <button
                      key={type}
                      onClick={() => setEditForm(f => ({ ...f, releaseType: type }))}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                        editForm.releaseType === type
                          ? type === 'Mixtape' ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40'
                          : type === 'EP' ? 'bg-violet-500/20 text-violet-400 ring-1 ring-violet-500/40'
                          : 'bg-primary/20 text-primary ring-1 ring-primary/40'
                          : 'bg-secondary text-foreground/50'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-border/30 flex gap-3">
              <button
                onClick={() => setEditingAlbum(null)}
                className="flex-1 py-2.5 bg-secondary rounded-xl text-sm font-medium text-foreground/70"
              >
                Cancel
              </button>
              <button
                onClick={saveAlbumEdit}
                className="flex-1 py-2.5 bg-primary rounded-xl text-sm font-medium text-primary-foreground flex items-center justify-center gap-2"
              >
                <Check size={16} /> Save All
              </button>
            </div>
          </div>
        </>
      )}

      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-[60] bg-background/90 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
          <div className="w-32 h-32 rounded-3xl border-4 border-dashed border-primary/60 flex items-center justify-center mb-6 animate-pulse">
            <Upload size={48} className="text-primary/60" />
          </div>
          <p className="text-lg font-semibold text-foreground">Drop music files here</p>
          <p className="text-sm text-foreground/50 mt-1">MP3, WAV, FLAC, OGG, M4A supported</p>
          <p className="text-xs text-amber-400/70 mt-3">AI will auto-tag metadata, album art & lyrics</p>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={e => { if (e.target.files) handleFileImport(e.target.files); e.target.value = ''; }}
      />

      {/* Hidden folder input */}
      <input
        ref={folderInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={e => { if (e.target.files) handleFileImport(e.target.files); e.target.value = ''; }}
        {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
      />

      {/* Hidden audio element */}
      {currentSong?.url && <audio ref={audioRef} src={currentSong.url} preload="metadata" />}
      {!currentSong?.url && <audio ref={audioRef} preload="metadata" />}
    </div>
  );
}
