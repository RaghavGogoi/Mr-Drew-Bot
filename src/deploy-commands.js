const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  } else {
    console.warn(`[Deploy] Warning: Command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

async function deployCommands() {
  config.validateConfig();
  const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

  try {
    console.log(`[Deploy] Started refreshing ${commands.length} application (/) commands globally...`);

    const data = await rest.put(
      Routes.applicationCommands(config.APPLICATION_ID),
      { body: commands }
    );

    console.log(`[Deploy] Successfully reloaded ${data.length} application (/) commands globally!`);
    return data;
  } catch (error) {
    console.error('[Deploy] Error registering application commands:', error);
    throw error;
  }
}

if (require.main === module) {
  deployCommands().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { deployCommands };
