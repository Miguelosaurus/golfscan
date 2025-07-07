import 'dotenv/config'; // MUST be first so other modules can read env vars
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { trpcServer } from "@hono/trpc-server";
import { cors } from "hono/cors";
import { appRouter } from "./app-router";
import { createContext } from "./create-context";

console.log('DEBUG: EXPO_PUBLIC_GOLF_COURSE_API_KEY =', process.env.EXPO_PUBLIC_GOLF_COURSE_API_KEY);

// app will be mounted at /api
const app = new Hono();

// Enable CORS for all routes
app.use("*", cors());

// Mount tRPC router at /trpc
app.use(
  "/api/trpc/*",
  trpcServer({
    endpoint: "/api/trpc",
    router: appRouter,
    createContext,
  })
);

// Simple health check endpoint
app.get("/", (c) => {
  return c.json({ status: "ok", message: "API is running" });
});

export default app;

// ---------------------------------------------------------------------------
// Local-dev convenience: if this file is executed with `tsx backend/trpc/hono.ts`
// (see the "backend" npm script) spin up a Node HTTP server automatically so
// the mobile app can reach `http://<LAN-IP>:PORT/api/trpc/*`.
// ---------------------------------------------------------------------------
if (require.main === module) {
  const port = Number(process.env.PORT ?? 3001);
  serve({ fetch: app.fetch, port });
  console.log(`🔹 Hono tRPC API listening on http://localhost:${port}/api`);
}