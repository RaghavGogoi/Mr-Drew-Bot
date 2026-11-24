const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { createNowPlayingEmbed, createWarningEmbed, createErrorEmbed } = require('../ui/embeds');
const { createMusicControllerRows } = require('../ui/components');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show currently playing track with interactive music controller')
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

    const { guild, channel } = voiceContext;
    const musicManager = getOrCreateMusicManager(client, guild.id);

    if (!musicManager.isPlaying || !musicManager.queue.current) {
      const warnEmbed = createWarningEmbed({
        title: 'Nothing Playing',
        description: 'No track is currently playing in this server! Use `/play` or `/lofi` to start playing music.'
      });
      return interaction.reply({ embeds: [warnEmbed], flags: MessageFlags.Ephemeral });
    }

    const track = musicManager.queue.current;
    const playerState = {
      isPaused: musicManager.isPaused,
      volume: musicManager.volume,
      elapsedSeconds: musicManager.getElapsedSeconds(),
      hasPrevious: musicManager.queue.history.length > 0
    };

    const embed = createNowPlayingEmbed(
      track,
      playerState,
      musicManager.queue,
      guild.name,
      channel?.name || 'Voice Channel'
    );

    const components = createMusicControllerRows(playerState, musicManager.queue.loopMode);
    const reply = await interaction.reply({ embeds: [embed], components, fetchReply: true });

    // Store as the active controller message so button presses update it
    musicManager.controllerMessage = reply;
  }
};
