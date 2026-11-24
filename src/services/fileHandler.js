const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../config');

/**
 * Validates whether an attachment is an acceptable audio file.
 * @param {import('discord.js').Attachment} attachment
 * @returns {boolean}
 */
function isAudioAttachment(attachment) {
  if (!attachment) return false;

  const ext = path.extname(attachment.name || '').toLowerCase();
  const contentType = (attachment.contentType || '').toLowerCase();

  return (
    config.ALLOWED_AUDIO_EXTENSIONS.has(ext) ||
    contentType.startsWith('audio/') ||
    contentType.includes('ogg') ||
    contentType.includes('mpeg')
  );
}

/**
 * Downloads a Discord attachment to local temp directory and parses its metadata.
 *
 * @param {import('discord.js').Attachment} attachment
 * @param {import('discord.js').User} requester
 * @returns {Promise<object>} Track object
 */
async function processAudioAttachment(attachment, requester) {
  if (!isAudioAttachment(attachment)) {
    throw new Error(
      `Unsupported audio file format! Supported formats: ${Array.from(config.ALLOWED_AUDIO_EXTENSIONS).join(', ')}`
    );
  }

  const rawExt = path.extname(attachment.name || '.mp3').toLowerCase();
  const safeExt = config.ALLOWED_AUDIO_EXTENSIONS.has(rawExt) ? rawExt : '.mp3';
  const cleanBaseName = path.basename(attachment.name || 'custom_audio', rawExt).replace(/[^a-zA-Z0-9_\- ]/g, '');
  const fileName = `${Date.now()}_${cleanBaseName}${safeExt}`;
  const filePath = path.join(config.TEMP_UPLOADS_DIR, fileName);

  // Download attachment
  const response = await axios({
    url: attachment.url,
    method: 'GET',
    responseType: 'stream',
    timeout: 30000
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  // Extract ID3/Audio tags via music-metadata
  let metaTitle = null;
  let metaArtist = null;
  let duration = 0;
  let bitrate = null;

  try {
    const mm = await import('music-metadata');
    const metadata = await mm.parseFile(filePath);

    if (metadata.common) {
      metaTitle = metadata.common.title;
      metaArtist = metadata.common.artist;
    }
    if (metadata.format) {
      duration = Math.round(metadata.format.duration || 0);
      bitrate = metadata.format.bitrate ? Math.round(metadata.format.bitrate / 1000) : null;
    }
  } catch (err) {
    console.warn('[FileHandler] music-metadata extraction notice:', err.message);
  }

  // Fallback to formatted filename
  const displayTitle = metaTitle || cleanBaseName.replace(/[_-]+/g, ' ').trim() || 'Uploaded Audio';
  const displayArtist = metaArtist || `${requester.username} (Upload)`;

  return {
    title: displayTitle,
    artist: displayArtist,
    duration, // in seconds (0 = live / unknown)
    url: attachment.url,
    webpageUrl: attachment.url,
    streamUrl: null,
    isLocalFile: true,
    localPath: filePath,
    source: 'Custom Upload',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png',
    requester,
    bitrate: bitrate ? `${bitrate} kbps` : 'Original'
  };
}

/**
 * Safely removes a temporary audio file from disk immediately.
 * @param {string} filePath
 */
function cleanupTempFile(filePath) {
  if (!filePath || !filePath.startsWith(config.TEMP_UPLOADS_DIR)) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.warn('[FileHandler] Error deleting temp file:', filePath, err.message);
    } else if (!err) {
      console.log('[FileHandler] Auto-deleted finished upload to save disk space:', path.basename(filePath));
    }
  });
}

/**
 * Scans temp_uploads directory and purges all files not currently playing or queued.
 * @param {Set<string>} [activeFilePaths=new Set()]
 */
function cleanOrphanedTempFiles(activeFilePaths = new Set()) {
  try {
    if (!fs.existsSync(config.TEMP_UPLOADS_DIR)) return;
    const files = fs.readdirSync(config.TEMP_UPLOADS_DIR);
    const now = Date.now();

    let deletedCount = 0;
    for (const file of files) {
      const fullPath = path.join(config.TEMP_UPLOADS_DIR, file);
      if (activeFilePaths.has(fullPath)) continue;

      try {
        const stats = fs.statSync(fullPath);
        // Delete if older than 15 seconds (prevents deleting active downloads)
        if (now - stats.mtimeMs > 15_000) {
          fs.unlinkSync(fullPath);
          deletedCount++;
        }
      } catch (_) {}
    }

    if (deletedCount > 0) {
      console.log(`[FileHandler] Cleaned up ${deletedCount} unneeded temp upload file(s).`);
    }
  } catch (err) {
    console.error('[FileHandler] Error cleaning temp directory:', err.message);
  }
}

module.exports = {
  isAudioAttachment,
  processAudioAttachment,
  cleanupTempFile,
  cleanOrphanedTempFiles
};
