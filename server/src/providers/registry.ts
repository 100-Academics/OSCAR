import { AIProvider, AgentInfo } from "../types/index.js";
import { GitHubModelsProvider } from "./githubModels.js";
import { OpenAIProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";

/**
 * Central registry of all AI providers.
 * To add a new provider: instantiate it here and add to the `providers` array.
 */
const providers: AIProvider[] = [
  new GitHubModelsProvider(),
  new OpenAIProvider(),
  new AnthropicProvider(),
];

export function getProviders(): AIProvider[] {
  return providers;
}

export function getAllAgents(): AgentInfo[] {
  return providers.flatMap((p) => p.listAgents());
}

export function getProviderForAgent(agentId: string): AIProvider {
  const provider = providers.find((p) =>
    p.listAgents().some((a) => a.id === agentId)
  );
  if (!provider) {
    throw new Error(`No provider found for agent: ${agentId}`);
  }
  return provider;
}
