const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { formatDuration } = require('../services/audioExtractor');
const { createSuccessEmbed, createWarningEmbed, createErrorEmbed, createProgressBar } = require('../ui/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('seek')
    .setDescription('Jump to a specific timestamp in the current track')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2])
    .addIntegerOption((opt) =>
      opt
        .setName('seconds')
        .setDescription('Timestamp in seconds to jump to (e.g. 60 for 1 minute)')
        .setMinValue(0)
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const seconds = interaction.options.getInteger('seconds');
    const voiceContext = await getVoiceContext(client, interaction);

    if (voiceContext.error) {
      const errEmbed = createErrorEmbed({
        title: 'Voice Channel Required',
        description: voiceContext.error
      });
      return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }

    const musicManager = getOrCreateMusicManager(client, voiceContext.guild.id);
    const current = musicManager.queue.current;

    if (!musicManager.isPlaying || !current) {
      const warnEmbed = createWarningEmbed({
        title: 'Nothing Playing',
        description: 'No track is currently playing to seek! Start playback with `/play`.'
      });
      return interaction.reply({ embeds: [warnEmbed], flags: MessageFlags.Ephemeral });
    }

    if (current.duration && seconds > current.duration) {
      const errEmbed = createErrorEmbed({
        title: 'Timestamp Exceeds Duration',
        description: `Cannot seek to \`${formatDuration(seconds)}\` because this song is only \`${formatDuration(current.duration)}\` long!`
      });
      return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();
    const success = await musicManager.seek(seconds);

    if (success) {
      const bar = createProgressBar(seconds, current.duration);
      const successEmbed = createSuccessEmbed({
        title: 'Playback Position Seeked',
        description: `Successfully jumped to \`${formatDuration(seconds)}\` in **[${current.title.slice(0, 60)}](${current.webpageUrl || current.url})**!`,
        fields: [
          { name: '⏱️ Target Timestamp', value: `\`${formatDuration(seconds)}\``, inline: true },
          { name: '⌛ Total Duration', value: `\`${formatDuration(current.duration)}\``, inline: true },
          { name: '📊 Progress Bar', value: bar, inline: false }
        ],
        user: interaction.user
      });
      return interaction.editReply({ embeds: [successEmbed] });
    } else {
      const failEmbed = createErrorEmbed({
        title: 'Seek Operation Failed',
        description: 'Could not seek to that timestamp. Live streams or certain direct audio streams may not support arbitrary seeking.'
      });
      return interaction.editReply({ embeds: [failEmbed] });
    }
  }
};
