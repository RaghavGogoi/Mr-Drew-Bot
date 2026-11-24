const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { createHistoryEmbed, createErrorEmbed } = require('../ui/embeds');
const { createHistoryPaginationRow } = require('../ui/components');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('Show recently played tracks in this session with interactive pagination')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2])
    .addIntegerOption((opt) =>
      opt
        .setName('page')
        .setDescription('Page number of history to view')
        .setMinValue(1)
        .setRequired(false)
    ),

  async execute(interaction, client) {
    const page = interaction.options.getInteger('page') || 1;
    const voiceContext = await getVoiceContext(client, interaction);

    if (voiceContext.error) {
      const errEmbed = createErrorEmbed({
        title: 'Voice Channel Required',
        description: voiceContext.error
      });
      return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }

    const musicManager = getOrCreateMusicManager(client, voiceContext.guild.id);
    const totalPages = Math.max(1, Math.ceil(musicManager.queue.history.length / 10));
    const embed = createHistoryEmbed(musicManager.queue, page);

    if (musicManager.queue.history.length > 0) {
      const rows = createHistoryPaginationRow(page, totalPages);
      return interaction.reply({ embeds: [embed], components: rows });
    }

    return interaction.reply({ embeds: [embed] });
  }
};
