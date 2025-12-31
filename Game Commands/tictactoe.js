const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tictactoe')
        .setDescription('A fast-paced Tic Tac Toe with timers!')
        .addUserOption(opt => opt.setName('opponent').setDescription('User to challenge').setRequired(true)),

    async execute(interaction) {
        const p1 = interaction.user;
        const p2 = interaction.options.getUser('opponent');

        // Helper for consistent embed-only messaging
        const quickEmbed = (t, d, c) => new EmbedBuilder().setTitle(t).setDescription(d).setColor(c);

        if (p2.id === p1.id) {
            return interaction.reply({ 
                embeds: [quickEmbed('❌ Error', 'You cannot challenge yourself!', 0xFF0000)], 
                flags: MessageFlags.Ephemeral 
            });
        }
        if (p2.bot) {
            return interaction.reply({ 
                embeds: [quickEmbed('❌ Error', 'Bots are not eligible to play!', 0xFF0000)], 
                flags: MessageFlags.Ephemeral 
            });
        }

        // Phase 1: Challenge/Acceptance
        const expiry = Math.floor((Date.now() + 60000) / 1000);
        let ready = { [p1.id]: false, [p2.id]: false };

        const startEmbed = new EmbedBuilder()
            .setTitle('⚔️ Tic Tac Toe Challenge')
            .setDescription(`${p1} has challenged ${p2}!\n\nBoth players must click **Accept** to begin.\nExpiring <t:${expiry}:R>`)
            .setColor(0x5865F2);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('accept').setLabel('Accept').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('decline').setLabel('Decline').setStyle(ButtonStyle.Danger)
        );

        // Standard Reply
        const responseMessage = await interaction.reply({ 
            embeds: [startEmbed], 
            components: [row],
            withResponse: true
        });

        const resp = responseMessage.resource.message;
        const invCol = resp.createMessageComponentCollector({ time: 60000 });

        invCol.on('collect', async i => {
            if (![p1.id, p2.id].includes(i.user.id)) {
                return i.reply({ 
                    embeds: [quickEmbed('✋ Forbidden', 'This is not your match!', 0xFF0000)], 
                    flags: MessageFlags.Ephemeral 
                });
            }

            if (i.customId === 'decline') {
                invCol.stop('declined');
                return i.update({ embeds: [quickEmbed('❌ Cancelled', `The game was declined by ${i.user}.`, 0xFF0000)], components: [] });
            }

            ready[i.user.id] = true;
            if (ready[p1.id] && ready[p2.id]) {
                invCol.stop('start');
            } else {
                await i.reply({ 
                    embeds: [quickEmbed('✅ Ready', `You have accepted! Waiting for ${i.user.id === p1.id ? p2 : p1}...`, 0x00FF00)], 
                    flags: MessageFlags.Ephemeral 
                });
            }
        });

        invCol.on('end', async (_, r) => {
            if (r === 'start') startGame();
            else if (r === 'time') {
                await interaction.editReply({ 
                    embeds: [quickEmbed('⏰ Timeout', 'The challenge expired (players took too long).', 0x808080)], 
                    components: [] 
                });
            }
        });

        async function startGame() {
            let turn = p1;
            const board = Array(9).fill('empty');
            let gameActive = true;
            let timer;

            const buildRows = () => {
                const rows = [];
                for (let i = 0; i < 3; i++) {
                    const r = new ActionRowBuilder();
                    for (let j = 0; j < 3; j++) {
                        const idx = i * 3 + j;
                        r.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`t_${idx}`)
                                .setLabel(board[idx] === 'empty' ? '\u200b' : board[idx])
                                .setStyle(board[idx] === 'empty' ? ButtonStyle.Secondary : (board[idx] === '❌' ? ButtonStyle.Danger : ButtonStyle.Primary))
                                .setDisabled(!gameActive || board[idx] !== 'empty')
                        );
                    }
                    rows.push(r);
                }
                return rows;
            };

            const getGameEmbed = (msg = 'ongoing') => {
                const tEnd = Math.floor((Date.now() + 10000) / 1000);
                const e = new EmbedBuilder().setTimestamp();
                if (msg === 'ongoing') {
                    e.setTitle('❌ Tic Tac Toe ⭕')
                     .setColor(0x5865F2)
                     .setDescription(`${p1} (❌) vs ${p2} (⭕)\n\n👉 **${turn}'s Turn**\nTime runs out <t:${tEnd}:R>`);
                } else {
                    e.setTitle('🎉 Match Finished')
                     .setColor(msg.includes('🏆') ? 0x00FF00 : 0x808080)
                     .setDescription(msg);
                }
                return e;
            };

            // Switch from "Challenge" embed to the actual board
            await interaction.editReply({ embeds: [getGameEmbed()], components: buildRows() });
            
            const gameMsg = await interaction.fetchReply();
            const col = gameMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 600000 });

            const startTurnTimer = () => {
                clearTimeout(timer);
                timer = setTimeout(async () => {
                    const win = turn.id === p1.id ? p2 : p1;
                    gameActive = false;
                    await interaction.editReply({ 
                        embeds: [getGameEmbed(`⏰ **${turn} ran out of time!**\nWinner by forfeit: ${win} 🏆`)], 
                        components: buildRows() 
                    });
                    col.stop();
                }, 10000); // 10 Second Limit
            };

            startTurnTimer();

            col.on('collect', async i => {
                if (i.user.id !== turn.id) {
                    return i.reply({ 
                        embeds: [quickEmbed('✋ Wait', `It is currently ${turn}'s turn!`, 0xFF0000)], 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                const index = parseInt(i.customId.split('_')[1]);
                board[index] = turn.id === p1.id ? '❌' : '⭕';

                const result = checkWinner(board);
                if (result) {
                    clearTimeout(timer);
                    gameActive = false;
                    let endText = result === 'Tie' ? "The match resulted in a draw! 🤝" : `${turn} has won the match! 🏆`;
                    return i.update({ embeds: [getGameEmbed(endText)], components: buildRows() });
                }

                // Swap turn and reset timer
                turn = turn.id === p1.id ? p2 : p1;
                startTurnTimer();
                await i.update({ embeds: [getGameEmbed()], components: buildRows() });
            });
        }
    }
};

function checkWinner(b) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [x,y,z] of lines) {
        if (b[x] !== 'empty' && b[x] === b[y] && b[x] === b[z]) return b[x];
    }
    return !b.includes('empty') ? 'Tie' : null;
}