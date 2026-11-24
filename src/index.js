const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
  ActivityType,
  MessageFlags
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { deployCommands } = require('./deploy-commands');
const { getVoiceContext } = require('./services/voiceService');
const { getOrCreateMusicManager } = require('./managers/musicManager');
const { LOOP_NAMES } = require('./managers/queueManager');
const { extractPageFromCustomId } = require('./ui/pagination');
const {
  createQueuePaginationRow,
  createHistoryPaginationRow,
  createHelpPaginationComponents,
  createVolumeModal
} = require('./ui/components');
const {
  createQueueEmbed,
  createHistoryEmbed,
  createHelpEmbed,
  createSuccessEmbed,
  createErrorEmbed,
  createWarningEmbed,
  createInfoEmbed,
  createVolumeBar,
  HELP_PAGES
} = require('./ui/embeds');
const { formatDuration } = require('./services/audioExtractor');
const { cleanupTempFile, cleanOrphanedTempFiles } = require('./services/fileHandler');

// Initialize Discord Client with Voice, Guild, and DM capabilities
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

// Map of Guild ID -> MusicManager
client.musicManagers = new Map();
client.commands = new Collection();

// Load Slash Commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  }
}

// Bot Startup Event
client.once(Events.ClientReady, async (c) => {
  console.log(`[Bot Ready] Logged in as ${c.user.tag} (ID: ${c.user.id})`);

  c.user.setActivity({
    name: 'any music link & files • /help',
    type: ActivityType.Listening
  });

  // Clean orphaned temp files immediately on startup
  cleanOrphanedTempFiles();

  // Automated recurring cleanup every 15 minutes to guarantee laptop storage never bloats
  setInterval(() => {
    const activePaths = new Set();
    for (const manager of client.musicManagers.values()) {
      if (manager.queue?.current?.localPath) {
        activePaths.add(manager.queue.current.localPath);
      }
      for (const t of (manager.queue?.queue || [])) {
        if (t.localPath) activePaths.add(t.localPath);
      }
    }
    cleanOrphanedTempFiles(activePaths);
  }, 15 * 60 * 1000);

  // Automatically register and sync slash commands globally
  try {
    await deployCommands();
  } catch (err) {
    console.error('[Startup] Failed to auto-sync slash commands:', err.message);
  }
});

// Interaction Router (Slash Commands, Autocomplete, Buttons, Menus, Modals)
client.on(Events.InteractionCreate, async (interaction) => {
  // 1. Handle Autocomplete Suggestions
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command || !command.autocomplete) return;

    try {
      await command.autocomplete(interaction, client);
    } catch (err) {
      console.error(`[Autocomplete Error] in /${interaction.commandName}:`, err.message);
    }
    return;
  }

  // 2. Handle Slash Commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.warn(`[Command] Unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(`[Command Error] in /${interaction.commandName}:`, error);
      const errEmbed = createErrorEmbed({
        title: 'Command Execution Error',
        description: `An unexpected error occurred while running \`/${interaction.commandName}\`:\n\`${error.message.slice(0, 150)}\``
      });

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errEmbed], flags: MessageFlags.Ephemeral }).catch(() => {});
      } else {
        await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
    return;
  }

  // 3. Handle String Select Menus (e.g. Help category selector)
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'help_category_select') {
      const page = parseInt(interaction.values[0], 10) || 1;
      const embed = createHelpEmbed(page);
      const components = createHelpPaginationComponents(page, HELP_PAGES.length);
      return interaction.update({ embeds: [embed], components });
    }
    return;
  }

  // 4. Handle Button Controls
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // Help Pagination Buttons: help_page_*
    if (customId.startsWith('help_page_')) {
      if (customId.includes('indicator')) {
        return interaction.deferUpdate();
      }
      const page = extractPageFromCustomId(customId);
      const embed = createHelpEmbed(page);
      const components = createHelpPaginationComponents(page, HELP_PAGES.length);
      return interaction.update({ embeds: [embed], components });
    }

    // Resolve active MusicManager (Guild or DM context)
    let musicManager = null;
    if (interaction.guildId) {
      musicManager = client.musicManagers.get(interaction.guildId);
    } else {
      const voiceContext = await getVoiceContext(client, interaction);
      if (voiceContext.guild) {
        musicManager = client.musicManagers.get(voiceContext.guild.id);
      }
    }

    if (!musicManager) {
      const errEmbed = createErrorEmbed({
        title: 'No Active Music Session',
        description: 'No active music playback session found for this server or voice channel. Start music using `/play` or `/lofi`!'
      });
      return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }

    // Playback Controls
    if (customId === 'ctrl_play_pause') {
      const isPaused = musicManager.togglePause();
      const current = musicManager.queue.current;
      const successEmbed = createSuccessEmbed({
        title: isPaused ? 'Playback Paused' : 'Playback Resumed',
        description: isPaused
          ? `⏸️ Playback **paused** for **${current?.title || 'current track'}**.`
          : `▶️ Playback **resumed** for **${current?.title || 'current track'}**.`
      });
      return interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
    }

    if (customId === 'ctrl_skip') {
      const current = musicManager.queue.current;
      const next = musicManager.queue.queue[0];
      musicManager.skip();

      const successEmbed = createSuccessEmbed({
        title: 'Track Skipped',
        description: `⏭️ Skipped **${current?.title || 'current track'}**!`,
        fields: [
          { name: '🎵 Next Up', value: next ? `**${next.title.slice(0, 48)}**` : '*Queue is empty*', inline: true }
        ]
      });
      return interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
    }

    if (customId === 'ctrl_prev') {
      const prevTrack = musicManager.queue.history[0];
      const success = musicManager.previous();

      if (success) {
        const successEmbed = createSuccessEmbed({
          title: 'Playing Previous Track',
          description: `⏮️ Now playing previous track: **${prevTrack?.title || 'previous track'}**.`
        });
        return interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
      } else {
        const warnEmbed = createWarningEmbed({
          title: 'No Previous Track',
          description: 'No previous tracks recorded in this session’s history!'
        });
        return interaction.reply({ embeds: [warnEmbed], flags: MessageFlags.Ephemeral });
      }
    }

    if (customId === 'ctrl_stop') {
      musicManager.stopPlayback();
      const successEmbed = createSuccessEmbed({
        title: 'Playback Stopped',
        description: '⏹️ Stopped playback and cleared the upcoming queue. The bot remains in the voice channel ready for your next song!'
      });
      return interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
    }

    if (customId === 'ctrl_loop') {
      const newMode = musicManager.cycleLoop();
      const successEmbed = createSuccessEmbed({
        title: 'Loop Mode Changed',
        description: `🔁 Loop mode updated to: **${LOOP_NAMES[newMode]}**.`
      });
      return interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
    }

    if (customId === 'ctrl_shuffle') {
      if (musicManager.queue.queue.length <= 1) {
        const warnEmbed = createWarningEmbed({
          title: 'Cannot Shuffle',
          description: 'Not enough upcoming tracks in the queue to shuffle! (Need at least 2 tracks)'
        });
        return interaction.reply({ embeds: [warnEmbed], flags: MessageFlags.Ephemeral });
      }
      musicManager.shuffle();
      const successEmbed = createSuccessEmbed({
        title: 'Queue Shuffled',
        description: `🔀 Shuffled **${musicManager.queue.queue.length}** upcoming tracks in the queue!`
      });
      return interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
    }

    if (customId === 'ctrl_volume') {
      const modal = createVolumeModal(musicManager.volume);
      return interaction.showModal(modal);
    }

    if (customId === 'ctrl_refresh') {
      await musicManager.sendControllerMessage();
      const successEmbed = createSuccessEmbed({
        title: 'Controller Refreshed',
        description: '🔄 Player controller refreshed with live timestamps and state!'
      });
      return interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
    }

    if (customId === 'ctrl_queue') {
      const embed = createQueueEmbed(musicManager.queue, 1);
      const totalPages = Math.max(1, Math.ceil(musicManager.queue.queue.length / 10));
      const components = createQueuePaginationRow(1, totalPages, musicManager.queue.queue.length);
      return interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
    }

    if (customId === 'ctrl_history') {
      const embed = createHistoryEmbed(musicManager.queue, 1);
      const totalPages = Math.max(1, Math.ceil(musicManager.queue.history.length / 10));
      const components = createHistoryPaginationRow(1, totalPages);
      return interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
    }

    // Queue Pagination Buttons: queue_page_*
    if (customId.startsWith('queue_page_')) {
      if (customId.includes('indicator')) {
        return interaction.deferUpdate();
      }
      const page = extractPageFromCustomId(customId);
      const totalPages = Math.max(1, Math.ceil(musicManager.queue.queue.length / 10));
      const embed = createQueueEmbed(musicManager.queue, page);
      const rows = createQueuePaginationRow(page, totalPages, musicManager.queue.queue.length);
      return interaction.update({ embeds: [embed], components: rows });
    }

    if (customId === 'queue_clear') {
      for (const t of musicManager.queue.queue) {
        if (t.isLocalFile && t.localPath) {
          cleanupTempFile(t.localPath);
          t.localPath = null;
        }
      }
      musicManager.queue.clear();
      musicManager.sendControllerMessage();

      const embed = createQueueEmbed(musicManager.queue, 1);
      const rows = createQueuePaginationRow(1, 1, 0);
      return interaction.update({ embeds: [embed], components: rows });
    }

    if (customId === 'queue_shuffle') {
      if (musicManager.queue.queue.length > 1) {
        musicManager.shuffle();
        musicManager.sendControllerMessage();
      }
      const totalPages = Math.max(1, Math.ceil(musicManager.queue.queue.length / 10));
      const embed = createQueueEmbed(musicManager.queue, 1);
      const rows = createQueuePaginationRow(1, totalPages, musicManager.queue.queue.length);
      return interaction.update({ embeds: [embed], components: rows });
    }

    if (customId.startsWith('queue_refresh_')) {
      const page = extractPageFromCustomId(customId);
      const totalPages = Math.max(1, Math.ceil(musicManager.queue.queue.length / 10));
      const embed = createQueueEmbed(musicManager.queue, page);
      const rows = createQueuePaginationRow(page, totalPages, musicManager.queue.queue.length);
      return interaction.update({ embeds: [embed], components: rows });
    }

    // History Pagination Buttons: hist_page_*
    if (customId.startsWith('hist_page_')) {
      if (customId.includes('indicator')) {
        return interaction.deferUpdate();
      }
      const page = extractPageFromCustomId(customId);
      const totalPages = Math.max(1, Math.ceil(musicManager.queue.history.length / 10));
      const embed = createHistoryEmbed(musicManager.queue, page);
      const rows = createHistoryPaginationRow(page, totalPages);
      return interaction.update({ embeds: [embed], components: rows });
    }

    if (customId.startsWith('hist_refresh_')) {
      const page = extractPageFromCustomId(customId);
      const totalPages = Math.max(1, Math.ceil(musicManager.queue.history.length / 10));
      const embed = createHistoryEmbed(musicManager.queue, page);
      const rows = createHistoryPaginationRow(page, totalPages);
      return interaction.update({ embeds: [embed], components: rows });
    }
  }

  // 5. Handle Modal Submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'modal_set_volume') {
      const rawVal = interaction.fields.getTextInputValue('vol_input');
      const num = parseInt(rawVal, 10);

      if (isNaN(num) || num < 1 || num > 200) {
        const errEmbed = createErrorEmbed({
          title: 'Invalid Volume',
          description: 'Please enter a valid whole number between **1** and **200**.'
        });
        return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }

      let musicManager = null;
      if (interaction.guildId) {
        musicManager = client.musicManagers.get(interaction.guildId);
      } else {
        const voiceContext = await getVoiceContext(client, interaction);
        if (voiceContext.guild) {
          musicManager = client.musicManagers.get(voiceContext.guild.id);
        }
      }

      if (!musicManager) {
        const errEmbed = createErrorEmbed({
          title: 'No Active Session',
          description: 'No active music playback session found to set volume.'
        });
        return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
      }

      musicManager.setVolume(num);
      const volBar = createVolumeBar(num);
      const successEmbed = createSuccessEmbed({
        title: 'Volume Level Set',
        description: `🔊 Playback volume adjusted to **${num}%**!`,
        fields: [
          { name: '📊 Volume Level', value: volBar, inline: true }
        ]
      });
      return interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
    }
  }
});

// Auto-Disconnect ONLY when all human listeners leave the voice channel
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const guild = oldState.guild || newState.guild;
  if (!guild) return;

  const musicManager = client.musicManagers.get(guild.id);
  if (!musicManager || !musicManager.voiceChannel) return;

  const currentChannel = guild.channels.cache.get(musicManager.voiceChannel.id);
  if (!currentChannel) return;

  // Filter out bots to count real listeners
  const humanMembers = currentChannel.members.filter((m) => !m.user.bot);
  if (humanMembers.size === 0) {
    // Everyone left the voice channel! Start countdown
    musicManager.startEmptyVoiceTimer();
  } else {
    // At least one human is present! Cancel countdown, stay in VC
    musicManager.cancelEmptyVoiceTimer();
  }
});

// Process-level counter-measures to prevent unexpected crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process Notice] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err, origin) => {
  console.error('[Process Notice] Uncaught Exception:', err, 'origin:', origin);
});

// Graceful Termination
function shutdown() {
  console.log('[Bot Shutdown] Cleaning up all music sessions and exiting...');
  for (const manager of client.musicManagers.values()) {
    try {
      manager.disconnect();
    } catch (_) {}
  }
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the bot
config.validateConfig();
client.login(config.DISCORD_TOKEN).catch((err) => {
  console.error('[Bot Login Error]:', err.message);
  process.exit(1);
});
