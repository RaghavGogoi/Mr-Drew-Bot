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

// 3. SCHEMAS
const GuildConfig = mongoose.model('GuildConfig', new mongoose.Schema({
    guildId: { type: String, unique: true },
    autoMod: { type: Boolean, default: true },
    logChannels: { type: [String], default: [] },
    blockedDomains: { type: [String], default: [] }
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

// Helper for Redirect URI
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
    } catch (e) { 
        console.error("Auth Error:", e.response ? e.response.data : e.message);
        res.status(500).json({ error: "Auth Fail" }); 
    }
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
        try {
            const member = await guild.members.fetch(dId).catch(() => null);
            if (member && (member.permissions.has(PermissionFlagsBits.Administrator) || guild.ownerId === dId)) {
                adminGuilds.push({ id: guild.id, name: guild.name, icon: guild.iconURL() || `https://ui-avatars.com/api/?name=${encodeURIComponent(guild.name)}&background=6366f1&color=fff` });
            }
        } catch (err) { continue; }
    }
    res.json(adminGuilds);
});

app.get('/api/guild/channels/:guildId', async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json([]);
    const channels = guild.channels.cache
        .filter(c => c.type === ChannelType.GuildText)
        .map(c => ({ id: c.id, name: c.name }));
    res.json(channels);
});

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

app.get('/api/guild/config/:guildId', async (req, res) => {
    const config = await GuildConfig.findOne({ guildId: req.params.guildId });
    res.json(config || { guildId: req.params.guildId, autoMod: true, logChannels: [], blockedDomains: [] });
});

// 6. MODERN AUTO-MOD LOGIC
async function performModeration(message) {
    if (!message.content || message.author.bot || !message.guild) return;

    const config = await GuildConfig.findOne({ guildId: message.guild.id });
    if (config && config.autoMod === false) return;

    const hasBadWord = badwords.check(message.content);
    const invitePatterns = ['discord.gg/', 'discord.com/invite/', 'discordapp.com/invite/'];
    const hasInviteLink = invitePatterns.some(pattern => message.content.toLowerCase().includes(pattern));
    const hasBlockedDomain = (config?.blockedDomains || []).some(domain => message.content.toLowerCase().includes(domain.toLowerCase()));

    if (hasBadWord || hasInviteLink || hasBlockedDomain) {
        const botPerms = message.channel.permissionsFor(client.user);
        if (!botPerms || !botPerms.has(PermissionFlagsBits.ManageMessages)) return;
        if (message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

        await message.delete().catch(() => null);

        let reason = hasBadWord ? "Prohibited Language" : (hasInviteLink ? "External Invite Link" : "Blacklisted Domain");

        const modEmbed = new EmbedBuilder()
            .setColor('#6366f1')
            .setAuthor({ name: 'Security Core', iconURL: client.user.displayAvatarURL() })
            .setDescription(`### 🛡️ Moderation Action\n${message.author}, your message was removed for **${reason}**.`)
            .setFooter({ text: 'Auto-Mod Active • Mr. Drew' })
            .setTimestamp();

        const warn = await message.channel.send({ embeds: [modEmbed] });
        setTimeout(() => warn.delete().catch(() => null), 6000);

        if (config?.logChannels?.length > 0) {
            const logEmbed = new EmbedBuilder()
                .setColor('#f43f5e')
                .setTitle('🚨 Moderation Log')
                .addFields(
                    { name: 'User', value: `${message.author.tag}`, inline: true },
                    { name: 'Channel', value: `${message.channel}`, inline: true },
                    { name: 'Reason', value: reason },
                    { name: 'Message', value: `\`\`\`${message.content.substring(0, 1000)}\`\`\`` }
                ).setTimestamp();

            config.logChannels.forEach(channelId => {
                const logChan = message.guild.channels.cache.get(channelId);
                if (logChan) logChan.send({ embeds: [logEmbed] }).catch(() => null);
            });
        }
    }
}

client.on(Events.MessageCreate, performModeration);
client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
    if (newMsg.partial) await newMsg.fetch();
    performModeration(newMsg);
});

// 7. STARTUP SEQUENCE (Render Optimized)
const start = async () => {
    try {
        // Step 1: Connect to Database
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🍃 MongoDB: Connected');

        // Step 2: Start Express Server
        app.listen(webPort, '0.0.0.0', () => {
            console.log(`📡 Dashboard API: http://0.0.0.0:${webPort}`);
            
            // Step 3: Log in Discord Bot
            client.login(process.env.DISCORD_TOKEN);
        });
    } catch (err) {
        console.error("Startup Error:", err);
        process.exit(1);
    }
};

client.once(Events.ClientReady, () => {
    console.log(`🚀 Bot & Dashboard Online!`);
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
});

start();