import { Router } from "express";
import { getAllAgents, getProviders } from "../providers/registry.js";

const router = Router();

/**
 * GET /api/agents
 * Returns all available agents grouped by provider, matching the
 * GitHub Copilot model-picker experience.
 */
router.get("/", (_req, res) => {
  const providers = getProviders().map((p) => ({
    id: p.id,
    name: p.name,
    agents: p.listAgents(),
  }));

  res.json({
    agents: getAllAgents(),
    providers,
  });
});

export default router;
