# Contributing to the Music Bot

We welcome community contributions, bug reports, and enhancements.

## Development Workflow

1. Fork the repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/your-username/mr-drew-bot.git
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
