export interface Env {
  MCP_AUTH_TOKEN: string;
  OPENAI_API_KEY: string;
  VECTORIZE: VectorizeIndex;
  DB: D1Database;
}

export interface Memory {
  id: string;
  user_id: string;
  text: string;
  metadata: Record<string, unknown>;
  similarity?: number;
  created_at: string;
  updated_at: string;
}

export interface ExtractedFacts {
  facts: string[];
}

export interface MemoryAction {
  id: string;
  text: string;
  event: "ADD" | "UPDATE" | "DELETE" | "NONE";
  old_memory?: string;
}

export interface MemoryUpdateResult {
  memory: MemoryAction[];
}
