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
 * Build a validated CORS origin allowlist from the ALLOWED_ORIGINS env var.
 * Each entry must be a valid http/https URL origin (scheme + host + optional port).
 * When not configured, allows local-development origins (`localhost` / `127.0.0.1`)
 * plus no-origin requests (same-origin/non-browser) and `Origin: null` (file://).
 * Explicit wildcard ("*") is NOT supported — set specific origins instead.
 */
function buildCorsOrigin(): cors.CorsOptions["origin"] {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw || raw.trim() === "") {
    // No explicit allowlist configured: make local development work by default.
    const localOriginPattern = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;
    return (origin, callback) => {
      if (!origin || origin === "null" || localOriginPattern.test(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    };
  }
  // Validate each entry: must be a well-formed http/https origin, no path/query.
  const originPattern = /^https?:\/\/(?:\[[0-9a-fA-F:]+\]|[a-zA-Z0-9\-._]+)(:\d{1,5})?$/;
  const allowlist = raw
    .split(",")
    .map((o) => o.trim())
    .filter((o) => originPattern.test(o));
  if (allowlist.length === 0) {
    console.warn(
      "ALLOWED_ORIGINS was set but contained no valid http/https origins. " +
        "Cross-origin requests will be blocked."
    );
    return false;
  }
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
