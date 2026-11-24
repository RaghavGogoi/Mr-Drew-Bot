const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { formatDuration } = require('../services/audioExtractor');
const { LOOP_NAMES, LOOP_MODES } = require('../managers/queueManager');

/**
 * Creates an aesthetic, clean, modern progress bar with percentage and remaining countdown.
 *
 * @param {number} currentSec
 * @param {number} totalSec
 * @param {number} size
 * @returns {string}
 */
function createProgressBar(currentSec, totalSec, size = 14) {
  if (!totalSec || totalSec <= 0) {
    return '`[Live Stream]` 🔘' + '━'.repeat(size - 1);
  }

  const progress = Math.min(Math.max(currentSec / totalSec, 0), 1);
  const progressIndex = Math.round(progress * (size - 1));
  const percent = Math.round(progress * 100);
  const remainingSec = Math.max(0, totalSec - currentSec);

  let bar = '';
  for (let i = 0; i < size; i++) {
    bar += (i === progressIndex) ? '🔘' : '━';
  }

  return `\`${formatDuration(currentSec)}\` ${bar} \`${formatDuration(totalSec)}\` \`(${percent}% • -${formatDuration(remainingSec)})\``;
}

/**
 * Creates a visual ASCII volume level bar.
 *
 * @param {number} volume
 * @param {number} [max=200]
 * @param {number} [size=10]
 * @returns {string}
 */
function createVolumeBar(volume, max = 200, size = 10) {
  const fraction = Math.min(Math.max(volume / max, 0), 1);
  const filled = Math.round(fraction * size);
  return '`[' + '█'.repeat(filled) + '░'.repeat(size - filled) + `] ${volume}%\``;
}

/**
 * Builds an ultra-detailed, aesthetic Now Playing Embed.
 *
 * @param {object} track
 * @param {object} playerState - { isPaused, volume, elapsedSeconds, hasPrevious }
 * @param {import('../managers/queueManager').QueueManager} queueManager
 * @param {string} guildName
 * @param {string} channelName
 * @returns {EmbedBuilder}
 */
function createNowPlayingEmbed(track, playerState, queueManager, guildName, channelName) {
  const isPaused = playerState.isPaused;
  const elapsed = Math.round(playerState.elapsedSeconds || 0);
  const total = track.duration || 0;
  const progressBar = createProgressBar(elapsed, total);

  const nextTrack = queueManager.queue[0];
  const upNextText = nextTrack
    ? `**[${nextTrack.title.slice(0, 55)}](${nextTrack.webpageUrl || nextTrack.url})** \`[${formatDuration(nextTrack.duration)}]\` • <@${nextTrack.requester.id}>`
    : '*Queue is empty — add more tracks using `/play`!*';

  const volIcon =
    playerState.volume > 120 ? '📢' :
    playerState.volume > 70  ? '🔊' :
    playerState.volume > 20  ? '🔉' : '🔈';

  const embed = new EmbedBuilder()
    .setColor(isPaused ? config.COLORS.PAUSED : config.COLORS.PLAYING)
    .setAuthor({
      name: isPaused ? '⏸️ Playback Paused' : '🎵 Now Playing',
      iconURL: track.requester?.displayAvatarURL() || 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
    })
    .setTitle(track.title.slice(0, 240))
    .setURL(track.webpageUrl || (track.isLocalFile ? undefined : track.url))
    .setDescription(
      `🎤 **Artist / Creator:** **${track.artist || 'Unknown Artist'}**\n\n` +
      `**Progress:**\n${progressBar}`
    )
    .addFields(
      {
        name: '⏱️ Duration',
        value: total > 0 ? `\`${formatDuration(total)}\`` : '`🔴 Live Stream`',
        inline: true
      },
      {
        name: '📡 Audio Source',
        value: `\`${track.source || 'Web Audio'}\``,
        inline: true
      },
      {
        name: '🎧 Requested By',
        value: track.requester ? `<@${track.requester.id}>` : '*Unknown*',
        inline: true
      },
      {
        name: `${volIcon} Volume`,
        value: `\`${playerState.volume}%\``,
        inline: true
      },
      {
        name: '🔁 Loop Mode',
        value: `\`${LOOP_NAMES[queueManager.loopMode] || 'Off'}\``,
        inline: true
      },
      {
        name: '📜 Upcoming Queue',
        value: `\`${queueManager.queue.length} track(s)\` (\`${formatDuration(queueManager.getTotalDuration())}\`)`,
        inline: true
      },
      {
        name: '⏭️ Up Next in Queue',
        value: upNextText,
        inline: false
      }
    )
    .setFooter({
      text: `🔊 ${channelName} • 🌐 ${guildName} • Mr. Drew Bot`,
      iconURL: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
    })
    .setTimestamp();

  if (track.thumbnail) {
    embed.setThumbnail(track.thumbnail);
  }

  return embed;
}

/**
 * Builds an informative Added to Queue Embed.
 *
 * @param {object} track
 * @param {number} position
 * @param {import('../managers/queueManager').QueueManager} queueManager
 * @param {number} [currentTrackRemaining=0]
 * @returns {EmbedBuilder}
 */
function createAddedToQueueEmbed(track, position, queueManager, currentTrackRemaining = 0) {
  const isPlayingNext = position === 1 && !queueManager.current;
  const posBadge = isPlayingNext ? '▶️ Playing Immediately' : `Position #${position}`;

  // Estimate wait time: sum of all tracks ahead of this track + remaining current track
  let waitSecs = Math.max(0, currentTrackRemaining);
  const aheadIndex = Math.max(0, position - 1);
  for (let i = 0; i < aheadIndex; i++) {
    if (queueManager.queue[i]) {
      waitSecs += (queueManager.queue[i].duration || 0);
    }
  }

  const waitTimeStr = isPlayingNext
    ? '`Instant`'
    : waitSecs > 0 ? `\`~${formatDuration(waitSecs)}\`` : '`Shortly`';

  const embed = new EmbedBuilder()
    .setColor(config.COLORS.SUCCESS)
    .setAuthor({
      name: '✅ Track Added to Queue',
      iconURL: track.requester?.displayAvatarURL() || 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
    })
    .setTitle(track.title.slice(0, 240))
    .setURL(track.webpageUrl || (track.isLocalFile ? undefined : track.url))
    .setDescription(`Successfully added **[${track.title.slice(0, 80)}](${track.webpageUrl || track.url})** to the playback queue!`)
    .addFields(
      {
        name: '👤 Artist / Creator',
        value: `**${track.artist || 'Unknown Artist'}**`,
        inline: true
      },
      {
        name: '⏱️ Duration',
        value: track.duration > 0 ? `\`${formatDuration(track.duration)}\`` : '`🔴 Live Stream`',
        inline: true
      },
      {
        name: '🔢 Queue Position',
        value: `\`${posBadge}\``,
        inline: true
      },
      {
        name: '⏳ Estimated Wait',
        value: waitTimeStr,
        inline: true
      },
      {
        name: '📡 Source',
        value: `\`${track.source || 'Web Audio'}\``,
        inline: true
      },
      {
        name: '🎧 Requested By',
        value: track.requester ? `<@${track.requester.id}>` : '*Unknown*',
        inline: true
      },
      {
        name: '📊 Total Queue Overview',
        value: `\`${queueManager.queue.length} track(s)\` in queue • Total playtime: \`${formatDuration(queueManager.getTotalDuration())}\``,
        inline: false
      }
    )
    .setFooter({
      text: `Added by ${track.requester?.username || 'User'} • Mr. Drew Bot`,
      iconURL: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
    })
    .setTimestamp();

  if (track.thumbnail) {
    embed.setThumbnail(track.thumbnail);
  }

  return embed;
}

/**
 * Builds a clean, detailed Playlist Added Embed.
 *
 * @param {string} playlistTitle
 * @param {number} count
 * @param {import('../managers/queueManager').QueueManager} queueManager
 * @param {import('discord.js').User} requester
 * @param {object} [firstTrack]
 * @param {object} [lastTrack]
 * @returns {EmbedBuilder}
 */
function createPlaylistAddedEmbed(playlistTitle, count, queueManager, requester, firstTrack, lastTrack) {
  const totalSecs = queueManager.getTotalDuration();

  const embed = new EmbedBuilder()
    .setColor(config.COLORS.SUCCESS)
    .setAuthor({
      name: '🎶 Playlist Queued Successfully',
      iconURL: requester?.displayAvatarURL() || 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
    })
    .setTitle(playlistTitle.slice(0, 240))
    .setDescription(`Enqueued **${count} tracks** from the playlist into the active queue!`)
    .addFields(
      {
        name: '📦 Tracks Queued',
        value: `\`${count} songs\``,
        inline: true
      },
      {
        name: '📜 Total Queue Length',
        value: `\`${queueManager.queue.length} songs\``,
        inline: true
      },
      {
        name: '⏱️ Total Queue Playtime',
        value: `\`${formatDuration(totalSecs)}\``,
        inline: true
      },
      {
        name: '🎧 Requested By',
        value: `<@${requester.id}>`,
        inline: true
      },
      {
        name: '🔁 Active Loop Mode',
        value: `\`${LOOP_NAMES[queueManager.loopMode] || 'Off'}\``,
        inline: true
      }
    );

  if (firstTrack) {
    embed.addFields({
      name: '🎵 First Queued Track',
      value: `[${firstTrack.title.slice(0, 60)}](${firstTrack.webpageUrl || firstTrack.url}) \`[${formatDuration(firstTrack.duration)}]\``,
      inline: false
    });
  }

  if (lastTrack && lastTrack !== firstTrack) {
    embed.addFields({
      name: '⏭️ Final Queued Track',
      value: `[${lastTrack.title.slice(0, 60)}](${lastTrack.webpageUrl || lastTrack.url}) \`[${formatDuration(lastTrack.duration)}]\``,
      inline: false
    });
  }

  embed
    .setFooter({
      text: `Queued by ${requester.username} • Mr. Drew Bot`,
      iconURL: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
    })
    .setTimestamp();

  return embed;
}

/**
 * Builds a clean, detailed, paginated Queue Embed.
 *
 * @param {import('../managers/queueManager').QueueManager} queueManager
 * @param {number} [page=1]
 * @returns {EmbedBuilder}
 */
function createQueueEmbed(queueManager, page = 1) {
  const current = queueManager.current;
  const queue = queueManager.queue;
  const itemsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(queue.length / itemsPerPage));
  const currentPage = Math.max(1, Math.min(page, totalPages));

  const totalSecs = queueManager.getTotalDuration();

  const embed = new EmbedBuilder()
    .setColor(config.COLORS.QUEUE)
    .setAuthor({
      name: '📜 Live Playback Queue',
      iconURL: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
    })
    .setTitle(`Music Queue • Page ${currentPage} of ${totalPages}`)
    .setTimestamp();

  let desc = '';

  // Currently playing section
  if (current) {
    desc += `▶️ **Now Playing:**\n` +
      `**[${current.title.slice(0, 80)}](${current.webpageUrl || current.url})** \`[${formatDuration(current.duration)}]\`\n` +
      `╰ 👤 *${current.artist || 'Unknown'}* • 🎧 <@${current.requester.id}> • 📡 \`${current.source || 'Web'}\`\n\n`;
  } else {
    desc += `⏸️ **Now Playing:** *No track currently playing.*\n\n`;
  }

  desc += `📊 **Queue Stats:** \`${queue.length} track(s)\` • Runtime: \`${formatDuration(totalSecs)}\` • Loop: \`${LOOP_NAMES[queueManager.loopMode]}\`\n\n`;

  if (queue.length === 0) {
    desc += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '*The upcoming queue is currently empty.*\n' +
      '👉 Use `/play` or `/playfile` to add songs to the queue!';
  } else {
    desc += `**Up Next (Showing ${((currentPage - 1) * itemsPerPage) + 1} - ${Math.min(currentPage * itemsPerPage, queue.length)} of ${queue.length}):**\n`;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageItems = queue.slice(startIndex, startIndex + itemsPerPage);

    const lines = pageItems.map((t, idx) => {
      const position = startIndex + idx + 1;
      const posStr = String(position).padStart(2, '0');
      const durStr = t.duration > 0 ? formatDuration(t.duration) : 'Live';
      const shortTitle = t.title.slice(0, 50);
      return `\`[#${posStr}]\` **[${shortTitle}](${t.webpageUrl || t.url})** \`[${durStr}]\`\n╰ 👤 *${(t.artist || 'Unknown').slice(0, 25)}* • 🎧 <@${t.requester.id}> • 📡 \`${t.source || 'Web'}\``;
    });

    desc += lines.join('\n\n');
  }

  embed.setDescription(desc);
  embed.setFooter({
    text: `Page ${currentPage} of ${totalPages} • Total: ${queue.length} songs (${formatDuration(totalSecs)}) • Mr. Drew Bot`,
    iconURL: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
  });

  return embed;
}

/**
 * Builds a clean, detailed, paginated History Embed.
 *
 * @param {import('../managers/queueManager').QueueManager} queueManager
 * @param {number} [page=1]
 * @returns {EmbedBuilder}
 */
function createHistoryEmbed(queueManager, page = 1) {
  const history = queueManager.history;
  const itemsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(history.length / itemsPerPage));
  const currentPage = Math.max(1, Math.min(page, totalPages));

  const totalHistorySecs = history.reduce((sum, t) => sum + (t.duration || 0), 0);

  const embed = new EmbedBuilder()
    .setColor(config.COLORS.INFO)
    .setAuthor({
      name: '🕒 Session Playback History',
      iconURL: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
    })
    .setTitle(`Playback History • Page ${currentPage} of ${totalPages}`)
    .setTimestamp();

  if (history.length === 0) {
    embed.setDescription(
      '*No tracks have finished playing yet during this bot session.*\n\n' +
      'Once songs complete playback, they will automatically appear in this history list and can be replayed using `/previous` or the controller button!'
    );
    embed.setFooter({
      text: 'History: 0 tracks • Mr. Drew Bot',
      iconURL: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
    });
    return embed;
  }

  const startIndex = (currentPage - 1) * itemsPerPage;
  const pageItems = history.slice(startIndex, startIndex + itemsPerPage);

  let desc = `📊 **History Stats:** \`${history.length} played track(s)\` • Total listened: \`${formatDuration(totalHistorySecs)}\`\n\n` +
    `**Recently Played Tracks (Showing ${startIndex + 1} - ${Math.min(startIndex + itemsPerPage, history.length)} of ${history.length}):**\n`;

  const lines = pageItems.map((t, idx) => {
    const pos = String(startIndex + idx + 1).padStart(2, '0');
    const durStr = t.duration > 0 ? formatDuration(t.duration) : 'Live';
    const shortTitle = t.title.slice(0, 50);
    return `\`[#${pos}]\` **[${shortTitle}](${t.webpageUrl || t.url})** \`[${durStr}]\`\n╰ 👤 *${(t.artist || 'Unknown').slice(0, 25)}* • 🎧 <@${t.requester.id}> • 📡 \`${t.source || 'Web'}\``;
  });

  desc += lines.join('\n\n');
  embed.setDescription(desc);

  embed.setFooter({
    text: `History Page ${currentPage} of ${totalPages} • Total: ${history.length} tracks • Mr. Drew Bot`,
    iconURL: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
  });

  return embed;
}

/**
 * Help manual pages definition for multi-page interactive pagination.
 */
const HELP_PAGES = [
  {
    title: '🌟 Overview & Quick Start Guide',
    author: 'Mr. Drew Bot • Master Guide',
    description:
      '**Welcome to Mr. Drew Bot!** A high-fidelity, unrestricted, completely paywall-free Discord music bot.\n\n' +
      '### ✨ Core Highlights:\n' +
      '• **Zero Paywalls:** No premium tier, no vote locks, no volume restrictions (up to 200%).\n' +
      '• **Play Anything:** YouTube, Spotify, SoundCloud, Bandcamp, direct audio URLs, or upload custom audio files.\n' +
      '• **Private DM Remote Control:** Control your music in server voice channels directly from your personal DMs!\n' +
      '• **Interactive Controller:** Live progress bar, playback buttons, queue manager, and volume sliders.\n' +
      '• **24/7 Live Radio:** Non-stop music stations across 12 genres & 4 lofi styles.',
    fields: [
      {
        name: '⚡ Quick Start Commands',
        value:
          '`/play [query]` - Play a song name or web URL\n' +
          '`/playfile [file]` - Upload and stream custom audio\n' +
          '`/lofi [style]` - Start 24/7 relaxing Lofi beats\n' +
          '`/nowplaying` - Open the live player controller\n' +
          '`/help [page]` - Navigate through this guide'
      },
      {
        name: '🧭 Navigation',
        value: 'Use the dropdown menu or pagination buttons below to explore all commands and features!'
      }
    ]
  },
  {
    title: '🚀 Playback & Voice Control Commands',
    author: 'Commands • Category 2 of 6',
    description: 'All commands to start, pause, resume, manipulate, and terminate voice playback.',
    fields: [
      {
        name: '▶️ `/play [query] [file]`',
        value: 'Search for any song with real-time autocomplete suggestions, paste a web link (YouTube, Spotify, SoundCloud, direct link), or attach an audio file.'
      },
      {
        name: '📁 `/playfile [file]`',
        value: 'Upload your own audio file (MP3, WAV, FLAC, OGG, M4A, etc.). Extracts ID3 tags automatically.'
      },
      {
        name: '⏸️ `/pause` & ▶️ `/resume`',
        value: 'Temporarily pause or resume audio playback without losing your position.'
      },
      {
        name: '⏭️ `/skip` & ⏮️ `/previous`',
        value: 'Skip the current track or restore and play the previous song from session history.'
      },
      {
        name: '⏩ `/seek [seconds]`',
        value: 'Jump straight to any second mark in the currently playing track (e.g. `/seek 90`).'
      },
      {
        name: '🔊 `/volume [1-200]`',
        value: 'Adjust playback volume percentage between 1% and 200% (default 100%).'
      },
      {
        name: '⏹️ `/stop` & 👋 `/leave`',
        value: '`/stop` halts playback and clears queue (stays in VC). `/leave` fully disconnects from the voice channel.'
      }
    ]
  },
  {
    title: '📜 Queue & Session Management',
    author: 'Commands • Category 3 of 6',
    description: 'Commands to inspect, modify, reorganize, and manage your active playlist and playback history.',
    fields: [
      {
        name: '📜 `/queue [page]`',
        value: 'Displays upcoming songs with live pagination, current track progress, and quick action buttons.'
      },
      {
        name: '🕒 `/history [page]`',
        value: 'Shows recently played songs from this bot session with interactive pagination.'
      },
      {
        name: '🎵 `/nowplaying`',
        value: 'Displays currently playing song with live elapsed progress bar and the 10-button interactive controller.'
      },
      {
        name: '🔁 `/loop [mode]`',
        value: 'Toggle or set repeat mode: `Off`, `Track` (repeat current song), or `Queue` (loop entire queue).'
      },
      {
        name: '🔀 `/shuffle`',
        value: 'Randomizes the order of all upcoming songs in the queue using Fisher-Yates shuffle.'
      },
      {
        name: '🗑️ `/remove [position]`',
        value: 'Removes a specific song from the queue by its number, featuring real-time queue track suggestions (e.g. `/remove 3`).'
      },
      {
        name: '🧹 `/clear`',
        value: 'Wipes all upcoming songs from the queue while leaving the current song playing.'
      }
    ]
  },
  {
    title: '📻 24/7 Live Radio & Lofi Stations',
    author: 'Features • Category 4 of 6',
    description: 'Continuous non-stop streaming stations that play 24/7 until all human listeners disconnect.',
    fields: [
      {
        name: '☕ `/lofi [style]`',
        value:
          'Stream continuous 24/7 high-fidelity Lofi beats:\n' +
          '• `chill` - Relax / Study Beats (Default)\n' +
          '• `sleep` - Deep Sleep / Chill Vibes\n' +
          '• `synthwave` - Retro Chillwave\n' +
          '• `coffee` - Coffee Shop & Jazz Hop'
      },
      {
        name: '🔴 `/24 [genre]` & `/radio [genre]`',
        value:
          'Stream 24/7 live stations for your chosen genre:\n' +
          '• ☕ Lofi Hip Hop  • 🌆 Synthwave  • 🎮 Gaming EDM\n' +
          '• 🌟 Top Pop Hits  • 🎸 Rock & Metal  • 🎷 Smooth Jazz\n' +
          '• 🎻 Classical Focus  • 🪩 Deep House  • 🎤 Hip Hop & Rap\n' +
          '• 🌸 Anime & J-Pop  • 🌌 Ambient Sleep  • 🏎️ Drift Phonk'
      },
      {
        name: '🛡️ Smart Auto-Disconnect Policy',
        value: 'Stations play continuously without interruption. The bot only disconnects if all human listeners leave the VC.'
      }
    ]
  },
  {
    title: '📁 Unrestricted Sources & Custom File Uploads',
    author: 'Supported Sources • Category 5 of 6',
    description: 'Learn about all the web platforms and local audio formats supported by Mr. Drew Bot.',
    fields: [
      {
        name: '🌐 Web Platforms Supported',
        value:
          '• **YouTube & YouTube Music:** Tracks, playlists, shorts, live streams\n' +
          '• **Spotify:** Track, album, and playlist links (auto-resolved with zero API key)\n' +
          '• **SoundCloud & Bandcamp:** Direct tracks, albums, sets\n' +
          '• **Direct Audio Links:** `.mp3`, `.wav`, `.ogg`, `.flac`, `.aac`, `.m4a`, `.opus`\n' +
          '• **Other Video Sites:** Twitch, Vimeo, Twitter/X, Dailymotion'
      },
      {
        name: '📁 Custom File Uploads (`/playfile` or `/play [file]`)',
        value:
          'Upload local audio files directly from your phone, laptop, or desktop!\n' +
          '• Supported: `MP3`, `WAV`, `FLAC`, `OGG`, `M4A`, `AAC`, `OPUS`, `WEBM`\n' +
          '• Automatic ID3 metadata extraction (song title, artist, duration, bitrate)\n' +
          '• Auto-cleanup removes files after playing to keep disk storage lean'
      }
    ]
  },
  {
    title: '💬 Direct Message (DM) Remote Control Guide',
    author: 'Advanced Features • Category 6 of 6',
    description: 'Control music in any server voice channel straight from your private DMs with the bot!',
    fields: [
      {
        name: '📱 How DM Remote Control Works',
        value:
          '1. Join a voice channel in any Discord server where Mr. Drew Bot is present.\n' +
          '2. Open your private Direct Messages (DM) with **Mr. Drew Bot**.\n' +
          '3. Type `/play [song]` or any command directly in the DM.\n' +
          '4. The bot will automatically detect which server voice channel you are sitting in and begin streaming there!\n' +
          '5. The interactive controller is delivered directly to your DM for private remote control!'
      },
      {
        name: '🔒 Privacy & Convenience',
        value:
          '• Control the music without spamming server text channels.\n' +
          '• Skip, adjust volume, loop, or queue tracks without leaving your private chat.\n' +
          '• Multi-server smart lookup finds you across mutual servers automatically.'
      }
    ]
  }
];

/**
 * Builds a paginated Help Embed.
 *
 * @param {number} [page=1] - 1-based page index (1 to 6)
 * @returns {EmbedBuilder}
 */
function createHelpEmbed(page = 1) {
  const totalPages = HELP_PAGES.length;
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const data = HELP_PAGES[currentPage - 1];

  const embed = new EmbedBuilder()
    .setColor(config.COLORS.INFO)
    .setAuthor({
      name: data.author,
      iconURL: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
    })
    .setTitle(data.title)
    .setDescription(data.description)
    .addFields(data.fields)
    .setFooter({
      text: `Page ${currentPage} of ${totalPages} • Use buttons or dropdown below to navigate • Mr. Drew Bot`,
      iconURL: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
    })
    .setTimestamp();

  return embed;
}

/**
 * Builds a 24/7 Radio or Lofi Station Announcement Embed.
 *
 * @param {object} options
 * @param {string} options.stationName
 * @param {string} options.genre
 * @param {object} options.track
 * @param {string} options.guildName
 * @param {string} options.channelName
 * @param {import('discord.js').User} options.requester
 * @param {boolean} [options.isLofi=false]
 * @returns {EmbedBuilder}
 */
function createStationEmbed({
  stationName,
  genre,
  track,
  guildName,
  channelName,
  requester,
  isLofi = false
}) {
  const title = isLofi ? '☕ 24/7 Lofi Stream Started' : '🔴 24/7 Live Radio Station Started';
  const color = isLofi ? config.COLORS.PLAYING : 0xE74C3C;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: isLofi ? '☕ 24/7 Lofi Beats' : '🔴 24/7 Live Music Radio',
      iconURL: requester?.displayAvatarURL() || 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
    })
    .setTitle(title)
    .setDescription(`Now streaming **${stationName}** continuously in high-fidelity!`)
    .addFields(
      {
        name: '📻 Station Name',
        value: `**${stationName}**`,
        inline: true
      },
      {
        name: '🎭 Genre / Vibe',
        value: `\`${genre || 'Continuous Radio'}\``,
        inline: true
      },
      {
        name: '🔊 Voice Channel',
        value: `\`${channelName}\``,
        inline: true
      },
      {
        name: '🌐 Server',
        value: `**${guildName}**`,
        inline: true
      },
      {
        name: '🎧 Started By',
        value: requester ? `<@${requester.id}>` : '*User*',
        inline: true
      },
      {
        name: '🛡️ Continuous Streaming',
        value: 'Plays 24/7 without interruption. Automatically disconnects only if all listeners leave the VC.',
        inline: false
      }
    )
    .setFooter({
      text: `24/7 Station Active • ${guildName} • Mr. Drew Bot`,
      iconURL: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
    })
    .setTimestamp();

  if (track?.thumbnail) {
    embed.setThumbnail(track.thumbnail);
  }

  return embed;
}

/**
 * Standard Success Embed.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.description
 * @param {Array<{ name: string, value: string, inline?: boolean }>} [options.fields=[]]
 * @param {string} [options.footer]
 * @param {string} [options.thumbnail]
 * @param {import('discord.js').User} [options.user]
 * @returns {EmbedBuilder}
 */
function createSuccessEmbed({
  title,
  description,
  fields = [],
  footer,
  thumbnail,
  user
}) {
  const embed = new EmbedBuilder()
    .setColor(config.COLORS.SUCCESS)
    .setTitle(title.startsWith('✅') ? title : `✅ ${title}`)
    .setDescription(description)
    .setFooter({
      text: footer || 'Mr. Drew Bot • High-Fidelity Music',
      iconURL: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
    })
    .setTimestamp();

  if (user) {
    embed.setAuthor({
      name: user.username,
      iconURL: user.displayAvatarURL()
    });
  }

  if (thumbnail) embed.setThumbnail(thumbnail);
  if (fields.length > 0) embed.addFields(fields);

  return embed;
}

/**
 * Standard Error Embed.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.description
 * @param {Array<{ name: string, value: string, inline?: boolean }>} [options.fields=[]]
 * @param {string} [options.footer]
 * @returns {EmbedBuilder}
 */
function createErrorEmbed({
  title = 'Action Failed',
  description,
  fields = [],
  footer
}) {
  const embed = new EmbedBuilder()
    .setColor(config.COLORS.ERROR)
    .setTitle(title.startsWith('❌') ? title : `❌ ${title}`)
    .setDescription(description || 'An unexpected error occurred while processing this request.')
    .setFooter({
      text: footer || 'Mr. Drew Bot • Error Notice',
      iconURL: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
    })
    .setTimestamp();

  if (fields.length > 0) embed.addFields(fields);

  return embed;
}

/**
 * Standard Warning Embed.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.description
 * @param {Array<{ name: string, value: string, inline?: boolean }>} [options.fields=[]]
 * @param {string} [options.footer]
 * @returns {EmbedBuilder}
 */
function createWarningEmbed({
  title = 'Notice',
  description,
  fields = [],
  footer
}) {
  const embed = new EmbedBuilder()
    .setColor(config.COLORS.PAUSED)
    .setTitle(title.startsWith('⚠️') ? title : `⚠️ ${title}`)
    .setDescription(description)
    .setFooter({
      text: footer || 'Mr. Drew Bot • Notice',
      iconURL: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
    })
    .setTimestamp();

  if (fields.length > 0) embed.addFields(fields);

  return embed;
}

/**
 * Standard Info Embed.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.description
 * @param {Array<{ name: string, value: string, inline?: boolean }>} [options.fields=[]]
 * @param {string} [options.footer]
 * @returns {EmbedBuilder}
 */
function createInfoEmbed({
  title = 'Information',
  description,
  fields = [],
  footer
}) {
  const embed = new EmbedBuilder()
    .setColor(config.COLORS.INFO)
    .setTitle(title.startsWith('ℹ️') ? title : `ℹ️ ${title}`)
    .setDescription(description)
    .setFooter({
      text: footer || 'Mr. Drew Bot • Information',
      iconURL: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
    })
    .setTimestamp();

  if (fields.length > 0) embed.addFields(fields);

  return embed;
}

module.exports = {
  createProgressBar,
  createVolumeBar,
  createNowPlayingEmbed,
  createAddedToQueueEmbed,
  createPlaylistAddedEmbed,
  createQueueEmbed,
  createHistoryEmbed,
  createHelpEmbed,
  createStationEmbed,
  createSuccessEmbed,
  createErrorEmbed,
  createWarningEmbed,
  createInfoEmbed,
  HELP_PAGES
};
