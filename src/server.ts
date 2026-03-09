import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env } from "./types.js";
import {
  addMemory,
  searchMemories,
  listMemories,
  getMemory,
  updateMemory,
  deleteMemory,
  deleteAllMemories,
} from "./services/memory.js";

export function createServer(env: Env): McpServer {
  const server = new McpServer({ name: "mem0-memory", version: "1.0.0" }, {});

  server.tool(
    "add_memory",
    "Store a memory. The system will automatically extract and deduplicate facts.",
    {
      text: z.string().describe("The content to remember"),
      user_id: z.string().optional().describe("User identifier (default: claude-code)"),
      metadata: z.record(z.string(), z.unknown()).optional().describe("Key-value metadata to attach"),
    },
    async ({ text, user_id, metadata }) => {
      const result = await addMemory(env, text, user_id, metadata);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "search_memories",
    "Semantic search across stored memories.",
    {
      query: z.string().describe("Natural language search query"),
      user_id: z.string().optional().describe("User identifier to scope the search"),
      limit: z.number().optional().default(10).describe("Max results (default 10)"),
    },
    async ({ query, user_id, limit }) => {
      const result = await searchMemories(env, query, user_id, limit);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "list_memories",
    "List all stored memories.",
    {
      user_id: z.string().optional().describe("User identifier to filter by"),
    },
    async ({ user_id }) => {
      const result = await listMemories(env, user_id);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "get_memory",
    "Retrieve a single memory by its ID.",
    {
      memory_id: z.string().describe("The unique memory identifier"),
    },
    async ({ memory_id }) => {
      const result = await getMemory(env, memory_id);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "update_memory",
    "Update the content of an existing memory.",
    {
      memory_id: z.string().describe("The unique memory identifier"),
      text: z.string().describe("The new content for this memory"),
    },
    async ({ memory_id, text }) => {
      const result = await updateMemory(env, memory_id, text);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "delete_memory",
    "Delete a single memory.",
    {
      memory_id: z.string().describe("The unique memory identifier to delete"),
    },
    async ({ memory_id }) => {
      const result = await deleteMemory(env, memory_id);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "delete_all_memories",
    "Delete ALL memories for a user. Use with caution!",
    {
      user_id: z.string().optional().describe("User identifier (default: claude-code)"),
    },
    async ({ user_id }) => {
      const result = await deleteAllMemories(env, user_id);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  return server;
}
