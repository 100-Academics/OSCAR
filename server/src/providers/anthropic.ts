import { AgentInfo, Message } from "../types/index.js";
import { BaseProvider } from "./base.js";

/**
 * Anthropic provider (Claude models).
 * Required env var: ANTHROPIC_API_KEY
 */
export class AnthropicProvider extends BaseProvider {
  id = "anthropic";
  name = "Anthropic";

  private readonly endpoint = "https://api.anthropic.com/v1/messages";

  private readonly agents: AgentInfo[] = [
    {
      id: "anthropic/claude-sonnet-4-5",
      name: "Claude Sonnet 4.5",
      provider: "anthropic",
      description: "Anthropic Claude Sonnet 4.5 — balanced speed and quality.",
      capabilities: ["featurescript", "design-review", "documentation"],
      model: "claude-sonnet-4-5",
    },
    {
      id: "anthropic/claude-opus-4-5",
      name: "Claude Opus 4.5",
      provider: "anthropic",
      description: "Anthropic Claude Opus 4.5 — highest quality reasoning.",
      capabilities: ["featurescript", "design-review", "documentation"],
      model: "claude-opus-4-5",
    },
  ];

  listAgents(): AgentInfo[] {
    return this.agents;
  }

  async chat(agentId: string, messages: Message[], systemPrompt?: string): Promise<Message> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured.");
    }

    const agent = this.agents.find((a) => a.id === agentId);
    if (!agent) {
      throw new Error(`Unknown agent: ${agentId}`);
    }

    // Anthropic uses a separate system field instead of a system message in the array
    const body: Record<string, unknown> = {
      model: agent.model,
      max_tokens: 4096,
      messages: messages.filter((m) => m.role !== "system"),
      ...(systemPrompt ? { system: systemPrompt } : {}),
    };

    const resp = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Anthropic API error ${resp.status}: ${text}`);
    }

    const data = (await resp.json()) as {
      content: { type: string; text: string }[];
    };

    const content = data.content?.find((c) => c.type === "text")?.text;
    if (!content) {
      throw new Error("No response from Anthropic API.");
    }

    return { role: "assistant", content };
  }
}
