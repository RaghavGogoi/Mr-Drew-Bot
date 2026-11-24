const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { createSuccessEmbed, createErrorEmbed } = require('../ui/embeds');
const { formatDuration } = require('../services/audioExtractor');
const { getQueuePositionChoices } = require('../services/autocompleteService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a specific track from the queue by its position number')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2])
    .addIntegerOption((opt) =>
      opt
        .setName('position')
        .setDescription('Queue position number to remove (see /queue)')
        .setMinValue(1)
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction, client) {
    let musicManager = null;
    if (interaction.guildId) {
      musicManager = client.musicManagers.get(interaction.guildId);
    } else {
      const voiceContext = await getVoiceContext(client, interaction);
      if (voiceContext.guild) {
        musicManager = client.musicManagers.get(voiceContext.guild.id);
      }
    }

    const focusedOption = interaction.options.getFocused(true);
    const choices = getQueuePositionChoices(musicManager, focusedOption.value);
    await interaction.respond(choices).catch(() => {});
  },

  async execute(interaction, client) {
    const pos = interaction.options.getInteger('position');
    const voiceContext = await getVoiceContext(client, interaction);

    if (voiceContext.error) {
      const errEmbed = createErrorEmbed({
        title: 'Voice Channel Required',
        description: voiceContext.error
      });
      return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }

    const musicManager = getOrCreateMusicManager(client, voiceContext.guild.id);
    const removed = musicManager.queue.remove(pos);

    if (removed) {
      const successEmbed = createSuccessEmbed({
        title: 'Track Removed from Queue',
        description: `Successfully removed **[${removed.title.slice(0, 60)}](${removed.webpageUrl || removed.url})** from queue position **#${pos}**.`,
        fields: [
          { name: '🗑️ Removed Track', value: removed.title.slice(0, 50), inline: true },
          { name: '⏱️ Duration', value: `\`${formatDuration(removed.duration)}\``, inline: true },
          { name: '📜 Remaining in Queue', value: `\`${musicManager.queue.queue.length} track(s)\``, inline: true }
        ],
        user: interaction.user
      });
      return interaction.reply({ embeds: [successEmbed] });
    } else {
      const errEmbed = createErrorEmbed({
        title: 'Invalid Queue Position',
        description: `No track exists at position **#${pos}**! The queue currently has **${musicManager.queue.queue.length}** upcoming track(s). Use \`/queue\` to verify positions.`
      });
      return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }
  }
};
