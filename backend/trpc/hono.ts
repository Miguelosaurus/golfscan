import 'dotenv/config'; // MUST be first so other modules can read env vars
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { trpcServer } from "@hono/trpc-server";
import { cors } from "hono/cors";
import { appRouter } from "./app-router";
import { createContext } from "./create-context";
import { tmpdir } from 'os';
import { writeFileSync } from 'fs';
import path from 'path';

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

// Lightweight upload endpoint to accept full-quality images without base64 JSON
app.post('/api/upload', async (c) => {
  try {
    const contentType = c.req.header('content-type') || '';
    const dir = tmpdir();

    if (contentType.includes('multipart/form-data')) {
      const formData = await c.req.parseBody();
      const file = formData['file'] as File | undefined;
      if (!file) {
        return c.json({ error: 'No file provided' }, 400);
      }
      const arrayBuf = await file.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      const ext = (file.type?.split('/')[1]) || 'jpg';
      const filename = `upload-${Date.now()}.${ext}`;
      const fullPath = path.join(dir, filename);
      writeFileSync(fullPath, buf);
      return c.json({ path: fullPath, mimeType: file.type || 'image/jpeg' });
    }

    // Fallback: raw octet-stream with headers x-filename, x-mime-type
    const ab = await c.req.arrayBuffer();
    const buf = Buffer.from(ab);
    const headerName = c.req.header('x-filename') || `upload-${Date.now()}.jpg`;
    const mime = c.req.header('x-mime-type') || 'image/jpeg';
    const fullPath = path.join(dir, headerName);
    writeFileSync(fullPath, buf);
    return c.json({ path: fullPath, mimeType: mime });
  } catch (e) {
    console.error('Upload error:', e);
    return c.json({ error: 'Upload failed' }, 500);
  }
});

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
  const hostname = process.env.HOST ?? '0.0.0.0';
  serve({ fetch: app.fetch, port, hostname });
  console.log(`🔹 Hono tRPC API listening on http://${hostname}:${port}/api`);
}