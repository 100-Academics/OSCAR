import "dotenv/config";
import express from "express";
import cors from "cors";
import agentsRouter from "./routes/agents.js";
import chatRouter from "./routes/chat.js";
import onshapeRouter from "./routes/onshape.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) ?? "*",
  })
);
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
