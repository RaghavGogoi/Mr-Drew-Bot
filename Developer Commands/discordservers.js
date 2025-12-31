const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('discordservers')
        .setDescription('High-speed paginated server list (Parallel Invites). | 🔒 Owner Only 🔒'),

    async execute(interaction) {
        // --- 1. OWNER SECURITY ---
        const devID = '855412373442789396';
        if (interaction.user.id !== devID) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setTitle('🛑 Access Denied').setColor(0xFF0000)],
                flags: MessageFlags.Ephemeral
            });
        }

        const guilds = Array.from(interaction.client.guilds.cache.values());
        guilds.sort((a, b) => b.memberCount - a.memberCount);

        const totalServers = guilds.length;
        const serversPerPage = 5;
        const totalPages = Math.ceil(totalServers / serversPerPage);

        if (totalServers === 0) return interaction.reply({ content: "No servers found.", flags: MessageFlags.Ephemeral });

        let currentPage = 0;

        // --- Fast Invite Helper ---
        const getInvite = async (guild) => {
            if (guild.vanityURLCode) return `https://discord.gg/${guild.vanityURLCode}`;
            try {
                // Instantly try system channel or any invitable text channel
                const channel = guild.systemChannel || guild.channels.cache.find(c => 
                    c.type === ChannelType.GuildText && 
                    guild.members.me.permissionsIn(c).has('CreateInstantInvite')
                );

                if (channel) {
                    const invite = await channel.createInvite({ maxAge: 0, maxUses: 0 });
                    return invite.url;
                }
            } catch (e) { return '`Locked (Perms)`'; }
            return '`No Invitable Channel`';
        };

        // --- Speed-Parallel Embed Generator ---
        const generatePageEmbed = async (page) => {
            const start = page * serversPerPage;
            const currentServers = guilds.slice(start, start + serversPerPage);

            const embed = new EmbedBuilder()
                .setTitle('🌐 Node Registry: Active Servers')
                .setColor(0x5865F2)
                .setDescription(`Monitoring **${totalServers}** environments across the bot network.`)
                .setTimestamp()
                .setFooter({ text: `Page ${page + 1} of ${totalPages}` });

            // RUN PARALLEL: Fire all 5 API calls at once
            const dataBatch = await Promise.all(currentServers.map(async (guild, index) => {
                const link = await getInvite(guild);
                return {
                    num: start + index + 1,
                    name: guild.name,
                    id: guild.id,
                    pop: guild.memberCount.toLocaleString(),
                    inv: link
                };
            }));

            dataBatch.forEach(s => {
                embed.addFields({
                    name: `${s.num}. ${s.name}`,
                    value: `> **ID:** \`${s.id}\` | **Pop:** \`${s.pop}\`\n> **Invite:** ${s.inv}`,
                    inline: false
                });
            });

            return embed;
        };

        const navRow = (p) => new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev_s').setLabel('Back').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
            new ButtonBuilder().setCustomId('next_s').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(p >= totalPages - 1)
        );

        // --- Start Execution ---
        // Acknowledge the command first
        await interaction.reply({ 
            embeds: [new EmbedBuilder().setDescription('🛰️ **Initializing Node Sync...**').setColor(0xFFAA00)], 
            flags: MessageFlags.Ephemeral 
        });

        // Load page 1
        const firstEmbed = await generatePageEmbed(currentPage);
        
        // Correct Fix for Interaction: editReply returns the Message directly.
        const message = await interaction.editReply({
            embeds: [firstEmbed],
            components: [navRow(currentPage)]
        });

        // --- Stable Collector ---
        const col = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });

        col.on('collect', async i => {
            if (i.user.id !== interaction.user.id) return;

            if (i.customId === 'prev_s') currentPage--;
            if (i.customId === 'next_s') currentPage++;
            currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));

            // Visual feedback
            await i.deferUpdate();

            const nextEmbed = await generatePageEmbed(currentPage);
            await interaction.editReply({
                embeds: [nextEmbed],
                components: [navRow(currentPage)]
            });
        });

        col.on('end', () => {
            const row = navRow(currentPage);
            row.components.forEach(b => b.setDisabled(true));
            interaction.editReply({ components: [row] }).catch(() => null);
        });
    },
};