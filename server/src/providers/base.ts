import { AgentInfo, AIProvider, Message } from "../types/index.js";

/**
 * Abstract base class for AI providers.
 * Extend this to add a new AI backend (OpenAI, Anthropic, GitHub Models, etc.).
 */
export abstract class BaseProvider implements AIProvider {
  abstract id: string;
  abstract name: string;

  abstract listAgents(): AgentInfo[];
  abstract chat(agentId: string, messages: Message[], systemPrompt?: string): Promise<Message>;
}
