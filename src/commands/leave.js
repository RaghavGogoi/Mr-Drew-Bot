const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { createSuccessEmbed, createErrorEmbed } = require('../ui/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Explicitly disconnect the bot from the voice channel')
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

    const channelName = voiceContext.channel ? voiceContext.channel.name : 'Voice Channel';
    const musicManager = getOrCreateMusicManager(client, voiceContext.guild.id);
    musicManager.disconnect();

    const successEmbed = createSuccessEmbed({
      title: 'Disconnected from Voice',
      description: `Left **${channelName}** and cleaned up the active playback session.`,
      fields: [
        { name: '🔊 Voice Channel', value: `\`${channelName}\``, inline: true },
        { name: '🌐 Server', value: `**${voiceContext.guild.name}**`, inline: true },
        { name: '💡 Tip', value: 'Run `/play` or `/lofi` anytime to invite me back!', inline: false }
      ],
      user: interaction.user
    });

    return interaction.reply({ embeds: [successEmbed] });
  }
};
