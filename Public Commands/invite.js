const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Get the link to invite me to your server!'),
    async execute(interaction) {
        const inviteEmbed = new EmbedBuilder()
            .setTitle('🚀 Invite Me')
            .setDescription('Enjoying the bot? Add me to your server for more access to commands!')
            .setColor(0x5865F2);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Invite Now')
                .setURL(`https://discord.com/api/oauth2/authorize?client_id=${interaction.client.user.id}&permissions=8&scope=bot%20applications.commands`)
                .setStyle(ButtonStyle.Link)
        );

        await interaction.reply({ embeds: [inviteEmbed], components: [row] });
    },
};