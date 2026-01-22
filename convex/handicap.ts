import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  calculateHandicapWithSelection,
  calculateHandicapFromDiffs,
} from "./lib/handicapUtils";
import { getClerkIdFromIdentity } from "./lib/authUtils";

/**
 * Lightweight handicap query for home screen / pre-round modal.
 * Returns only currentHandicap, isProvisional, and roundsCount.
 * 
 * IMPORTANT: This must match getDetails semantics exactly:
 * - Compute currentHandicap from diffs (not user.handicap cache)
 * - Sort scores by createdAt descending
 * - Cap roundsCount at 20
 * - Use user.handicap only as fallback if no valid diffs
 * 
 * This avoids the expensive course/round joins that make getDetails costly.
 */
export const getSummary = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const selfPlayer = await ctx.db
      .query("players")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .filter((q) => q.eq(q.field("isSelf"), true))
      .first();

    if (!selfPlayer) {
      return {
        currentHandicap: user.handicap ?? null,
        isProvisional: false,
        roundsCount: 0,
      };
    }

    const scores = await ctx.db
      .query("scores")
      .withIndex("by_player_createdAt", (q) => q.eq("playerId", selfPlayer._id))
      .order("desc")
      .take(50);

    // Filter to scores with valid handicapDifferential (already ordered by createdAt desc)
    const scored = scores.filter((s) => typeof s.handicapDifferential === "number");

    const roundsCount = Math.min(20, scored.length);
    const isProvisional = roundsCount > 0 && roundsCount < 3;

    // Compute currentHandicap from diffs (not user.handicap cache)
    // This ensures we match getDetails even if user.handicap is stale
    if (roundsCount === 0) {
      return {
        currentHandicap: user.handicap ?? null, // Fallback only if no diffs
        isProvisional: false,
        roundsCount: 0,
      };
    }

    const diffs = scored.slice(0, 20).map((s) => s.handicapDifferential as number);
    const computedHandicap = calculateHandicapFromDiffs(diffs);

    return {
      currentHandicap: computedHandicap ?? user.handicap ?? null,
      isProvisional,
      roundsCount,
    };
  },
});

export const recalculate = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    // Find the self player for this user
    const selfPlayer = await ctx.db
      .query("players")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .filter((q) => q.eq(q.field("isSelf"), true))
      .first();

    if (!selfPlayer) {
      return null;
    }

    // Use by_player_createdAt index for deterministic newest-first ordering
    const scores = await ctx.db
      .query("scores")
      .withIndex("by_player_createdAt", (q) => q.eq("playerId", selfPlayer._id))
      .order("desc")
      .take(50);

    if (!scores.length) {
      // No scores at all - clear handicap AND history
      await ctx.db.patch(args.userId, {
        handicap: undefined,
        handicapIndexHistory: [],
        updatedAt: Date.now()
      });
      return null;
    }

    // Only consider scores with a stored handicapDifferential.
    const differentials = scores
      .map((s) => s.handicapDifferential)
      .filter((d): d is number => typeof d === "number");

    if (!differentials.length) {
      // No valid differentials - clear handicap AND history
      await ctx.db.patch(args.userId, {
        handicap: undefined,
        handicapIndexHistory: [],
        updatedAt: Date.now()
      });
      return null;
    }

    // Use last 20 stored differentials (most recent first)
    const limitedDiffs = differentials.slice(0, 20);
    const handicap = calculateHandicapFromDiffs(limitedDiffs);

    const now = Date.now();
    const todayISO = new Date(now).toISOString().split("T")[0];

    // Keep history but limit to last 100 entries and avoid duplicate today entries
    const existingHistory = (user.handicapIndexHistory ?? [])
      .filter((h: any) => !h.date.startsWith(todayISO));

    const newHistory = handicap !== null
      ? [...existingHistory, { date: new Date(now).toISOString(), value: handicap }].slice(-100)
      : existingHistory.slice(-100);

    await ctx.db.patch(args.userId, {
      handicap: handicap ?? undefined,
      handicapIndexHistory: newHistory,
      updatedAt: now,
    });

    return handicap;
  },
});

/**
 * Manually rebuild handicap history from current scores.
 * Creates a history entry for each round date.
 */
export const rebuildHistory = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const clerkId = getClerkIdFromIdentity(identity);
    if (!clerkId) throw new Error("Missing Clerk ID");

    // Lookup by Clerk ID (required for all users)
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (!user) throw new Error("User not found");

    // Find self player
    const selfPlayer = await ctx.db
      .query("players")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .filter((q) => q.eq(q.field("isSelf"), true))
      .first();

    if (!selfPlayer) {
      await ctx.db.patch(user._id, { handicapIndexHistory: [], handicap: undefined });
      return { success: true, message: "No self player found" };
    }

    // Get all scores for this player
    const scores = await ctx.db
      .query("scores")
      .withIndex("by_player", (q) => q.eq("playerId", selfPlayer._id))
      .collect();

    // Fetch rounds to get dates, then pair scores with dates
    const scoresWithDates = await Promise.all(
      scores
        .filter((s) => typeof s.handicapDifferential === "number")
        .map(async (s) => {
          // For synthesized scores, use the score's createdAt (which is backdated)
          // For real scores, use the round's date
          if (s.isSynthesized) {
            return { score: s, date: new Date(s.createdAt).toISOString() };
          }
          const round = await ctx.db.get(s.roundId);
          return { score: s, date: round?.date ?? new Date(s.createdAt).toISOString() };
        })
    );

    // Sort by date ascending (oldest first)
    const validScores = scoresWithDates.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    console.log("[rebuildHistory] Total scores:", validScores.length);
    console.log("[rebuildHistory] First 5 scores (oldest):", validScores.slice(0, 5).map(s => ({
      date: s.date,
      diff: s.score.handicapDifferential,
      isSynthesized: s.score.isSynthesized,
    })));
    console.log("[rebuildHistory] Last 5 scores (newest):", validScores.slice(-5).map(s => ({
      date: s.date,
      diff: s.score.handicapDifferential,
      isSynthesized: s.score.isSynthesized,
    })));

    if (!validScores.length) {
      await ctx.db.patch(user._id, { handicapIndexHistory: [], handicap: undefined });
      return { success: true, message: "No valid scores found" };
    }

    // Build history progressively: for each score, calculate what handicap would be
    const history: { date: string; value: number; isSynthesized?: boolean }[] = [];
    for (let i = 0; i < validScores.length; i++) {
      const currentScore = validScores[i];

      // For synthesized/seeded scores, use the seeded differential directly
      // (no progressive adjustment - it represents an "imported baseline")
      if (currentScore.score.isSynthesized) {
        const seededHandicap = Math.max(0, Math.round((currentScore.score.handicapDifferential as number) * 10) / 10);
        history.push({
          date: currentScore.date,
          value: seededHandicap,
          isSynthesized: true,
        });
        continue;
      }

      // For real scores, use the full progressive WHS calculation
      const diffsUpToNow = validScores
        .slice(0, i + 1)
        .map((item) => item.score.handicapDifferential as number)
        .reverse(); // Most recent first for calculation

      const result = calculateHandicapWithSelection(diffsUpToNow);

      // Log first few and last few calculations
      if (i < 3 || i >= validScores.length - 3) {
        console.log(`[rebuildHistory] Score ${i}: diffs=[${diffsUpToNow.slice(0, 5).join(", ")}${diffsUpToNow.length > 5 ? "..." : ""}], handicap=${result.handicap}`);
      }

      if (result.handicap !== null) {
        history.push({
          date: currentScore.date,
          value: result.handicap,
          isSynthesized: false,
        });
      }
    }

    console.log("[rebuildHistory] History entries:", history.length);
    console.log("[rebuildHistory] First 3 history values:", history.slice(0, 3).map(h => h.value));
    console.log("[rebuildHistory] Last 3 history values:", history.slice(-3).map(h => h.value));

    // Calculate current handicap from all diffs
    const allDiffs = validScores.map((item) => item.score.handicapDifferential as number).reverse();
    const currentHandicap = calculateHandicapFromDiffs(allDiffs);

    console.log("[rebuildHistory] All diffs:", allDiffs.slice(0, 10), "...");
    console.log("[rebuildHistory] Current handicap:", currentHandicap);

    await ctx.db.patch(user._id, {
      handicapIndexHistory: history,
      handicap: currentHandicap ?? undefined,
      updatedAt: Date.now(),
    });

    return { success: true, entriesCreated: history.length };
  },
});

export const seedHandicap = mutation({
  args: { initialHandicap: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const clerkId = getClerkIdFromIdentity(identity);
    if (!clerkId) throw new Error("Missing Clerk ID");

    // Lookup by Clerk ID (required for all users)
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (!user) throw new Error("User not found");

    // Find or create the self player for this user
    let selfPlayer = await ctx.db
      .query("players")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .filter((q) => q.eq(q.field("isSelf"), true))
      .first();

    const now = Date.now();

    if (!selfPlayer) {
      const newSelfId = await ctx.db.insert("players", {
        ownerId: user._id,
        userId: user._id,
        name: user.name,
        handicap: undefined,
        gender: user.gender ?? undefined,
        isSelf: true,
        createdAt: now,
        updatedAt: now,
      });
      selfPlayer = (await ctx.db.get(newSelfId)) as any;
    }

    // Check for existing scores for this player.
    const existingScores = await ctx.db
      .query("scores")
      .withIndex("by_player", (q) => q.eq("playerId", selfPlayer!._id))
      .take(100);

    // FIRST: Clear any existing synthesized scores and rounds
    const existingSynthesizedScores = existingScores.filter((s) => s.isSynthesized);
    for (const score of existingSynthesizedScores) {
      await ctx.db.delete(score._id);
    }

    // Also delete synthesized rounds
    const synthesizedRounds = await ctx.db
      .query("rounds")
      .withIndex("by_host", (q) => q.eq("hostId", user._id))
      .filter((q) => q.eq(q.field("isSynthesized"), true))
      .collect();
    for (const round of synthesizedRounds) {
      await ctx.db.delete(round._id);
    }

    // Find the earliest ROUND date to place seeds before it (not createdAt).
    // If the user has no real rounds yet, place seeds well before account creation
    // so they don't appear to overlap with a user's first real round.
    const realScores = existingScores.filter((s) => !s.isSynthesized);
    const SEED_BUFFER_DAYS = 30;
    let baseDate = user.createdAt
      ? user.createdAt - SEED_BUFFER_DAYS * 24 * 60 * 60 * 1000
      : now;
    if (realScores.length > 0) {
      // Get the round dates for real scores
      const roundDates: number[] = [];
      for (const score of realScores) {
        const round = await ctx.db.get(score.roundId);
        if (round?.date) {
          roundDates.push(new Date(round.date).getTime());
        }
      }
      if (roundDates.length > 0) {
        const earliestRoundDate = Math.min(...roundDates);
        baseDate = earliestRoundDate - SEED_BUFFER_DAYS * 24 * 60 * 60 * 1000;
      }
    }

    // Ensure we have a course to attach ghost rounds to.
    let seedCourse = await ctx.db
      .query("courses")
      .withIndex("by_name", (q) => q)
      .first();

    if (!seedCourse) {
      const holes = Array.from({ length: 18 }, (_, i) => ({
        number: i + 1,
        par: 4,
        hcp: i + 1,
        yardage: 350,
      }));
      const courseId = await ctx.db.insert("courses", {
        externalId: `seed-course-${user._id}`,
        name: "Scandicap Seed Course",
        location: "Seed",
        holes,
        imageUrl: undefined,
        rating: 72,
        slope: 113,
        createdAt: now,
        updatedAt: now,
      });
      seedCourse = await ctx.db.get(courseId);
    }

    if (!seedCourse) throw new Error("Failed to prepare seed course");

    // Insert 20 synthesized rounds with a single synthesized score each, spaced weekly.
    // This matches the user's mental model of "seed rounds" and keeps history ordering clear.
    for (let i = 0; i < 20; i++) {
      const createdAt = baseDate - i * 7 * 24 * 60 * 60 * 1000; // spaced by a week going backward
      const roundId = await ctx.db.insert("rounds", {
        hostId: user._id,
        courseId: seedCourse!._id,
        date: new Date(createdAt).toISOString(),
        weather: "Seed",
        holeCount: 18,
        scanJobId: undefined,
        isSynthesized: true,
        createdAt,
        updatedAt: createdAt,
      });

      await ctx.db.insert("scores", {
        roundId,
        playerId: selfPlayer!._id,
        courseId: seedCourse!._id,
        grossScore: 0,
        netScore: undefined,
        handicapUsed: undefined,
        holeCount: 18,
        teeName: undefined,
        teeGender: undefined,
        courseRatingUsed: undefined,
        courseSlopeUsed: undefined,
        handicapDifferential: args.initialHandicap,
        isSynthesized: true,
        blowUpHoles: 0,
        par3Score: 0,
        par4Score: 0,
        par5Score: 0,
        holeData: [],
        createdAt,
        updatedAt: createdAt,
      });
    }

    // Rebuild the entire handicap history with the new seeded data.
    await ctx.runMutation("handicap:rebuildHistory" as any, {});

    return { success: true };
  },
});

// Clear all seeded/synthesized rounds and scores for testing
export const clearSeededRounds = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const clerkId = getClerkIdFromIdentity(identity);
    if (!clerkId) throw new Error("Missing Clerk ID");

    // Lookup by Clerk ID (required for all users)
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (!user) throw new Error("User not found");

    // Find self player
    const selfPlayer = await ctx.db
      .query("players")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .filter((q) => q.eq(q.field("isSelf"), true))
      .first();

    let deletedScores = 0;
    let deletedRounds = 0;

    // Delete ALL synthesized scores for this player directly
    if (selfPlayer) {
      const allScores = await ctx.db
        .query("scores")
        .withIndex("by_player", (q) => q.eq("playerId", selfPlayer._id))
        .collect();

      for (const score of allScores) {
        if (score.isSynthesized) {
          await ctx.db.delete(score._id);
          deletedScores++;
        }
      }
    }

    // Find and delete all synthesized rounds for this user
    const synthesizedRounds = await ctx.db
      .query("rounds")
      .withIndex("by_host", (q) => q.eq("hostId", user._id))
      .filter((q) => q.eq(q.field("isSynthesized"), true))
      .collect();

    for (const round of synthesizedRounds) {
      // Also delete any remaining scores for this round
      const scores = await ctx.db
        .query("scores")
        .withIndex("by_round", (q) => q.eq("roundId", round._id))
        .collect();
      for (const score of scores) {
        await ctx.db.delete(score._id);
        deletedScores++;
      }
      await ctx.db.delete(round._id);
      deletedRounds++;
    }

    // Rebuild history after clearing
    await ctx.runMutation("handicap:rebuildHistory" as any, {});

    return { success: true, deletedRounds, deletedScores };
  },
});
export const getDetails = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const selfPlayer = await ctx.db
      .query("players")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .filter((q) => q.eq(q.field("isSelf"), true))
      .first();

    const history = user.handicapIndexHistory ?? [];

    if (!selfPlayer) {
      return {
        currentHandicap: user.handicap ?? null,
        isProvisional: false,
        roundsCount: 0,
        history,
        calculationRounds: [] as any[],
      };
    }

    // Use by_player_createdAt index for deterministic newest-first ordering
    const scores = await ctx.db
      .query("scores")
      .withIndex("by_player_createdAt", (q) => q.eq("playerId", selfPlayer._id))
      .order("desc")
      .take(50);

    // Filter to scores with valid handicapDifferential (already ordered by createdAt desc)
    const scored = scores.filter((s) => typeof s.handicapDifferential === "number");

    if (!scored.length) {
      return {
        currentHandicap: user.handicap ?? null,
        isProvisional: false,
        roundsCount: 0,
        history,
        calculationRounds: [] as any[],
      };
    }

    const limited = scored.slice(0, 20);
    const diffs = limited.map((s) => s.handicapDifferential as number);
    const { handicap, usedIndices } = calculateHandicapWithSelection(diffs);
    const usedIdSet = new Set(
      usedIndices
        .map((idx) => limited[idx]?._id)
        .filter((id) => !!id)
    );

    const roundsCount = diffs.length;
    const isProvisional = roundsCount > 0 && roundsCount < 3;
    const currentHandicap = handicap ?? user.handicap ?? null;

    const roundCache = new Map<string, any>();
    const courseCache = new Map<string, any>();

    const loadRound = async (roundId: any) => {
      const key = String(roundId);
      let r = roundCache.get(key);
      if (!r) {
        r = await ctx.db.get(roundId);
        roundCache.set(key, r);
      }
      return r;
    };

    const loadCourse = async (courseId: any) => {
      const key = String(courseId);
      let c = courseCache.get(key);
      if (!c) {
        c = await ctx.db.get(courseId);
        courseCache.set(key, c);
      }
      return c;
    };

    const calculationRounds = await Promise.all(
      scored.map(async (score) => {
        const round = await loadRound(score.roundId);
        const course = await loadCourse(score.courseId);

        const isSynthesized = !!score.isSynthesized;
        const courseName = isSynthesized
          ? "Imported History"
          : course?.name ?? "Unknown Course";

        // For real rounds, use the round's date field
        // For synthesized rounds, use the score's createdAt (which was backdated)
        let date: string;
        if (round?.date) {
          date = round.date;
        } else if (score.createdAt) {
          date = new Date(score.createdAt).toISOString();
        } else {
          date = new Date().toISOString();
        }

        return {
          id: score._id,
          date,
          courseName,
          grossScore: score.grossScore,
          differential: score.handicapDifferential as number,
          usedInCalculation: usedIdSet.has(score._id),
          isSynthesized,
        };
      })
    );

    calculationRounds.sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0
    );

    return {
      currentHandicap,
      isProvisional,
      roundsCount,
      history,
      calculationRounds,
    };
  },
});
