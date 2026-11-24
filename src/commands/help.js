const { SlashCommandBuilder } = require('discord.js');
const { createHelpEmbed, HELP_PAGES } = require('../ui/embeds');
const { createHelpPaginationComponents } = require('../ui/components');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Interactive manual, commands list, supported formats, and DM guide')
    .setIntegrationTypes([0, 1])
    .setContexts([0, 1, 2])
    .addIntegerOption((opt) =>
      opt
        .setName('page')
        .setDescription('Page number of the help guide (1 to 6)')
        .setMinValue(1)
        .setMaxValue(HELP_PAGES.length)
        .setRequired(false)
    ),

  async execute(interaction) {
    const page = interaction.options.getInteger('page') || 1;
    const embed = createHelpEmbed(page);
    const components = createHelpPaginationComponents(page, HELP_PAGES.length);

    return interaction.reply({ embeds: [embed], components });
  }
};
