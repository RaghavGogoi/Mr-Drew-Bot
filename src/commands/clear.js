const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { cleanupTempFile } = require('../services/fileHandler');
const { createSuccessEmbed, createWarningEmbed, createErrorEmbed } = require('../ui/embeds');
const { formatDuration } = require('../services/audioExtractor');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear all upcoming tracks from the queue')
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
    const count = musicManager.queue.queue.length;

    if (count === 0) {
      const warnEmbed = createWarningEmbed({
        title: 'Queue Already Empty',
        description: 'There are no upcoming tracks in the queue to clear. Use `/play` to add songs!'
      });
      return interaction.reply({ embeds: [warnEmbed], flags: MessageFlags.Ephemeral });
    }

    const totalClearedDuration = musicManager.queue.getTotalDuration();

    // Clean up any uploaded local files in the cleared queue
    for (const t of musicManager.queue.queue) {
      if (t.isLocalFile && t.localPath) {
        cleanupTempFile(t.localPath);
        t.localPath = null;
      }
    }

    musicManager.queue.clear();
    musicManager.sendControllerMessage();

    const successEmbed = createSuccessEmbed({
      title: 'Queue Cleared',
      description: `Successfully wiped **${count}** upcoming track(s) from the playback queue!`,
      fields: [
        { name: '🗑️ Removed Songs', value: `\`${count} track(s)\``, inline: true },
        { name: '⏱️ Duration Freed', value: `\`${formatDuration(totalClearedDuration)}\``, inline: true },
        { name: '🎵 Current Track', value: musicManager.queue.current ? `**${musicManager.queue.current.title}** (Still Playing)` : '*None*', inline: false }
      ],
      user: interaction.user
    });

    return interaction.reply({ embeds: [successEmbed] });
  }
};
