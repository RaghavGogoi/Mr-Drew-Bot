const cmd24 = require('./24');
const { SlashCommandBuilder } = require('discord.js');

// Create exact clone under the name 'radio'
const radioData = new SlashCommandBuilder()
  .setName('radio')
  .setDescription('Stream a continuous 24/7 live music station for your selected genre')
  .setIntegrationTypes([0, 1])
  .setContexts([0, 1, 2]);

for (const opt of cmd24.data.options) {
  radioData.options.push(opt);
}

module.exports = {
  data: radioData,
  execute: cmd24.execute
};
