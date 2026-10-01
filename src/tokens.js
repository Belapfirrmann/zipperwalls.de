import { encrypt, decrypt } from './crypto.js';

export async function saveToken(env, channel, { accessToken, refreshToken = null, expiresAt = null, meta = {} }) {
  await env.DB.prepare(
    `INSERT INTO tokens (channel, access_token, refresh_token, expires_at, meta, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(channel) DO UPDATE SET access_token=?2, refresh_token=?3, expires_at=?4, meta=?5, updated_at=?6`,
  )
    .bind(
      channel,
      await encrypt(env, accessToken),
      refreshToken ? await encrypt(env, refreshToken) : null,
      expiresAt,
      JSON.stringify(meta),
      new Date().toISOString(),
    )
    .run();
}

export async function loadToken(env, channel) {
  const row = await env.DB.prepare('SELECT * FROM tokens WHERE channel = ?').bind(channel).first();
  if (!row) throw new Error('Nicht verbunden. Bitte unter "Verbindungen" verbinden.');
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    throw new Error('Zugang abgelaufen. Bitte unter "Verbindungen" neu verbinden.');
  }
  return { accessToken: await decrypt(env, row.access_token), meta: JSON.parse(row.meta || '{}'), expiresAt: row.expires_at };
}

export async function listConnections(env) {
  const rows = (await env.DB.prepare('SELECT channel, expires_at, meta, updated_at FROM tokens').all()).results;
  const byChannel = Object.fromEntries(rows.map((r) => [r.channel, r]));
  return ['facebook', 'instagram', 'linkedin'].map((channel) => {
    const r = byChannel[channel];
    if (!r) return { channel, connected: false };
    const meta = JSON.parse(r.meta || '{}');
    const expired = !!r.expires_at && new Date(r.expires_at) < new Date();
    const daysLeft = r.expires_at ? Math.floor((new Date(r.expires_at) - Date.now()) / 86400000) : null;
    return { channel, connected: !expired, expired, label: meta.label || null, expiresAt: r.expires_at, daysLeft, updatedAt: r.updated_at };
  });
}
