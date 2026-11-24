const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { createQueueEmbed, createErrorEmbed } = require('../ui/embeds');
const { createQueuePaginationRow } = require('../ui/components');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Display the current music queue with interactive pagination')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2])
    .addIntegerOption((opt) =>
      opt
        .setName('page')
        .setDescription('Page number of the queue to view')
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
    const totalPages = Math.max(1, Math.ceil(musicManager.queue.queue.length / 10));
    const embed = createQueueEmbed(musicManager.queue, page);

    const rows = createQueuePaginationRow(page, totalPages, musicManager.queue.queue.length);
    return interaction.reply({ embeds: [embed], components: rows });
  }
};
