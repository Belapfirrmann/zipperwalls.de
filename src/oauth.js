import { apiFetch } from './publishers/http.js';
import { saveToken } from './tokens.js';

const META_SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
  'business_management',
];

async function newState(env, provider) {
  const state = crypto.randomUUID();
  await env.DB.prepare('DELETE FROM oauth_states WHERE created_at < ?').bind(new Date(Date.now() - 3600000).toISOString()).run();
  await env.DB.prepare('INSERT INTO oauth_states (state, provider, created_at) VALUES (?,?,?)').bind(state, provider, new Date().toISOString()).run();
  return state;
}

async function checkState(env, provider, state) {
  if (!state) return false;
  const row = await env.DB.prepare('SELECT * FROM oauth_states WHERE state=? AND provider=?').bind(state, provider).first();
  if (!row) return false;
  await env.DB.prepare('DELETE FROM oauth_states WHERE state=?').bind(state).run();
  return Date.now() - new Date(row.created_at) < 10 * 60 * 1000;
}

const back = (env, msg, ok) => Response.redirect(`${env.PUBLIC_BASE_URL}/#verbindungen?${ok ? 'ok' : 'fehler'}=${encodeURIComponent(msg)}`, 302);

export async function metaStart(env) {
  if (!env.META_APP_ID || !env.META_APP_SECRET) return back(env, 'META_APP_ID und META_APP_SECRET sind nicht gesetzt.', false);
  const u = new URL(`https://www.facebook.com/${env.GRAPH_VERSION || 'v22.0'}/dialog/oauth`);
  u.search = new URLSearchParams({
    client_id: env.META_APP_ID,
    redirect_uri: `${env.PUBLIC_BASE_URL}/oauth/meta/callback`,
    state: await newState(env, 'meta'),
    scope: META_SCOPES.join(','),
  });
  return Response.redirect(u.toString(), 302);
}

export async function metaCallback(env, url) {
  if (url.searchParams.get('error')) return back(env, 'Facebook: ' + (url.searchParams.get('error_description') || 'abgebrochen'), false);
  if (!(await checkState(env, 'meta', url.searchParams.get('state')))) return back(env, 'Ungültiger oder abgelaufener Vorgang. Bitte erneut verbinden.', false);
  try {
    const g = `https://graph.facebook.com/${env.GRAPH_VERSION || 'v22.0'}`;
    const redirect = `${env.PUBLIC_BASE_URL}/oauth/meta/callback`;
    const short = await apiFetch(`${g}/oauth/access_token?` + new URLSearchParams({ client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, redirect_uri: redirect, code: url.searchParams.get('code') }));
    // Langlebiges Nutzer Token: daraus abgeleitete Seiten Tokens laufen nicht ab
    const long = await apiFetch(`${g}/oauth/access_token?` + new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: short.data.access_token }));
    const pages = await apiFetch(`${g}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${long.data.access_token}`);
    const list = pages.data.data || [];
    if (!list.length) throw new Error('Keine Facebook Seite gefunden. Sie müssen Administrator einer Seite sein und sie bei der Anmeldung auswählen.');
    const page = (env.META_PAGE_ID && list.find((p) => p.id === env.META_PAGE_ID)) || list[0];
    await saveToken(env, 'facebook', { accessToken: page.access_token, meta: { pageId: page.id, label: page.name } });
    let msg = `Facebook verbunden: ${page.name}.`;
    if (page.instagram_business_account?.id) {
      const ig = await apiFetch(`${g}/${page.instagram_business_account.id}?fields=username&access_token=${page.access_token}`);
      await saveToken(env, 'instagram', { accessToken: page.access_token, meta: { igUserId: page.instagram_business_account.id, label: '@' + ig.data.username } });
      msg += ` Instagram verbunden: @${ig.data.username}.`;
    } else {
      msg += ' Kein Instagram Business Konto mit dieser Seite verknüpft.';
    }
    return back(env, msg, true);
  } catch (e) {
    return back(env, e.message, false);
  }
}

export async function linkedinStart(env) {
  if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) return back(env, 'LINKEDIN_CLIENT_ID und LINKEDIN_CLIENT_SECRET sind nicht gesetzt.', false);
  const scopes = ['openid', 'profile', 'w_member_social'];
  if (env.LINKEDIN_ORG_ID) scopes.push('w_organization_social', 'r_organization_social');
  const u = new URL('https://www.linkedin.com/oauth/v2/authorization');
  u.search = new URLSearchParams({
    response_type: 'code',
    client_id: env.LINKEDIN_CLIENT_ID,
    redirect_uri: `${env.PUBLIC_BASE_URL}/oauth/linkedin/callback`,
    state: await newState(env, 'linkedin'),
    scope: scopes.join(' '),
  });
  return Response.redirect(u.toString(), 302);
}

export async function linkedinCallback(env, url) {
  if (url.searchParams.get('error')) return back(env, 'LinkedIn: ' + (url.searchParams.get('error_description') || 'abgebrochen'), false);
  if (!(await checkState(env, 'linkedin', url.searchParams.get('state')))) return back(env, 'Ungültiger oder abgelaufener Vorgang. Bitte erneut verbinden.', false);
  try {
    const tok = await apiFetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: url.searchParams.get('code'),
        redirect_uri: `${env.PUBLIC_BASE_URL}/oauth/linkedin/callback`,
        client_id: env.LINKEDIN_CLIENT_ID,
        client_secret: env.LINKEDIN_CLIENT_SECRET,
      }),
    });
    const me = await apiFetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${tok.data.access_token}` } });
    const org = env.LINKEDIN_ORG_ID;
    const author = org ? `urn:li:organization:${org}` : `urn:li:person:${me.data.sub}`;
    await saveToken(env, 'linkedin', {
      accessToken: tok.data.access_token,
      refreshToken: tok.data.refresh_token || null,
      expiresAt: new Date(Date.now() + (tok.data.expires_in || 5184000) * 1000).toISOString(),
      meta: { author, label: org ? `Unternehmensseite ${org}` : me.data.name },
    });
    return back(env, `LinkedIn verbunden: ${org ? 'Unternehmensseite' : me.data.name}.`, true);
  } catch (e) {
    return back(env, e.message, false);
  }
}
