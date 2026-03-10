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
      metadata: z.record(z.string(), z.unknown()).optional().describe("Key-value metadata to attach"),
    },
    async ({ text, metadata }) => {
      const result = await addMemory(env, text, metadata);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "search_memories",
    "Semantic search across stored memories.",
    {
      query: z.string().describe("Natural language search query"),
      limit: z.number().optional().default(10).describe("Max results (default 10)"),
    },
    async ({ query, limit }) => {
      const result = await searchMemories(env, query, limit);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.tool(
    "list_memories",
    "List stored memories, ordered by most recently updated.",
    {
      limit: z.number().optional().default(50).describe("Max results (default 50)"),
      offset: z.number().optional().default(0).describe("Number of results to skip (default 0)"),
    },
    async ({ limit, offset }) => {
      const result = await listMemories(env, limit, offset);
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
    "Delete ALL memories. Use with caution!",
    {},
    async () => {
      const result = await deleteAllMemories(env);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  return server;
}
