const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { createSuccessEmbed, createErrorEmbed } = require('../ui/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop music playback and clear the queue (remains in voice channel)')
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
    const wasPlaying = musicManager.isPlaying;
    const queuedCount = musicManager.queue.queue.length;

    musicManager.stopPlayback();

    const successEmbed = createSuccessEmbed({
      title: 'Playback Stopped',
      description: 'Stopped music playback, cleared all upcoming tracks, and reset the audio player.\n\n*The bot will remain connected to the voice channel waiting for your next song!*',
      fields: [
        { name: '⏹️ Status', value: 'Playback halted', inline: true },
        { name: '🧹 Tracks Cleared', value: `\`${queuedCount} track(s)\``, inline: true },
        { name: '🔊 Voice Channel', value: `\`${voiceContext.channel?.name || 'Voice Channel'}\``, inline: true }
      ],
      user: interaction.user
    });

    return interaction.reply({ embeds: [successEmbed] });
  }
};
