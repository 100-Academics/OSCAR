import { AgentInfo, Message } from "../types/index.js";
import { BaseProvider } from "./base.js";

/**
 * GitHub Models / GitHub Copilot provider.
 * Uses the GitHub Models inference endpoint which is compatible with the
 * OpenAI chat completions API.
 *
 * Required env var: GITHUB_TOKEN
 */
export class GitHubModelsProvider extends BaseProvider {
  id = "github";
  name = "GitHub Copilot / GitHub Models";

  private readonly endpoint =
    "https://models.inference.ai.azure.com/chat/completions";

  private readonly agents: AgentInfo[] = [
    {
      id: "github/gpt-4.1",
      name: "GPT-4.1",
      provider: "github",
      description: "OpenAI GPT-4.1 via GitHub Models — best general-purpose reasoning.",
      capabilities: ["featurescript", "design-review", "documentation"],
      model: "gpt-4.1",
    },
    {
      id: "github/gpt-4o",
      name: "GPT-4o",
      provider: "github",
      description: "OpenAI GPT-4o via GitHub Models — fast multimodal model.",
      capabilities: ["featurescript", "design-review", "documentation"],
      model: "gpt-4o",
    },
    {
      id: "github/o3",
      name: "o3",
      provider: "github",
      description: "OpenAI o3 via GitHub Models — advanced reasoning model.",
      capabilities: ["featurescript", "design-review"],
      model: "o3",
    },
  ];

  listAgents(): AgentInfo[] {
    return this.agents;
  }

  async chat(agentId: string, messages: Message[], systemPrompt?: string): Promise<Message> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN is not configured.");
    }

    const agent = this.agents.find((a) => a.id === agentId);
    if (!agent) {
      throw new Error(`Unknown agent: ${agentId}`);
    }

    const body: Record<string, unknown> = {
      model: agent.model,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        ...messages,
      ],
    };

    const resp = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`GitHub Models API error ${resp.status}: ${text}`);
    }

    const data = (await resp.json()) as {
      choices: { message: { role: string; content: string } }[];
    };

    const choice = data.choices?.[0]?.message;
    if (!choice) {
      throw new Error("No response from GitHub Models API.");
    }

    return { role: "assistant", content: choice.content };
  }
}
