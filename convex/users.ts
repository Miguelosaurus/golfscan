import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getClerkIdFromIdentity, deriveNameFromEmail } from "./lib/authUtils";
import { ensureSelfPlayer } from "./lib/playerUtils";

// Monthly scan limit for free users
const DEFAULT_MONTHLY_SCANS = 30;

function isGenericName(name: string | undefined): boolean {
  return !name || name === "New Golfer";
}

export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const clerkId = getClerkIdFromIdentity(identity);
    if (!clerkId) return null;

    // Prefer lookup by canonical Clerk id, with a legacy fallback to tokenIdentifier
    let user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
        .unique();
    }

    if (!user) return null;
    return user;
  },
});

export const upsertFromClerk = mutation({
  args: { data: v.any() },
  handler: async (ctx, args) => {
    const data = args.data as any;
    const now = Date.now();
    const clerkId = data.id as string;
    const email =
      data.email_addresses?.find((e: any) => e.id === data.primary_email_address_id)?.email_address ||
      data.primary_email_address?.email_address ||
      data.email_addresses?.[0]?.email_address ||
      "";
    const nameFromClerk =
      (data.first_name && data.last_name
        ? `${data.first_name} ${data.last_name}`
        : undefined) ||
      data.first_name ||
      data.username ||
      data.full_name ||
      data.name;
    const derivedFromEmail = deriveNameFromEmail(email);
    const name = nameFromClerk || derivedFromEmail || "New Golfer";
    const avatarUrl = undefined;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (existing) {
      const updates: Record<string, unknown> = {
        email,
        updatedAt: now,
      };

      if (!isGenericName(name) && name !== existing.name) {
        updates.name = name;
      }
      if (avatarUrl !== existing.avatarUrl) {
        updates.avatarUrl = avatarUrl;
      }

      if (Object.keys(updates).length > 1) {
        await ctx.db.patch(existing._id, updates);
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId,
      tokenIdentifier: clerkId,
      name,
      email,
      avatarUrl,
      handicap: undefined,
      handicapIndexHistory: [],
      isPro: false,
      scansRemaining: DEFAULT_MONTHLY_SCANS,
      stats: undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    profileSetupComplete: v.optional(v.boolean()),
    gender: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const clerkId = getClerkIdFromIdentity(identity);

    let user = clerkId
      ? await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
        .unique()
      : null;

    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
        .unique();
      if (user && clerkId) {
        await ctx.db.patch(user._id, {
          clerkId,
          tokenIdentifier: identity.tokenIdentifier,
          updatedAt: Date.now(),
        });
      }
    }

    const now = Date.now();
    const desiredName = args.name?.trim();
    const fallbackName =
      desiredName ||
      identity.name ||
      deriveNameFromEmail(identity.email) ||
      "New Golfer";

    // If user record doesn't exist yet (e.g., first-time login from Apple), create it.
    if (!user) {
      const insertedId = await ctx.db.insert("users", {
        tokenIdentifier: identity.tokenIdentifier,
        name: fallbackName,
        email: identity.email ?? "",
        avatarUrl: args.avatarUrl ?? identity.profileUrl ?? undefined,
        handicap: undefined,
        handicapIndexHistory: [],
        isPro: false,
        scansRemaining: DEFAULT_MONTHLY_SCANS,
        stats: undefined,
        createdAt: now,
        updatedAt: now,
      });
      await ensureSelfPlayer(ctx, insertedId, fallbackName, now, args.gender);
      return {
        _id: insertedId,
        tokenIdentifier: identity.tokenIdentifier,
        name: fallbackName,
        email: identity.email ?? "",
        avatarUrl: args.avatarUrl ?? identity.profileUrl ?? undefined,
        gender: args.gender ?? undefined,
        handicap: undefined,
        handicapIndexHistory: [],
        isPro: false,
        scansRemaining: DEFAULT_MONTHLY_SCANS,
        stats: undefined,
        createdAt: now,
        updatedAt: now,
      };
    }

    const updates: Record<string, unknown> = {
      updatedAt: now,
    };

    if (desiredName && desiredName !== user.name) {
      updates.name = desiredName;
    }

    if (typeof args.avatarUrl === "string" && args.avatarUrl !== user.avatarUrl) {
      updates.avatarUrl = args.avatarUrl;
    }

    if (args.gender !== undefined && args.gender !== user.gender) {
      updates.gender = args.gender;
    }

    if (typeof args.profileSetupComplete === "boolean") {
      updates.profileSetupComplete = args.profileSetupComplete;
    }

    if (Object.keys(updates).length > 1) {
      await ctx.db.patch(user._id, updates);
      await ensureSelfPlayer(
        ctx,
        user._id,
        (updates.name as string) ?? user.name,
        now,
        (updates.gender as string) ?? user.gender
      );
      return { ...user, ...updates };
    }

    return user;
  },
});

export const updateHandicap = mutation({
  args: { handicap: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const clerkId = getClerkIdFromIdentity(identity);
    const user = clerkId
      ? await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
        .unique()
      : null;
    if (!user) throw new Error("User not found");

    const now = Date.now();
    await ctx.db.patch(user._id, { handicap: args.handicap, updatedAt: now });
    return { ...user, handicap: args.handicap, updatedAt: now };
  },
});

export const deleteFromClerk = mutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkUserId))
      .unique();
    if (!existing) return;

    const userId = existing._id;

    // 1) Remove all rounds hosted by this user and their related scores.
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_host", (q) => q.eq("hostId", userId))
      .collect();

    for (const round of rounds) {
      const scores = await ctx.db
        .query("scores")
        .withIndex("by_round", (q) => q.eq("roundId", round._id))
        .collect();
      for (const s of scores) {
        await ctx.db.delete(s._id);
      }
      await ctx.db.delete(round._id);
    }

    // 2) Remove any scan jobs owned by this user.
    const scanJobs = await ctx.db
      .query("scanJobs")
      .withIndex("by_user_status", (q) => q.eq("userId", userId))
      .collect();
    for (const job of scanJobs) {
      await ctx.db.delete(job._id);
    }

    // 3) Remove any player records tied to this user.
    const ownedPlayers = await ctx.db
      .query("players")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();

    for (const p of ownedPlayers) {
      await ctx.db.delete(p._id);
    }

    const linkedPlayers = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const p of linkedPlayers) {
      await ctx.db.delete(p._id);
    }

    // 4) Finally, delete the user document itself.
    await ctx.db.delete(userId);
  },
});
