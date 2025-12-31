const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    ComponentType, StringSelectMenuBuilder, UserSelectMenuBuilder, MessageFlags, Events
} = require('discord.js');

// Registry to prevent duplicate sessions or bot crashes
const activeGamers = new Set();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buckshot')
        .setDescription('Strategic tactical gamble with a 5HP system and high-intelligence AI.'),

    async execute(interaction) {
        if (activeGamers.has(interaction.user.id)) {
            const err = new EmbedBuilder().setTitle('⚠️ Seat Occupied').setDescription('Finish your current game first!').setColor(0xFFAA00);
            return interaction.reply({ embeds: [err], flags: MessageFlags.Ephemeral });
        }

        activeGamers.add(interaction.user.id);

        // --- 1. LOBBY & INSTRUCTIONS ---
        const lobbyEmbed = new EmbedBuilder()
            .setTitle('🔫 BUCKSHOT ROULETTE')
            .setColor(0x2B2D31)
            .setDescription(`**WELCOME TO THE TABLE.**

📜 **BRIEF INSTRUCTIONS:**
- Shotgun magazine is randomized with **Live** (⚡) and **Blank** (❄️) rounds.
- Shoot yourself with a **Blank** to keep your turn.
- Shoot others with a **Live** to deduct 1 Health Charge.
- Every player starts with **5 Health Charges**.

⚠️ **CRITICAL WARNING:**
This is a fictional simulation for entertainment purposes ONLY.
**DO NOT use this for real-world gambling or harmful activities.**
Play responsibly and keep it safe.`)
            .setFooter({ text: 'Selection expires in 60s • AI: Tactical Expert' });

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('mode').setPlaceholder('Select Game Path').addOptions([
                { label: 'Singleplayer', value: 'sp', emoji: '🤖', description: 'Face the Deductive Dealer.' },
                { label: 'Multiplayer', value: 'mp', emoji: '👥', description: 'Up to 4 human victims.' }
            ])
        );

        const response = await interaction.reply({ embeds: [lobbyEmbed], components: [row], flags: MessageFlags.Ephemeral });
        const modeCol = response.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

        modeCol.on('collect', async m => {
            if (m.values[0] === 'sp') {
                await m.update({ content: '🤖 **Dealer:** "Signing the wavier... Let the game begin."', embeds: [], components: [] });
                return runGame(interaction, [{ id: interaction.user.id, user: interaction.user }, { id: 'DEALER', user: { username: 'The Dealer' } }]);
            } else {
                // MULTIPLAYER HANDLER
                const userMenu = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('targets').setPlaceholder('Select 1-4 Players').setMinValues(1).setMaxValues(4));
                await m.update({ embeds: [new EmbedBuilder().setTitle('👥 Lobby Invitation').setDescription('Pick opponents from the dropdown.')], components: [userMenu] });
                
                const uCol = response.createMessageComponentCollector({ componentType: ComponentType.UserSelect, time: 60000 });
                uCol.on('collect', async u => {
                    const selected = Array.from(u.users.values()).filter(usr => usr.id !== interaction.user.id && !usr.bot);
                    selected.forEach(t => activeGamers.add(t.id));

                    const confirmRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('y').setLabel('Confirm & DM').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('n').setLabel('Close Lobby').setStyle(ButtonStyle.Danger)
                    );
                    await u.update({ embeds: [new EmbedBuilder().setTitle('📝 Dispatching Contracts').setDescription(`Targets: ${selected.join(', ')}`)], components: [confirmRow] });

                    const bCol = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
                    bCol.on('collect', async b => {
                        if (b.customId === 'n') {
                            selected.forEach(t => activeGamers.delete(t.id)); activeGamers.delete(interaction.user.id);
                            return b.update({ content: 'Lobby terminated.', embeds: [], components: [] });
                        }

                        const participants = [{ id: interaction.user.id, user: interaction.user, accepted: true, status: '✅ Joined' }];
                        selected.forEach(t => participants.push({ id: t.id, user: t, accepted: false, status: '⏳ Pending' }));
                        
                        const statusE = (foot) => new EmbedBuilder().setTitle('📫 Invitation Phase').setColor(0x5865F2).setDescription(participants.map(p => `${p.status} **${p.user.username}**`).join('\n')).setFooter({text: foot});
                        const hostAbortRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('h_abort').setLabel('Abort Lobby').setStyle(ButtonStyle.Danger));
                        
                        const statusBoard = await interaction.channel.send({ content: `${selected.join(' ')}`, embeds: [statusE('Host can cancel at any time.')], components: [hostAbortRow] });
                        
                        const lobbyHandler = async (int) => {
                            if (!int.isButton()) return;
                            if (int.customId === 'h_abort' && int.user.id === interaction.user.id) {
                                selected.forEach(t => activeGamers.delete(t.id)); activeGamers.delete(interaction.user.id);
                                interaction.client.off(Events.InteractionCreate, lobbyHandler);
                                return statusBoard.edit({ content: null, embeds: [new EmbedBuilder().setTitle('🛑 Aborted').setDescription('Recruitment closed by host.').setColor(0xFF0000)], components: [] });
                            }

                            const p = participants.find(part => part.id === int.user.id);
                            if (p && !p.accepted && (int.customId === `j_${interaction.user.id}` || int.customId === `d_${interaction.user.id}`)) {
                                try { await int.deferReply({ flags: MessageFlags.Ephemeral }); } catch(e) { return; }
                                if (int.customId === `d_${interaction.user.id}`) {
                                    p.status = '❌ Declined';
                                    selected.forEach(t => activeGamers.delete(t.id)); activeGamers.delete(interaction.user.id);
                                    interaction.client.off(Events.InteractionCreate, lobbyHandler);
                                    return statusBoard.edit({ embeds: [statusE(`${int.user.username} declined. Table cleared.`).setColor(0xFF0000)], components: [] });
                                }
                                p.accepted = true; p.status = '✅ Joined';
                                await int.editReply({ content: 'Contract verified. Return to the table.' });
                                await statusBoard.edit({ embeds: [statusE('Checking heartbeats...')] });
                                if (participants.every(p => p.accepted)) {
                                    interaction.client.off(Events.InteractionCreate, lobbyHandler);
                                    runGame(interaction, participants, statusBoard);
                                }
                            }
                        };
                        interaction.client.on(Events.InteractionCreate, lobbyHandler);

                        for (const target of selected) {
                            try {
                                const dr = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`j_${interaction.user.id}`).setLabel('JOIN').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`d_${interaction.user.id}`).setLabel('DECLINE').setStyle(ButtonStyle.Danger));
                                await target.send({ embeds: [new EmbedBuilder().setTitle('🔫 Game Challenge').setDescription(`${interaction.user.tag} challenged you to Buckshot in ${interaction.guild.name}.`)], components: [dr] });
                            } catch { /* Fail siliently */ }
                        }
                    });
                });
            }
        });
    },
};

// --- CINEMATIC 5HP GAME ENGINE ---
async function runGame(interaction, playerConfigs, existingMsg = null) {
    let players = playerConfigs.map(p => ({ ...p, hp: 5, vHP: 5 }));
    let barrel = [];
    let turnIndex = 0;
    // Snapshot container to keep Step 1 frozen
    let vSnapshot = { len: 0, live: 0, blank: 0 };

    const reload = () => {
        const c = Math.floor(Math.random() * 3) + 4;
        const l = Math.ceil(c / 2);
        return [...Array(l).fill(true), ...Array(c - l).fill(false)].sort(() => Math.random() - 0.5);
    };

    barrel = reload();

    const getEmbed = (log = "Round loaded.", phase = 3) => {
        const cur = players[turnIndex];
        const isC = (phase < 3); // Boolean check for "Cinematic Frozen state"

        // Rule: In Step 1, keep HP and MAGAZINE FROZEN
        const displayHP = (p) => "🟩".repeat(Math.max(0, isC ? p.vHP : p.hp)) + "⬜".repeat(Math.max(0, 5 - (isC ? p.vHP : p.hp)));
        const lNum = isC ? vSnapshot.live : barrel.filter(s => s === true).length;
        const bNum = isC ? vSnapshot.blank : barrel.filter(s => s === false).length;
        const tNum = isC ? vSnapshot.len : barrel.length;

        const table = players.map(p => {
            const isTurn = players[turnIndex] && p.id === players[turnIndex].id;
            return `${p.hp <= 0 ? '💀' : isTurn ? '👉' : '👤'} **${p.user.username}**: [ ${displayHP(p)} ]`;
        }).join('\n');

        return new EmbedBuilder()
            .setTitle('🎲 BUCKSHOT: THE HIGH TABLE')
            .setDescription(`${table}\n\n**Board Log:**\n> *${log}*`)
            .addFields({ name: '⚡ Chamber Information', value: `\`${tNum}\` total: **${lNum}** Live | **${bNum}** Blank` })
            .setColor(players[turnIndex]?.id === 'DEALER' ? 0x2B2D31 : 0x5865F2);
    };

    const actionMenu = (players, idx) => {
        const r = new ActionRowBuilder();
        const actor = players[idx];
        if (!actor) return [];
        r.addComponents(new ButtonBuilder().setCustomId('self').setLabel('Aim Self').setEmoji('🔫').setStyle(ButtonStyle.Danger));
        players.filter(p => p.id !== actor.id && p.hp > 0).forEach(p => {
            if (r.components.length < 5) r.addComponents(new ButtonBuilder().setCustomId(`t_${p.id}`).setLabel(`Target ${p.user.username}`).setStyle(ButtonStyle.Primary));
        });
        const n = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('leave').setLabel('Leave Table').setEmoji('🚪').setStyle(ButtonStyle.Secondary));
        return [r, n];
    };

    const tableUI = { content: null, embeds: [getEmbed()], components: actionMenu(players, turnIndex) };
    const tableMsg = existingMsg ? await existingMsg.edit(tableUI) : await interaction.channel.send(tableUI);
    const gameCol = tableMsg.createMessageComponentCollector({ time: 3600000 });

    const handleTransition = async (shotWasLive, targetIndex) => {
        const living = players.filter(p => p && p.hp > 0);
        if (living.length <= 1) {
            players.forEach(p => activeGamers.delete(p.id));
            gameCol.stop();
            return tableMsg.edit({ embeds: [new EmbedBuilder().setTitle('🛑 GameOver').setDescription(`**${living[0]?.user.username || 'The Reaper'}** walked away.`).setColor(0x00FF00)], components: [] });
        }

        if (barrel.length === 0) {
            await tableMsg.edit({ embeds: [getEmbed('Empty shells ejected. Refreshing magazine...', 3)], components: [] });
            barrel = reload();
            await new Promise(res => setTimeout(res, 3000));
        }

        if (targetIndex !== turnIndex || shotWasLive) {
            do { turnIndex = (turnIndex + 1) % players.length; } while (!players[turnIndex] || players[turnIndex].hp <= 0);
        }

        const next = players[turnIndex];
        if (next && next.id === 'DEALER') {
            await tableMsg.edit({ embeds: [getEmbed('The Dealer counts the items in his chamber...')], components: [] });
            setTimeout(() => advancedDealerAI(tableMsg, players, barrel, handleTransition, getEmbed), 3000);
        } else {
            await tableMsg.edit({ embeds: [getEmbed()], components: actionMenu(players, turnIndex) });
        }
    };

    gameCol.on('collect', async i => {
        if (i.customId === 'leave') {
            const pIdx = players.findIndex(p => p.id === i.user.id);
            if (pIdx === -1) return;
            const userTag = players[pIdx].user.username;
            activeGamers.delete(i.user.id);
            players.splice(pIdx, 1);
            if (pIdx < turnIndex) turnIndex--;
            if (turnIndex >= players.length) turnIndex = 0;
            await i.reply({ content: `🚪 **${userTag}** left the match.`, flags: MessageFlags.Ephemeral });
            return handleTransition(true, 0);
        }

        if (i.user.id !== players[turnIndex]?.id) return i.reply({ content: 'Wait your turn.', flags: MessageFlags.Ephemeral });

        const targetPlayer = i.customId === 'self' ? players[turnIndex] : players.find(p => p.id === i.customId.replace('t_', ''));
        if (!targetPlayer) return;

        // PHASE 1 START: Record Snapshot
        players.forEach(p => p.vHP = p.hp); 
        vSnapshot = { len: barrel.length, live: barrel.filter(s => s === true).length, blank: barrel.filter(s => s === false).length };

        const bullet = barrel.shift();

        // Cinematic 1: Wait for Recoil (Log shows Tension, HP & MAGAZINE FROZEN)
        await i.update({ embeds: [getEmbed('Sweat drips... wait for recoil.', 1)], components: [] });

        setTimeout(async () => {
            const logMsg = bullet ? `⚡ **KABOOM!** It was Live. ${targetPlayer.user.username} took 1 Damage.` : `❄️ **Click.** It was a blank round. ${targetPlayer.user.username} is safe.`;
            
            // PHASE 2 START: Visual Change! 
            // Logical health drops only after recoil is over. 
            if (bullet) targetPlayer.hp--; 

            // STEP 2 REVEAL: Log changes, UI reflects NEW HP and NEW magazine count.
            await tableMsg.edit({ embeds: [getEmbed(logMsg, 3)] });

            // Step 3 transition
            setTimeout(() => handleTransition(bullet, players.indexOf(targetPlayer)), 3000);
        }, 3000);
    });
}

// --- PROFESSIONAL STRATEGIC DEALER ---
async function advancedDealerAI(msg, players, barrel, nextF, boardF) {
    const d = players.find(p => p.id === 'DEALER');
    const playerTarget = players.find(p => p.id !== 'DEALER' && p.hp > 0);
    if (!playerTarget || !d) return;

    // Brain Strategy: Pro Players only shoot themselves if probability favors turn-keeping.
    const tot = barrel.length;
    const lCount = barrel.filter(s => s === true).length;
    const betSelf = lCount === 0 || ((tot - lCount) / tot > 0.45 && lCount > 0);
    const chosenT = betSelf ? d : playerTarget;

    // AI Step 1: Snapshot and ponder
    players.forEach(p => p.vHP = p.hp);
    const snapL = lCount; const snapB = tot - lCount; const snapT = tot;

    const getAiUi = (logText, cinematic) => {
        const boardDisplay = players.map(p => {
            if (!p || !p.user) return "";
            const isTurn = p.id === 'DEALER';
            const val = cinematic ? p.vHP : p.hp;
            const barDisplay = "🟩".repeat(Math.max(0, val)) + "⬜".repeat(Math.max(0, 5 - val));
            return `${p.hp <= 0 ? '💀' : isTurn ? '👉' : '👤'} **${p.user.username}**: [ ${barDisplay} ]`;
        }).filter(Boolean).join('\n');

        return new EmbedBuilder()
            .setTitle('🎲 BUCKSHOT: THE HIGH TABLE').setColor(0x2B2D31)
            .setDescription(`${boardDisplay}\n\n**Action Log:**\n> *${logText}*`)
            .addFields({ name: '⚡ Chamber Load', value: `\`${cinematic ? snapT : barrel.length}\` items: **${cinematic ? snapL : barrel.filter(s=>s).length}** ⚡ | **${cinematic ? snapB : barrel.filter(s=>!s).length}** ❄️` });
    };

    const pondText = betSelf ? "Dealer calculates Blank risk... he aims the shotgun at himself." : `Dealer ignores the odds. He points the barrel at ${playerTarget.user.username}.`;
    await msg.edit({ embeds: [getAiUi(pondText, true)] }).catch(() => null);

    setTimeout(async () => {
        const stillVictim = players.find(p => p.id === chosenT.id);
        if (!stillVictim) return;

        const shellPull = barrel.shift();
        const resMsg = shellPull ? `⚡ **BANG!** Dealer fired a live into ${stillVictim.user.username}.` : `❄️ **CLICK.** Dealer aimed at ${stillVictim.user.username}... Blank.`;

        // UPDATE DATA LOGIC AFTER THOUGHT GAP
        if (shellPull) stillVictim.hp--;

        // AI Result UI: Reveals NEW shells and NEW hp
        await msg.edit({ embeds: [getAiUi(resMsg, false)] }).catch(() => null);

        setTimeout(() => {
            if (betSelf && !shellPull && d.hp > 0) {
                 msg.edit({ embeds: [new EmbedBuilder().setTitle('🔄 Tactician Cycle').setDescription('The Dealer keeps the turn after his self-shot gamble.')] });
                 setTimeout(() => advancedDealerAI(msg, players, barrel, nextF, boardF), 3000);
            } else {
                 nextF(shellPull, players.indexOf(stillVictim));
            }
        }, 3000);
    }, 3000);
}