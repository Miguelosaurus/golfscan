import { action } from "./_generated/server";
import { v } from "convex/values";

const API_BASE = "https://api.golfcourseapi.com";

const buildHeaders = (apiKey: string) => ({
  Authorization: `Key ${apiKey}`,
  "Content-Type": "application/json",
});

export const search = action({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const apiKey = process.env.GOLF_COURSE_API_KEY ?? process.env.EXPO_PUBLIC_GOLF_COURSE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GOLF_COURSE_API_KEY");
    }

    const url = `${API_BASE}/v1/search?search_query=${encodeURIComponent(args.query)}`;
    const res = await fetch(url, { headers: buildHeaders(apiKey) });
    if (!res.ok) {
      throw new Error(`Golf API search failed: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    return data?.courses ?? [];
  },
});

export const getDetails = action({
  args: { id: v.number() },
  handler: async (ctx, args) => {
    const apiKey = process.env.GOLF_COURSE_API_KEY ?? process.env.EXPO_PUBLIC_GOLF_COURSE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GOLF_COURSE_API_KEY");
    }

    const url = `${API_BASE}/v1/courses/${args.id}`;
    const res = await fetch(url, { headers: buildHeaders(apiKey) });
    if (!res.ok) {
      throw new Error(`Golf API getDetails failed: ${res.status} ${res.statusText}`);
    }
    return await res.json();
  },
});
