const path = require('path');
const fs = require('fs');
require('dotenv').config();

const BASE_DIR = path.resolve(__dirname, '..');
const TEMP_UPLOADS_DIR = path.resolve(BASE_DIR, process.env.TEMP_UPLOADS_DIR || 'temp_uploads');

if (!fs.existsSync(TEMP_UPLOADS_DIR)) {
  fs.mkdirSync(TEMP_UPLOADS_DIR, { recursive: true });
}

function validateConfig() {
  const missing = [];
  if (!process.env.DISCORD_TOKEN) missing.push('DISCORD_TOKEN');
  if (!process.env.APPLICATION_ID) missing.push('APPLICATION_ID');

  if (missing.length > 0) {
    console.error('\n' + '='.repeat(60));
    console.error(' [CONFIGURATION ERROR] Missing required environment variables:');
    missing.forEach((v) => console.error(`   ❌ ${v}`));
    console.error('\n Please create/update your .env file based on .env.example:');
    console.error('   cp .env.example .env');
    console.error(' Refer to README.md for the complete setup and deployment guide.');
    console.error('='.repeat(60) + '\n');
    process.exit(1);
  }
}

module.exports = {
  // Validation helper
  validateConfig,

  // Discord Bot Credentials
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',
  APPLICATION_ID: process.env.APPLICATION_ID || '',
  PUBLIC_KEY: process.env.PUBLIC_KEY || '',

  // Player Defaults
  DEFAULT_VOLUME: parseInt(process.env.DEFAULT_VOLUME, 10) || 100,
  EMPTY_VC_TIMEOUT_MS: (parseInt(process.env.EMPTY_VC_TIMEOUT_SECONDS, 10) || 60) * 1000,
  MAX_QUEUE_SIZE: parseInt(process.env.MAX_QUEUE_SIZE, 10) || 500,
  MAX_HISTORY_SIZE: parseInt(process.env.MAX_HISTORY_SIZE, 10) || 50,

  // Optional Spotify API Credentials (for enhanced metadata & direct catalog search)
  SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID || null,
  SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET || null,

  // File paths
  BASE_DIR,
  TEMP_UPLOADS_DIR,

  // Embed Colors (Discord hex integers)
  COLORS: {
    PLAYING: 0x5865F2,   // Discord Blurple
    PAUSED: 0xF1C40F,    // Amber
    SUCCESS: 0x2ECC71,   // Emerald
    ERROR: 0xED4245,     // Crimson
    INFO: 0x3498DB,      // Sky Blue
    QUEUE: 0x9B59B6,     // Purple
    STOPPED: 0x747F8D    // Neutral Gray
  },

  // Supported audio formats for custom uploaded files
  ALLOWED_AUDIO_EXTENSIONS: new Set([
    '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.opus', '.wma', '.webm'
  ])
};
