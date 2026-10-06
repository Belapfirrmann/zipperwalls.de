import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import express, { type Request, type Response } from "express";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidClientMetadataError, InvalidGrantError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { config } from "./config.js";

const ACCESS_TOKEN_TTL = 60 * 60; // 1 Stunde
const REFRESH_TOKEN_TTL = 90 * 24 * 60 * 60; // 90 Tage
const CODE_TTL = 10 * 60 * 1000;
const PENDING_TTL = 15 * 60 * 1000;

type StoredToken = { kind: "access" | "refresh"; clientId: string; scopes: string[]; expiresAt: number; resource?: string };
type StoreData = { clients: Record<string, OAuthClientInformationFull>; tokens: Record<string, StoredToken> };

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");
const now = () => Math.floor(Date.now() / 1000);

/** Clients und Tokens (nur als Hash) in einer JSON Datei, damit ein Neustart nicht alle abmeldet. */
class FileStore {
  private file: string;
  data: StoreData;

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, "oauth.json");
    try {
      this.data = JSON.parse(readFileSync(this.file, "utf8"));
    } catch {
      this.data = { clients: {}, tokens: {} };
    }
  }

  save() {
    const t = now();
    for (const [key, token] of Object.entries(this.data.tokens)) {
      if (token.expiresAt < t) delete this.data.tokens[key];
    }
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}

type PendingRequest = { clientId: string; params: AuthorizationParams; expiresAt: number };
type AuthCode = { clientId: string; params: AuthorizationParams; expiresAt: number };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function loginPage(requestId: string, clientName: string, error?: string): string {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Zipperwalls Connector Anmeldung</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f4f4f2;color:#1d1d1b;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px}
  form{background:#fff;padding:32px;border-radius:16px 0 16px 0;max-width:360px;width:100%;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  h1{font-size:20px;margin:0 0 8px} p{font-size:14px;color:#555;margin:0 0 20px}
  input{width:100%;box-sizing:border-box;padding:12px;font-size:16px;border:1px solid #ccc;border-radius:8px;margin-bottom:16px}
  button{width:100%;padding:12px;font-size:16px;font-weight:600;background:#ffcc20;border:0;border-radius:8px;cursor:pointer}
  .error{color:#b00020;font-size:14px;margin-bottom:12px}
</style></head><body>
<form method="post" action="/oauth/login">
  <h1>Zipperwalls Connector</h1>
  <p>${escapeHtml(clientName)} möchte auf Kalender und Mail zugreifen.</p>
  ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
  <input type="hidden" name="request_id" value="${escapeHtml(requestId)}">
  <input type="password" name="password" placeholder="Passwort" autofocus required>
  <button type="submit">Zugriff erlauben</button>
</form></body></html>`;
}

export class ConnectorAuthProvider implements OAuthServerProvider {
  private store = new FileStore(config.dataDir);
  private pending = new Map<string, PendingRequest>();
  private codes = new Map<string, AuthCode>();
  private failedLogins = new Map<string, { count: number; until: number }>();

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (clientId) => this.store.data.clients[clientId],
      registerClient: (client) => {
        const full = client as OAuthClientInformationFull;
        for (const uri of full.redirect_uris) {
          const host = new URL(uri).hostname.toLowerCase();
          const allowed = config.allowedRedirectHosts.some((h) => host === h || host.endsWith(`.${h}`));
          if (!allowed) throw new InvalidClientMetadataError(`redirect_uri ${uri} ist nicht erlaubt`);
        }
        this.store.data.clients[full.client_id] = full;
        this.store.save();
        return full;
      },
    };
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const requestId = randomToken();
    this.pending.set(requestId, { clientId: client.client_id, params, expiresAt: Date.now() + PENDING_TTL });
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'");
    res.type("html").send(loginPage(requestId, client.client_name ?? "Claude"));
  }

  /** POST /oauth/login: prüft das Passwort und leitet mit einem Code zurück zu Claude. */
  loginRouter() {
    const router = express.Router();
    router.post("/oauth/login", express.urlencoded({ extended: false }), (req: Request, res: Response) => {
      const ip = req.ip ?? "unknown";
      const lock = this.failedLogins.get(ip);
      const requestId = String(req.body?.request_id ?? "");
      const pending = this.pending.get(requestId);

      if (!pending || pending.expiresAt < Date.now()) {
        this.pending.delete(requestId);
        res.status(400).type("text").send("Anmeldung abgelaufen. Bitte in Claude erneut verbinden.");
        return;
      }
      const client = this.store.data.clients[pending.clientId];
      const clientName = client?.client_name ?? "Claude";

      if (lock && lock.count >= 5 && lock.until > Date.now()) {
        res.status(429).type("html").send(loginPage(requestId, clientName, "Zu viele Fehlversuche. Bitte 15 Minuten warten."));
        return;
      }

      const given = hash(String(req.body?.password ?? ""));
      const expected = hash(config.adminPassword);
      if (!timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
        const count = lock && lock.until > Date.now() ? lock.count + 1 : 1;
        this.failedLogins.set(ip, { count, until: Date.now() + 15 * 60 * 1000 });
        res.status(401).type("html").send(loginPage(requestId, clientName, "Falsches Passwort."));
        return;
      }

      this.failedLogins.delete(ip);
      this.pending.delete(requestId);
      const code = randomToken();
      this.codes.set(code, { clientId: pending.clientId, params: pending.params, expiresAt: Date.now() + CODE_TTL });

      const target = new URL(pending.params.redirectUri);
      target.searchParams.set("code", code);
      if (pending.params.state !== undefined) target.searchParams.set("state", pending.params.state);
      res.redirect(302, target.toString());
    });
    return router;
  }

  private takeCode(client: OAuthClientInformationFull, code: string): AuthCode {
    const entry = this.codes.get(code);
    if (!entry || entry.clientId !== client.client_id || entry.expiresAt < Date.now()) {
      throw new InvalidGrantError("Ungültiger oder abgelaufener Code");
    }
    return entry;
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, code: string): Promise<string> {
    return this.takeCode(client, code).params.codeChallenge;
  }

  private issueTokens(clientId: string, scopes: string[], resource?: string): OAuthTokens {
    const access = randomToken();
    const refresh = randomToken();
    const t = now();
    this.store.data.tokens[hash(access)] = { kind: "access", clientId, scopes, expiresAt: t + ACCESS_TOKEN_TTL, resource };
    this.store.data.tokens[hash(refresh)] = { kind: "refresh", clientId, scopes, expiresAt: t + REFRESH_TOKEN_TTL, resource };
    this.store.save();
    return {
      access_token: access,
      token_type: "bearer",
      expires_in: ACCESS_TOKEN_TTL,
      refresh_token: refresh,
      scope: scopes.join(" ") || undefined,
    };
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const entry = this.takeCode(client, code);
    this.codes.delete(code);
    if (redirectUri && redirectUri !== entry.params.redirectUri) {
      throw new InvalidGrantError("redirect_uri passt nicht zum Code");
    }
    return this.issueTokens(client.client_id, entry.params.scopes ?? [], entry.params.resource?.toString());
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[]): Promise<OAuthTokens> {
    const key = hash(refreshToken);
    const stored = this.store.data.tokens[key];
    if (!stored || stored.kind !== "refresh" || stored.clientId !== client.client_id || stored.expiresAt < now()) {
      throw new InvalidGrantError("Ungültiges Refresh Token");
    }
    delete this.store.data.tokens[key]; // Rotation: jedes Refresh Token gilt nur einmal
    const granted = scopes?.length ? scopes.filter((s) => stored.scopes.includes(s)) : stored.scopes;
    return this.issueTokens(client.client_id, granted, stored.resource);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const stored = this.store.data.tokens[hash(token)];
    if (!stored || stored.kind !== "access" || stored.expiresAt < now()) {
      throw new InvalidTokenError("Ungültiges oder abgelaufenes Token");
    }
    return {
      token,
      clientId: stored.clientId,
      scopes: stored.scopes,
      expiresAt: stored.expiresAt,
      resource: stored.resource ? new URL(stored.resource) : undefined,
    };
  }

  async revokeToken(_client: OAuthClientInformationFull, request: { token: string }): Promise<void> {
    const key = hash(request.token);
    if (this.store.data.tokens[key]) {
      delete this.store.data.tokens[key];
      this.store.save();
    }
  }

  /** Aufräumen abgelaufener Einträge im Speicher. */
  sweep() {
    const t = Date.now();
    for (const [k, v] of this.pending) if (v.expiresAt < t) this.pending.delete(k);
    for (const [k, v] of this.codes) if (v.expiresAt < t) this.codes.delete(k);
    for (const [k, v] of this.failedLogins) if (v.until < t) this.failedLogins.delete(k);
  }
}
