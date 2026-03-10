import type { Env, ExtractedFacts, Memory, MemoryUpdateResult } from "../types.js";
import { embed, chatJson } from "./openai.js";
import { FACT_EXTRACTION_PROMPT } from "../prompts/fact-extraction.js";
import { MEMORY_UPDATE_PROMPT } from "../prompts/memory-update.js";

const USER_ID = "default";
const DEDUP_THRESHOLD = 0.85;

function generateId(): string {
  return crypto.randomUUID();
}

/** Query Vectorize then hydrate full records from D1 */
async function vectorSearch(
  env: Env,
  embedding: number[],
  threshold: number,
  topK: number,
): Promise<Memory[]> {
  const matches = await env.VECTORIZE.query(embedding, {
    topK,
    filter: { user_id: USER_ID },
    returnMetadata: "all",
  });

  const ids = matches.matches
    .filter((m) => m.score >= threshold)
    .map((m) => m.id);

  if (ids.length === 0) return [];

  const placeholders = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT id, text, metadata, created_at, updated_at FROM memories WHERE id IN (${placeholders})`,
  )
    .bind(...ids)
    .all<{ id: string; text: string; metadata: string; created_at: string; updated_at: string }>();

  const scoreMap = new Map(matches.matches.map((m) => [m.id, m.score]));

  return (results || [])
    .map((r) => ({
      id: r.id,
      text: r.text,
      metadata: JSON.parse(r.metadata || "{}"),
      similarity: scoreMap.get(r.id),
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
}

export async function addMemory(
  env: Env,
  text: string,
  metadata?: Record<string, unknown>,
): Promise<{ results: { id: string; memory: string; event: string }[] }> {
  const results: { id: string; memory: string; event: string }[] = [];
  const meta = JSON.stringify(metadata || {});

  const { facts } = await chatJson<ExtractedFacts>(
    FACT_EXTRACTION_PROMPT,
    text,
    env.OPENAI_API_KEY,
  );

  for (const fact of facts) {
    const embedding = await embed(fact, env.OPENAI_API_KEY);

    const similar = await vectorSearch(env, embedding, DEDUP_THRESHOLD, 5);

    if (similar.length > 0) {
      const existingList = similar
        .map((m: Memory) => `ID: ${m.id}\nText: ${m.text}`)
        .join("\n\n");
      const prompt = `New fact: ${fact}\n\nExisting memories:\n${existingList}`;
      const decision = await chatJson<MemoryUpdateResult>(
        MEMORY_UPDATE_PROMPT,
        prompt,
        env.OPENAI_API_KEY,
      );

      for (const action of decision.memory) {
        if (action.event === "ADD") {
          const id = generateId();
          const newEmbed = await embed(action.text, env.OPENAI_API_KEY);
          await env.DB.prepare(
            "INSERT INTO memories (id, user_id, text, metadata) VALUES (?, ?, ?, ?)",
          )
            .bind(id, USER_ID, action.text, meta)
            .run();
          await env.VECTORIZE.upsert([
            { id, values: newEmbed, metadata: { user_id: USER_ID } },
          ]);
          results.push({ id, memory: action.text, event: "ADD" });
        } else if (action.event === "UPDATE") {
          const updatedEmbed = await embed(action.text, env.OPENAI_API_KEY);
          await env.DB.prepare(
            "UPDATE memories SET text = ?, updated_at = datetime('now') WHERE id = ?",
          )
            .bind(action.text, action.id)
            .run();
          await env.VECTORIZE.upsert([
            { id: action.id, values: updatedEmbed, metadata: { user_id: USER_ID } },
          ]);
          results.push({ id: action.id, memory: action.text, event: "UPDATE" });
        } else if (action.event === "DELETE") {
          await env.DB.prepare("DELETE FROM memories WHERE id = ?")
            .bind(action.id)
            .run();
          await env.VECTORIZE.deleteByIds([action.id]);
          results.push({ id: action.id, memory: action.text, event: "DELETE" });
        }
      }
    } else {
      const id = generateId();
      await env.DB.prepare(
        "INSERT INTO memories (id, user_id, text, metadata) VALUES (?, ?, ?, ?)",
      )
        .bind(id, USER_ID, fact, meta)
        .run();
      await env.VECTORIZE.upsert([
        { id, values: embedding, metadata: { user_id: USER_ID } },
      ]);
      results.push({ id, memory: fact, event: "ADD" });
    }
  }

  return { results };
}

export async function searchMemories(
  env: Env,
  query: string,
  limit: number = 10,
): Promise<{ results: Memory[] }> {
  const embedding = await embed(query, env.OPENAI_API_KEY);
  const results = await vectorSearch(env, embedding, 0.3, limit);
  return { results };
}

export async function listMemories(
  env: Env,
  limit: number = 50,
  offset: number = 0,
): Promise<Memory[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, text, metadata, created_at, updated_at FROM memories WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
  )
    .bind(USER_ID, limit, offset)
    .all<{ id: string; text: string; metadata: string; created_at: string; updated_at: string }>();

  return (results || []).map((r) => ({
    id: r.id,
    text: r.text,
    metadata: JSON.parse(r.metadata || "{}"),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export async function getMemory(
  env: Env,
  memoryId: string,
): Promise<Memory> {
  const r = await env.DB.prepare(
    "SELECT id, text, metadata, created_at, updated_at FROM memories WHERE id = ?",
  )
    .bind(memoryId)
    .first<{ id: string; text: string; metadata: string; created_at: string; updated_at: string }>();

  if (!r) throw new Error("Memory not found");
  return {
    id: r.id,
    text: r.text,
    metadata: JSON.parse(r.metadata || "{}"),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function updateMemory(
  env: Env,
  memoryId: string,
  text: string,
): Promise<Memory> {
  const embedding = await embed(text, env.OPENAI_API_KEY);

  await env.DB.prepare(
    "UPDATE memories SET text = ?, updated_at = datetime('now') WHERE id = ?",
  )
    .bind(text, memoryId)
    .run();

  await env.VECTORIZE.upsert([
    { id: memoryId, values: embedding, metadata: { user_id: USER_ID } },
  ]);

  return getMemory(env, memoryId);
}

export async function deleteMemory(
  env: Env,
  memoryId: string,
): Promise<{ message: string }> {
  await env.DB.prepare("DELETE FROM memories WHERE id = ?")
    .bind(memoryId)
    .run();
  await env.VECTORIZE.deleteByIds([memoryId]);
  return { message: "Memory deleted" };
}

export async function deleteAllMemories(
  env: Env,
): Promise<{ message: string }> {
  const { results } = await env.DB.prepare(
    "SELECT id FROM memories WHERE user_id = ?",
  )
    .bind(USER_ID)
    .all<{ id: string }>();

  const ids = (results || []).map((r) => r.id);

  await env.DB.prepare("DELETE FROM memories WHERE user_id = ?")
    .bind(USER_ID)
    .run();

  if (ids.length > 0) {
    await env.VECTORIZE.deleteByIds(ids);
  }

  return { message: "All memories deleted" };
}
