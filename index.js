const { Client, GatewayIntentBits, Collection, REST, Routes, Events, Partials, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

// 1. SETUP BAD WORDS FILTER
const BadWordsNext = require('bad-words-next');
const en = require('bad-words-next/lib/en'); 
const badwords = new BadWordsNext({ data: en });

const app = express();
const webPort = process.env.PORT || 3000;

// 2. MIDDLEWARE & DB
app.use(express.json());
app.use(cors({
    origin: 'https://mrdrew.netlify.app'
}));
app.use(express.static('public'));

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('🍃 MongoDB: Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// 3. UPDATED SCHEMA
const GuildConfig = mongoose.model('GuildConfig', new mongoose.Schema({
    guildId: { type: String, unique: true },
    autoMod: { type: Boolean, default: true },
    logChannels: { type: [String], default: [] },    // Array of channel IDs
    blockedDomains: { type: [String], default: [] }  // Array of custom links/domains
}));

const User = mongoose.model('User', new mongoose.Schema({
    discordId: String, username: String, avatar: String
}));

// 4. BOT SETUP
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel, Partials.Message] 
});

client.commands = new Collection();
const commands = [];
const commandFolders = ['Developer Commands', 'Public Commands', 'Staff Commands', 'Game Commands'];

commandFolders.forEach(f => {
    const p = path.join(__dirname, f);
    if (fs.existsSync(p)) {
        fs.readdirSync(p).forEach(file => {
            const c = require(path.join(p, file));
            if (c.data && c.execute) {
                client.commands.set(c.data.name, c);
                commands.push(c.data.toJSON());
            }
        });
    }
});

const getRedirectUri = () => {
    const baseUrl = process.env.DASHBOARD_URL.endsWith('/') 
        ? process.env.DASHBOARD_URL.slice(0, -1) 
        : process.env.DASHBOARD_URL;
    return `${baseUrl}/callback.html`;
};

// 5. API ENDPOINTS

app.get('/api/auth/discord', (req, res) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(getRedirectUri())}&response_type=code&scope=identify%20guilds`;
    res.redirect(url);
});

app.post('/api/auth/discord/callback', async (req, res) => {
    const { code } = req.body;
    try {
        const params = new URLSearchParams({
            client_id: process.env.CLIENT_ID, client_secret: process.env.CLIENT_SECRET,
            grant_type: 'authorization_code', code: code, redirect_uri: getRedirectUri()
        });
        const tRes = await axios.post('https://discord.com/api/oauth2/token', params, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        const uRes = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tRes.data.access_token}` } });
        let user = await User.findOneAndUpdate(
            { discordId: uRes.data.id },
            { username: uRes.data.username, avatar: `https://cdn.discordapp.com/avatars/${uRes.data.id}/${uRes.data.avatar}.png` },
            { upsert: true, new: true }
        );
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'secret');
        res.json({ token, user: { username: user.username, avatar: user.avatar, dId: user.discordId } });
    } catch (e) { res.status(500).json({ error: "Auth Fail" }); }
});

app.get('/api/stats', (req, res) => {
    res.json({
        users: client.isReady() ? client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0) : 0,
        servers: client.isReady() ? client.guilds.cache.size : 0,
        ping: client.isReady() ? Math.round(client.ws.ping) : 0,
        commands: client.commands.size,
        uptime: client.uptime ? Math.floor(client.uptime / 60000) : 0
    });
});

app.get('/api/user/guilds', async (req, res) => {
    const dId = req.headers['user-id'];
    if (!dId || !client.isReady()) return res.json([]);
    const adminGuilds = [];
    for (const [guildId, guild] of client.guilds.cache) {
        const member = await guild.members.fetch(dId).catch(() => null);
        if (member && (member.permissions.has(PermissionFlagsBits.Administrator) || guild.ownerId === dId)) {
            adminGuilds.push({ id: guild.id, name: guild.name, icon: guild.iconURL() || `https://ui-avatars.com/api/?name=${encodeURIComponent(guild.name)}&background=6366f1&color=fff` });
        }
    }
    res.json(adminGuilds);
});

// NEW: Endpoint to get server channels for Log Channel selection
app.get('/api/guild/channels/:guildId', async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json([]);
    
    // Get only text channels
    const channels = guild.channels.cache
        .filter(c => c.type === ChannelType.GuildText)
        .map(c => ({ id: c.id, name: c.name }));
    res.json(channels);
});

// UPDATED: Save Config including new features
app.post('/api/guild/config', async (req, res) => {
    const { guildId, autoMod, logChannels, blockedDomains } = req.body;
    const config = await GuildConfig.findOneAndUpdate(
        { guildId }, 
        { 
            autoMod: Boolean(autoMod), 
            logChannels: logChannels || [], 
            blockedDomains: blockedDomains || [] 
        }, 
        { upsert: true, new: true }
    );
    res.json(config);
});

// UPDATED: Fetch Config
app.get('/api/guild/config/:guildId', async (req, res) => {
    const config = await GuildConfig.findOne({ guildId: req.params.guildId });
    res.json(config || { 
        guildId: req.params.guildId, 
        autoMod: true, 
        logChannels: [], 
        blockedDomains: [] 
    });
});

// 6. IMPROVED AUTO-MOD LOGIC
async function performModeration(message) {
    if (!message.content || message.author.bot || !message.guild) return;

    const config = await GuildConfig.findOne({ guildId: message.guild.id });
    if (config && config.autoMod === false) return;

    const hasBadWord = badwords.check(message.content);
    
    // Check Discord Invites
    const invitePatterns = ['discord.gg/', 'discord.com/invite/', 'discordapp.com/invite/'];
    const hasInviteLink = invitePatterns.some(pattern => message.content.toLowerCase().includes(pattern));

    // NEW: Check Custom Blocked Domains
    const hasBlockedDomain = (config?.blockedDomains || []).some(domain => 
        message.content.toLowerCase().includes(domain.toLowerCase())
    );

    if (hasBadWord || hasInviteLink || hasBlockedDomain) {
        const botPerms = message.channel.permissionsFor(client.user);
        if (!botPerms || !botPerms.has(PermissionFlagsBits.ManageMessages)) return;

        if (message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

        // 1. Delete message
        await message.delete().catch(() => null);

        // 2. Identify the primary violation
        let reason = "Restricted Content";
        if (hasBadWord) reason = "Prohibited Language";
        else if (hasInviteLink) reason = "External Invite Link";
        else if (hasBlockedDomain) reason = "Blacklisted Domain";

        // 3. Send Warning Embed
        const modEmbed = new EmbedBuilder()
            .setColor('#6366f1')
            .setAuthor({ name: 'Security Core', iconURL: client.user.displayAvatarURL() })
            .setDescription(`### 🛡️ Moderation Action\n${message.author}, your message was removed for **${reason}**.`)
            .setFooter({ text: 'Auto-Mod Active • Mr. Drew' })
            .setTimestamp();

        const warn = await message.channel.send({ embeds: [modEmbed] });
        setTimeout(() => warn.delete().catch(() => null), 6000);

        // 4. LOGGING TO CHANNELS
        if (config?.logChannels?.length > 0) {
            const logEmbed = new EmbedBuilder()
                .setColor('#f43f5e') // Rose red for logs
                .setTitle('🚨 Moderation Log')
                .addFields(
                    { name: 'User', value: `${message.author.tag} (${message.author.id})`, inline: true },
                    { name: 'Channel', value: `${message.channel}`, inline: true },
                    { name: 'Reason', value: reason },
                    { name: 'Original Message', value: `\`\`\`${message.content.substring(0, 1000)}\`\`\`` }
                )
                .setTimestamp();

            config.logChannels.forEach(channelId => {
                const logChan = message.guild.channels.cache.get(channelId);
                if (logChan) logChan.send({ embeds: [logEmbed] }).catch(() => null);
            });
        }
    }
}

// Listeners
client.on(Events.MessageCreate, performModeration);
client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
    if (newMsg.partial) await newMsg.fetch();
    performModeration(newMsg);
});

client.once(Events.ClientReady, () => {
    console.log(`🚀 Bot Live: ${client.user.tag}`);
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
});

app.listen(webPort, () => console.log(`📡 Dashboard API: http://localhost:${webPort}`));
client.login(process.env.DISCORD_TOKEN);