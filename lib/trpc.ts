import { createTRPCReact } from "@trpc/react-query";
import { httpLink } from "@trpc/client";
import type { AppRouter } from "@/backend/trpc/app-router";
import superjson from "superjson";

export const trpc = createTRPCReact<AppRouter>();

const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }

  throw new Error(
    "No base url found, please set EXPO_PUBLIC_API_BASE_URL in your .env file"
  );
};

export const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
      fetch: (input, init) => {
        const controller = new AbortController();
        const timeoutMs = 300_000; // 300s to avoid aborts on full-quality images
        const startedAt = Date.now();
        // Lightweight request logging
        try {
          console.log(
            `tRPC HTTP start ${new Date(startedAt).toLocaleTimeString()} | timeout=${timeoutMs}ms | url=${typeof input === 'string' ? input : (input as Request).url}`
          );
        } catch { }
        const id = setTimeout(() => controller.abort(), timeoutMs);
        return fetch(input as any, { ...init, signal: controller.signal as any })
          .then((res) => {
            const elapsed = Date.now() - startedAt;
            try { console.log(`tRPC HTTP end ${new Date().toLocaleTimeString()} | ${res.status} | ${elapsed}ms`); } catch { }
            return res;
          })
          .catch((err) => {
            const elapsed = Date.now() - startedAt;
            const aborted = (controller.signal as any)?.aborted;
            try { console.error(`tRPC HTTP error | aborted=${aborted} | ${elapsed}ms |`, err?.message || err); } catch { }
            throw err;
          })
          .finally(() => clearTimeout(id));
      },
    }),
  ],
});