# Discord Stream Watcher

A Node.js background worker that joins a configured Discord voice channel and tracks active streams.

## Local setup

1. Install Node.js 20.18 or later.
2. Copy `.env.example` to `.env` and add your values.
3. Install and run:

   ```bash
   npm ci
   npm start
   ```

## Deploy with Render Blueprint

1. Create an empty GitHub repository and push this folder to it. Do not commit `.env`.
2. In Render, select **New +** → **Blueprint**, then connect the GitHub repository.
3. Render detects `render.yaml` and creates a Background Worker.
4. Enter `TOKEN`, `SERVER_ID`, and `VOICE_CHANNEL_ID` when Render asks for environment values, then deploy.

The worker does not expose an HTTP port. Its process must stay running, so it is configured as a Render Background Worker rather than a Web Service.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `TOKEN` | Yes | Discord account token used by the client. |
| `SERVER_ID` | Yes | Discord server ID. |
| `VOICE_CHANNEL_ID` | Yes | Voice-channel ID to join. |

Keep the token only in local `.env` and Render's encrypted environment settings. If it has ever been committed or shared, rotate it before deployment.

## Commands

| Command | Purpose |
| --- | --- |
| `npm start` | Start the worker. |
| `npm run dev` | Start with Node's file watcher. |
| `npm test` | Check the main file for JavaScript syntax errors. |

## Notes

Automating a normal Discord user account may conflict with Discord's rules. Confirm that the account and intended use comply with Discord's current Terms of Service before deploying.
