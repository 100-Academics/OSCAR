import { OnshapeContext } from "../types/index.js";

const ONSHAPE_BASE = "https://cad.onshape.com/api/v6";

/**
 * Onshape document/workspace/element IDs are 24-character hex strings.
 * Reject anything that doesn't match to prevent request-forgery via
 * user-supplied IDs being embedded in outbound URLs.
 */
const ONSHAPE_ID_RE = /^[a-fA-F0-9]{24}$/;

function validateId(value: string, name: string): string {
  if (!ONSHAPE_ID_RE.test(value)) {
    throw new Error(
      `Invalid Onshape ${name}: must be a 24-character hexadecimal string.`
    );
  }
  return value;
}

function authHeaders(): Record<string, string> {
  const accessKey = process.env.ONSHAPE_ACCESS_KEY;
  const secretKey = process.env.ONSHAPE_SECRET_KEY;

  if (accessKey && secretKey) {
    // API key auth (Basic)
    const credentials = Buffer.from(`${accessKey}:${secretKey}`).toString("base64");
    return {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
      Accept: "application/json;charset=UTF-8; qs=0.09",
    };
  }

  const token = process.env.ONSHAPE_ACCESS_TOKEN;
  if (token) {
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json;charset=UTF-8; qs=0.09",
    };
  }

  throw new Error(
    "No Onshape credentials configured. Set ONSHAPE_ACCESS_KEY + ONSHAPE_SECRET_KEY or ONSHAPE_ACCESS_TOKEN."
  );
}

/**
 * Fetch the feature list for a Part Studio element.
 */
export async function fetchFeatures(ctx: OnshapeContext): Promise<unknown> {
  const did = validateId(ctx.documentId, "documentId");
  const wid = validateId(ctx.workspaceId, "workspaceId");
  const eid = validateId(ctx.elementId, "elementId");
  const url = `${ONSHAPE_BASE}/partstudios/d/${did}/w/${wid}/e/${eid}/features`;

  const resp = await fetch(url, { headers: authHeaders() });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Onshape features API error ${resp.status}: ${body}`);
  }
  return resp.json();
}

/**
 * Fetch document metadata (name, description).
 */
export async function fetchDocument(did: string): Promise<{ name: string; description: string }> {
  const safeId = validateId(did, "documentId");
  const url = `${ONSHAPE_BASE}/documents/${safeId}`;
  const resp = await fetch(url, { headers: authHeaders() });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Onshape document API error ${resp.status}: ${body}`);
  }
  return resp.json() as Promise<{ name: string; description: string }>;
}

/**
 * Execute a FeatureScript snippet in a Part Studio.
 */
export async function executeFeatureScript(
  ctx: OnshapeContext,
  script: string
): Promise<unknown> {
  const did = validateId(ctx.documentId, "documentId");
  const wid = validateId(ctx.workspaceId, "workspaceId");
  const eid = validateId(ctx.elementId, "elementId");
  const url = `${ONSHAPE_BASE}/partstudios/d/${did}/w/${wid}/e/${eid}/featurescript`;

  const resp = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ script }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Onshape FeatureScript API error ${resp.status}: ${body}`);
  }
  return resp.json();
}

/**
 * Add a feature to a Part Studio.
 * `featureSpec` should match the Onshape features API schema.
 */
export async function addFeature(
  ctx: OnshapeContext,
  featureSpec: Record<string, unknown>
): Promise<unknown> {
  const did = validateId(ctx.documentId, "documentId");
  const wid = validateId(ctx.workspaceId, "workspaceId");
  const eid = validateId(ctx.elementId, "elementId");
  const url = `${ONSHAPE_BASE}/partstudios/d/${did}/w/${wid}/e/${eid}/features`;

  const resp = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(featureSpec),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Onshape add feature API error ${resp.status}: ${body}`);
  }
  return resp.json();
}
