import { Router, Request, Response } from "express";
import {
  fetchFeatures,
  fetchDocument,
  executeFeatureScript,
  addFeature,
} from "../clients/onshapeClient.js";
import { OnshapeContext, OnshapeAction } from "../types/index.js";

const router = Router();

/**
 * GET /api/onshape/context?did=&wid=&eid=
 * Fetches the current Onshape document and feature context.
 */
router.get("/context", async (req: Request, res: Response) => {
  const { did, wid, eid } = req.query as Record<string, string>;

  if (!did || !wid || !eid) {
    res.status(400).json({ error: "Query params did, wid, and eid are required." });
    return;
  }

  try {
    const [document, features] = await Promise.all([
      fetchDocument(did),
      fetchFeatures({ documentId: did, workspaceId: wid, elementId: eid }),
    ]);

    res.json({ document, features });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/onshape/apply
 * Body: { onshapeContext, action }
 * Executes an AI-suggested action against the Onshape API.
 */
router.post("/apply", async (req: Request, res: Response) => {
  const { onshapeContext, action } = req.body as {
    onshapeContext: OnshapeContext;
    action: OnshapeAction;
  };

  if (!onshapeContext || !action) {
    res.status(400).json({ error: "onshapeContext and action are required." });
    return;
  }

  const ctx: OnshapeContext = onshapeContext;

  try {
    let result: unknown;

    switch (action.type) {
      case "featurescript": {
        const script = action.payload.script as string;
        if (!script) {
          res.status(400).json({ error: "action.payload.script is required for featurescript actions." });
          return;
        }
        result = await executeFeatureScript(ctx, script);
        break;
      }

      case "rename":
      case "suppress":
      case "custom": {
        // Treat custom/rename/suppress as add-feature calls with the raw payload
        result = await addFeature(ctx, action.payload);
        break;
      }

      default:
        res.status(400).json({ error: `Unsupported action type: ${(action as OnshapeAction).type}` });
        return;
    }

    res.json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
