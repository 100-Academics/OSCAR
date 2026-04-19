import { AgentInfo, Message } from "../types/index.js";
import { BaseProvider } from "./base.js";

/**
 * OpenAI provider.
 * Required env var: OPENAI_API_KEY
 */
export class OpenAIProvider extends BaseProvider {
  id = "openai";
  name = "OpenAI";

  private readonly endpoint = "https://api.openai.com/v1/chat/completions";

  private readonly agents: AgentInfo[] = [
    {
      id: "openai/gpt-4.1",
      name: "GPT-4.1",
      provider: "openai",
      description: "OpenAI GPT-4.1 — latest flagship model.",
      capabilities: ["featurescript", "design-review", "documentation"],
      model: "gpt-4.1",
    },
    {
      id: "openai/gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      description: "OpenAI GPT-4o — fast and efficient.",
      capabilities: ["featurescript", "design-review", "documentation"],
      model: "gpt-4o",
    },
    {
      id: "openai/o3",
      name: "o3",
      provider: "openai",
      description: "OpenAI o3 — advanced reasoning model.",
      capabilities: ["featurescript", "design-review"],
      model: "o3",
    },
  ];

  listAgents(): AgentInfo[] {
    return this.agents;
  }

  async chat(agentId: string, messages: Message[], systemPrompt?: string): Promise<Message> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured.");
    }

    const agent = this.agents.find((a) => a.id === agentId);
    if (!agent) {
      throw new Error(`Unknown agent: ${agentId}`);
    }

    const body = {
      model: agent.model,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        ...messages,
      ],
    };

    const resp = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`OpenAI API error ${resp.status}: ${text}`);
    }

    const data = (await resp.json()) as {
      choices: { message: { role: string; content: string } }[];
    };

    const choice = data.choices?.[0]?.message;
    if (!choice) {
      throw new Error("No response from OpenAI API.");
    }

    return { role: "assistant", content: choice.content };
  }
}
