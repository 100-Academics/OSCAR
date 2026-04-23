import { Router, Request, Response } from "express";
import { ChatRequest, OnshapeContext } from "../types/index.js";
import { getProviderForAgent } from "../providers/registry.js";
import { fetchFeatures } from "../clients/onshapeClient.js";

const router = Router();

const SYSTEM_PROMPT = `You are OSCAR — an Onshape CAD automation assistant powered by AI.
You help engineers design, review, and automate Onshape Part Studios.

When the user asks you to create or modify features, respond with a JSON block wrapped
in triple-backtick fences tagged \`json\` containing an "actions" array. Each action must have:
- "type": one of "addFeature" | "featurescript" | "rename" | "suppress" | "custom"
- "label": short human-readable description of the action
- "payload": an object with the action data

CRITICAL — Onshape API type discriminator:
All Onshape BTM objects (BTMFeature, BTMParameter subtypes, BTMQuery subtypes, etc.) use
the field name "btType" (NOT "type") as their JSON polymorphic discriminator.
Always write "btType": "BTMParameterQuantity-147" etc. — never "type" for those objects.
The outer action object itself still uses "type" (e.g. "type": "addFeature").

ACTION TYPES
============

**addFeature** — Use this to persistently add a feature to the Part Studio.
The payload must be a valid Onshape POST /features request body.
Use "addFeature" for ALL geometry-creation tasks (sketches, extrudes, fillets, etc.).
Do NOT use "featurescript" for geometry creation — it is read-only.

Example — add an extrude feature (assumes a sketch already exists):
\`\`\`json
{
  "actions": [
    {
      "type": "addFeature",
      "label": "Extrude sketch to 50 mm",
      "payload": {
        "feature": {
          "btType": "BTMFeature-134",
          "featureType": "newExtrude",
          "name": "Extrude 1",
          "suppressed": false,
          "parameters": [
            {
              "btType": "BTMParameterQueryList-148",
              "queries": [{ "btType": "BTMIndividualSketchRegionQuery-140", "featureId": "sketch1" }],
              "parameterId": "entities"
            },
            {
              "btType": "BTMParameterEnum-145",
              "value": "BLIND",
              "enumName": "BoundingType",
              "parameterId": "endBound"
            },
            {
              "btType": "BTMParameterQuantity-147",
              "expression": "50 mm",
              "parameterId": "depth"
            },
            {
              "btType": "BTMParameterEnum-145",
              "value": "NEW",
              "enumName": "NewBodyOperationType",
              "parameterId": "operationType"
            }
          ]
        }
      }
    }
  ]
}
\`\`\`

**featurescript** — Use ONLY for read-only evaluation/queries (e.g. measuring area, querying entities).
IMPORTANT: The Onshape /featurescript endpoint reverts all context changes after evaluation —
it cannot create or modify geometry persistently.
Do NOT wrap in "defineFeature" — that declares a feature type but creates nothing.
The script must be a function: \`function(context is Context, id is Id) { return ...; }\`

Example — query the bounding box of a body:
\`\`\`json
{
  "actions": [
    {
      "type": "featurescript",
      "label": "Get bounding box",
      "payload": {
        "script": "function(context is Context, id is Id) { return evBox3d(context, { topology: qEveryBody(), tight: true }); }"
      }
    }
  ]
}
\`\`\`

Outside the code block, explain your reasoning clearly.
If no automated actions are needed, simply answer in plain text.`;

/**
 * POST /api/chat
 * Body: { agentId, messages, onshapeContext? }
 * Returns: { agentId, message, actions? }
 */
router.post("/", async (req: Request, res: Response) => {
  const body = req.body as ChatRequest;

  if (!body.agentId) {
    res.status(400).json({ error: "agentId is required." });
    return;
  }
  if (!body.messages || body.messages.length === 0) {
    res.status(400).json({ error: "messages array is required and must not be empty." });
    return;
  }

  // Optionally enrich context with live Onshape data
  let contextNote = "";
  if (body.onshapeContext?.documentId && body.onshapeContext.workspaceId && body.onshapeContext.elementId) {
    try {
      const features = await fetchFeatures(body.onshapeContext as OnshapeContext);
      contextNote = `\n\n[Current Onshape feature tree]:\n${JSON.stringify(features).slice(0, 8000)}`;
    } catch {
      // Non-fatal — context enrichment is best-effort
      contextNote = "\n\n[Could not fetch Onshape feature tree — API credentials may not be configured.]";
    }
  }

  const systemPrompt = SYSTEM_PROMPT + contextNote;

  try {
    const provider = getProviderForAgent(body.agentId);
    const message = await provider.chat(body.agentId, body.messages, systemPrompt);

    // Extract any JSON action blocks from the assistant response
    const actions = extractActions(message.content);

    res.json({ agentId: body.agentId, message, actions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

/**
 * Parse ```json ... ``` blocks from AI response and extract "actions" arrays.
 */
function extractActions(content: string) {
  const jsonFenceRegex = /```json\s*([\s\S]*?)```/gi;
  const actions: unknown[] = [];

  let match: RegExpExecArray | null;
  while ((match = jsonFenceRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed.actions)) {
        actions.push(...parsed.actions);
      }
    } catch {
      // ignore malformed blocks
    }
  }

  return actions.length > 0 ? actions : undefined;
}

export default router;
