# Discord Music Bot

A high-performance Discord music bot built with **Node.js** and **Discord.js v14**. Supports universal audio streaming, custom audio file uploads, interactive controller buttons, rich status embeds, and Direct Message (DM) remote control.

---

## Key Features

- **Multi-Source Audio Playback**: Plays audio from search queries, web URLs, and custom audio file uploads.
- **Custom Audio File Uploads**: Upload tracks (`.mp3`, `.wav`, `.flac`, `.ogg`, `.m4a`, `.aac`, `.opus`, `.webm`) directly via `/play` or `/playfile`.
- **Automated Temp File Management**: Uploaded files are automatically cleaned up when playback finishes, on skip/stop, and by a recurring disk protection routine.
- **24/7 Radio & Lofi Stations**: Stream continuous stations for relaxing, study, synthwave, EDM, and genre radio using `/lofi` and `/24` (or `/radio`).
- **Interactive Music Controller**: Buttons attached directly to the Now Playing embed:
  - Play / Pause toggle
  - Skip & Previous (history playback)
  - Stop & Disconnect
  - Loop mode switcher (Off -> Track -> Queue)
  - Shuffle upcoming queue
  - Paginated Queue and History displays
  - Modal-based Volume control (1% - 200%)
  - Refresh button for progress bar updates
- **Direct Message (DM) Control**: Run slash commands directly inside the bot's DM. The bot automatically discovers which voice channel you are currently in across shared servers, joins, and sends playback controls directly to your direct message chat.
- **Voice Channel Retention**: The bot stays in the voice channel waiting for more songs and only initiates an idle leave timer when all human listeners leave the channel.

---

## Prerequisites

Before setting up the bot, ensure you have the following installed on your host machine or server:

1. **Node.js** (v18.0.0 or higher):
   - Check with: `node -v`
   - Download: [nodejs.org](https://nodejs.org/)

2. **FFmpeg** (Required for audio processing):
   - **Windows**: `winget install Gyan.FFmpeg` or download from [ffmpeg.org](https://ffmpeg.org/) and add to your PATH.
   - **Ubuntu/Debian**: `sudo apt update && sudo apt install -y ffmpeg`
   - **macOS**: `brew install ffmpeg`

3. **yt-dlp** (Required for media extraction):
   - **Windows**: `winget install yt-dlp` or download the binary from [yt-dlp GitHub releases](https://github.com/yt-dlp/yt-dlp/releases).
   - **Ubuntu/Debian**: `sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp`
   - **macOS**: `brew install yt-dlp`

*(Note: If you deploy using Docker, FFmpeg and yt-dlp are bundled automatically in the container image.)*

---

## Step 1: Create Your Discord Application & Bot

1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** in the top-right corner.
3. Enter a name for your bot and confirm.
4. Go to **General Information**:
   - Copy the **Application ID** (Client ID). Save this for your `.env` file.
5. Go to the **Bot** tab on the left menu:
   - Click **Reset Token** to generate a new bot token.
   - Copy the **Token** immediately. Save this for your `.env` file.
   - Under **Privileged Gateway Intents**, turn **ON** the following toggles:
     - **Server Members Intent**
     - **Message Content Intent**
   - Click **Save Changes**.
6. Generate your Bot Invite Link:
   - Go to **OAuth2** -> **URL Generator**.
   - Under **Scopes**, select:
     - `bot`
     - `applications.commands`
   - Under **Bot Permissions**, select:
     - `View Channels`
     - `Send Messages`
     - `Embed Links`
     - `Attach Files`
     - `Connect`
     - `Speak`
     - `Use Voice Activity`
   - Copy the generated URL at the bottom and open it in your browser to invite the bot to your Discord server.

---

## Step 2: Clone and Configure the Project

1. Clone your repository:
   ```bash
   git clone https://github.com/your-username/your-bot-repo.git
   cd your-bot-repo
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create your `.env` configuration file from the example template:
   ```bash
   cp .env.example .env
   ```
   *(On Windows Command Prompt: `copy .env.example .env`, or on PowerShell: `Copy-Item .env.example .env`)*

4. Open `.env` in an editor and enter your credentials:
   ```env
   DISCORD_TOKEN=your_bot_token_here
   APPLICATION_ID=your_application_id_here
   PUBLIC_KEY=your_public_key_here

   DEFAULT_VOLUME=100
   EMPTY_VC_TIMEOUT_SECONDS=60
   MAX_QUEUE_SIZE=500
   MAX_HISTORY_SIZE=50
   TEMP_UPLOADS_DIR=temp_uploads

   # Optional: Spotify API credentials for faster search metadata
   # SPOTIFY_CLIENT_ID=
   # SPOTIFY_CLIENT_SECRET=
   ```

---

## Step 3: Register Slash Commands

Register the bot's application slash commands globally across Discord:

```bash
npm run deploy
```

> **Note**: Discord global command propagation usually completes within a few moments.

---

## Step 4: Run the Bot Locally

Verify everything runs properly:

```bash
npm start
```

Once the bot logs in, it will output its username and status in the console. Join a voice channel in your Discord server and try running `/play query: lofi hip hop`.

---

## Step 5: 24/7 Deployment Options

### Option A: Docker Deployment (Recommended)

Docker provides an isolated environment where Node.js, FFmpeg, and yt-dlp are bundled together with zero host configuration.

1. Ensure Docker and Docker Compose are installed.
2. Build and run the container:
   ```bash
   docker compose up -d --build
   ```
3. Check container logs:
   ```bash
   docker compose logs -f
   ```
4. Stop container:
   ```bash
   docker compose down
   ```

---

### Option B: VPS Deployment with PM2 (Ubuntu / Debian / Linux)

PM2 keeps your bot running in the background and restarts it automatically if the server reboots.

1. Connect to your VPS via SSH.
2. Install Node.js, FFmpeg, yt-dlp, and PM2:
   ```bash
   sudo apt update
   sudo apt install -y curl ffmpeg
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
   sudo chmod a+rx /usr/local/bin/yt-dlp
   sudo npm install -g pm2
   ```

3. Clone your bot repository and configure `.env`:
   ```bash
   git clone https://github.com/your-username/your-bot-repo.git
   cd your-bot-repo
   npm install
   cp .env.example .env
   nano .env
   ```

4. Deploy commands and start with PM2:
   ```bash
   npm run deploy
   pm2 start src/index.js --name "music-bot"
   pm2 save
   pm2 startup
   ```

5. Monitor your bot:
   ```bash
   pm2 status
   pm2 logs music-bot
   ```

---

### Option C: Systemd Service (Linux)

1. Create a systemd unit file:
   ```bash
   sudo nano /etc/systemd/system/musicbot.service
   ```

2. Add the following configuration (replace paths and user with yours):
   ```ini
   [Unit]
   Description=Discord Music Bot
   After=network.target

   [Service]
   Type=simple
   User=ubuntu
   WorkingDirectory=/home/ubuntu/your-bot-repo
   ExecStart=/usr/bin/node src/index.js
   Restart=always
   RestartSec=10
   Environment=NODE_ENV=production

   [Install]
   WantedBy=multi-user.target
   ```

3. Reload systemd and enable the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now musicbot
   sudo systemctl status musicbot
   ```

---

## Slash Commands Reference

| Command | Arguments | Description |
|---|---|---|
| `/play` | `[query]` or `[file]` | Play a song title, direct audio URL, or upload a custom audio file |
| `/playfile` | `[file]` | Upload and stream a local audio file directly |
| `/lofi` | `[style]` | Stream continuous 24/7 relaxing lofi beats |
| `/24` or `/radio` | `[genre]` | Stream continuous 24/7 radio stations |
| `/pause` | *None* | Pause playback |
| `/resume` | *None* | Resume playback |
| `/skip` | *None* | Skip to the next song in the queue |
| `/previous` | *None* | Replay the previous song from history |
| `/stop` | *None* | Stop music playback and clear the queue |
| `/leave` | *None* | Disconnect the bot from the voice channel |
| `/queue` | `[page]` | View the upcoming playlist with pagination |
| `/nowplaying` | *None* | Show track details and interactive player controls |
| `/history` | `[page]` | View session playback history |
| `/loop` | `[mode]` | Set loop mode (`Off`, `Track`, `Queue`) |
| `/shuffle` | *None* | Randomize the order of tracks in the queue |
| `/volume` | `[percent]` | Set playback volume from 1% to 200% |
| `/seek` | `[seconds]` | Jump to a timestamp within the current song |
| `/remove` | `[position]` | Remove a specific song from the queue |
| `/clear` | *None* | Clear all songs from the queue |
| `/help` | `[page]` | View interactive guide and documentation |

---

## Troubleshooting

- **Bot joins voice channel but no audio plays**:
  - Verify that FFmpeg is installed and accessible from your terminal (`ffmpeg -version`).
  - Make sure the bot has the `Speak` and `Connect` permissions in that specific channel.
- **yt-dlp extraction issues or rate limits**:
  - Update yt-dlp to the latest release: `yt-dlp -U`.
- **Slash commands do not appear**:
  - Run `npm run deploy` to reload application commands globally.
  - Verify that the bot was invited with the `applications.commands` OAuth2 scope.
- **Missing Privileged Gateway Intents**:
  - If the bot crashes on startup or cannot read guild states, ensure **Server Members Intent** and **Message Content Intent** are enabled in the Discord Developer Portal under the **Bot** tab.

---

## Pushing to GitHub

To publish this repository to your own GitHub account:

1. Create a new empty repository on [GitHub](https://github.com/new) (do not initialize with README or license).
2. Link your remote repository and push:
   ```bash
   git remote add origin https://github.com/your-username/your-repo-name.git
   git branch -M main
   git push -u origin main
   ```

---

## 🐛 Bug Reports & Feature Requests

Found a bug or have a suggestion? We use GitHub Issues to track feedback:

- **Report a Bug**: [Open a Bug Report](https://github.com/your-username/your-repo-name/issues/new?template=bug_report.md) with steps to reproduce, logs, and your OS/Node/FFmpeg environment.
- **Request a Feature**: [Open a Feature Request](https://github.com/your-username/your-repo-name/issues/new?template=feature_request.md) describing your idea.
- **Security Vulnerabilities**: Please review [SECURITY.md](SECURITY.md) to report vulnerabilities privately.

---

## Contributing

Contributions are always welcome! Check out [CONTRIBUTING.md](CONTRIBUTING.md) to learn how to set up the dev environment and submit pull requests.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
