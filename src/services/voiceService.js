const { PermissionsBitField } = require('discord.js');

/**
 * Discovers and validates the voice channel context for a user.
 * Supports commands executed in both Guilds and Direct Messages (DM)!
 *
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').CommandInteraction} interaction
 * @returns {Promise<{ guild: import('discord.js').Guild|null, channel: import('discord.js').VoiceBasedChannel|null, member: import('discord.js').GuildMember|null, isDM: boolean, error: string|null }>}
 */
async function getVoiceContext(client, interaction) {
  const userId = interaction.user.id;

  // Case A: Command used directly inside a Guild
  if (interaction.guildId) {
    const guild = interaction.guild;
    let member = interaction.member;

    if (!member || !member.voice) {
      member = await guild.members.fetch(userId).catch(() => null);
    }

    if (!member || !member.voice?.channel) {
      return {
        guild,
        channel: null,
        member,
        isDM: false,
        error: '❌ You must be connected to a voice channel in this server to use music commands!'
      };
    }

    const channel = member.voice.channel;
    const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
    const perms = channel.permissionsFor(botMember);

    if (!perms?.has(PermissionsBitField.Flags.ViewChannel)) {
      return { guild, channel: null, member, isDM: false, error: `❌ I do not have permission to **View** \`${channel.name}\`!` };
    }
    if (!perms?.has(PermissionsBitField.Flags.Connect)) {
      return { guild, channel: null, member, isDM: false, error: `❌ I do not have permission to **Connect** to \`${channel.name}\`!` };
    }
    if (!perms?.has(PermissionsBitField.Flags.Speak)) {
      return { guild, channel: null, member, isDM: false, error: `❌ I do not have permission to **Speak** in \`${channel.name}\`!` };
    }
    if (channel.userLimit && channel.members.size >= channel.userLimit && !perms.has(PermissionsBitField.Flags.MoveMembers)) {
      if (!channel.members.has(botMember.id)) {
        return { guild, channel: null, member, isDM: false, error: `❌ The voice channel \`${channel.name}\` is currently full!` };
      }
    }

    return { guild, channel, member, isDM: false, error: null };
  }

  // Case B: Command executed in Direct Message (DM)
  // Scan all mutual guilds to find which server VC the user is actively connected to
  const guilds = Array.from(client.guilds.cache.values());
  let targetMatch = null;

  for (const g of guilds) {
    let m = g.members.cache.get(userId);
    if (!m) {
      m = await g.members.fetch(userId).catch(() => null);
    }

    if (m?.voice?.channel) {
      targetMatch = { guild: g, channel: m.voice.channel, member: m };
      break; // Found the user's active VC across mutual servers
    }
  }

  if (!targetMatch) {
    return {
      guild: null,
      channel: null,
      member: null,
      isDM: true,
      error:
        '❌ **No Active Voice Channel Found!**\n' +
        'You used this command in a DM, but you are not connected to a voice channel in any server where I am present.\n\n' +
        '👉 **To use DM control:**\n' +
        '1. Join a voice channel in any server that shares this bot.\n' +
        '2. Run `/play` or any music command right here in DM to remotely control the music!'
    };
  }

  const { guild, channel, member } = targetMatch;
  const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  const perms = channel.permissionsFor(botMember);

  if (!perms?.has(PermissionsBitField.Flags.Connect)) {
    return { guild, channel: null, member, isDM: true, error: `❌ I found you in **${guild.name}** (\`${channel.name}\`), but I lack permission to **Connect** there!` };
  }
  if (!perms?.has(PermissionsBitField.Flags.Speak)) {
    return { guild, channel: null, member, isDM: true, error: `❌ I found you in **${guild.name}** (\`${channel.name}\`), but I lack permission to **Speak** in \`${channel.name}\`!` };
  }

  return { guild, channel, member, isDM: true, error: null };
}

module.exports = { getVoiceContext };
