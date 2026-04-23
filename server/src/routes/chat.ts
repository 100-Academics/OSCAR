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

SKETCH CREATION RULES — READ CAREFULLY:
1. Every sketch feature MUST include a "featureId" field (a short unique string you choose,
   e.g. "oscar_sketch_1"). This ID is required so that dependent features (extrudes, etc.)
   can reference the sketch reliably.
2. The sketch MUST include a "sketchPlane" parameter that references a valid plane.
   For the three standard default planes use BTMIndividualQuery-138 with the fixed
   Part Studio deterministicIds:
     TOP   plane → { "btType": "BTMIndividualQuery-138", "deterministicIds": ["JDC"] }
     FRONT plane → { "btType": "BTMIndividualQuery-138", "deterministicIds": ["JDD"] }
     RIGHT plane → { "btType": "BTMIndividualQuery-138", "deterministicIds": ["JDE"] }
   Do NOT use "BTMDefaultPlaneQuery-1020" — it is not a valid Onshape REST API type and
   will cause a 400 error.
   For an existing plane/face from the feature tree use BTMIndividualQuery-138 with the
   featureId from the feature tree context.
3. Sketch entity geometry values (radius, coordinates) use SI units — METRES, not millimetres.
   Example: a 5 mm radius circle has "radius": 0.005.
4. Each sketch entity MUST have a unique "entityId" string.

SKETCH→EXTRUDE LINKAGE RULE:
When you generate both a sketch and an extrude that depends on it:
- Set "featureId" in the sketch payload to a chosen string (e.g. "oscar_sketch_1").
- In the extrude's BTMIndividualSketchRegionQuery-140, set "featureId" to that SAME string.
- If the sketch already exists in the document (visible in the feature tree context below),
  use its "featureId" value from the feature tree — do NOT invent a new one.

Example — create a circle sketch on the Top plane then extrude it:
\`\`\`json
{
  "actions": [
    {
      "type": "addFeature",
      "label": "Sketch circle Ø10 mm on Top plane",
      "payload": {
        "feature": {
          "btType": "BTMFeature-134",
          "featureType": "newSketch",
          "name": "Sketch 1",
          "featureId": "oscar_sketch_1",
          "suppressed": false,
          "parameters": [
            {
              "btType": "BTMParameterQueryList-148",
              "parameterId": "sketchPlane",
              "queries": [
                { "btType": "BTMIndividualQuery-138", "deterministicIds": ["JDC"] }
              ]
            }
          ],
          "entities": [
            {
              "btType": "BTMSketchCurve-4",
              "entityId": "circle_1",
              "geometry": {
                "btType": "BTCurveGeometryCircle-115",
                "radius": 0.005,
                "xCenter": 0,
                "yCenter": 0,
                "xDir": { "x": 1, "y": 0, "z": 0 },
                "yDir": { "x": 0, "y": 1, "z": 0 }
              }
            }
          ],
          "constraints": []
        }
      }
    },
    {
      "type": "addFeature",
      "label": "Extrude sketch to 20 mm",
      "payload": {
        "feature": {
          "btType": "BTMFeature-134",
          "featureType": "newExtrude",
          "name": "Extrude 1",
          "suppressed": false,
          "parameters": [
            {
              "btType": "BTMParameterQueryList-148",
              "parameterId": "entities",
              "queries": [
                { "btType": "BTMIndividualSketchRegionQuery-140", "featureId": "oscar_sketch_1" }
              ]
            },
            {
              "btType": "BTMParameterEnum-145",
              "value": "BLIND",
              "enumName": "BoundingType",
              "parameterId": "endBound"
            },
            {
              "btType": "BTMParameterQuantity-147",
              "expression": "20 mm",
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

Example — add an extrude of an EXISTING sketch (featureId taken from the feature tree context):
\`\`\`json
{
  "actions": [
    {
      "type": "addFeature",
      "label": "Extrude existing sketch to 50 mm",
      "payload": {
        "feature": {
          "btType": "BTMFeature-134",
          "featureType": "newExtrude",
          "name": "Extrude 1",
          "suppressed": false,
          "parameters": [
            {
              "btType": "BTMParameterQueryList-148",
              "parameterId": "entities",
              "queries": [
                { "btType": "BTMIndividualSketchRegionQuery-140", "featureId": "<featureId from feature tree>" }
              ]
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
