import "dotenv/config";
import express from "express";
import cors from "cors";
import agentsRouter from "./routes/agents.js";
import chatRouter from "./routes/chat.js";
import onshapeRouter from "./routes/onshape.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

// ── Middleware ──────────────────────────────────────────────────────────────

/**
 * Build a safe CORS origin allowlist from the ALLOWED_ORIGINS env var.
 * Each entry must be a valid http/https URL origin (scheme + host + optional port).
 * Falls back to blocking cross-origin requests when the env var is not set,
 * so tokens and data are not inadvertently exposed to arbitrary origins in
 * production. Set ALLOWED_ORIGINS=* only for local development.
 */
function buildCorsOrigin(): string | string[] | ((origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void) {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw || raw.trim() === "") {
    // No origins configured — reject all cross-origin requests.
    return [];
  }
  if (raw.trim() === "*") {
    // Explicit wildcard opt-in (development only).
    return "*";
  }
  // Validate each entry: must be http:// or https:// origin (no path/query).
  const originPattern = /^https?:\/\/[a-zA-Z0-9\-._]+(:\d{1,5})?$/;
  const allowlist = raw
    .split(",")
    .map((o) => o.trim())
    .filter((o) => originPattern.test(o));
  return allowlist;
}

app.use(cors({ origin: buildCorsOrigin() }));
app.use(express.json({ limit: "1mb" }));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use("/api/agents", agentsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/onshape", onshapeRouter);

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`OSCAR bridge running on http://localhost:${PORT}`);
});

export default app;
