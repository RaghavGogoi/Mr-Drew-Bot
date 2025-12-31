const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shutdown')
        .setDescription('High-security system shutdown | 🔒 OWNER COMMAND 🔒'),
    async execute(interaction) {
        const ownerID = '855412373442789396'; 

        // LAYER 1: ID CHECK
        if (interaction.user.id !== ownerID) {
            const deniedEmbed = new EmbedBuilder()
                .setTitle('🛑 Access Denied')
                .setDescription('Unauthorized shutdown attempt. This action has been logged.')
                .setColor(0xFF0000);

            return interaction.reply({ 
                embeds: [deniedEmbed], 
                flags: MessageFlags.Ephemeral 
            });
        }

        const requestSentEmbed = new EmbedBuilder()
            .setDescription('🔐 **Security Verification required.** Please check your Direct Messages.')
            .setColor(0x5865F2); // Blurple

        await interaction.reply({ embeds: [requestSentEmbed], flags: MessageFlags.Ephemeral });

        // Generate 6-digit OTP
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

        try {
            // LAYER 2: DM BUTTON AUTHORIZATION
            const authEmbed = new EmbedBuilder()
                .setTitle('⚡ Critical Security: System Shutdown')
                .setDescription('A shutdown command was triggered. Do you authorize this request?\n\n*Verification session expires in 2 minutes.*')
                .setColor(0x5865F2);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('auth_approve').setLabel('Approve & Generate OTP').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('auth_cancel').setLabel('Cancel Action').setStyle(ButtonStyle.Danger)
            );

            const dmMessage = await interaction.user.send({ embeds: [authEmbed], components: [row] });

            // Button Collector
            const collector = dmMessage.createMessageComponentCollector({ 
                componentType: ComponentType.Button, 
                time: 120000 
            });

            collector.on('collect', async i => {
                if (i.customId === 'auth_cancel') {
                    const cancelEmbed = new EmbedBuilder()
                        .setTitle('❌ Action Aborted')
                        .setDescription('The system shutdown has been cancelled by the owner.')
                        .setColor(0xFF0000);

                    await i.update({ embeds: [cancelEmbed], components: [] });
                    return collector.stop();
                }

                // LAYER 3: OTP VERIFICATION
                const otpEmbed = new EmbedBuilder()
                    .setTitle('🔢 Final OTP Verification')
                    .setDescription(`Physical button confirmed. Now enter the security code into this chat to finalize:\n\n# Code: \`${otpCode}\``)
                    .setColor(0xFFAA00)
                    .setFooter({ text: 'Code expires in 30 seconds.' });

                await i.update({ embeds: [otpEmbed], components: [] });

                // Wait for text response
                const filter = m => m.content === otpCode && m.author.id === ownerID;
                const messageCollector = i.channel.createMessageCollector({ filter, max: 1, time: 30000 });

                messageCollector.on('collect', async m => {
                    const finalizedEmbed = new EmbedBuilder()
                        .setTitle('🔌 Shutdown Initialized')
                        .setDescription('OTP verified. All systems are going **offline** now.')
                        .setColor(0x00FF00);

                    await m.reply({ embeds: [finalizedEmbed] });
                    console.log(`[SHUTDOWN] Process exited via Owner 2FA (${interaction.user.tag})`);
                    
                    // Exit bot process after a short delay
                    setTimeout(() => process.exit(), 1500);
                });

                messageCollector.on('end', collected => {
                    if (collected.size === 0) {
                        const timeoutEmbed = new EmbedBuilder()
                            .setDescription('⚠️ **Security Timeout:** OTP was not entered. Shutdown failed.')
                            .setColor(0xFF0000);
                        i.followUp({ embeds: [timeoutEmbed] });
                    }
                });
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    const expiredEmbed = new EmbedBuilder()
                        .setTitle('⏰ Request Expired')
                        .setDescription('The security request has timed out and is no longer valid.')
                        .setColor(0x808080);
                        
                    dmMessage.edit({ embeds: [expiredEmbed], components: [] }).catch(() => null);
                }
            });

        } catch (error) {
            const failEmbed = new EmbedBuilder()
                .setTitle('❌ Communication Error')
                .setDescription('Failed to send security request to your DMs. Check your Privacy Settings.')
                .setColor(0xFF0000);

            return interaction.followUp({ embeds: [failEmbed], flags: MessageFlags.Ephemeral });
        }
    },
};