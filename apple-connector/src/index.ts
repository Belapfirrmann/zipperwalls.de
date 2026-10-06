import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { config } from "./config.js";
import { ConnectorAuthProvider } from "./auth.js";
import { buildServer } from "./tools.js";

const app = express();
app.set("trust proxy", 1); // läuft hinter einem HTTPS Reverse Proxy
app.disable("x-powered-by");

const provider = new ConnectorAuthProvider();
setInterval(() => provider.sweep(), 5 * 60 * 1000).unref();

const issuerUrl = new URL(config.publicUrl);
const mcpUrl = new URL("/mcp", issuerUrl);

app.use(
  mcpAuthRouter({
    provider,
    issuerUrl,
    resourceServerUrl: mcpUrl,
    resourceName: "Zipperwalls Apple Connector",
  }),
);
app.use(provider.loginRouter());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const auth = requireBearerAuth({
  verifier: provider,
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
});

// Zustandslos: für jede Anfrage ein frischer Server, damit nichts zwischen Aufrufen hängen bleibt.
app.post("/mcp", auth, express.json({ limit: "2mb" }), async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP Fehler:", err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Interner Fehler" }, id: null });
    }
  }
});

app.all("/mcp", auth, (_req, res) => {
  res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
});

app.listen(config.port, () => {
  console.log(`Zipperwalls Apple Connector läuft auf Port ${config.port}, öffentlich unter ${mcpUrl}`);
  console.log(`Senden von Mails: ${config.allowSend ? "erlaubt" : "aus (nur Entwürfe)"}`);
});
