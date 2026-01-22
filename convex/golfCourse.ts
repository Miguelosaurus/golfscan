import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { api } from "./_generated/api";

const API_BASE = "https://api.golfcourseapi.com";

const buildHeaders = (apiKey: string) => ({
  Authorization: `Key ${apiKey}`,
  "Content-Type": "application/json",
});

export const search = action({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    // Check rate limit before making paid API call (15/day)
    const rateLimitResult = await ctx.runMutation(api.users.checkRateLimit, {
      service: "courseApi",
    });

    if (!rateLimitResult.allowed) {
      const resetsIn = Math.ceil((rateLimitResult.resetsAt - Date.now()) / (1000 * 60 * 60));
      throw new ConvexError(`COURSE_API_LIMIT_REACHED:${resetsIn}`);
    }

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

/**
 * Guest search for unauthenticated onboarding flow.
 * No rate limiting - suitable for demo/onboarding only.
 */
export const searchGuest = action({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    // No rate limiting for guest searches during onboarding
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
