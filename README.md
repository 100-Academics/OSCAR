# OSCAR — Onshape-Synced Copilot for Automated Reviews

A bi-directional communication bridge that connects your Onshape Part Studio to **GitHub Copilot** (and other AI models) directly inside the Onshape tab.

## What it does

- **Send instructions** from the Onshape tab to GitHub Copilot (or any configured AI model)
- **Receive responses** — FeatureScript snippets, design suggestions, documentation, review notes — rendered right in the tab
- **Apply results** to your Onshape document with one click (FeatureScript execution, feature modifications)
- **Pick your model** from a GitHub Copilot-style model selector in the top bar:
  - GitHub Copilot models (GPT-4.1, GPT-4o, Claude 3.5/3.7 Sonnet, Gemini 2.0 Flash, o3-mini) — **free for students**
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
4. Under **Permissions / Scopes**, enable **GitHub Copilot** (in the "Copilot" section)
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

### 6. Open the Onshape tab

Open `client/index.html` directly in your browser, or serve it:

```sh
npx serve client
# then open http://localhost:3001
```

To embed it as a custom tab inside Onshape, see [Embedding as an Onshape tab](#embedding-as-an-onshape-tab).

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
  "agentId": "github-copilot/gpt-4.1",
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
  "agentId": "github-copilot/gpt-4.1",
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
- The GitHub Copilot session token is exchanged server-side and cached in memory for ~30 minutes. It is never exposed to the client.
- Validate and sanitize all `onshapeContext` inputs before forwarding to the Onshape API (the current implementation trusts the client for IDs; add auth middleware as needed for production).
- Set `ALLOWED_ORIGINS` in `.env` to restrict CORS in production.

---

## License

MIT
