const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { extractTracks } = require('../services/audioExtractor');
const { isAudioAttachment, processAudioAttachment } = require('../services/fileHandler');
const { createAddedToQueueEmbed, createPlaylistAddedEmbed, createErrorEmbed } = require('../ui/embeds');
const { getMusicSuggestions } = require('../services/autocompleteService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play any song name, web link (YouTube, Spotify, SoundCloud, etc.), or upload an audio file')
    .setIntegrationTypes([0, 1]) // GuildInstall, UserInstall
    .setContexts([0, 1, 2])      // Guild, BotDM, PrivateChannel
    .addStringOption((opt) =>
      opt
        .setName('query')
        .setDescription('Song title, YouTube / Spotify / SoundCloud link, or direct audio URL')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addAttachmentOption((opt) =>
      opt
        .setName('file')
        .setDescription('Upload your own custom music file (MP3, WAV, FLAC, OGG, M4A, etc.)')
        .setRequired(false)
    ),

  /**
   * Autocomplete suggestions as user types in query
   * @param {import('discord.js').AutocompleteInteraction} interaction
   */
  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name === 'query') {
      const suggestions = await getMusicSuggestions(focusedOption.value);
      await interaction.respond(suggestions).catch(() => {});
    }
  },

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {import('discord.js').Client} client
   */
  async execute(interaction, client) {
    const query = interaction.options.getString('query');
    const file = interaction.options.getAttachment('file');

    if (!query && !file) {
      const errEmbed = createErrorEmbed({
        title: 'Missing Query or Audio File',
        description: 'Please provide either a song search/URL query or upload an audio file.\n\n**Examples:**\n• `/play query: lofi hip hop`\n• `/play query: https://open.spotify.com/track/...`\n• `/play file: [attach audio]`'
      });
      return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    // 1. Locate Voice Context (Supports both Guild and DM!)
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
        description: `Failed to connect to the voice channel: \`${err.message}\``
      });
      return interaction.editReply({ embeds: [errEmbed] });
    }

    const currentTrackRemaining = musicManager.queue.current
      ? Math.max(0, (musicManager.queue.current.duration || 0) - musicManager.getElapsedSeconds())
      : 0;

    // 2. Handle Custom Uploaded Audio File
    if (file) {
      if (!isAudioAttachment(file)) {
        const errEmbed = createErrorEmbed({
          title: 'Unsupported Audio Format',
          description: 'The attached file format is not supported.\n\n**Supported formats include:**\n`MP3`, `WAV`, `FLAC`, `OGG`, `M4A`, `AAC`, `OPUS`, `WEBM`'
        });
        return interaction.editReply({ embeds: [errEmbed] });
      }

      try {
        const track = await processAudioAttachment(file, interaction.user);
        const position = musicManager.queue.queue.length + 1;
        musicManager.queue.add(track);

        const embed = createAddedToQueueEmbed(track, position, musicManager.queue, currentTrackRemaining);
        await interaction.editReply({ embeds: [embed] });

        if (!musicManager.isPlaying) {
          musicManager.playNext();
        }
        return;
      } catch (err) {
        const errEmbed = createErrorEmbed({
          title: 'File Processing Error',
          description: `Failed to process uploaded audio file: \`${err.message}\``
        });
        return interaction.editReply({ embeds: [errEmbed] });
      }
    }

    // 3. Handle Query or URL Extraction
    try {
      const { tracks, isPlaylist, playlistTitle } = await extractTracks(query, interaction.user);

      if (!tracks || tracks.length === 0) {
        const errEmbed = createErrorEmbed({
          title: 'No Matching Tracks Found',
          description: `Could not find any playable audio for query: \`${query}\`.\nPlease check spelling or try a direct link!`
        });
        return interaction.editReply({ embeds: [errEmbed] });
      }

      if (isPlaylist) {
        const firstTrack = tracks[0];
        const lastTrack = tracks[tracks.length - 1];
        const addedCount = musicManager.queue.addTracks(tracks);

        const embed = createPlaylistAddedEmbed(
          playlistTitle || 'Playlist',
          addedCount,
          musicManager.queue,
          interaction.user,
          firstTrack,
          lastTrack
        );
        await interaction.editReply({ embeds: [embed] });
      } else {
        const track = tracks[0];
        const position = musicManager.queue.queue.length + 1;
        musicManager.queue.add(track);

        const embed = createAddedToQueueEmbed(track, position, musicManager.queue, currentTrackRemaining);
        await interaction.editReply({ embeds: [embed] });
      }

      // If nothing is playing, start playback immediately
      if (!musicManager.isPlaying) {
        musicManager.playNext();
      }
    } catch (err) {
      console.error('[Play Command Error]:', err);
      const errEmbed = createErrorEmbed({
        title: 'Audio Loading Error',
        description: `Could not load audio: \`${err.message.slice(0, 200)}\``
      });
      return interaction.editReply({ embeds: [errEmbed] });
    }
  }
};
