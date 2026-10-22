# Discord Stream Watcher

A Node.js service that joins a configured Discord voice channel, tracks active streams, and exposes a health endpoint for uptime checks.

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
3. Render detects `render.yaml` and creates a Web Service.
4. Enter `TOKEN`, `SERVER_ID`, and `VOICE_CHANNEL_ID` when Render asks for environment values, then deploy.

Render uses `GET /ping` as its health check. After deployment, create a cron-job.org job that calls `https://YOUR-RENDER-SERVICE.onrender.com/ping` every 10–14 minutes. The endpoint returns `{"status":"ok"}`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `TOKEN` | Yes | Discord account token used by the client. |
| `SERVER_ID` | Yes | Discord server ID. |
| `VOICE_CHANNEL_ID` | Yes | Voice-channel ID to join. |
| `PORT` | No | HTTP port supplied automatically by Render. |

Keep the token only in local `.env` and Render's encrypted environment settings. If it has ever been committed or shared, rotate it before deployment.

## Commands

| Command | Purpose |
| --- | --- |
| `npm start` | Start the worker. |
| `npm run dev` | Start with Node's file watcher. |
| `npm test` | Check the main file for JavaScript syntax errors. |

## Notes

Automating a normal Discord user account may conflict with Discord's rules. Confirm that the account and intended use comply with Discord's current Terms of Service before deploying.
