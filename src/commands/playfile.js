const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { isAudioAttachment, processAudioAttachment } = require('../services/fileHandler');
const { createAddedToQueueEmbed, createErrorEmbed } = require('../ui/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('playfile')
    .setDescription('Upload and play a custom audio file directly from your device')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2])
    .addAttachmentOption((opt) =>
      opt
        .setName('file')
        .setDescription('Upload your audio file (MP3, WAV, FLAC, OGG, M4A, etc.)')
        .setRequired(true)
    ),

  /**
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {import('discord.js').Client} client
   */
  async execute(interaction, client) {
    const file = interaction.options.getAttachment('file');

    if (!isAudioAttachment(file)) {
      const errEmbed = createErrorEmbed({
        title: 'Unsupported Audio Format',
        description: 'The uploaded file is not recognized as an audio format.\n\n**Supported formats:**\n`MP3`, `WAV`, `FLAC`, `OGG`, `M4A`, `AAC`, `OPUS`, `WEBM`'
      });
      return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }

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
        description: `Failed to connect to the voice channel: \`${err.message}\``
      });
      return interaction.editReply({ embeds: [errEmbed] });
    }

    try {
      const track = await processAudioAttachment(file, interaction.user);
      const position = musicManager.queue.queue.length + 1;
      musicManager.queue.add(track);

      const currentTrackRemaining = musicManager.queue.current
        ? Math.max(0, (musicManager.queue.current.duration || 0) - musicManager.getElapsedSeconds())
        : 0;

      const embed = createAddedToQueueEmbed(track, position, musicManager.queue, currentTrackRemaining);
      await interaction.editReply({ embeds: [embed] });

      if (!musicManager.isPlaying) {
        musicManager.playNext();
      }
    } catch (err) {
      const errEmbed = createErrorEmbed({
        title: 'File Upload Error',
        description: `Error processing uploaded audio file: \`${err.message}\``
      });
      return interaction.editReply({ embeds: [errEmbed] });
    }
  }
};
