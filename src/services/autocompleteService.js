const axios = require('axios');
const path = require('path');
const config = require('../config');
const { isSpotifyUrl, resolveSpotify } = require('./spotifyResolver');

// In-memory cache for autocomplete results: query -> { timestamp, choices }
const autocompleteCache = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

// Cached official Spotify OAuth token
let officialSpotifyToken = null;
let officialSpotifyTokenExpiry = 0;

// Curated music presets shown when the user hasn't typed anything yet
const DEFAULT_PRESETS = [
  { name: 'Today\'s Top Hits (Global Chart)', value: 'top hits music 2026' },
  { name: 'Mega Hit Mix (Billboard Hot 100)', value: 'billboard hot 100 hits' },
  { name: 'Pop Rising & Viral Hits', value: 'pop rising viral hits' },
  { name: 'All Out 2010s & 2000s Throwbacks', value: 'greatest 2010s hits' },
  { name: 'Hip Hop Central & Rap Caviar', value: 'hip hop rap hits' },
  { name: 'Rock Classics & Modern Rock', value: 'classic rock greatest hits' },
  { name: 'Deep Focus & Ambient Study Piano', value: 'deep focus study piano music' },
  { name: 'Chill Lofi Beats (Relax & Sleep)', value: 'chill lofi beats relax study' },
  { name: 'Synthwave & Retro Electro Waves', value: 'synthwave retro electro chill' },
  { name: 'Smooth Jazz & Cafe Lounge', value: 'smooth jazz cafe piano lounge' },
  { name: 'Deep House Sunset Session', value: 'deep house relax sunset music' },
  { name: 'Gaming EDM & Electro House Mix', value: 'gaming edm house mix' },
  { name: 'Anime OST & J-Pop Favorites', value: 'anime jpop favorites mix' },
  { name: 'Drift Phonk & Bass Boosted', value: 'drift phonk bass boosted' },
  { name: '24/7 Lofi Hip Hop Radio Live', value: 'lofi hip hop radio beats to relax study to' },
  { name: '24/7 Synthwave Chill Stream', value: 'synthwave radio chill beats live' },
  { name: '24/7 Gaming EDM Radio Live', value: 'gaming edm radio live stream 24/7' }
];

/**
 * Obtains an official Spotify Client Credentials Bearer token if credentials are provided in config.
 * @returns {Promise<string|null>}
 */
async function getOfficialSpotifyToken() {
  if (!config.SPOTIFY_CLIENT_ID || !config.SPOTIFY_CLIENT_SECRET) {
    return null;
  }

  // Use cached token if still valid
  if (officialSpotifyToken && Date.now() < officialSpotifyTokenExpiry) {
    return officialSpotifyToken;
  }

  try {
    const creds = Buffer.from(`${config.SPOTIFY_CLIENT_ID}:${config.SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const res = await axios.post(
      'https://accounts.spotify.com/api/token',
      'grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${creds}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 2500
      }
    );

    if (res.data?.access_token) {
      officialSpotifyToken = res.data.access_token;
      // Refresh 60 seconds before actual expiry
      officialSpotifyTokenExpiry = Date.now() + ((res.data.expires_in || 3600) - 60) * 1000;
      return officialSpotifyToken;
    }
  } catch (err) {
    console.warn('[SpotifyAuth] Official token request error:', err.message);
  }

  return null;
}

/**
 * Fetches Spotify track suggestions using Official Spotify API (Tier 1) or Universal Track Catalog (Tier 2).
 * Suggestions are formatted cleanly without emoji dots or brand tags: "Track Title - Artist".
 *
 * @param {string} query
 * @returns {Promise<Array<{ name: string, value: string }>>}
 */
async function fetchSpotifyTrackSuggestions(query) {
  const choices = [];

  // Tier 1: Try official Spotify API if client credentials exist
  const token = await getOfficialSpotifyToken();
  if (token) {
    try {
      const res = await axios.get('https://api.spotify.com/v1/search', {
        params: {
          q: query,
          type: 'track',
          limit: 16
        },
        headers: {
          'Authorization': `Bearer ${token}`
        },
        timeout: 1400
      });

      const items = res.data?.tracks?.items || [];
      for (const t of items) {
        if (!t.name) continue;
        const artists = t.artists?.map((a) => a.name).join(', ') || '';
        const displayName = artists ? `${t.name} - ${artists}` : t.name;

        const name = displayName.slice(0, 100);
        const value = (t.external_urls?.spotify || displayName).slice(0, 100);

        if (!choices.some((c) => c.value.toLowerCase() === value.toLowerCase() || c.name.toLowerCase() === name.toLowerCase())) {
          choices.push({ name, value });
        }
      }

      if (choices.length > 0) return choices;
    } catch (err) {
      console.warn('[SpotifyAutocomplete] Official API search notice:', err.message);
    }
  }

  // Tier 2: Universal High-Fidelity Music Track Catalog (iTunes / Apple Music engine)
  // Provides exact studio song title and artist formatted cleanly without API keys
  try {
    const res = await axios.get('https://itunes.apple.com/search', {
      params: {
        term: query,
        entity: 'song',
        limit: 16
      },
      timeout: 1400
    });

    const results = res.data?.results || [];
    for (const t of results) {
      if (!t.trackName) continue;
      const artist = t.artistName ? ` - ${t.artistName}` : '';
      const displayName = `${t.trackName}${artist}`;

      const name = displayName.slice(0, 100);
      const value = displayName.slice(0, 100);

      if (!choices.some((c) => c.value.toLowerCase() === value.toLowerCase() || c.name.toLowerCase() === name.toLowerCase())) {
        choices.push({ name, value });
      }
    }
  } catch (_) {}

  return choices;
}

/**
 * Fetches search autocomplete suggestions cleanly.
 *
 * @param {string} query
 * @returns {Promise<Array<{ name: string, value: string }>>}
 */
async function fetchYouTubeSuggestions(query) {
  const choices = [];
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 1200
    });

    if (Array.isArray(res.data) && Array.isArray(res.data[1])) {
      for (const item of res.data[1]) {
        if (typeof item === 'string') {
          const val = item.trim();
          if (val && val.toLowerCase() !== query.toLowerCase()) {
            choices.push({
              name: val.slice(0, 100),
              value: val.slice(0, 100)
            });
          }
        }
      }
    }
  } catch (_) {}

  return choices;
}

/**
 * Retrieves autocomplete music suggestions for a search query or URL.
 * Prioritizes Spotify tracks first (Mainly Spotify), followed by search suggestions.
 * All choices are clean track/query strings with no emoji dots or platform tags.
 *
 * @param {string} rawQuery - Current text typed by user in Discord slash command
 * @returns {Promise<Array<{ name: string, value: string }>>} Array of up to 25 choices
 */
async function getMusicSuggestions(rawQuery) {
  const query = (rawQuery || '').trim();

  // 1. If empty query, show curated music presets
  if (!query) {
    return DEFAULT_PRESETS.slice(0, 25);
  }

  // 2. Check cache for instant response
  const cacheKey = query.toLowerCase();
  const cached = autocompleteCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.choices;
  }

  const choices = [];

  // 3. Handle Direct URLs (Spotify, YouTube, SoundCloud, Audio files)
  if (isSpotifyUrl(query)) {
    try {
      const tracks = await Promise.race([
        resolveSpotify(query),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))
      ]);

      if (tracks && tracks.length > 0) {
        const first = tracks[0];
        const isMulti = tracks.length > 1;
        const name = isMulti
          ? `${first.title} (${tracks.length} tracks)`
          : `${first.title}${first.artist ? ` - ${first.artist}` : ''}`;

        choices.push({
          name: name.slice(0, 100),
          value: query.slice(0, 100)
        });
      }
    } catch (_) {}

    if (choices.length === 0) {
      choices.push({
        name: query.slice(0, 100),
        value: query.slice(0, 100)
      });
    }

    autocompleteCache.set(cacheKey, { timestamp: Date.now(), choices });
    return choices;
  }

  if (query.includes('youtube.com/') || query.includes('youtu.be/')) {
    choices.push({
      name: query.slice(0, 100),
      value: query.slice(0, 100)
    });
    autocompleteCache.set(cacheKey, { timestamp: Date.now(), choices });
    return choices;
  }

  if (query.includes('soundcloud.com/')) {
    choices.push({
      name: query.slice(0, 100),
      value: query.slice(0, 100)
    });
    autocompleteCache.set(cacheKey, { timestamp: Date.now(), choices });
    return choices;
  }

  if (/\.(mp3|wav|ogg|flac|m4a|aac|opus)(\?.*)?$/i.test(query)) {
    choices.push({
      name: path.basename(query).split('?')[0].slice(0, 100),
      value: query.slice(0, 100)
    });
    autocompleteCache.set(cacheKey, { timestamp: Date.now(), choices });
    return choices;
  }

  // 4. Query Spotify and YouTube in parallel (MAINLY SPOTIFY)
  const [spotifyResult, ytResult] = await Promise.allSettled([
    fetchSpotifyTrackSuggestions(query),
    fetchYouTubeSuggestions(query)
  ]);

  // Add Spotify track suggestions first (up to 16 tracks!)
  if (spotifyResult.status === 'fulfilled' && Array.isArray(spotifyResult.value)) {
    for (const item of spotifyResult.value) {
      if (!choices.some((c) => c.name.toLowerCase() === item.name.toLowerCase() || c.value.toLowerCase() === item.value.toLowerCase())) {
        choices.push(item);
      }
      if (choices.length >= 17) break; // Keep room for general search suggestions
    }
  }

  // Add YouTube search suggestions next (fill up to 24 total choices)
  if (ytResult.status === 'fulfilled' && Array.isArray(ytResult.value)) {
    for (const item of ytResult.value) {
      if (!choices.some((c) => c.name.toLowerCase() === item.name.toLowerCase() || c.value.toLowerCase() === item.value.toLowerCase())) {
        choices.push(item);
      }
      if (choices.length >= 24) break;
    }
  }

  // Ensure the user's exact typed query is also available at the bottom if not already included
  if (!choices.some((c) => c.name.toLowerCase() === query.toLowerCase() || c.value.toLowerCase() === query.toLowerCase())) {
    choices.push({
      name: query.slice(0, 100),
      value: query.slice(0, 100)
    });
  }

  const finalChoices = choices.slice(0, 25);
  autocompleteCache.set(cacheKey, { timestamp: Date.now(), choices: finalChoices });

  // Prevent memory bloat
  if (autocompleteCache.size > 500) {
    const oldestKey = autocompleteCache.keys().next().value;
    autocompleteCache.delete(oldestKey);
  }

  return finalChoices;
}

/**
 * Autocompletes tracks in the upcoming queue for commands like /remove.
 *
 * @param {import('../managers/musicManager').MusicManager} musicManager
 * @param {string|number} focusedValue
 * @returns {Array<{ name: string, value: number }>}
 */
function getQueuePositionChoices(musicManager, focusedValue = '') {
  if (!musicManager || !musicManager.queue || musicManager.queue.queue.length === 0) {
    return [{ name: 'The upcoming queue is currently empty', value: 1 }];
  }

  const queue = musicManager.queue.queue;
  const search = String(focusedValue || '').toLowerCase().trim();

  const allChoices = queue.map((track, idx) => {
    const pos = idx + 1;
    const artist = track.artist ? ` - ${track.artist}` : '';
    const name = `#${pos} • ${track.title}${artist}`.slice(0, 100);

    return {
      name,
      value: pos,
      matchText: `${pos} ${track.title} ${track.artist || ''}`.toLowerCase()
    };
  });

  if (!search) {
    return allChoices.slice(0, 25).map(({ name, value }) => ({ name, value }));
  }

  const filtered = allChoices.filter((c) => c.matchText.includes(search));
  const results = filtered.length > 0 ? filtered : allChoices;

  return results.slice(0, 25).map(({ name, value }) => ({ name, value }));
}

module.exports = {
  getMusicSuggestions,
  getQueuePositionChoices
};
