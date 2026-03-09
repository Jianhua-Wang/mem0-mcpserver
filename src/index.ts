import { createMcpHandler } from "agents/mcp";
import type { Env } from "./types.js";
import { createServer } from "./server.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check — no auth
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    // Only handle /mcp
    if (url.pathname !== "/mcp") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    // Bearer token auth
    const auth = request.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return Response.json({ error: "Missing Bearer token" }, { status: 401 });
    }
    if (auth.slice(7) !== env.MCP_AUTH_TOKEN) {
      return Response.json({ error: "Invalid token" }, { status: 403 });
    }

    // Create a fresh MCP server per request (stateless)
    const server = createServer(env);
    const handler = createMcpHandler(server);
    return handler(request, env, ctx);
  },
};
