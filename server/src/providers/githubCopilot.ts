import { AgentInfo, Message } from "../types/index.js";
import { BaseProvider } from "./base.js";

/**
 * GitHub Copilot provider.
 *
 * Uses the same authentication flow as the official VS Code Copilot extension:
 *   1. Exchange a GitHub OAuth token (with `copilot` scope) for a short-lived
 *      Copilot session token via https://api.github.com/copilot_internal/v2/token
 *   2. Call the OpenAI-compatible chat completions endpoint at
 *      https://api.githubcopilot.com/chat/completions with that session token.
 *
 * This is the endpoint that backs GitHub Copilot Individual / Education (free
 * for students via the GitHub Student Developer Pack).
 *
 * Required env var: GITHUB_TOKEN
 *   - Personal Access Token or OAuth token with the `copilot` scope.
 *   - Students: create one at https://github.com/settings/tokens with the
 *     "GitHub Copilot" permission (or legacy `copilot` scope).
 */
export class GitHubCopilotProvider extends BaseProvider {
  id = "github-copilot";
  name = "GitHub Copilot";

  private readonly tokenEndpoint =
    "https://api.github.com/copilot_internal/v2/token";
  private readonly chatEndpoint =
    "https://api.githubcopilot.com/chat/completions";

  /** Cached session token + its expiry timestamp (ms). */
  private sessionToken: string | null = null;
  private sessionTokenExpiresAt = 0;

  /**
   * All models available via GitHub Copilot as of 2025.
   * Students get access to all of these for free.
   */
  private readonly agents: AgentInfo[] = [
    {
      id: "github-copilot/gpt-4.1",
      name: "GPT-4.1",
      provider: "github-copilot",
      description: "OpenAI GPT-4.1 via GitHub Copilot — latest flagship reasoning model.",
      capabilities: ["featurescript", "design-review", "documentation"],
      model: "gpt-4.1",
    },
    {
      id: "github-copilot/gpt-4o",
      name: "GPT-4o",
      provider: "github-copilot",
      description: "OpenAI GPT-4o via GitHub Copilot — fast, multimodal.",
      capabilities: ["featurescript", "design-review", "documentation"],
      model: "gpt-4o",
    },
    {
      id: "github-copilot/gpt-4o-mini",
      name: "GPT-4o mini",
      provider: "github-copilot",
      description: "OpenAI GPT-4o mini via GitHub Copilot — lightweight and fast.",
      capabilities: ["featurescript", "documentation"],
      model: "gpt-4o-mini",
    },
    {
      id: "github-copilot/o3-mini",
      name: "o3-mini",
      provider: "github-copilot",
      description: "OpenAI o3-mini via GitHub Copilot — fast reasoning model.",
      capabilities: ["featurescript", "design-review"],
      model: "o3-mini",
    },
    {
      id: "github-copilot/claude-3.5-sonnet",
      name: "Claude 3.5 Sonnet",
      provider: "github-copilot",
      description: "Anthropic Claude 3.5 Sonnet via GitHub Copilot.",
      capabilities: ["featurescript", "design-review", "documentation"],
      model: "claude-3.5-sonnet",
    },
    {
      id: "github-copilot/claude-3.7-sonnet",
      name: "Claude 3.7 Sonnet",
      provider: "github-copilot",
      description: "Anthropic Claude 3.7 Sonnet via GitHub Copilot — extended thinking.",
      capabilities: ["featurescript", "design-review", "documentation"],
      model: "claude-3.7-sonnet",
    },
    {
      id: "github-copilot/gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      provider: "github-copilot",
      description: "Google Gemini 2.0 Flash via GitHub Copilot — ultra-fast responses.",
      capabilities: ["featurescript", "documentation"],
      model: "gemini-2.0-flash-001",
    },
  ];

  listAgents(): AgentInfo[] {
    return this.agents;
  }

  /**
   * Returns a valid Copilot session token, refreshing it when needed.
   * The session token expires roughly every 30 minutes.
   */
  private async getSessionToken(): Promise<string> {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error(
        "GITHUB_TOKEN is not set. " +
          "Create a Personal Access Token at https://github.com/settings/tokens " +
          "with the 'GitHub Copilot' (copilot) scope. " +
          "Students: activate Copilot free at https://education.github.com/students."
      );
    }

    // Return cached token if it still has more than 60 s of life
    const now = Date.now();
    if (this.sessionToken && this.sessionTokenExpiresAt - now > 60_000) {
      return this.sessionToken;
    }

    const resp = await fetch(this.tokenEndpoint, {
      headers: {
        Authorization: `token ${githubToken}`,
        "User-Agent": "OSCAR-Onshape-Copilot-Bridge/1.0",
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(
        `GitHub Copilot token exchange failed (${resp.status}): ${text}. ` +
          "Make sure your GITHUB_TOKEN has the 'copilot' scope and your account " +
          "has an active GitHub Copilot subscription (free for students)."
      );
    }

    const data = (await resp.json()) as {
      token: string;
      expires_at: string;
    };

    this.sessionToken = data.token;
    this.sessionTokenExpiresAt = new Date(data.expires_at).getTime();

    return this.sessionToken;
  }

  async chat(agentId: string, messages: Message[], systemPrompt?: string): Promise<Message> {
    const agent = this.agents.find((a) => a.id === agentId);
    if (!agent) {
      throw new Error(`Unknown GitHub Copilot agent: ${agentId}`);
    }

    const sessionToken = await this.getSessionToken();

    const body = {
      model: agent.model,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        ...messages,
      ],
      stream: false,
    };

    const resp = await fetch(this.chatEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        "Content-Type": "application/json",
        // Headers that identify this as a Copilot client (required by the API)
        "Editor-Version": "vscode/1.89.0",
        "Editor-Plugin-Version": "copilot/1.172.0",
        "Copilot-Integration-Id": "vscode-chat",
        "Openai-Intent": "conversation-panel",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`GitHub Copilot API error ${resp.status}: ${text}`);
    }

    const data = (await resp.json()) as {
      choices: { message: { role: string; content: string } }[];
    };

    const choice = data.choices?.[0]?.message;
    if (!choice) {
      throw new Error("No response from GitHub Copilot API.");
    }

    return { role: "assistant", content: choice.content };
  }
}
