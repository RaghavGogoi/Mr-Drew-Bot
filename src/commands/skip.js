const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { createSuccessEmbed, createWarningEmbed, createErrorEmbed } = require('../ui/embeds');
const { formatDuration } = require('../services/audioExtractor');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the currently playing track')
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
        description: 'There is no track currently playing to skip!'
      });
      return interaction.reply({ embeds: [warnEmbed], flags: MessageFlags.Ephemeral });
    }

    const currentTrack = musicManager.queue.current;
    const nextTrack = musicManager.queue.queue[0];
    musicManager.skip();

    const successEmbed = createSuccessEmbed({
      title: 'Track Skipped',
      description: `Skipped **[${currentTrack.title.slice(0, 60)}](${currentTrack.webpageUrl || currentTrack.url})**!`,
      fields: [
        { name: '⏭️ Skipped Song', value: currentTrack.title.slice(0, 50), inline: true },
        { name: '⏱️ Duration', value: `\`${formatDuration(currentTrack.duration)}\``, inline: true },
        { name: '🎵 Next Up', value: nextTrack ? `**[${nextTrack.title.slice(0, 50)}](${nextTrack.webpageUrl || nextTrack.url})**` : '*Queue is now empty*', inline: false }
      ],
      user: interaction.user
    });

    return interaction.reply({ embeds: [successEmbed] });
  }
};
