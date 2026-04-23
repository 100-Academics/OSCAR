export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  agentId: string;
  messages: Message[];
  onshapeContext?: OnshapeContext;
}

export interface ChatResponse {
  agentId: string;
  message: Message;
  actions?: OnshapeAction[];
}

export interface OnshapeContext {
  documentId: string;
  workspaceId: string;
  elementId: string;
  documentName?: string;
  features?: unknown;
}

export interface OnshapeAction {
  type: "featurescript" | "addFeature" | "rename" | "suppress" | "custom";
  label: string;
  payload: Record<string, unknown>;
}

export interface AgentInfo {
  id: string;
  name: string;
  provider: string;
  description: string;
  capabilities: string[];
  model: string;
}

export interface AIProvider {
  id: string;
  name: string;
  listAgents(): AgentInfo[];
  chat(agentId: string, messages: Message[], systemPrompt?: string): Promise<Message>;
}
