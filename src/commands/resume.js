const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { createSuccessEmbed, createWarningEmbed, createErrorEmbed } = require('../ui/embeds');
const { formatDuration } = require('../services/audioExtractor');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume paused track playback')
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
    if (!musicManager.isPlaying || !musicManager.queue.current) {
      const warnEmbed = createWarningEmbed({
        title: 'Nothing Playing',
        description: 'No music is currently loaded or playing! Use `/play` to get started.'
      });
      return interaction.reply({ embeds: [warnEmbed], flags: MessageFlags.Ephemeral });
    }

    if (!musicManager.isPaused) {
      const warnEmbed = createWarningEmbed({
        title: 'Already Playing',
        description: 'Music playback is already active and playing! Use `/pause` if you wish to pause.'
      });
      return interaction.reply({ embeds: [warnEmbed], flags: MessageFlags.Ephemeral });
    }

    musicManager.togglePause();
    const track = musicManager.queue.current;
    const elapsed = Math.round(musicManager.getElapsedSeconds());

    const successEmbed = createSuccessEmbed({
      title: 'Playback Resumed',
      description: `Resumed playback of **[${track.title.slice(0, 60)}](${track.webpageUrl || track.url})**!`,
      fields: [
        { name: '🎵 Track', value: track.title.slice(0, 50), inline: true },
        { name: '⏱️ Position', value: `\`${formatDuration(elapsed)} / ${formatDuration(track.duration)}\``, inline: true },
        { name: '🔊 Volume', value: `\`${musicManager.volume}%\``, inline: true }
      ],
      user: interaction.user
    });

    return interaction.reply({ embeds: [successEmbed] });
  }
};
