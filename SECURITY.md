# Security Policy

## Reporting Security Issues

Please **DO NOT** report security vulnerabilities or exposed tokens through public GitHub issues.

If you discover a security vulnerability or security bug, please report it privately:

1. Open a **Private Security Advisory** on GitHub:
   - Go to the **Security** tab of this repository.
   - Click **Advisories** -> **New draft security advisory**.
2. Or contact the project maintainer directly via GitHub profile details.

### Security Best Practices for Users
- Never commit your `.env` file to git.
- If you accidentally expose your bot token, immediately reset it in the [Discord Developer Portal](https://discord.com/developers/applications).
- Regularly update `yt-dlp` and npm dependencies to maintain audio extraction compatibility and security.
