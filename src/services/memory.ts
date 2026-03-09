import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env, ExtractedFacts, Memory, MemoryUpdateResult } from "../types.js";
import { embed, chatJson } from "./openai.js";
import { FACT_EXTRACTION_PROMPT } from "../prompts/fact-extraction.js";
import { MEMORY_UPDATE_PROMPT } from "../prompts/memory-update.js";

const DEFAULT_USER_ID = "claude-code";
const DEDUP_THRESHOLD = 0.85;

export async function addMemory(
  db: SupabaseClient,
  env: Env,
  text: string,
  userId?: string,
  metadata?: Record<string, unknown>,
): Promise<{ results: { id: string; memory: string; event: string }[] }> {
  const uid = userId || DEFAULT_USER_ID;
  const results: { id: string; memory: string; event: string }[] = [];

  // Extract facts from the input text
  const { facts } = await chatJson<ExtractedFacts>(
    FACT_EXTRACTION_PROMPT,
    text,
    env.OPENAI_API_KEY,
  );

  for (const fact of facts) {
    const embedding = await embed(fact, env.OPENAI_API_KEY);

    // Check for similar existing memories
    const { data: similar } = await db.rpc("match_memories", {
      query_embedding: embedding,
      query_user_id: uid,
      match_threshold: DEDUP_THRESHOLD,
      match_count: 5,
    });

    if (similar && similar.length > 0) {
      // Ask LLM to decide: update, delete, or add
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
          const newEmbed = await embed(action.text, env.OPENAI_API_KEY);
          const { data } = await db
            .from("memories")
            .insert({
              user_id: uid,
              text: action.text,
              embedding: newEmbed,
              metadata: metadata || {},
            })
            .select("id")
            .single();
          if (data) results.push({ id: data.id, memory: action.text, event: "ADD" });
        } else if (action.event === "UPDATE") {
          const updatedEmbed = await embed(action.text, env.OPENAI_API_KEY);
          await db
            .from("memories")
            .update({
              text: action.text,
              embedding: updatedEmbed,
              updated_at: new Date().toISOString(),
            })
            .eq("id", action.id);
          results.push({ id: action.id, memory: action.text, event: "UPDATE" });
        } else if (action.event === "DELETE") {
          await db.from("memories").delete().eq("id", action.id);
          results.push({ id: action.id, memory: action.text, event: "DELETE" });
        }
      }
    } else {
      // No similar memories — just add
      const { data } = await db
        .from("memories")
        .insert({
          user_id: uid,
          text: fact,
          embedding: embedding,
          metadata: metadata || {},
        })
        .select("id")
        .single();
      if (data) results.push({ id: data.id, memory: fact, event: "ADD" });
    }
  }

  return { results };
}

export async function searchMemories(
  db: SupabaseClient,
  env: Env,
  query: string,
  userId?: string,
  limit: number = 10,
): Promise<{ results: Memory[] }> {
  const uid = userId || DEFAULT_USER_ID;
  const embedding = await embed(query, env.OPENAI_API_KEY);

  const { data, error } = await db.rpc("match_memories", {
    query_embedding: embedding,
    query_user_id: uid,
    match_threshold: 0.5,
    match_count: limit,
  });

  if (error) throw new Error(`Search error: ${error.message}`);
  return { results: data || [] };
}

export async function listMemories(
  db: SupabaseClient,
  userId?: string,
): Promise<Memory[]> {
  const uid = userId || DEFAULT_USER_ID;
  const { data, error } = await db
    .from("memories")
    .select("id, user_id, text, metadata, created_at, updated_at")
    .eq("user_id", uid)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`List error: ${error.message}`);
  return data || [];
}

export async function getMemory(
  db: SupabaseClient,
  memoryId: string,
): Promise<Memory> {
  const { data, error } = await db
    .from("memories")
    .select("id, user_id, text, metadata, created_at, updated_at")
    .eq("id", memoryId)
    .single();

  if (error) throw new Error(`Get error: ${error.message}`);
  return data;
}

export async function updateMemory(
  db: SupabaseClient,
  env: Env,
  memoryId: string,
  text: string,
): Promise<Memory> {
  const embedding = await embed(text, env.OPENAI_API_KEY);
  const { data, error } = await db
    .from("memories")
    .update({ text, embedding, updated_at: new Date().toISOString() })
    .eq("id", memoryId)
    .select("id, user_id, text, metadata, created_at, updated_at")
    .single();

  if (error) throw new Error(`Update error: ${error.message}`);
  return data;
}

export async function deleteMemory(
  db: SupabaseClient,
  memoryId: string,
): Promise<{ message: string }> {
  const { error } = await db.from("memories").delete().eq("id", memoryId);
  if (error) throw new Error(`Delete error: ${error.message}`);
  return { message: "Memory deleted" };
}

export async function deleteAllMemories(
  db: SupabaseClient,
  userId?: string,
): Promise<{ message: string }> {
  const uid = userId || DEFAULT_USER_ID;
  const { error } = await db.from("memories").delete().eq("user_id", uid);
  if (error) throw new Error(`Delete all error: ${error.message}`);
  return { message: "All memories deleted" };
}
