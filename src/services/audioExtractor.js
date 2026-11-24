const { spawn, execFile } = require('child_process');
const { isSpotifyUrl, isAppleMusicUrl, resolveSpotify, resolveAppleMusic } = require('./spotifyResolver');

// Common direct audio link extensions
const DIRECT_AUDIO_REGEX = /\.(mp3|wav|ogg|flac|aac|m4a|opus)(\?.*)?$/i;

/**
 * Checks if a string is a valid web URL.
 * @param {string} str
 */
function isUrl(str) {
  try {
    const parsed = new URL(str);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Normalizes YouTube URLs to point directly to the individual video.
 * Removes tracking parameters (&si=, &feature=) and mix/radio playlist parameters (&list=RD..., &index=).
 *
 * @param {string} rawUrl
 * @returns {string}
 */
function normalizeYouTubeUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);

    // youtu.be/<id>
    if (parsed.hostname === 'youtu.be' || parsed.hostname.endsWith('.youtu.be')) {
      const videoId = parsed.pathname.slice(1).split('/')[0].split('?')[0];
      if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
    }

    // youtube.com/shorts/<id>
    if (parsed.pathname.includes('/shorts/')) {
      const parts = parsed.pathname.split('/');
      const idx = parts.indexOf('shorts');
      if (idx !== -1 && parts[idx + 1]) {
        const videoId = parts[idx + 1].split('?')[0];
        if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
      }
    }

    // youtube.com or music.youtube.com with video param ?v=<id>
    if (parsed.hostname.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v) {
        // Strip out &list=RD..., &index=..., &start_radio=..., etc.
        return `https://www.youtube.com/watch?v=${v}`;
      }
    }
  } catch (_) {}

  return rawUrl;
}

/**
 * Checks if a URL is explicitly intended to be a multi-track playlist.
 * (Only pure playlists without an individual video ID).
 *
 * @param {string} rawUrl
 * @returns {boolean}
 */
function isExplicitPlaylistUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    // If it has an individual video ID, the user clicked a specific video!
    if (parsed.searchParams.has('v')) return false;

    // Pure YouTube playlist
    if (parsed.pathname.includes('/playlist') && parsed.searchParams.has('list')) return true;

    // SoundCloud set
    if (parsed.pathname.includes('/sets/')) return true;
  } catch (_) {}

  return false;
}

/**
 * Formats duration from seconds to MM:SS or HH:MM:SS
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatDuration(totalSeconds) {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) return 'Live / Unknown';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);

  const pad = (n) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

/**
 * Executes a fast yt-dlp metadata query extracting title and direct audio stream URL.
 * @param {Array<string>} args
 * @returns {Promise<object>}
 */
function execYtdlFast(args) {
  return new Promise((resolve, reject) => {
    execFile(
      'yt-dlp',
      [
        '--dump-json',
        '-f', 'ba/b',
        '--no-warnings',
        '--geo-bypass',
        '--skip-download',
        ...args
      ],
      { maxBuffer: 10 * 1024 * 1024, timeout: 20000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        try {
          const info = JSON.parse(stdout);
          resolve(info);
        } catch (parseErr) {
          reject(parseErr);
        }
      }
    );
  });
}

/**
 * Pre-fetches direct stream URL for a queued track in the background so it plays with zero lag.
 * @param {object} track
 */
async function prefetchTrackStream(track) {
  if (!track || track.isLocalFile || track.streamUrl) return;

  try {
    const target = track.searchQuery
      ? `ytsearch1:${track.searchQuery}`
      : (track.webpageUrl || track.url);

    const info = await execYtdlFast(['--no-playlist', target]);
    if (info && info.url) {
      track.streamUrl = info.url;
      if (!track.duration && info.duration) {
        track.duration = Math.round(info.duration);
      }
      if (!track.thumbnail && info.thumbnail) {
        track.thumbnail = info.thumbnail;
      }
    }
  } catch (_) {
    // Non-blocking prefetch failure; will fallback during playback
  }
}

/**
 * Extracts metadata and direct stream URL for a query or URL.
 *
 * @param {string} query
 * @param {import('discord.js').User} requester
 * @returns {Promise<{ tracks: Array<object>, isPlaylist: boolean, playlistTitle: string|null }>}
 */
async function extractTracks(query, requester) {
  let trimmed = query.trim();

  // If YouTube link, normalize to ensure exact video target
  if (isUrl(trimmed) && (trimmed.includes('youtube.com') || trimmed.includes('youtu.be'))) {
    trimmed = normalizeYouTubeUrl(trimmed);
  }

  // 1. Check for Spotify Links
  if (isSpotifyUrl(trimmed)) {
    const spotifyResults = await resolveSpotify(trimmed);
    if (spotifyResults.length > 0) {
      // Single Spotify Track: resolve to exact YouTube audio link immediately
      if (spotifyResults.length === 1) {
        const s = spotifyResults[0];
        try {
          const ytInfo = await execYtdlFast(['--no-playlist', `ytsearch1:${s.query}`]);
          return {
            tracks: [
              {
                title: s.title,
                artist: s.artist || ytInfo.uploader || 'Spotify Artist',
                duration: s.duration || Math.round(ytInfo.duration || 0),
                url: ytInfo.webpage_url || ytInfo.original_url,
                webpageUrl: ytInfo.webpage_url || ytInfo.original_url,
                streamUrl: ytInfo.url || null, // Direct stream URL for instant start!
                searchQuery: null,
                isLocalFile: false,
                source: 'Spotify',
                thumbnail: s.thumbnail || ytInfo.thumbnail || null,
                requester
              }
            ],
            isPlaylist: false,
            playlistTitle: null
          };
        } catch (err) {
          console.warn('[AudioExtractor] Spotify direct resolve fallback:', err.message);
        }
      }

      // Spotify Playlist or Album
      const tracks = spotifyResults.map((s, idx) => ({
        title: s.title,
        artist: s.artist || 'Spotify Artist',
        duration: s.duration || 0,
        url: s.url,
        webpageUrl: s.url,
        streamUrl: null,
        searchQuery: s.query,
        isLocalFile: false,
        source: 'Spotify',
        thumbnail: s.thumbnail || 'https://cdn-icons-png.flaticon.com/512/174/174872.png',
        requester
      }));

      // Resolve the very first track immediately so playback starts instantly
      if (tracks.length > 0) {
        prefetchTrackStream(tracks[0]).catch(() => {});
      }

      return {
        tracks,
        isPlaylist: tracks.length > 1,
        playlistTitle: tracks.length > 1 ? `Spotify Collection (${tracks.length} tracks)` : null
      };
    }
  }

  // 2. Check for Apple Music Links
  if (isAppleMusicUrl(trimmed)) {
    const appleResults = await resolveAppleMusic(trimmed);
    if (appleResults.length > 0) {
      if (appleResults.length === 1) {
        const a = appleResults[0];
        try {
          const ytInfo = await execYtdlFast(['--no-playlist', `ytsearch1:${a.query}`]);
          return {
            tracks: [
              {
                title: a.title,
                artist: a.artist || ytInfo.uploader || 'Apple Music',
                duration: a.duration || Math.round(ytInfo.duration || 0),
                url: ytInfo.webpage_url || ytInfo.original_url,
                webpageUrl: ytInfo.webpage_url || ytInfo.original_url,
                streamUrl: ytInfo.url || null,
                searchQuery: null,
                isLocalFile: false,
                source: 'Apple Music',
                thumbnail: a.thumbnail || ytInfo.thumbnail || null,
                requester
              }
            ],
            isPlaylist: false,
            playlistTitle: null
          };
        } catch (err) {
          console.warn('[AudioExtractor] Apple Music direct resolve fallback:', err.message);
        }
      }

      const tracks = appleResults.map((a) => ({
        title: a.title,
        artist: a.artist || 'Apple Music Artist',
        duration: 0,
        url: a.url,
        webpageUrl: a.url,
        streamUrl: null,
        searchQuery: a.query,
        isLocalFile: false,
        source: 'Apple Music',
        thumbnail: a.thumbnail || 'https://cdn-icons-png.flaticon.com/512/732/732225.png',
        requester
      }));

      if (tracks.length > 0) {
        prefetchTrackStream(tracks[0]).catch(() => {});
      }

      return {
        tracks,
        isPlaylist: tracks.length > 1,
        playlistTitle: tracks.length > 1 ? `Apple Music Collection` : null
      };
    }
  }

  // 3. Direct Audio URL (.mp3, .ogg, radio streams)
  if (isUrl(trimmed) && DIRECT_AUDIO_REGEX.test(trimmed)) {
    const parsed = new URL(trimmed);
    const fileName = parsed.pathname.split('/').pop() || 'Direct Stream';
    return {
      tracks: [
        {
          title: decodeURIComponent(fileName.replace(/[_-]/g, ' ')),
          artist: parsed.hostname,
          duration: 0,
          url: trimmed,
          webpageUrl: trimmed,
          streamUrl: trimmed, // Direct URL is already the audio stream!
          searchQuery: null,
          isLocalFile: false,
          isDirectStream: true,
          source: 'Direct Audio Stream',
          thumbnail: 'https://cdn-icons-png.flaticon.com/512/2875/2875433.png',
          requester
        }
      ],
      isPlaylist: false,
      playlistTitle: null
    };
  }

  // 4. Pure Multi-Track Playlist (e.g. /playlist?list=PL... or soundcloud /sets/)
  if (isUrl(trimmed) && isExplicitPlaylistUrl(trimmed)) {
    try {
      const playlistOutput = await new Promise((resolve, reject) => {
        execFile(
          'yt-dlp',
          [
            '--flat-playlist',
            '--dump-json',
            '--no-warnings',
            '--geo-bypass',
            trimmed
          ],
          { maxBuffer: 10 * 1024 * 1024, timeout: 30000 },
          (err, stdout) => {
            if (err) return reject(err);
            resolve(stdout);
          }
        );
      });

      const lines = playlistOutput.trim().split('\n').filter(Boolean);
      const tracks = [];
      let playlistTitle = 'Web Playlist';

      for (const line of lines) {
        try {
          const item = JSON.parse(line);
          if (item.playlist_title || item.playlist) {
            playlistTitle = item.playlist_title || item.playlist;
          }
          tracks.push({
            title: item.title || 'Unknown Title',
            artist: item.uploader || item.channel || 'Unknown Artist',
            duration: Math.round(item.duration || 0),
            url: item.url || item.webpage_url || `https://www.youtube.com/watch?v=${item.id}`,
            webpageUrl: item.webpage_url || item.url || `https://www.youtube.com/watch?v=${item.id}`,
            streamUrl: null,
            searchQuery: null,
            isLocalFile: false,
            source: item.extractor_key || 'Web Stream',
            thumbnail: item.thumbnails?.[item.thumbnails.length - 1]?.url || null,
            requester
          });
        } catch (_) {}
      }

      if (tracks.length > 0) {
        // Resolve the first track immediately so playlist playback begins without delay
        prefetchTrackStream(tracks[0]).catch(() => {});

        return {
          tracks,
          isPlaylist: true,
          playlistTitle: `${playlistTitle} (${tracks.length} tracks)`
        };
      }
    } catch (err) {
      console.warn('[AudioExtractor] Playlist extraction failed, falling back to single:', err.message);
    }
  }

  // 5. Standard Extraction (Exact Single Video Link or Search Keyword)
  const ytdlArgs = ['--no-playlist'];

  if (isUrl(trimmed)) {
    // If it's a direct URL, pass the URL directly without default-search
    ytdlArgs.push(trimmed);
  } else {
    // If it's text search, use ytsearch
    ytdlArgs.push('--default-search', 'ytsearch', trimmed);
  }

  const info = await execYtdlFast(ytdlArgs);

  const track = {
    title: info.title || 'Unknown Title',
    artist: info.uploader || info.channel || info.artist || 'Unknown Artist',
    duration: Math.round(info.duration || 0),
    url: info.webpage_url || info.original_url || trimmed,
    webpageUrl: info.webpage_url || info.original_url || trimmed,
    streamUrl: info.url || null, // Direct high-speed CDN audio stream URL
    searchQuery: null,
    isLocalFile: false,
    source: info.extractor_key || 'Web Stream',
    thumbnail: info.thumbnail || info.thumbnails?.[info.thumbnails.length - 1]?.url || null,
    requester
  };

  return {
    tracks: [track],
    isPlaylist: false,
    playlistTitle: null
  };
}

/**
 * Spawns the audio playback pipeline with instant FFmpeg direct stream initiation.
 *
 * @param {object} track
 * @param {number} [seekSeconds=0]
 * @returns {{ stream: import('stream').Readable, cleanup: () => void }}
 */
function createAudioStream(track, seekSeconds = 0) {
  const processes = [];

  const cleanup = () => {
    for (const proc of processes) {
      try {
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
      } catch (_) {}
    }
  };

  // Case 1: Local File (Instant start: ~50ms)
  if (track.isLocalFile && track.localPath) {
    const ffmpegArgs = [
      '-ss', String(seekSeconds),
      '-i', track.localPath,
      '-vn',
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1'
    ];

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    processes.push(ffmpeg);

    ffmpeg.stderr.on('data', () => {});
    ffmpeg.on('error', (err) => console.error('[FFmpeg Local Error]:', err.message));
    ffmpeg.stdout.on('close', cleanup);

    return { stream: ffmpeg.stdout, cleanup };
  }

  // Case 2: Instant Direct Stream URL (Starts in ~250ms without re-running yt-dlp)
  if (track.streamUrl) {
    const ffmpegArgs = [
      '-ss', String(seekSeconds),
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-analyzeduration', '0',
      '-probesize', '32768',
      '-loglevel', 'error',
      '-i', track.streamUrl,
      '-vn',
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1'
    ];

    const ffmpeg = spawn('ffmpeg', ffmpegArgs);
    processes.push(ffmpeg);

    ffmpeg.stderr.on('data', () => {});
    ffmpeg.on('error', (err) => console.error('[FFmpeg Direct Stream Error]:', err.message));
    ffmpeg.stdout.on('close', cleanup);

    return { stream: ffmpeg.stdout, cleanup };
  }

  // Case 3: Universal yt-dlp Stream piped into FFmpeg (Fallback if streamUrl expired or not pre-fetched)
  const ytdlArgs = [
    '-o', '-',
    '-f', 'ba/b',
    '--no-playlist',
    '--no-warnings',
    '--geo-bypass'
  ];

  if (track.searchQuery) {
    ytdlArgs.push('--default-search', 'ytsearch', `ytsearch1:${track.searchQuery}`);
  } else {
    ytdlArgs.push(track.webpageUrl || track.url);
  }

  const ytdl = spawn('yt-dlp', ytdlArgs);
  processes.push(ytdl);

  const ffmpegArgs = [
    '-ss', String(seekSeconds),
    '-i', 'pipe:0',
    '-vn',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1'
  ];

  const ffmpeg = spawn('ffmpeg', ffmpegArgs);
  processes.push(ffmpeg);

  // Pipe yt-dlp stdout into ffmpeg stdin
  ytdl.stdout.pipe(ffmpeg.stdin);

  ytdl.stderr.on('data', () => {});
  ffmpeg.stderr.on('data', () => {});

  ytdl.on('error', (err) => {
    console.error('[yt-dlp Stream Error]:', err.message);
    cleanup();
  });

  ffmpeg.on('error', (err) => {
    console.error('[FFmpeg Stream Error]:', err.message);
    cleanup();
  });

  ffmpeg.stdout.on('close', cleanup);

  return { stream: ffmpeg.stdout, cleanup };
}

module.exports = {
  extractTracks,
  createAudioStream,
  prefetchTrackStream,
  formatDuration,
  isUrl,
  normalizeYouTubeUrl
};
