const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const os = require('node:os');
const process = require('node:process');

// --- SAFETY LOCK VARIABLE ---
let activeSession = null;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('High-precision ultra-reactive performance metrics')
        .addIntegerOption(opt => 
            opt.setName('minutes')
                .setDescription('Duration of live updates (1-60)')
                .setMinValue(1).setMaxValue(60)),

    async execute(interaction) {
        // --- SAFETY CHECK (Prevent Concurrent Instances) ---
        if (activeSession) {
            const safetyEmbed = new EmbedBuilder()
                .setTitle('⚠️ Pulse Already Active')
                .setDescription(`There is already a live monitoring session active. To prevent API spam, please use the existing monitor here:\n\n🔗 **[Jump to Active Pulse](${activeSession})**`)
                .setColor(0xFFAA00);
            
            return interaction.reply({ embeds: [safetyEmbed], flags: MessageFlags.Ephemeral });
        }

        const liveMinutes = interaction.options.getInteger('minutes') || 5;
        const totalDuration = liveMinutes * 60000;
        const endTime = Date.now() + totalDuration;

        // Metric Logic
        const getMetrics = (intLat = 0) => {
            const mem = process.memoryUsage();
            const ramUsed = (mem.rss / 1024 / 1024).toFixed(3);
            const heapTotal = (mem.heapTotal / 1024 / 1024).toFixed(3);
            const cpuLoad = os.loadavg()[0].toFixed(2);
            
            const hrTime = process.hrtime();
            const jitter = ((hrTime[0] * 1000000 + hrTime[1] / 1000) % 1000).toFixed(0);

            return new EmbedBuilder()
                .setTitle('⚡ Ultra-Reactive Bot Pulse')
                .setColor(0x5865F2)
                .setDescription(`Live monitoring active until <t:${Math.floor(endTime / 1000)}:T>`)
                .addFields(
                    { name: '🛰️ Network Latency', value: `\`\`\`diff\n+ WS Pulse: ${interaction.client.ws.ping}ms\n+ Last Edit: ${intLat}ms\n- Jitter: ${jitter}μs\`\`\``, inline: true },
                    { name: '🧠 Precise Memory', value: `\`\`\`yaml\nRSS: ${ramUsed} MB\nHeap: ${heapTotal} MB\nUptime: ${formatDuration(interaction.client.uptime)}\`\`\``, inline: true },
                    { name: '🖥️ System Environment', value: `\`\`\`fix\nLoad: ${cpuLoad}%\nPlatform: ${os.platform()}\nCPUs: ${os.cpus().length}\`\`\``, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'High-Resolution Realtime Dashboard • v1.2' });
        };

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('p_refresh').setLabel('Manual Pulse').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('p_stop').setLabel('End Stream').setStyle(ButtonStyle.Danger)
        );

        // INITIAL REPLY (Compliant with withResponse standard)
        const startTime = Date.now();
        const replyResponse = await interaction.reply({ 
            embeds: [getMetrics()], 
            components: [buttons], 
            withResponse: true 
        });

        // The reply object for editing is stored inside .resource.message
        const response = replyResponse.resource.message;

        // LOCK THE COMMAND
        activeSession = response.url;
        
        let lastLat = response.createdTimestamp - startTime;
        await interaction.editReply({ embeds: [getMetrics(lastLat)] });

        // THE FAST REFRESH LOOP
        const liveLoop = setInterval(async () => {
            if (Date.now() > endTime) return stopLive('Auto-expired');
            
            const pulseStart = Date.now();
            try {
                // If the message is older than 15 minutes, re-fetch to keep stream alive
                if (Date.now() - interaction.createdTimestamp > 840000) {
                    const fresh = await interaction.channel.messages.fetch(response.id);
                    await fresh.edit({ embeds: [getMetrics(lastLat)] });
                } else {
                    await interaction.editReply({ embeds: [getMetrics(lastLat)] });
                }
                lastLat = Date.now() - pulseStart;
            } catch (e) {
                clearInterval(liveLoop);
                activeSession = null;
            }
        }, 1800);

        const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: totalDuration });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: '❌ Monitor already in use by owner.', flags: MessageFlags.Ephemeral });
            }
            if (i.customId === 'p_stop') return stopLive('Manually killed');
            if (i.customId === 'p_refresh') {
                const s = Date.now();
                await i.deferUpdate();
                lastLat = Date.now() - s;
                await i.editReply({ embeds: [getMetrics(lastLat)] });
            }
        });

        async function stopLive(reason) {
            clearInterval(liveLoop);
            collector.stop();
            activeSession = null; // --- UNLOCK ---

            const finalEmbed = getMetrics(lastLat);
            finalEmbed.setColor(0xFF0000)
                      .setTitle('🛑 Pulse Dashboard (Stopped)')
                      .setDescription(`The live stream has been **stopped**. Reason: \`${reason}\``);

            const row = new ActionRowBuilder().addComponents(
                buttons.components.map(b => ButtonBuilder.from(b).setDisabled(true))
            );

            await interaction.editReply({ embeds: [finalEmbed], components: [row] }).catch(() => null);
        }

        collector.on('end', (_, reason) => { if (reason === 'time') stopLive('Session Limit Reached'); });
    }
};

function formatDuration(ms) {
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / 60000) % 60;
    const h = Math.floor(ms / 3600000);
    return `${h}h ${m}m ${s}s`;
}