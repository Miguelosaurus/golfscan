import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { getClerkIdFromIdentity, deriveNameFromEmail } from "./lib/authUtils";
import { ensureSelfPlayer } from "./lib/playerUtils";

export const syncUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const clerkId = getClerkIdFromIdentity(identity);
    if (!clerkId) {
      throw new Error("Missing Clerk user id from identity");
    }
    const tokenIdentifier = identity.tokenIdentifier;
    const now = Date.now();

    // 1) Prefer lookup by canonical Clerk id
    let existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    // 2) Legacy migration: if not found, fall back to tokenIdentifier and attach clerkId
    if (!existing) {
      existing = await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { clerkId, tokenIdentifier, updatedAt: now });
      }
    }

    if (existing) {
      const updates: Record<string, unknown> = { updatedAt: now };

      if (identity.name && identity.name !== existing.name) {
        updates.name = identity.name;
      }
      if (identity.email && identity.email !== existing.email) {
        updates.email = identity.email;
      }
      if (Object.keys(updates).length > 1) {
        await ctx.db.patch(existing._id, updates);
      }

      await ensureSelfPlayer(ctx, existing._id, (updates.name as string) ?? existing.name, now);
      return existing._id;
    }

    const fallbackName =
      identity.name ||
      deriveNameFromEmail(identity.email) ||
      "New Golfer";

    const userId = await ctx.db.insert("users", {
      tokenIdentifier,
      name: fallbackName,
      email: identity.email ?? "",
      avatarUrl: undefined,
      handicap: undefined,
      handicapIndexHistory: [],
      isPro: false,
      scansRemaining: 30, // Monthly scan limit for free users
      stats: undefined,
      createdAt: now,
      updatedAt: now,
    });

    await ensureSelfPlayer(ctx, userId, fallbackName, now);
    return userId;
  },
});
