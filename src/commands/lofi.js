const { SlashCommandBuilder } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { extractTracks } = require('../services/audioExtractor');
const { createStationEmbed, createErrorEmbed } = require('../ui/embeds');

const LOFI_STATIONS = {
  chill: {
    name: 'Lofi Girl - Beats to Relax/Study',
    query: 'lofi girl beats to relax study to live stream',
    genre: 'Relax & Study Beats',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/3075/3075908.png'
  },
  sleep: {
    name: 'Lofi Girl - Beats to Sleep/Chill',
    query: 'lofi girl beats to sleep chill to live stream',
    genre: 'Deep Sleep & Ambient Chill',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/869/869869.png'
  },
  synthwave: {
    name: 'Lofi Synthwave - Chill Retro Beats',
    query: 'synthwave lofi radio chill beats live stream',
    genre: 'Synthwave & Retro Wave',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
  },
  coffee: {
    name: 'Coffee Shop Lofi - Jazz & Study Vibes',
    query: 'coffee shop lofi hip hop radio live stream',
    genre: 'Coffee Shop & Jazz Hop',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/924/924514.png'
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lofi')
    .setDescription('Stream 24/7 high-fidelity Lofi beats continuously')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2])
    .addStringOption((opt) =>
      opt
        .setName('style')
        .setDescription('Choose your preferred lofi vibe')
        .setRequired(false)
        .addChoices(
          { name: '☕ Relax / Study Beats (Default)', value: 'chill' },
          { name: '🌙 Sleep / Deep Chill Beats', value: 'sleep' },
          { name: '🌆 Synthwave / Retro Chill', value: 'synthwave' },
          { name: '☕ Coffee Shop / Jazz Hop', value: 'coffee' }
        )
    ),

  async execute(interaction, client) {
    const styleKey = interaction.options.getString('style') || 'chill';
    const station = LOFI_STATIONS[styleKey] || LOFI_STATIONS.chill;

    await interaction.deferReply();

    const voiceContext = await getVoiceContext(client, interaction);
    if (voiceContext.error) {
      const errEmbed = createErrorEmbed({
        title: 'Voice Channel Required',
        description: voiceContext.error
      });
      return interaction.editReply({ embeds: [errEmbed] });
    }

    const { guild, channel } = voiceContext;
    const musicManager = getOrCreateMusicManager(client, guild.id);

    try {
      await musicManager.connect(channel, interaction.channel);
    } catch (err) {
      const errEmbed = createErrorEmbed({
        title: 'Voice Connection Failed',
        description: `Could not join voice channel: \`${err.message}\``
      });
      return interaction.editReply({ embeds: [errEmbed] });
    }

    // Stop existing playback and clear queue for continuous 24/7 radio
    musicManager.stopPlayback();

    try {
      const { tracks } = await extractTracks(station.query, interaction.user);
      if (!tracks || tracks.length === 0) {
        const errEmbed = createErrorEmbed({
          title: 'Station Unavailable',
          description: `Could not connect to live 24/7 Lofi station for **${station.name}**. Please try another vibe!`
        });
        return interaction.editReply({ embeds: [errEmbed] });
      }

      const track = tracks[0];
      track.title = `☕ 24/7 Lofi Live: ${station.name}`;
      track.source = '24/7 Lofi Radio';
      if (station.thumbnail) track.thumbnail = station.thumbnail;

      musicManager.queue.add(track);

      const embed = createStationEmbed({
        stationName: station.name,
        genre: station.genre || styleKey,
        track,
        guildName: guild.name,
        channelName: channel.name,
        requester: interaction.user,
        isLofi: true
      });

      await interaction.editReply({ embeds: [embed] });

      musicManager.playNext();
    } catch (err) {
      console.error('[Lofi Command Error]:', err);
      const errEmbed = createErrorEmbed({
        title: 'Lofi Stream Error',
        description: `Error connecting to the lofi live stream: \`${err.message}\``
      });
      return interaction.editReply({ embeds: [errEmbed] });
    }
  }
};
