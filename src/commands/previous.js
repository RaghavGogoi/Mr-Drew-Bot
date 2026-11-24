const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { createSuccessEmbed, createWarningEmbed, createErrorEmbed } = require('../ui/embeds');
const { formatDuration } = require('../services/audioExtractor');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('previous')
    .setDescription('Play the previous track from history')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2]),

  async execute(interaction, client) {
    const voiceContext = await getVoiceContext(client, interaction);
    if (voiceContext.error) {
      const errEmbed = createErrorEmbed({
        title: 'Voice Channel Required',
        description: voiceContext.error
      });
      return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }

    const musicManager = getOrCreateMusicManager(client, voiceContext.guild.id);
    if (musicManager.queue.history.length === 0) {
      const warnEmbed = createWarningEmbed({
        title: 'No Playback History',
        description: 'There are no previously played tracks recorded in this session’s history.'
      });
      return interaction.reply({ embeds: [warnEmbed], flags: MessageFlags.Ephemeral });
    }

    const prevTrack = musicManager.queue.history[0];
    const success = musicManager.previous();

    if (success) {
      const successEmbed = createSuccessEmbed({
        title: 'Playing Previous Track',
        description: `Restored and started playing **[${prevTrack.title.slice(0, 60)}](${prevTrack.webpageUrl || prevTrack.url})** from history!`,
        fields: [
          { name: '🎵 Track', value: prevTrack.title.slice(0, 50), inline: true },
          { name: '⏱️ Duration', value: `\`${formatDuration(prevTrack.duration)}\``, inline: true },
          { name: '👤 Artist', value: `*${prevTrack.artist || 'Unknown'}*`, inline: true }
        ],
        user: interaction.user
      });
      return interaction.reply({ embeds: [successEmbed] });
    } else {
      const failEmbed = createErrorEmbed({
        title: 'Previous Track Failed',
        description: 'Could not restore the previous track from history.'
      });
      return interaction.reply({ embeds: [failEmbed], flags: MessageFlags.Ephemeral });
    }
  }
};
