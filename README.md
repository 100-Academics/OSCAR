# OSCAR — Onshape-Synced Copilot for Automated Reviews

A bi-directional communication bridge that connects your Onshape Part Studio to **GitHub Copilot** (and other AI models) from a local GUI or an embedded Onshape tab.

## What it does

- **Send instructions** from a local OSCAR UI (or embedded tab) to GitHub Copilot (or any configured AI model)
- **Receive responses** — FeatureScript snippets, design suggestions, documentation, review notes — rendered right in the tab
- **Apply results** to your Onshape document with one click (FeatureScript execution, feature modifications)
- **Pick your model** from a GitHub Copilot-style model selector in the top bar:
  - GitHub Copilot models (including **GPT-5.3-Codex** agent, GPT-5.2-Codex, GPT-5.2, GPT-5.4 mini, GPT-5 mini, GPT-4.1, GPT-4o, Grok Code Fast 1, Claude Haiku 4.5, Gemini 3 Flash, Gemini 3.1 Pro, Gemini 2.5 Pro) — **free for students**
  - OpenAI (GPT-4.1, GPT-4o, o3)
  - Anthropic Claude (Sonnet, Opus)

---

## Quick start (students)

### 1. Activate GitHub Copilot for free

1. Verify your student status at <https://education.github.com/students>
2. Activate **GitHub Copilot Individual** (free) at <https://github.com/settings/copilot>

### 2. Create a GitHub Personal Access Token

1. Go to <https://github.com/settings/tokens/new>
2. Token name: `OSCAR`
3. Expiration: 90 days (or custom)
4. Under **Permissions / Scopes**, enable:
   - **GitHub Copilot** (classic PAT `copilot` scope), or
   - **GitHub Models: Read** (`models:read`) for fine-grained PATs
5. Copy the generated token (starts with `ghp_…`)

### 3. Get Onshape API keys

1. Log in to <https://dev-portal.onshape.com>
2. Go to **API Keys** → **Create new API key**
3. Copy the Access Key and Secret Key

### 4. Configure the server

```sh
cd server
cp .env.example .env
# Edit .env and fill in GITHUB_TOKEN, ONSHAPE_ACCESS_KEY, ONSHAPE_SECRET_KEY
```

### 5. Install and start

```sh
cd server
npm install
npm run dev      # development (tsx watch)
# or
npm run build && npm start   # production
```

Server starts on `http://localhost:3000`.

### 6. Open OSCAR locally (recommended, 100% free)

Open `client/index.html` directly in your browser, or serve it:

```sh
npx serve client -l 3001
# then open http://localhost:3001
```

In OSCAR, paste a full Onshape workspace URL (for example `https://cad.onshape.com/documents/55282c74bcea380828de0e51/w/dbddf877c059c056e8d4986b/e/4c596dc1de28e1258a125bf0`) and click **Load context**.
Then chat with the model and use **Apply to Onshape** to push approved actions to the real Onshape document.

No ngrok/cloudflared is required for this local standalone mode.

To embed OSCAR as a custom tab inside Onshape, see [Embedding as an Onshape tab](#embedding-as-an-onshape-tab).

---

## Architecture

```
client/
  index.html              # Self-contained Onshape tab UI (HTML/CSS/JS)

server/
  src/
    index.ts              # Express app entry point
    types/index.ts        # Shared TypeScript types
    providers/
      base.ts             # Abstract BaseProvider class
      githubCopilot.ts    # GitHub Copilot provider (token exchange + API)
      openai.ts           # OpenAI provider
      anthropic.ts        # Anthropic provider
      registry.ts         # Provider registry — add new providers here
    clients/
      onshapeClient.ts    # Onshape REST API client
    routes/
      agents.ts           # GET  /api/agents
      chat.ts             # POST /api/chat
      onshape.ts          # GET  /api/onshape/context
                          # POST /api/onshape/apply
  .env.example
  package.json
  tsconfig.json
```

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/agents` | List all available AI models grouped by provider |
| `POST` | `/api/chat` | Send a message to the selected agent |
| `GET`  | `/api/onshape/context` | Fetch document + feature tree from Onshape |
| `POST` | `/api/onshape/apply` | Execute an AI-suggested action in Onshape |
| `GET`  | `/health` | Health check |

### Chat request / response

```jsonc
// POST /api/chat
{
  "agentId": "github-copilot/gpt-5.3-codex",
  "messages": [
    { "role": "user", "content": "Generate a FeatureScript extrude 25 mm" }
  ],
  // optional — enriches the prompt with live Onshape data
  "onshapeContext": {
    "documentId": "abc123",
    "workspaceId": "def456",
    "elementId":   "ghi789"
  }
}

// Response
{
  "agentId": "github-copilot/gpt-5.3-codex",
  "message": { "role": "assistant", "content": "Here is the FeatureScript…\n```json\n{\"actions\":[…]}\n```" },
  "actions": [
    {
      "type": "featurescript",
      "label": "Create 25 mm extrude",
      "payload": { "script": "/* FeatureScript */" }
    }
  ]
}
```

---

## Adding a new AI provider

1. Create `server/src/providers/myProvider.ts` extending `BaseProvider`:

```ts
import { BaseProvider } from "./base.js";
import { AgentInfo, Message } from "../types/index.js";

export class MyProvider extends BaseProvider {
  id   = "my-provider";
  name = "My Provider";

  listAgents(): AgentInfo[] {
    return [{ id: "my-provider/cool-model", name: "Cool Model", provider: "my-provider",
               description: "…", capabilities: [], model: "cool-model" }];
  }

  async chat(agentId: string, messages: Message[], systemPrompt?: string): Promise<Message> {
    // call your API, return { role: "assistant", content: "…" }
  }
}
```

2. Register it in `server/src/providers/registry.ts`:

```ts
import { MyProvider } from "./myProvider.js";
const providers: AIProvider[] = [
  new GitHubCopilotProvider(),
  new MyProvider(),          // ← add here
  …
];
```

The new provider and all its agents will automatically appear in the UI model picker.

---

## Install and use OSCAR inside Onshape (embedded tab mode)

> This mode requires publicly reachable HTTPS URLs so Onshape can load the UI iframe and call the backend.  
> If you want a fully local/free setup, use the local standalone flow above instead.

### A. Deploy OSCAR so Onshape can reach it

1. Deploy the backend (`server/`) to a public HTTPS URL (example: `https://oscar-api.yourdomain.com`).
2. Host `client/index.html` at a public HTTPS URL (example: `https://oscar-ui.yourdomain.com`).
3. Set CORS in `server/.env`:

```env
ALLOWED_ORIGINS=https://oscar-ui.yourdomain.com,https://cad.onshape.com
```

4. Ensure your frontend points to your backend by adding this before the main script in `client/index.html`:

```html
<script>window.OSCAR_API_URL = "https://oscar-api.yourdomain.com";</script>
```

#### Local tunnel setup (ngrok / cloudflared)

If you are testing locally, you can expose both backend and UI with tunnels instead of deploying:

1. Start OSCAR backend locally:

```sh
cd server
npm run dev
```

2. Serve the UI locally from repo root:

```sh
npx serve client -l 3001
```

3. Create **two** public HTTPS tunnels:

- one for backend (`localhost:3000`)
- one for UI (`localhost:3001`)

ngrok example:

```sh
ngrok http 3000
ngrok http 3001
```

cloudflared example:

```sh
cloudflared tunnel --url http://localhost:3000
cloudflared tunnel --url http://localhost:3001
```

4. Point UI to backend tunnel by setting this before the main script in `client/index.html`:

```html
<script>window.OSCAR_API_URL = "https://YOUR-BACKEND-TUNNEL-URL";</script>
```

5. Set CORS in `server/.env` and restart backend:

```env
ALLOWED_ORIGINS=https://YOUR-UI-TUNNEL-URL,https://cad.onshape.com
```

6. In Onshape custom app settings, use the **UI tunnel URL** as the iframe/app URL.

> Seeing `Cannot GET /` at your backend tunnel root is expected. The OSCAR backend does not serve a homepage at `/`. Use `https://YOUR-BACKEND-TUNNEL-URL/health` to verify the API is reachable.

### B. Create an Onshape app

1. Go to the Onshape Developer Portal: <https://dev-portal.onshape.com>.
2. Create a new app (or edit an existing app).
3. Add an OAuth client for your app (recommended for multi-user production use).
4. Configure the app/tab URL to your hosted OSCAR UI (`https://oscar-ui.yourdomain.com`).
5. Set redirect/callback URLs required by your OAuth configuration.
6. Publish privately to your company/team or install it to your account for testing.

> For local testing, you can use static API keys on the backend (`ONSHAPE_ACCESS_KEY` / `ONSHAPE_SECRET_KEY`) instead of full OAuth.

### C. Add OSCAR to a document and use it

1. Open an Onshape document and add the OSCAR app/tab.
2. In OSCAR:
   - Paste the current Onshape workspace URL (`.../documents/<documentId>/w/<workspaceId>/e/<elementId>`), or manual IDs
   - Click **Load context**
3. Pick a model from the top-right model picker (default is **GPT-5.3-Codex**).
4. Ask for changes (for example, "Generate a FeatureScript fillet on selected edges").
5. Review the response and proposed actions.
6. Click **Apply to Onshape** to execute only the action(s) you approve.

### D. Recommended model usage

- **GPT-5.3-Codex** (default): best for agentic multi-step edits and implementation workflows
- GPT-5.2-Codex: strong alternative for complex coding tasks
- GPT-5.2 / GPT-4.1: balanced general reasoning
- GPT-5 mini / GPT-5.4 mini / Gemini 3 Flash / Claude Haiku 4.5: fastest low-cost options
- Gemini 3.1 Pro / Gemini 2.5 Pro: deep analysis and hard planning

## Embedding as an Onshape tab

1. In Onshape, open **App Store** → **Manage apps** → **Add custom app**
2. Set the iframe URL to where `client/index.html` is hosted (e.g., `https://your-server.example.com/`)
3. In `client/index.html`, set `window.OSCAR_API_URL` to your server URL before the `<script>` block:

```html
<script>window.OSCAR_API_URL = 'https://your-server.example.com';</script>
```

The panel will appear as a tab in your Onshape document view.

---

## Security notes

- **Secrets are server-side only.** The `GITHUB_TOKEN`, Onshape keys, and any AI provider keys are read from the server's environment — they are never sent to the browser.
- OSCAR first uses GitHub Copilot session-token exchange server-side (cached ~30 minutes). If that endpoint is unavailable for your token/account, OSCAR falls back to GitHub Models inference using the same server-side `GITHUB_TOKEN`.
- `onshapeContext` document/workspace/element IDs are validated server-side as 24-character Onshape IDs before API calls; still add auth middleware and per-user authorization checks for production.
- Set `ALLOWED_ORIGINS` in `.env` to restrict CORS in production.

---

## License

MIT
