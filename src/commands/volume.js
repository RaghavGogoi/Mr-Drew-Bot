const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { createSuccessEmbed, createErrorEmbed, createVolumeBar } = require('../ui/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set the playback volume level (1% - 200%)')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2])
    .addIntegerOption((opt) =>
      opt
        .setName('percent')
        .setDescription('Volume level percentage (1 - 200)')
        .setMinValue(1)
        .setMaxValue(200)
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const percent = interaction.options.getInteger('percent');
    const voiceContext = await getVoiceContext(client, interaction);

    if (voiceContext.error) {
      const errEmbed = createErrorEmbed({
        title: 'Voice Channel Required',
        description: voiceContext.error
      });
      return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    }

    const musicManager = getOrCreateMusicManager(client, voiceContext.guild.id);
    const updatedVol = musicManager.setVolume(percent);
    const volBar = createVolumeBar(updatedVol);

    const volIcon =
      updatedVol > 120 ? '📢' :
      updatedVol > 70  ? '🔊' :
      updatedVol > 20  ? '🔉' : '🔈';

    const successEmbed = createSuccessEmbed({
      title: 'Volume Level Adjusted',
      description: `${volIcon} Playback volume set to **${updatedVol}%**!`,
      fields: [
        { name: '🔊 Current Volume', value: `\`${updatedVol}%\``, inline: true },
        { name: '📊 Volume Level', value: volBar, inline: true }
      ],
      user: interaction.user
    });

    return interaction.reply({ embeds: [successEmbed] });
  }
};
