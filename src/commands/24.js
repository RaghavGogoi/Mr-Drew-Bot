const { SlashCommandBuilder } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { extractTracks } = require('../services/audioExtractor');
const { createStationEmbed, createErrorEmbed } = require('../ui/embeds');

const GENRE_STATIONS = {
  lofi: {
    name: '24/7 Lofi Hip Hop (Relax / Study)',
    query: 'lofi hip hop radio beats to relax study to live stream',
    genre: 'Lofi / Study / Relax',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/3075/3075908.png'
  },
  synthwave: {
    name: '24/7 Synthwave & Cyberpunk Chill',
    query: 'synthwave radio chill beats live stream',
    genre: 'Synthwave / Retro Electro',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
  },
  gaming: {
    name: '24/7 Gaming EDM & Electro House',
    query: 'gaming edm radio live stream 24/7',
    genre: 'Gaming EDM / House',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/686/686589.png'
  },
  pop: {
    name: '24/7 Today’s Top Pop Hits',
    query: 'pop hits radio live 24/7 stream',
    genre: 'Top 40 / Pop Hits',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/1828/1828884.png'
  },
  rock: {
    name: '24/7 Rock & Classic Hits',
    query: 'rock radio live 24/7 stream',
    genre: 'Classic Rock & Modern Rock',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/3075/3075899.png'
  },
  jazz: {
    name: '24/7 Smooth Jazz & Cafe Piano',
    query: 'smooth jazz radio live stream 24/7',
    genre: 'Smooth Jazz & Cafe Piano',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/924/924514.png'
  },
  classical: {
    name: '24/7 Classical Focus & Study',
    query: 'classical music radio live stream 24/7',
    genre: 'Symphonic Classical & Focus',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/2907/2907253.png'
  },
  deep_house: {
    name: '24/7 Deep House & Sunset Lounge',
    query: 'deep house relax radio live stream 24/7',
    genre: 'Deep House / Sunset Lounge',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/3844/3844724.png'
  },
  hiphop: {
    name: '24/7 Hip Hop & Boom Bap',
    query: 'hip hop radio live 24/7 stream',
    genre: 'Hip Hop / Boom Bap / Rap',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/1063/1063376.png'
  },
  anime: {
    name: '24/7 Anime OST & J-Pop Chill',
    query: 'anime lofi chill radio live stream 24/7',
    genre: 'Anime Soundtracks & J-Pop',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/3408/3408545.png'
  },
  ambient: {
    name: '24/7 Ambient & Deep Sleep',
    query: 'ambient music sleep relaxation live stream 24/7',
    genre: 'Ambient / Sleep & Meditation',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/869/869869.png'
  },
  phonk: {
    name: '24/7 Drift Phonk & Bass',
    query: 'drift phonk radio live stream 24/7',
    genre: 'Drift Phonk / Bass Boosted',
    thumbnail: 'https://cdn-icons-png.flaticon.com/512/3076/3076041.png'
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('24')
    .setDescription('Stream a continuous 24/7 live music station for your selected genre')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2])
    .addStringOption((opt) =>
      opt
        .setName('genre')
        .setDescription('Select the 24/7 music genre station to stream')
        .setRequired(true)
        .addChoices(
          { name: '☕ Lofi Hip Hop (Relax / Study)', value: 'lofi' },
          { name: '🌆 Synthwave / Cyberpunk', value: 'synthwave' },
          { name: '🎮 Gaming EDM / Electro', value: 'gaming' },
          { name: '🌟 Top Pop Hits 24/7', value: 'pop' },
          { name: '🎸 Rock & Metal Hits', value: 'rock' },
          { name: '🎷 Smooth Jazz & Lounge', value: 'jazz' },
          { name: '🎻 Classical Focus & Study', value: 'classical' },
          { name: '🪩 Deep House / Sunset Chill', value: 'deep_house' },
          { name: '🎤 Hip Hop & Rap', value: 'hiphop' },
          { name: '🌸 Anime OST & J-Pop', value: 'anime' },
          { name: '🌌 Ambient & Sleep', value: 'ambient' },
          { name: '🏎️ Drift Phonk & Bass', value: 'phonk' }
        )
    ),

  async execute(interaction, client) {
    const genreKey = interaction.options.getString('genre');
    const station = GENRE_STATIONS[genreKey] || GENRE_STATIONS.lofi;

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
        description: `Could not connect to the voice channel: \`${err.message}\``
      });
      return interaction.editReply({ embeds: [errEmbed] });
    }

    // Stop current playback and clear queue for continuous 24/7 live station
    musicManager.stopPlayback();

    try {
      const { tracks } = await extractTracks(station.query, interaction.user);
      if (!tracks || tracks.length === 0) {
        const errEmbed = createErrorEmbed({
          title: 'Station Unavailable',
          description: `Could not connect to live 24/7 station for **${station.name}**. Please try another genre station!`
        });
        return interaction.editReply({ embeds: [errEmbed] });
      }

      const track = tracks[0];
      track.title = `🔴 24/7 LIVE: ${station.name}`;
      track.source = '24/7 Live Radio';
      if (station.thumbnail) track.thumbnail = station.thumbnail;

      musicManager.queue.add(track);

      const embed = createStationEmbed({
        stationName: station.name,
        genre: station.genre || genreKey,
        track,
        guildName: guild.name,
        channelName: channel.name,
        requester: interaction.user,
        isLofi: false
      });

      await interaction.editReply({ embeds: [embed] });

      musicManager.playNext();
    } catch (err) {
      console.error('[24 Command Error]:', err);
      const errEmbed = createErrorEmbed({
        title: '24/7 Stream Error',
        description: `Error connecting to the live stream: \`${err.message}\``
      });
      return interaction.editReply({ embeds: [errEmbed] });
    }
  }
};
