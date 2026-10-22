const { Client } = require('@trickstarcandina/discordjs-selfbot');
require('dotenv').config();

const requiredEnvironmentVariables = ['TOKEN', 'SERVER_ID', 'VOICE_CHANNEL_ID'];
const missingEnvironmentVariables = requiredEnvironmentVariables.filter(
  (name) => !process.env[name]
);

if (missingEnvironmentVariables.length > 0) {
  console.error(
    `[CONFIG] Missing required environment variables: ${missingEnvironmentVariables.join(', ')}`
  );
  process.exit(1);
}

const client = new Client();

const GUILD_ID = process.env.SERVER_ID;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;

const watchingUsers = new Map(); // userId -> StreamConnectionReadonly
let voiceConnection = null;
let keepAliveInterval = null;
let scanInterval = null;
let summaryInterval = null;
let isJoining = false;

// ============ ERROR HANDLERS (silent non-critical errors) ============
client.on('error', (err) => {
  const msg = err?.message || '';
  if (msg.includes("reading 'SPEAKING'")) return;
  console.error('[ERROR] Client:', msg);
});

process.on('unhandledRejection', (err) => {
  const msg = err?.message || '';
  if (msg.includes("reading 'SPEAKING'")) return;
  console.error('[ERROR] Unhandled rejection:', msg);
});

process.on('uncaughtException', (err) => {
  const msg = err?.message || '';
  if (msg.includes("reading 'SPEAKING'")) return;
  if (msg.includes('VOICE_USER_NOT_STREAMING')) return;
  if (msg.includes('Session is no longer valid')) return;
  if (msg.includes('Voice websocket closed')) return;
  console.error('[ERROR] Uncaught exception:', msg);
});

// ============ JOIN VOICE ============
async function joinVoice() {
  if (isJoining) return;

  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return console.log('[BOT] Guild not found');

    const channel = guild.channels.cache.get(VOICE_CHANNEL_ID);
    if (!channel) return console.log('[BOT] Voice channel not found');

    const me = guild.members.me;
    if (me?.voice?.channelId === VOICE_CHANNEL_ID && voiceConnection) {
      const status = voiceConnection.state?.status;
      if (status && !['disconnected', 'destroyed'].includes(status)) return;
    }

    isJoining = true;
    voiceConnection = await client.voice.joinChannel(channel, {
      selfMute: true,
      selfDeaf: false,
      selfVideo: false,
    });

    voiceConnection.on('error', (err) => {
      const msg = err?.message || '';
      if (msg.includes("reading 'SPEAKING'")) return;
      if (msg.includes('VOICE_USER_NOT_STREAMING')) return;
      console.error('[ERROR] Voice:', msg);
    });

    console.log(`[BOT] ✅ Joined "${channel.name}"`);

    await watchAllMembers(channel);
  } catch (err) {
    console.error('[BOT] ❌ Failed to join:', err?.message || err);
    setTimeout(() => { isJoining = false; joinVoice(); }, 5000);
    return;
  } finally {
    isJoining = false;
  }
}

// ============ WATCH ALL MEMBERS ============
async function watchAllMembers(channel) {
  if (!channel || !voiceConnection) return;

  const members = channel.members;
  if (!members || members.size === 0) return;

  for (const member of members.values()) {
    if (member.id === client.user.id) continue;
    if (member.user.bot) continue;
    if (watchingUsers.has(member.id)) continue;

    const status = voiceConnection.state?.status;
    if (status && ['disconnected', 'destroyed'].includes(status)) return;

    try {
      const streamConn = await Promise.race([
        voiceConnection.joinStreamConnection(member.id),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 3000)
        ),
      ]);

      watchingUsers.set(member.id, streamConn);
      console.log(`[STREAM] ▶️ ${member.user.tag} — watching`);
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('WrongGroupId')) {
        watchingUsers.set(member.id, true);
        console.log(`[STREAM] ▶️ ${member.user.tag} — watching (WrongGroupId)`);
      }
      // Silent for all other errors
    }
  }
}

// ============ CLEANUP ============
function cleanupStream(userId) {
  const conn = watchingUsers.get(userId);
  if (!conn || conn === true) {
    watchingUsers.delete(userId);
    return;
  }
  try {
    if (typeof conn.disconnect === 'function') conn.disconnect();
    else if (typeof conn.destroy === 'function') conn.destroy();
  } catch (_) {}
  watchingUsers.delete(userId);
}

function cleanupAllStreams() {
  for (const userId of [...watchingUsers.keys()]) cleanupStream(userId);
}

// ============ CHECK & REJOIN ============
async function checkAndRejoin() {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return;

  const me = guild.members.me;
  const currentChannel = me?.voice?.channelId;

  if (currentChannel !== VOICE_CHANNEL_ID) {
    console.log(currentChannel
      ? '[BOT] ⚠️ Wrong channel, rejoining...'
      : '[BOT] ⚠️ Disconnected, rejoining...');
    voiceConnection = null;
    cleanupAllStreams();
    await joinVoice();
    return;
  }

  if (voiceConnection) {
    const status = voiceConnection.state?.status;
    if (status && ['disconnected', 'destroyed'].includes(status)) {
      console.log(`[BOT] ⚠️ Connection ${status}, reconnecting...`);
      try { voiceConnection.disconnect(); } catch (_) {}
      voiceConnection = null;
      cleanupAllStreams();
      await joinVoice();
    }
  }
}

// ============ READY ============
client.on('ready', async () => {
  console.log(`[BOT] ${client.user.username} is ready`);
  await joinVoice();

  // Keep-alive check every 10s
  keepAliveInterval = setInterval(() => {
    checkAndRejoin().catch(() => {});
  }, 10000);

  // Scan members every 15s
  scanInterval = setInterval(async () => {
    const guild = client.guilds.cache.get(GUILD_ID);
    const channel = guild?.channels?.cache?.get(VOICE_CHANNEL_ID);
    if (channel && voiceConnection) {
      await watchAllMembers(channel);
    }
  }, 15000);

  // Summary every 60s (only if watching something)
  let lastSummary = '';
  summaryInterval = setInterval(() => {
    const guild = client.guilds.cache.get(GUILD_ID);
    const channel = guild?.channels?.cache?.get(VOICE_CHANNEL_ID);
    if (!channel) return;

    const memberCount = [...channel.members.values()]
      .filter(m => m.id !== client.user.id && !m.user.bot).length;
    const watchCount = watchingUsers.size;

    const summary = `in-channel: ${memberCount} | watching: ${watchCount}`;
    if (summary !== lastSummary) {
      console.log(`[STATUS] ${summary}`);
      lastSummary = summary;
    }
  }, 60000);
});

// ============ VOICE STATE UPDATE ============
client.on('voiceStateUpdate', async (oldState, newState) => {
  const member = newState.member;
  if (!member) return;

  // Bot itself
  if (member.id === client.user.id) {
    if (newState.channelId !== VOICE_CHANNEL_ID) {
      console.log('[BOT] ⚠️ Bot removed from channel, rejoining...');
      voiceConnection = null;
      cleanupAllStreams();
      setTimeout(() => joinVoice(), 5000);
    }
    return;
  }

  const guild = client.guilds.cache.get(GUILD_ID);
  const channel = guild?.channels?.cache?.get(VOICE_CHANNEL_ID);

  // User joined channel
  if (
    newState.channelId === VOICE_CHANNEL_ID &&
    oldState.channelId !== VOICE_CHANNEL_ID
  ) {
    console.log(`[USER] ➕ ${member.user.tag} joined`);
    if (channel && voiceConnection) await watchAllMembers(channel);
    return;
  }

  // User started streaming
  if (
    newState.channelId === VOICE_CHANNEL_ID &&
    (newState.streaming === true || newState.selfStream === true) &&
    !watchingUsers.has(member.id)
  ) {
    if (channel && voiceConnection) await watchAllMembers(channel);
  }

  // User stopped streaming
  if (
    (oldState.streaming || oldState.selfStream) &&
    !newState.streaming &&
    !newState.selfStream
  ) {
    if (watchingUsers.has(member.id)) {
      console.log(`[STREAM] ⏹️ ${member.user.tag} — stopped`);
      cleanupStream(member.id);
    }
  }

  // User left channel
  if (
    oldState.channelId === VOICE_CHANNEL_ID &&
    newState.channelId !== VOICE_CHANNEL_ID
  ) {
    console.log(`[USER] ➖ ${member.user.tag} left`);
    if (watchingUsers.has(member.id)) cleanupStream(member.id);
  }
});

// ============ SHUTDOWN ============
function shutdown(signal) {
  console.log('\n[BOT] 🛑 Shutting down...');
  if (keepAliveInterval) clearInterval(keepAliveInterval);
  if (scanInterval) clearInterval(scanInterval);
  if (summaryInterval) clearInterval(summaryInterval);
  cleanupAllStreams();
  try { if (voiceConnection) voiceConnection.disconnect(); } catch (_) {}
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ============ LOGIN ============
client.login(process.env.TOKEN);
