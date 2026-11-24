const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { createSuccessEmbed, createWarningEmbed, createErrorEmbed } = require('../ui/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Randomize the order of upcoming songs in the queue')
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

    if (count <= 1) {
      const warnEmbed = createWarningEmbed({
        title: 'Cannot Shuffle Queue',
        description: `There ${count === 1 ? 'is only 1 song' : 'are no songs'} in the upcoming queue. You need at least 2 upcoming tracks to shuffle!`
      });
      return interaction.reply({ embeds: [warnEmbed], flags: MessageFlags.Ephemeral });
    }

    musicManager.shuffle();
    const nextTrack = musicManager.queue.queue[0];

    const successEmbed = createSuccessEmbed({
      title: 'Queue Shuffled',
      description: `🔀 Successfully randomized the order of **${count}** upcoming track(s)!`,
      fields: [
        { name: '🎲 Tracks Shuffled', value: `\`${count} songs\``, inline: true },
        { name: '⏭️ Now Playing Next', value: nextTrack ? `**[${nextTrack.title.slice(0, 48)}](${nextTrack.webpageUrl || nextTrack.url})**` : '*None*', inline: true }
      ],
      user: interaction.user
    });

    return interaction.reply({ embeds: [successEmbed] });
  }
};
