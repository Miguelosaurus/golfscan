import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  buildHandicapDifferentialsForIndex,
  calculateHandicapFromDiffs,
  computeAdjustedGrossForHandicapRound,
  getRatingSlopeForScore,
  pickTeeMeta,
  roundToTenth,
} from "./lib/handicapUtils";
import { getClerkIdFromIdentity } from "./lib/authUtils";

const getRoundHoleCount = (holeData: any[], roundHoleCount?: number) => {
  if (roundHoleCount) return roundHoleCount;
  if (!holeData.length) return 18;
  const maxHole = Math.max(...holeData.map((h) => h.hole));
  return maxHole <= 9 ? 9 : 18;
};

const convertNineHoleToEighteenEquivalent = (
  nineHoleScore: number,
  playerHandicap?: number,
  coursePar9: number = 36
) => {
  if (playerHandicap !== undefined) {
    const nineHoleHandicap = playerHandicap / 2;
    const expectedNineHoleScore = coursePar9 + nineHoleHandicap;
    return nineHoleScore + expectedNineHoleScore;
  }
  return nineHoleScore + (coursePar9 + 4);
};

const computeFallbackDifferential = (
  score: any,
  course: any,
  holeCount: 9 | 18
): number | null => {
  const teeMeta = pickTeeMeta(course, (score as any).teeName, (score as any).teeGender);
  const holeData = Array.isArray(score.holeData) ? score.holeData.map((h: any) => ({ hole: h.hole })) : [];
  const { ratingUsed, slopeUsed } = getRatingSlopeForScore(course, teeMeta, holeCount, holeData);

  const courseHandicapUsed = (score as any).handicapUsed;
  const adjustedGross =
    typeof (score as any).adjustedGrossScore === "number" && Number.isFinite((score as any).adjustedGrossScore)
      ? (score as any).adjustedGrossScore
      : (typeof courseHandicapUsed === "number" && Number.isFinite(courseHandicapUsed)
        ? computeAdjustedGrossForHandicapRound({
          holeCount,
          holeData: Array.isArray(score.holeData)
            ? score.holeData.map((h: any) => ({ hole: h.hole, score: h.score, par: h.par }))
            : [],
          courseHoles: (course.holes as any[]) ?? [],
          courseHandicap: courseHandicapUsed,
        })
        : null);

  if (typeof adjustedGross !== "number") return null;
  return roundToTenth(((adjustedGross - ratingUsed) * 113) / slopeUsed);
};

export const getSelf = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const clerkId = getClerkIdFromIdentity(identity);
    if (!clerkId) return null;

    // Lookup by Clerk ID (required for all users)
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q: any) => q.eq("clerkId", clerkId))
      .unique();

    if (!user) return null;

    const ownerPlayers = await ctx.db
      .query("players")
      .withIndex("by_owner", (q: any) => q.eq("ownerId", user._id))
      .collect();

    const selfPlayer = ownerPlayers.find((p: any) => p.isSelf);
    return selfPlayer ?? null;
  },
});

/**
 * Get all players owned by the current user
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const clerkId = getClerkIdFromIdentity(identity);
    if (!clerkId) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q: any) => q.eq("clerkId", clerkId))
      .unique();

    if (!user) return [];

    return ctx.db
      .query("players")
      .withIndex("by_owner", (q: any) => q.eq("ownerId", user._id))
      .collect();
  },
});

/**
 * Get players who have actually played rounds (have scores)
 * This matches what the history players tab shows
 */
export const listWithRounds = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const clerkId = getClerkIdFromIdentity(identity);
    if (!clerkId) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q: any) => q.eq("clerkId", clerkId))
      .unique();

    if (!user) return [];

    // Get all owned players
    const allPlayers = await ctx.db
      .query("players")
      .withIndex("by_owner", (q: any) => q.eq("ownerId", user._id))
      .collect();

    // Filter to only players who have at least one score
    const playersWithRounds = [];
    for (const player of allPlayers) {
      const hasScore = await ctx.db
        .query("scores")
        .withIndex("by_player", (q: any) => q.eq("playerId", player._id))
        .first();
      if (hasScore) {
        playersWithRounds.push(player);
      }
    }

    return playersWithRounds;
  },
});

/**
 * Lightweight query to get just the calculated Scandicap for any player.
 * Uses the same WHS formula as getStats but returns only the handicap value.
 */
export const getHandicap = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) return null;

    const scores = await ctx.db
      .query("scores")
      .withIndex("by_player_createdAt", (q) => q.eq("playerId", args.playerId))
      .order("desc")
      .collect();

    // Ignore synthesized/ghost scores
    const realScores = scores.filter((s) => !s.isSynthesized);
    if (!realScores.length) {
      return { playerId: args.playerId, handicap: null, roundsPlayed: 0 };
    }

    const scoreLikes: Array<{
      _id: any;
      createdAt: number;
      holeCount?: number;
      handicapDifferential?: number;
    }> = [];

    for (const score of realScores) {
      const holeCount = (score.holeCount === 9 ? 9 : 18) as 9 | 18;

      if (typeof score.handicapDifferential === "number") {
        scoreLikes.push({
          _id: score._id,
          createdAt: score.createdAt,
          holeCount,
          handicapDifferential: roundToTenth(score.handicapDifferential),
        });
        continue;
      }

      const course = await ctx.db.get(score.courseId);
      if (!course) continue;

      const fallback = computeFallbackDifferential(score, course, holeCount);
      if (typeof fallback !== "number") continue;

      scoreLikes.push({
        _id: score._id,
        createdAt: score.createdAt,
        holeCount,
        handicapDifferential: fallback,
      });
    }

    const events = buildHandicapDifferentialsForIndex(scoreLikes);
    const handicapVal = calculateHandicapFromDiffs(events.slice(0, 20).map((e) => e.differential));

    return {
      playerId: args.playerId,
      handicap: handicapVal,
      roundsPlayed: realScores.length,
    };
  },
});

/**
 * Batch query to get calculated Scandicaps for multiple players at once.
 * Avoids N+1 query issues when displaying linkable players.
 */
export const getHandicapsBatch = query({
  args: { playerIds: v.array(v.id("players")) },
  handler: async (ctx, args) => {
    const results: Record<string, { handicap: number | null; roundsPlayed: number }> = {};

    for (const playerId of args.playerIds) {
      const player = await ctx.db.get(playerId);
      if (!player) {
        results[playerId] = { handicap: null, roundsPlayed: 0 };
        continue;
      }

      const scores = await ctx.db
        .query("scores")
        .withIndex("by_player_createdAt", (q) => q.eq("playerId", playerId))
        .order("desc")
        .collect();

      const realScores = scores.filter((s) => !s.isSynthesized);
      if (!realScores.length) {
        results[playerId] = { handicap: null, roundsPlayed: 0 };
        continue;
      }

      const scoreLikes: Array<{
        _id: any;
        createdAt: number;
        holeCount?: number;
        handicapDifferential?: number;
      }> = [];

      for (const score of realScores) {
        const holeCount = (score.holeCount === 9 ? 9 : 18) as 9 | 18;

        if (typeof score.handicapDifferential === "number") {
          scoreLikes.push({
            _id: score._id,
            createdAt: score.createdAt,
            holeCount,
            handicapDifferential: roundToTenth(score.handicapDifferential),
          });
          continue;
        }

        const course = await ctx.db.get(score.courseId);
        if (!course) continue;

        const fallback = computeFallbackDifferential(score, course, holeCount);
        if (typeof fallback !== "number") continue;

        scoreLikes.push({
          _id: score._id,
          createdAt: score.createdAt,
          holeCount,
          handicapDifferential: fallback,
        });
      }

      const events = buildHandicapDifferentialsForIndex(scoreLikes);
      const handicapVal = calculateHandicapFromDiffs(events.slice(0, 20).map((e) => e.differential));
      results[playerId] = {
        handicap: handicapVal,
        roundsPlayed: realScores.length,
      };
    }

    return results;
  },
});

export const getStats = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) return null;

    const scores = await ctx.db
      .query("scores")
      .withIndex("by_player_createdAt", (q) => q.eq("playerId", args.playerId))
      .order("desc")
      .collect();

    // Ignore synthesized/ghost scores when computing performance stats.
    const realScores = scores.filter((s) => !s.isSynthesized);

    if (!realScores.length) {
      return {
        playerId: args.playerId,
        playerName: player.name,
        isSelf: !!player.isSelf,
        roundsPlayed: 0,
        averageScore: "0",
        averageVsPar: "0",
        handicap: "N/A",
        birdies: 0,
        eagles: 0,
        pars: 0,
        bogeys: 0,
        doubleBogeys: 0,
        worseThanDouble: 0,
        blowUp: { averagePerRound: 0, totalBlowUps: 0, roundsConsidered: 0 },
        performanceByPar: { par3: null, par4: null, par5: null },
        performanceByDifficulty: { hard: null, medium: null, easy: null },
      };
    }

    const coursesCache = new Map<string, any>();
    const roundsCache = new Map<string, any>();

    const loadCourse = async (courseId: string) => {
      let c = coursesCache.get(courseId);
      if (!c) {
        c = await ctx.db.get(courseId as any);
        coursesCache.set(courseId, c);
      }
      return c;
    };
    const loadRound = async (roundId: string) => {
      let r = roundsCache.get(roundId);
      if (!r) {
        r = await ctx.db.get(roundId as any);
        roundsCache.set(roundId, r);
      }
      return r;
    };

    let totalEighteenScore = 0;
    let totalEighteenPar = 0;
    let roundsPlayed = 0;
    let birdies = 0;
    let eagles = 0;
    let pars = 0;
    let bogeys = 0;
    let doubleBogeys = 0;
    let worseThanDouble = 0;

    let blowUpCount = 0;
    let blowUpRounds = 0;

    const scoreLikes: Array<{
      _id: any;
      createdAt: number;
      holeCount?: number;
      handicapDifferential?: number;
    }> = [];

    // Aggregates for performance by par/difficulty
    const parTotals: Record<number, { rel: number; count: number }> = {
      3: { rel: 0, count: 0 },
      4: { rel: 0, count: 0 },
      5: { rel: 0, count: 0 },
    };
    const diffBuckets: Record<"hard" | "medium" | "easy", { rel: number; count: number }> = {
      hard: { rel: 0, count: 0 },
      medium: { rel: 0, count: 0 },
      easy: { rel: 0, count: 0 },
    };

    for (const score of realScores) {
      const round = await loadRound(score.roundId);
      if (!round) continue;
      const course = await loadCourse(score.courseId);
      if (!course) continue;

      const holeCount = getRoundHoleCount(score.holeData, round.holeCount);
      const coursePar = course.holes.reduce((sum: number, h: any) => sum + (h.par ?? 4), 0);
      const coursePar9 = course.holes.slice(0, 9).reduce((sum: number, h: any) => sum + (h.par ?? 4), 0);

      const totalScore = score.grossScore;
      const eighteenEquivalent =
        holeCount === 18
          ? totalScore
          : convertNineHoleToEighteenEquivalent(totalScore, score.handicapUsed ?? undefined, coursePar9);

      totalEighteenScore += eighteenEquivalent;
      totalEighteenPar += holeCount === 18 ? coursePar : coursePar9 + 36;
      roundsPlayed += 1;

      const holeCountTyped = (holeCount === 9 ? 9 : 18) as 9 | 18;
      const differential =
        typeof score.handicapDifferential === "number"
          ? roundToTenth(score.handicapDifferential)
          : computeFallbackDifferential(score, course, holeCountTyped);

      if (typeof differential === "number") {
        scoreLikes.push({
          _id: score._id,
          createdAt: score.createdAt,
          holeCount: holeCountTyped,
          handicapDifferential: differential,
        });
      }

      let countedRound = false;
      for (const h of score.holeData) {
        const courseHole = course.holes.find((ch: any) => ch.number === h.hole);
        const par = courseHole?.par ?? h.par ?? 4;
        const rel = h.score - par;
        if (courseHole) {
          const handicap = (courseHole as any).hcp ?? (courseHole as any).handicap;
          if (handicap !== undefined) {
            if (handicap >= 1 && handicap <= 6) {
              diffBuckets.hard.rel += rel;
              diffBuckets.hard.count++;
            } else if (handicap >= 7 && handicap <= 12) {
              diffBuckets.medium.rel += rel;
              diffBuckets.medium.count++;
            } else if (handicap >= 13 && handicap <= 18) {
              diffBuckets.easy.rel += rel;
              diffBuckets.easy.count++;
            }
          }
          if (courseHole.par === 3 || courseHole.par === 4 || courseHole.par === 5) {
            parTotals[courseHole.par].rel += rel;
            parTotals[courseHole.par].count += 1;
          }
        }

        if (rel <= -2) eagles++;
        else if (rel === -1) birdies++;
        else if (rel === 0) pars++;
        else if (rel === 1) bogeys++;
        else if (rel === 2) doubleBogeys++;
        else if (rel > 2) worseThanDouble++;

        if (h.score >= par + 3) {
          blowUpCount += 1;
          countedRound = true;
        }
      }
      if (countedRound) blowUpRounds += 1;
    }

    const events = buildHandicapDifferentialsForIndex(scoreLikes);
    const handicapVal = calculateHandicapFromDiffs(events.slice(0, 20).map((e) => e.differential));

    const performanceByPar = {
      par3: parTotals[3].count ? parTotals[3].rel / parTotals[3].count : null,
      par4: parTotals[4].count ? parTotals[4].rel / parTotals[4].count : null,
      par5: parTotals[5].count ? parTotals[5].rel / parTotals[5].count : null,
    };
    const performanceByDifficulty = {
      hard: diffBuckets.hard.count ? diffBuckets.hard.rel / diffBuckets.hard.count : null,
      medium: diffBuckets.medium.count ? diffBuckets.medium.rel / diffBuckets.medium.count : null,
      easy: diffBuckets.easy.count ? diffBuckets.easy.rel / diffBuckets.easy.count : null,
    };

    return {
      playerId: args.playerId,
      playerName: player.name,
      isSelf: !!player.isSelf,
      roundsPlayed,
      averageScore: roundsPlayed > 0 ? (totalEighteenScore / roundsPlayed).toFixed(1) : "0",
      averageVsPar:
        roundsPlayed > 0 && totalEighteenPar > 0
          ? ((totalEighteenScore - totalEighteenPar) / roundsPlayed).toFixed(1)
          : "0",
      handicap: handicapVal !== null ? handicapVal.toFixed(1) : "N/A",
      birdies,
      eagles,
      pars,
      bogeys,
      doubleBogeys,
      worseThanDouble,
      blowUp: {
        averagePerRound: blowUpRounds ? blowUpCount / blowUpRounds : 0,
        totalBlowUps: blowUpCount,
        roundsConsidered: blowUpRounds,
      },
      performanceByPar,
      performanceByDifficulty,
    };
  },
});

export const getHeadToHead = query({
  args: {
    myPlayerId: v.id("players"),
    theirPlayerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    // Get all scores for both players
    const myScores = await ctx.db
      .query("scores")
      .withIndex("by_player", (q) => q.eq("playerId", args.myPlayerId))
      .filter((q) =>
        q.or(
          q.eq(q.field("isSynthesized"), undefined),
          q.eq(q.field("isSynthesized"), false)
        )
      )
      .collect();

    const theirScores = await ctx.db
      .query("scores")
      .withIndex("by_player", (q) => q.eq("playerId", args.theirPlayerId))
      .filter((q) =>
        q.or(
          q.eq(q.field("isSynthesized"), undefined),
          q.eq(q.field("isSynthesized"), false)
        )
      )
      .collect();

    // Find shared rounds (rounds where both players participated)
    const myRoundIds = new Set(myScores.map((s) => s.roundId));
    const theirRoundIds = new Set(theirScores.map((s) => s.roundId));
    const sharedRoundIds = Array.from(myRoundIds).filter((id) => theirRoundIds.has(id));

    if (sharedRoundIds.length === 0) {
      return {
        sharedRoundsCount: 0,
        myWins: 0,
        theirWins: 0,
        ties: 0,
        myAvgScore: null,
        theirAvgScore: null,
        avgMargin: null,
        recentRounds: [],
      };
    }

    // Get player names
    const myPlayer = await ctx.db.get(args.myPlayerId);
    const theirPlayer = await ctx.db.get(args.theirPlayerId);

    // Analyze each shared round
    let myWins = 0;
    let theirWins = 0;
    let ties = 0;
    let myTotalScore = 0;
    let theirTotalScore = 0;
    let roundsWithBothScores = 0;

    const recentRounds: Array<{
      roundId: string;
      date: string;
      courseName: string;
      myScore: number;
      theirScore: number;
      winner: "me" | "them" | "tie";
    }> = [];

    // Sort shared rounds by date (most recent first) for display
    const roundsInfo = await Promise.all(
      sharedRoundIds.map(async (roundId) => {
        const round = await ctx.db.get(roundId);
        return { roundId, round };
      })
    );
    const sortedRounds = roundsInfo
      .filter((r) => r.round)
      .sort((a, b) => {
        const dateA = new Date((a.round as any).date).getTime();
        const dateB = new Date((b.round as any).date).getTime();
        return dateB - dateA;
      });

    for (const { roundId, round } of sortedRounds) {
      if (!round) continue;

      const myScore = myScores.find((s) => s.roundId === roundId);
      const theirScore = theirScores.find((s) => s.roundId === roundId);

      if (!myScore || !theirScore) continue;

      const myGross = myScore.grossScore;
      const theirGross = theirScore.grossScore;

      // Compare using net scores if available, otherwise gross
      const myNet = myScore.netScore ?? myGross;
      const theirNet = theirScore.netScore ?? theirGross;

      let winner: "me" | "them" | "tie";
      if (myNet < theirNet) {
        myWins++;
        winner = "me";
      } else if (theirNet < myNet) {
        theirWins++;
        winner = "them";
      } else {
        ties++;
        winner = "tie";
      }

      myTotalScore += myGross;
      theirTotalScore += theirGross;
      roundsWithBothScores++;

      // Add to recent rounds (limit to 5)
      if (recentRounds.length < 5) {
        const course = await ctx.db.get((round as any).courseId);
        recentRounds.push({
          roundId: roundId as string,
          date: (round as any).date,
          courseName: (course as any)?.name ?? "Unknown Course",
          myScore: myGross,
          theirScore: theirGross,
          winner,
        });
      }
    }

    const myAvgScore =
      roundsWithBothScores > 0 ? myTotalScore / roundsWithBothScores : null;
    const theirAvgScore =
      roundsWithBothScores > 0 ? theirTotalScore / roundsWithBothScores : null;
    const avgMargin =
      myAvgScore !== null && theirAvgScore !== null
        ? theirAvgScore - myAvgScore
        : null;

    return {
      sharedRoundsCount: sharedRoundIds.length,
      myWins,
      theirWins,
      ties,
      myAvgScore: myAvgScore !== null ? Number(myAvgScore.toFixed(1)) : null,
      theirAvgScore: theirAvgScore !== null ? Number(theirAvgScore.toFixed(1)) : null,
      avgMargin: avgMargin !== null ? Number(avgMargin.toFixed(1)) : null,
      myPlayerName: myPlayer?.name ?? "You",
      theirPlayerName: theirPlayer?.name ?? "Player",
      recentRounds,
    };
  },
});

/**
 * Add an alias to a player's profile (for scorecard name matching)
 */
export const addAlias = mutation({
  args: {
    playerId: v.id("players"),
    alias: v.string(),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    // Get existing aliases or empty array
    const existingAliases = player.aliases ?? [];

    // Normalize alias for comparison
    const normalizedAlias = args.alias.toLowerCase().trim();

    // Don't add if it's the same as the player name
    if (player.name.toLowerCase().trim() === normalizedAlias) {
      return { success: true, message: "Alias matches player name" };
    }

    // Don't add if already exists
    if (existingAliases.some(a => a.toLowerCase().trim() === normalizedAlias)) {
      return { success: true, message: "Alias already exists" };
    }

    // Add the new alias
    await ctx.db.patch(args.playerId, {
      aliases: [...existingAliases, args.alias.trim()],
      updatedAt: Date.now(),
    });

    return { success: true, message: "Alias added" };
  },
});

/**
 * Create a new player owned by the current user
 */
export const create = mutation({
  args: {
    name: v.string(),
    handicap: v.optional(v.number()),
    gender: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const clerkId = getClerkIdFromIdentity(identity);
    if (!clerkId) {
      throw new Error("Missing Clerk ID");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q: any) => q.eq("clerkId", clerkId))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const now = Date.now();
    const playerId = await ctx.db.insert("players", {
      ownerId: user._id,
      name: args.name.trim(),
      handicap: args.handicap,
      isSelf: false,
      gender: args.gender,
      createdAt: now,
      updatedAt: now,
    });

    return playerId;
  },
});

/**
 * Delete a player (only if they are not the "self" player)
 * This will also delete all associated scores to maintain data integrity.
 */
export const deletePlayer = mutation({
  args: {
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    // Prevent deleting self player
    if (player.isSelf) {
      throw new Error("Cannot delete your own player profile");
    }

    // Get all scores for this player
    const scores = await ctx.db
      .query("scores")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();

    // Delete all scores for this player
    for (const score of scores) {
      await ctx.db.delete(score._id);
    }

    // Delete the player
    await ctx.db.delete(args.playerId);

    return { success: true, deletedScoresCount: scores.length };
  },
});

/**
 * Merge two players into one.
 * All scores from the source player are reassigned to the target player.
 * The source player is deleted after merging.
 */
export const mergePlayers = mutation({
  args: {
    targetPlayerId: v.id("players"),
    sourcePlayerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    if (args.targetPlayerId === args.sourcePlayerId) {
      throw new Error("Cannot merge a player with themselves");
    }

    const targetPlayer = await ctx.db.get(args.targetPlayerId);
    const sourcePlayer = await ctx.db.get(args.sourcePlayerId);

    if (!targetPlayer || !sourcePlayer) {
      throw new Error("One or both players not found");
    }

    // Prevent merging into a player if both are "self" (shouldn't happen but safeguard)
    if (sourcePlayer.isSelf && targetPlayer.isSelf) {
      throw new Error("Cannot merge two self players");
    }

    // Get all scores for the source player
    const sourceScores = await ctx.db
      .query("scores")
      .withIndex("by_player", (q) => q.eq("playerId", args.sourcePlayerId))
      .collect();

    // Reassign all source player's scores to the target player
    for (const score of sourceScores) {
      await ctx.db.patch(score._id, {
        playerId: args.targetPlayerId,
        updatedAt: Date.now(),
      });
    }

    // Merge aliases: add source player's name and aliases to target
    const targetAliases = targetPlayer.aliases || [];
    const sourceAliases = sourcePlayer.aliases || [];
    const allAliases = Array.from(new Set([
      ...targetAliases,
      ...sourceAliases,
      sourcePlayer.name, // Add source player's main name as an alias
    ])).filter(alias =>
      alias.toLowerCase().trim() !== targetPlayer.name.toLowerCase().trim()
    );

    await ctx.db.patch(args.targetPlayerId, {
      aliases: allAliases,
      updatedAt: Date.now(),
    });

    // Delete the source player
    await ctx.db.delete(args.sourcePlayerId);

    return {
      success: true,
      mergedScoresCount: sourceScores.length,
      targetPlayerId: args.targetPlayerId,
    };
  },
});
