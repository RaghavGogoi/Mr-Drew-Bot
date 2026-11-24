# Contributing to Mr. Drew's Discord Music Bot

We welcome community contributions, bug reports, and enhancements.

## Reporting Bugs

If you find a bug or issue:

1. Check existing issues in the GitHub repository to see if it has already been reported.
2. If not, open a new issue using the **Bug Report** template.
3. Include:
   - Steps to reproduce the bug
   - Expected behavior vs. actual behavior
   - Node.js, FFmpeg, and yt-dlp versions
   - Error messages or stack traces from the console (make sure to **redact your bot token and any sensitive credentials**)
4. For security-related bugs, refer to [SECURITY.md](SECURITY.md).

## Development Workflow

1. Fork the repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/RaghavGogoi/Mr-Drew-Bot.git
   cd mr-drew-bot
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```
5. Fill in your test Discord bot credentials.
6. Verify file syntax:
   ```bash
   npm run check
   ```
7. Register slash commands:
   ```bash
   npm run deploy
   ```
8. Start the bot:
   ```bash
   npm start
   ```

## Pull Request Guidelines

- Ensure your code adheres to standard JavaScript formatting.
- Test all slash commands and voice playback in a private Discord test server.
- Do not commit your `.env` or personal bot tokens.
