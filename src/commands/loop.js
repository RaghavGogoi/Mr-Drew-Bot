const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getVoiceContext } = require('../services/voiceService');
const { getOrCreateMusicManager } = require('../managers/musicManager');
const { LOOP_MODES, LOOP_NAMES } = require('../managers/queueManager');
const { createSuccessEmbed, createErrorEmbed } = require('../ui/embeds');

const LOOP_DESCRIPTIONS = {
  [LOOP_MODES.OFF]: 'Playback will proceed through the queue normally and stop when finished.',
  [LOOP_MODES.TRACK]: 'The currently playing track will repeat indefinitely.',
  [LOOP_MODES.QUEUE]: 'Songs will be re-added to the back of the queue when finished, looping the entire playlist.'
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Change or toggle the playback loop mode')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2])
    .addIntegerOption((opt) =>
      opt
        .setName('mode')
        .setDescription('Select loop mode')
        .setRequired(false)
        .addChoices(
          { name: 'Off - No looping', value: LOOP_MODES.OFF },
          { name: 'Track - Repeat current track', value: LOOP_MODES.TRACK },
          { name: 'Queue - Repeat entire queue', value: LOOP_MODES.QUEUE }
        )
    ),

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
    const chosenMode = interaction.options.getInteger('mode');

    let newMode;
    if (chosenMode !== null) {
      musicManager.queue.setLoop(chosenMode);
      newMode = chosenMode;
    } else {
      newMode = musicManager.cycleLoop();
    }

    const successEmbed = createSuccessEmbed({
      title: 'Loop Mode Updated',
      description: `Playback loop mode has been set to **${LOOP_NAMES[newMode]}**.`,
      fields: [
        { name: '🔁 Active Mode', value: `\`${LOOP_NAMES[newMode]}\``, inline: true },
        { name: '📜 Queue Length', value: `\`${musicManager.queue.queue.length} track(s)\``, inline: true },
        { name: 'ℹ️ Behavior', value: LOOP_DESCRIPTIONS[newMode] || 'Updated repeat behavior.', inline: false }
      ],
      user: interaction.user
    });

    return interaction.reply({ embeds: [successEmbed] });
  }
};
