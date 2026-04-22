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
  private readonly modelsChatEndpoint =
    "https://models.github.ai/inference/chat/completions";

  /** Cached session token + its expiry timestamp (ms). */
  private sessionToken: string | null = null;
  private sessionTokenExpiresAt = 0;
  private authMode: "copilot-session" | "github-token-direct" = "copilot-session";

  /**
   * Student-available GitHub Copilot models (April 18, 2026).
   * Ordered with GPT-5.3-Codex first because it is the primary agentic model.
   */
  private readonly agents: AgentInfo[] = [
    {
      id: "github-copilot/gpt-5.3-codex",
      name: "GPT-5.3-Codex",
      provider: "github-copilot",
      description: "Primary agentic model for complex multi-step CAD changes.",
      capabilities: ["featurescript", "design-review", "documentation", "agentic-planning"],
      model: "gpt-5.3-codex",
    },
    {
      id: "github-copilot/gpt-5.2-codex",
      name: "GPT-5.2-Codex",
      provider: "github-copilot",
      description: "Codex model for advanced coding and automation tasks.",
      capabilities: ["featurescript", "design-review", "documentation", "agentic-planning"],
      model: "gpt-5.2-codex",
    },
    {
      id: "github-copilot/gpt-5.2",
      name: "GPT-5.2",
      provider: "github-copilot",
      description: "Versatile high-intelligence reasoning model.",
      capabilities: ["featurescript", "design-review", "documentation"],
      model: "gpt-5.2",
    },
    {
      id: "github-copilot/gpt-5-mini",
      name: "GPT-5 mini",
      provider: "github-copilot",
      description: "Fast and cost-efficient GPT-5 variant.",
      capabilities: ["featurescript", "documentation"],
      model: "gpt-5-mini",
    },
    {
      id: "github-copilot/gpt-5.4-mini",
      name: "GPT-5.4 mini",
      provider: "github-copilot",
      description: "Fast and cost-efficient GPT-5.4 mini model.",
      capabilities: ["featurescript", "documentation"],
      model: "gpt-5.4-mini",
    },
    {
      id: "github-copilot/gpt-4.1",
      name: "GPT-4.1",
      provider: "github-copilot",
      description: "Reliable versatile model for general Onshape help.",
      capabilities: ["featurescript", "design-review", "documentation"],
      model: "gpt-4.1",
    },
    {
      id: "github-copilot/gpt-4o",
      name: "GPT-4o",
      provider: "github-copilot",
      description: "Fast multimodal general-purpose model.",
      capabilities: ["featurescript", "design-review", "documentation"],
      model: "gpt-4o",
    },
    {
      id: "github-copilot/grok-code-fast-1",
      name: "Grok Code Fast 1",
      provider: "github-copilot",
      description: "Fast code-focused model for quick implementation drafts.",
      capabilities: ["featurescript", "documentation"],
      model: "grok-code-fast-1",
    },
    {
      id: "github-copilot/claude-haiku-4.5",
      name: "Claude Haiku 4.5",
      provider: "github-copilot",
      description: "Low-latency Claude model for concise assistance.",
      capabilities: ["featurescript", "documentation"],
      model: "claude-haiku-4.5",
    },
    {
      id: "github-copilot/gemini-3-flash",
      name: "Gemini 3 Flash (Preview)",
      provider: "github-copilot",
      description: "Preview fast Gemini model for rapid responses.",
      capabilities: ["featurescript", "documentation"],
      model: "gemini-3-flash",
    },
    {
      id: "github-copilot/gemini-3.1-pro",
      name: "Gemini 3.1 Pro (Preview)",
      provider: "github-copilot",
      description: "Preview model for complex reasoning workloads.",
      capabilities: ["featurescript", "design-review", "documentation"],
      model: "gemini-3.1-pro",
    },
    {
      id: "github-copilot/gemini-2.5-pro",
      name: "Gemini 2.5 Pro",
      provider: "github-copilot",
      description: "Powerful model for difficult analysis and planning.",
      capabilities: ["featurescript", "design-review", "documentation"],
      model: "gemini-2.5-pro",
    },
  ];

  listAgents(): AgentInfo[] {
    return this.agents;
  }

  private modelToGithubModelsId(model: string): string | null {
    const map: Record<string, string> = {
      "gpt-5.3-codex": "openai/gpt-5.3-codex",
      "gpt-5.2-codex": "openai/gpt-5.2-codex",
      "gpt-5.2": "openai/gpt-5.2",
      "gpt-5-mini": "openai/gpt-5-mini",
      "gpt-5.4-mini": "openai/gpt-5-mini",
      "gpt-4.1": "openai/gpt-4.1",
      "gpt-4o": "openai/gpt-4o",
      "grok-code-fast-1": "xai/grok-code-fast-1",
      "claude-haiku-4.5": "anthropic/claude-haiku-4.5",
      "gemini-3-flash": "google/gemini-2.5-flash",
      "gemini-3.1-pro": "google/gemini-2.5-pro",
      "gemini-2.5-pro": "google/gemini-2.5-pro",
    };
    return map[model] ?? null;
  }

  private async chatViaGithubModels(
    githubToken: string,
    model: string,
    messages: Message[],
    systemPrompt?: string
  ): Promise<Message> {
    const modelsModel = this.modelToGithubModelsId(model);
    if (!modelsModel) {
      throw new Error(
        "Fallback to GitHub Models is unavailable for this selected model."
      );
    }

    const modelsResp = await fetch(this.modelsChatEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        model: modelsModel,
        messages: [
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          ...messages,
        ],
        stream: false,
      }),
    });

    if (!modelsResp.ok) {
      const modelsErrorText = await modelsResp.text();
      throw new Error(
        `GitHub Models error ${modelsResp.status}: ${modelsErrorText}. ` +
          "Use a token with GitHub Models read permission and Copilot enabled on your account."
      );
    }

    const modelsData = (await modelsResp.json()) as {
      choices: { message: { role: string; content: string } }[];
    };
    const modelsChoice = modelsData.choices?.[0]?.message;
    if (!modelsChoice) {
      throw new Error("No response from GitHub Models API.");
    }
    return { role: "assistant", content: modelsChoice.content };
  }

  /**
   * Returns a valid Copilot session token, refreshing it when needed.
   * The session token expires roughly every 30 minutes.
   */
  private async getSessionToken(githubToken: string): Promise<string> {
    if (this.authMode === "github-token-direct") {
      return githubToken;
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
      if (resp.status === 404) {
        // Newer GitHub auth flows can disable the legacy internal token endpoint.
        // Fall back to direct GitHub token auth; chat() will use GitHub Models
        // as a secondary endpoint if the Copilot endpoint still rejects it.
        this.authMode = "github-token-direct";
        console.warn(
          "Copilot token exchange endpoint returned 404. Falling back to direct GitHub token auth."
        );
        return githubToken;
      }
      throw new Error(
        `GitHub Copilot token exchange failed (${resp.status}): ${text}. ` +
          "Use a GitHub token with Copilot access (classic: 'copilot' scope, " +
          "fine-grained: GitHub Models read permission) and ensure your account " +
          "has an active Copilot subscription."
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

  private getGithubToken(): string {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error(
        "GITHUB_TOKEN is not set. " +
          "Create a Personal Access Token at https://github.com/settings/tokens " +
          "with Copilot/Models access. " +
          "Students: activate Copilot free at https://education.github.com/students."
      );
    }
    return githubToken;
  }

  async chat(agentId: string, messages: Message[], systemPrompt?: string): Promise<Message> {
    const agent = this.agents.find((a) => a.id === agentId);
    if (!agent) {
      throw new Error(`Unknown GitHub Copilot agent: ${agentId}`);
    }

    const githubToken = this.getGithubToken();
    const sessionToken = await this.getSessionToken(githubToken);

    const body = {
      model: agent.model,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        ...messages,
      ],
      stream: false,
    };

    // Fine-grained PATs are not supported by the Copilot chat endpoint directly.
    // In direct-token mode, call GitHub Models immediately.
    if (this.authMode === "github-token-direct") {
      return this.chatViaGithubModels(githubToken, agent.model, messages, systemPrompt);
    }

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

    if (resp.ok) {
      const data = (await resp.json()) as {
        choices: { message: { role: string; content: string } }[];
      };
      const choice = data.choices?.[0]?.message;
      if (!choice) {
        throw new Error("No response from GitHub Copilot API.");
      }
      return { role: "assistant", content: choice.content };
    }

    const copilotErrorText = await resp.text();

    // Some models (e.g. gpt-5.3-codex) are not accessible via the Copilot
    // /chat/completions endpoint but ARE available on GitHub Models.
    // Detect this specific error code and transparently retry via GitHub Models.
    let copilotErrorBody: { error?: { code?: string } } = {};
    try {
      copilotErrorBody = JSON.parse(copilotErrorText);
    } catch {
      // not JSON — fall through to generic error
    }
    if (copilotErrorBody.error?.code === "unsupported_api_for_model") {
      console.warn(
        `Model "${agent.model}" is not supported by the Copilot chat endpoint. ` +
          "Falling back to GitHub Models inference."
      );
      return this.chatViaGithubModels(githubToken, agent.model, messages, systemPrompt);
    }

    throw new Error(`GitHub Copilot API error ${resp.status}: ${copilotErrorText}`);
  }
}
