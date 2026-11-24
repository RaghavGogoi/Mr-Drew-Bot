const axios = require('axios');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Checks if a string is a Spotify URL.
 * @param {string} url
 */
function isSpotifyUrl(url) {
  return /^(https?:\/\/)?(open\.)?spotify\.com\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)/i.test(url);
}

/**
 * Checks if a string is an Apple Music URL.
 * @param {string} url
 */
function isAppleMusicUrl(url) {
  return /^(https?:\/\/)?music\.apple\.com\/([a-z]{2}\/)?(album|playlist|song)\/[^/]+/i.test(url);
}

/**
 * Resolves Spotify tracks, albums, or playlists into highly-accurate search queries.
 *
 * @param {string} url
 * @returns {Promise<Array<{ title: string, artist: string, duration: number, query: string, thumbnail: string|null, url: string, source: string }>>}
 */
async function resolveSpotify(url) {
  const match = url.match(/spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/i);
  if (!match) return [];

  const type = match[1].toLowerCase();
  const id = match[2];

  try {
    const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
    const res = await axios.get(embedUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000
    });

    const nextDataMatch = res.data.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      const data = JSON.parse(nextDataMatch[1]);
      const entity = data.props?.pageProps?.state?.data?.entity;

      if (type === 'track' && entity) {
        const title = entity.name || entity.title || 'Unknown Title';
        const artist = entity.artists?.[0]?.name || entity.subtitle || '';
        const duration = Math.round((entity.duration || 0) / 1000);
        const thumbnail =
          entity.visualIdentity?.image?.[0]?.url ||
          entity.coverArt?.sources?.[0]?.url ||
          null;

        const query = artist ? `${artist} - ${title} official audio` : `${title} audio`;

        return [{
          title,
          artist,
          duration,
          query,
          thumbnail,
          url: `https://open.spotify.com/track/${id}`,
          source: 'Spotify'
        }];
      }

      if ((type === 'album' || type === 'playlist') && entity) {
        const trackList = entity.trackList || [];
        const albumCover =
          entity.visualIdentity?.image?.[0]?.url ||
          entity.coverArt?.sources?.[0]?.url ||
          null;

        if (trackList.length > 0) {
          return trackList.map((t) => {
            const title = t.title || t.name || 'Unknown Title';
            const artist = t.subtitle || entity.artists?.[0]?.name || '';
            const duration = Math.round((t.duration || 0) / 1000);
            const query = artist ? `${artist} - ${title} official audio` : `${title} audio`;

            return {
              title,
              artist,
              duration,
              query,
              thumbnail: albumCover,
              url: `https://open.spotify.com/track/${t.id || id}`,
              source: 'Spotify'
            };
          });
        }
      }
    }
  } catch (err) {
    console.warn(`[SpotifyResolver] Primary embed extraction failed for ${type}:`, err.message);
  }

  // Fallback to oEmbed for track if embed page fails
  if (type === 'track') {
    try {
      const oembedRes = await axios.get(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${id}`, {
        headers: { 'User-Agent': USER_AGENT },
        timeout: 5000
      });

      const title = oembedRes.data?.title || 'Spotify Track';
      const thumbnail = oembedRes.data?.thumbnail_url || null;

      return [{
        title,
        artist: 'Spotify',
        duration: 0,
        query: `${title} audio`,
        thumbnail,
        url: `https://open.spotify.com/track/${id}`,
        source: 'Spotify'
      }];
    } catch (e) {
      console.error('[SpotifyResolver] oEmbed fallback failed:', e.message);
    }
  }

  return [];
}

/**
 * Resolves Apple Music URLs into accurate search queries.
 * @param {string} url
 */
async function resolveAppleMusic(url) {
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 6000
    });

    const titleMatch = res.data.match(/property="og:title"\s+content="([^"]+)"/i);
    const descMatch = res.data.match(/property="og:description"\s+content="([^"]+)"/i);
    const imageMatch = res.data.match(/property="og:image"\s+content="([^"]+)"/i);

    const rawTitle = titleMatch ? titleMatch[1].replace(/ - Single| - EP| on Apple Music/gi, '').trim() : 'Apple Music Track';
    const artist = descMatch ? descMatch[1].split('·')[0].trim() : '';
    const thumbnail = imageMatch ? imageMatch[1] : null;

    const query = artist && !rawTitle.includes(artist) ? `${artist} - ${rawTitle} official audio` : `${rawTitle} audio`;

    return [{
      title: rawTitle,
      artist,
      duration: 0,
      query,
      thumbnail,
      url,
      source: 'Apple Music'
    }];
  } catch (err) {
    console.error('[AppleMusicResolver] Failed to resolve Apple Music url:', err.message);
    return [];
  }
}

module.exports = {
  isSpotifyUrl,
  isAppleMusicUrl,
  resolveSpotify,
  resolveAppleMusic
};
