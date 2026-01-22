import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  calculateHandicapFromDiffs,
  validateDifferential,
  computeAdjustedGross,
  applyNetDoubleBogey,
  pickTeeMeta,
  getRatingSlopeForScore,
} from "./lib/handicapUtils";
import { getClerkIdFromIdentity } from "./lib/authUtils";
const holeInput = v.object({
  hole: v.number(),
  score: v.number(),
  par: v.number(),
  putts: v.optional(v.number()),
  fairwayHit: v.optional(v.boolean()),
  gir: v.optional(v.boolean()),
});

const playerInput = v.object({
  name: v.string(),
  playerId: v.optional(v.id("players")),
  teeName: v.optional(v.string()),
  teeGender: v.optional(v.string()),
  handicap: v.optional(v.number()),
  holeData: v.array(holeInput),
  // When true, this row should be tied to the owner's "self" player
  isSelf: v.optional(v.boolean()),
});

const computeStats = (
  holeData: Array<{ hole: number; score: number; par: number }>
) => {
  let grossScore = 0;
  let blowUpHoles = 0;
  let par3Score = 0;
  let par4Score = 0;
  let par5Score = 0;

  for (const hole of holeData) {
    grossScore += hole.score;
    if (hole.score - hole.par >= 3) blowUpHoles += 1; // triple or worse, matches stats.ts blow-up rate
    if (hole.par === 3) par3Score += hole.score;
    if (hole.par === 4) par4Score += hole.score;
    if (hole.par === 5) par5Score += hole.score;
  }

  return { grossScore, blowUpHoles, par3Score, par4Score, par5Score };
};

// For Scandicap: Apply Net Double Bogey and return both adjusted gross and per-hole adjusted data.
const computeNetDoubleBogeyAdjustment = (
  holeData: Array<{ hole: number; score: number; par: number; hcp?: number }>,
  courseHoles: Array<{ number: number; par: number; hcp: number }>,
  courseHandicap: number
): { adjustedGross: number; adjustedHoleData: Array<{ hole: number; score: number; par: number; adjustedScore?: number; hcp?: number }> } => {
  // Merge course hole stroke indexes into holeData
  const holeDataWithHcp = holeData.map(h => {
    const courseHole = courseHoles.find(ch => ch.number === h.hole);
    return {
      ...h,
      hcp: h.hcp ?? courseHole?.hcp ?? 18 // fallback to stroke index 18 if not found
    };
  });

  // Apply Net Double Bogey adjustment
  const adjusted = applyNetDoubleBogey(holeDataWithHcp, courseHandicap);
  const adjustedGross = adjusted.reduce((sum, h) => sum + h.adjustedScore, 0);
  const adjustedHoleData = adjusted.map(h => ({
    hole: h.hole,
    score: h.score,
    par: h.par,
    adjustedScore: h.adjustedScore,
    hcp: h.hcp
  }));

  return { adjustedGross, adjustedHoleData };
};

// Fallback for when we don't have course handicap - uses Par+3 cap
const computeAdjustedGrossFallback = (
  holeData: Array<{ hole: number; score: number; par: number }>
) => {
  let adjusted = 0;
  for (const hole of holeData) {
    const par = hole.par ?? 4;
    const cap = par + 3;
    adjusted += hole.score > cap ? cap : hole.score;
  }
  return adjusted;
};

const normalizeHoles = (
  holes: Array<{
    hole: number;
    score: number;
    par: number;
    putts?: number;
    fairwayHit?: boolean;
    gir?: boolean;
  }>,
  holeCount: 9 | 18
) => {
  const maxHole = holeCount === 9 ? 9 : 18;
  return holes
    .filter((h) => h.hole >= 1 && h.hole <= maxHole)
    .map((h) => ({
      hole: h.hole,
      score: h.score,
      par: h.par,
      putts: h.putts,
      fairwayHit: h.fairwayHit,
      gir: h.gir,
    }));
};



const computePlayerHandicap = async (
  ctx: any,
  playerId: string,
  coursesCache: Map<string, any>
) => {
  // Use by_player_createdAt index for deterministic newest-first ordering
  const scores = await ctx.db
    .query("scores")
    .withIndex("by_player_createdAt", (q: any) => q.eq("playerId", playerId))
    .order("desc")
    .take(50);

  const differentials: number[] = [];

  for (const score of scores) {
    const courseId = score.courseId;
    let course = coursesCache.get(courseId);
    if (!course) {
      course = await ctx.db.get(courseId);
      if (!course) continue;
      coursesCache.set(courseId, course);
    }

    // Prefer pre-computed differential when available (Scandicap path).
    if (typeof score.handicapDifferential === "number") {
      differentials.push(score.handicapDifferential);
      continue;
    }

    const coursePar = course.holes.reduce((sum: number, h: any) => sum + (h.par ?? 4), 0);
    const courseRating = course.rating ?? coursePar;
    const courseSlope = course.slope ?? 113;
    const differential = ((score.grossScore - courseRating) * 113) / courseSlope;
    differentials.push(differential);
  }

  const limited = differentials.slice(0, 20);
  return calculateHandicapFromDiffs(limited);
};

export const saveRound = mutation({
  args: {
    courseId: v.id("courses"),
    date: v.string(),
    holeCount: v.union(v.literal(9), v.literal(18)),
    weather: v.optional(v.string()),
    scanJobId: v.optional(v.id("scanJobs")),
    players: v.array(playerInput),
  },
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

    if (!user) throw new Error("User not found; call syncUser first");

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");

    const now = Date.now();
    const canonicalDate = (() => {
      const match = /(\d{4}-\d{2}-\d{2})/.exec(args.date);
      return match ? match[1] : args.date;
    })();
    const roundId = await ctx.db.insert("rounds", {
      hostId: user._id,
      courseId: args.courseId,
      date: canonicalDate,
      weather: args.weather,
      holeCount: args.holeCount,
      scanJobId: args.scanJobId ?? undefined,
      createdAt: now,
      updatedAt: now,
    });

    const holeCount = args.holeCount;

    const pickTeeMeta = (teeName?: string | null, teeGender?: string | null) => {
      const teeSets = (course as any).teeSets as any[] | undefined;
      if (!Array.isArray(teeSets) || !teeName) return null;
      const lowerName = teeName.toString().toLowerCase();
      const candidates = teeSets.filter(
        (t) => t?.name && t.name.toString().toLowerCase() === lowerName
      );
      if (!candidates.length) return null;
      if (teeGender) {
        const genderMatch = candidates.find((t) => t.gender === teeGender);
        if (genderMatch) return genderMatch;
      }
      return candidates[0];
    };

    const getRatingSlopeForScore = (
      teeMeta: any | null,
      holeData: Array<{ hole: number; score: number; par: number }>
    ) => {
      const coursePar = course.holes.reduce((sum: number, h: any) => sum + (h.par ?? 4), 0);
      const baseRating = (teeMeta && teeMeta.rating) ?? course.rating ?? coursePar;
      const baseSlope = (teeMeta && teeMeta.slope) ?? course.slope ?? 113;

      if (holeCount === 18) {
        return { ratingUsed: baseRating, slopeUsed: baseSlope, scaleTo18: 1 };
      }

      const allHoles = holeData.map((h) => h.hole);
      const isFront = allHoles.length > 0 && allHoles.every((h) => h <= 9);
      const isBack = allHoles.length > 0 && allHoles.every((h) => h >= 10);

      const frontRating = teeMeta?.frontRating as number | undefined;
      const frontSlope = teeMeta?.frontSlope as number | undefined;
      const backRating = teeMeta?.backRating as number | undefined;
      const backSlope = teeMeta?.backSlope as number | undefined;

      if (isFront && typeof frontRating === "number" && typeof frontSlope === "number") {
        return { ratingUsed: frontRating, slopeUsed: frontSlope, scaleTo18: 2 };
      }
      if (isBack && typeof backRating === "number" && typeof backSlope === "number") {
        return { ratingUsed: backRating, slopeUsed: backSlope, scaleTo18: 2 };
      }

      const rating9 = baseRating / 2;
      const slope9 = baseSlope / 2;
      return { ratingUsed: rating9, slopeUsed: slope9, scaleTo18: 2 };
    };

    let ownerPlayers = await ctx.db
      .query("players")
      .withIndex("by_owner", (q: any) => q.eq("ownerId", user._id))
      .collect();
    let selfPlayer = ownerPlayers.find((p: any) => p.isSelf);
    // Insert scores and create players as needed
    for (const player of args.players) {
      let playerId = player.playerId;

      if (player.isSelf) {
        // Force this row to use (or create) the canonical self player
        if (!selfPlayer) {
          const newSelfId = await ctx.db.insert("players", {
            ownerId: user._id,
            userId: user._id,
            name: player.name,
            handicap: player.handicap ?? undefined,
            gender: user.gender ?? undefined,
            isSelf: true,
            createdAt: now,
            updatedAt: now,
          });
          selfPlayer = (await ctx.db.get(newSelfId)) as any;
          ownerPlayers = [...ownerPlayers, selfPlayer!];
        }
        playerId = selfPlayer!._id;
      } else {
        if (!playerId) {
          const match = ownerPlayers.find(
            (p: any) => p.name.trim().toLowerCase() === player.name.trim().toLowerCase()
          );
          playerId = match?._id;
        }

        if (!playerId) {
          playerId = await ctx.db.insert("players", {
            ownerId: user._id,
            userId: undefined,
            name: player.name,
            handicap: player.handicap ?? undefined,
            gender: player.teeGender ?? undefined,
            isSelf: false,
            createdAt: now,
            updatedAt: now,
          });
          const created = await ctx.db.get(playerId);
          if (created) ownerPlayers = [...ownerPlayers, created as any];
        }
      }

      const holeData = normalizeHoles(player.holeData, holeCount);
      const stats = computeStats(holeData);

      const teeMeta = pickTeeMeta(player.teeName, player.teeGender);

      // Warn if tee not found but was specified
      if (player.teeName && !teeMeta) {
        console.warn(`[Handicap] Tee "${player.teeName}" not found for course "${course.name}". Using fallback rating/slope.`);
      }

      const { ratingUsed, slopeUsed, scaleTo18 } = getRatingSlopeForScore(teeMeta, holeData);

      // Calculate course handicap first - needed for Net Double Bogey
      // Course Handicap = Handicap Index × (Slope / 113)
      const courseHandicap = player.handicap !== undefined && slopeUsed
        ? Math.round(player.handicap * (slopeUsed / 113))
        : player.handicap;

      // Apply Net Double Bogey adjustment using course handicap and hole stroke indexes
      const hasValidCourseHandicap = typeof courseHandicap === 'number' && courseHandicap >= 0;
      const courseHoles = (course.holes as Array<{ number: number; par: number; hcp: number }>) || [];

      let adjustedGross: number;
      let adjustedHoleData: Array<{ hole: number; score: number; par: number; adjustedScore?: number; hcp?: number }>;

      if (hasValidCourseHandicap && courseHoles.length > 0) {
        const adjustment = computeNetDoubleBogeyAdjustment(holeData, courseHoles, courseHandicap);
        adjustedGross = adjustment.adjustedGross;
        adjustedHoleData = adjustment.adjustedHoleData;
      } else {
        // Fallback to Par+3 cap if missing required data
        adjustedGross = computeAdjustedGrossFallback(holeData);
        adjustedHoleData = holeData.map(h => ({ ...h })); // No adjustment
      }

      let handicapDifferential: number | undefined = undefined;
      if (ratingUsed && slopeUsed) {
        const rawDiff = ((adjustedGross - ratingUsed) * 113) / slopeUsed;
        const scaled = rawDiff * (scaleTo18 || 1);

        // Validate differential range
        validateDifferential(scaled, { courseName: course.name, grossScore: stats.grossScore });

        handicapDifferential = scaled;
      }

      await ctx.db.insert("scores", {
        roundId,
        playerId,
        courseId: args.courseId,
        grossScore: stats.grossScore,
        netScore: courseHandicap !== undefined ? stats.grossScore - courseHandicap : undefined,
        handicapUsed: courseHandicap ?? undefined,
        holeCount,
        teeName: player.teeName ?? undefined,
        // Track gender alongside tee when provided (helps downstream tee selection)
        teeGender: player.teeGender ?? undefined,
        courseRatingUsed: ratingUsed,
        courseSlopeUsed: slopeUsed,
        handicapDifferential,
        adjustedGrossScore: adjustedGross,
        blowUpHoles: stats.blowUpHoles,
        par3Score: stats.par3Score,
        par4Score: stats.par4Score,
        par5Score: stats.par5Score,
        holeData: adjustedHoleData,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Update handicaps for all players in this round (mirrors addRound -> calculatePlayerHandicap)
    const coursesCache = new Map<string, any>();
    for (const player of args.players) {
      const playerId =
        player.playerId ??
        ownerPlayers.find(
          (p: any) => p.name.trim().toLowerCase() === player.name.trim().toLowerCase()
        )?._id;
      if (!playerId) continue;
      const handicap = await computePlayerHandicap(ctx, playerId, coursesCache);
      if (handicap !== null) {
        await ctx.db.patch(playerId, { handicap, updatedAt: Date.now() });
      }
    }

    // Trigger handicap recalculation and history rebuild for the host user (Scandicap)
    // This updates both the current handicap AND the chart history
    await ctx.runMutation("handicap:rebuildHistory" as any, {});

    // Keep user's cached stats (roundsPlayed) loosely in sync for the UI.
    const existingStats = user.stats ?? {
      roundsPlayed: 0,
      avgScore: 0,
      blowUpHolesPerRound: 0,
    };

    await ctx.db.patch(user._id, {
      stats: {
        roundsPlayed: existingStats.roundsPlayed + 1,
        avgScore: existingStats.avgScore,
        blowUpHolesPerRound: existingStats.blowUpHolesPerRound,
      },
      updatedAt: Date.now(),
    });

    return { roundId };
  },
});

export const updateRound = mutation({
  args: {
    roundId: v.id("rounds"),
    courseId: v.id("courses"),
    date: v.string(),
    holeCount: v.union(v.literal(9), v.literal(18)),
    weather: v.optional(v.string()),
    players: v.array(playerInput),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const round = await ctx.db.get(args.roundId);
    if (!round) throw new Error("Round not found");

    const clerkId = getClerkIdFromIdentity(identity);
    if (!clerkId) throw new Error("Missing Clerk ID");

    // Lookup by Clerk ID (required for all users)
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (!user || round.hostId !== user._id) throw new Error("Not authorized");

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new Error("Course not found");

    // Helper functions for handicap calculation (same as saveRound)
    const pickTeeMeta = (teeName?: string | null, teeGender?: string | null) => {
      const teeSets = (course as any).teeSets as any[] | undefined;
      if (!Array.isArray(teeSets) || !teeName) return null;
      const lowerName = teeName.toString().toLowerCase();
      const candidates = teeSets.filter(
        (t) => t?.name && t.name.toString().toLowerCase() === lowerName
      );
      if (!candidates.length) return null;
      if (teeGender) {
        const genderMatch = candidates.find((t) => t.gender === teeGender);
        if (genderMatch) return genderMatch;
      }
      return candidates[0];
    };

    const getRatingSlopeForScore = (
      teeMeta: any | null,
      holeData: Array<{ hole: number; score: number; par: number }>
    ) => {
      const coursePar = course.holes.reduce((sum: number, h: any) => sum + (h.par ?? 4), 0);
      const baseRating = (teeMeta && teeMeta.rating) ?? course.rating ?? coursePar;
      const baseSlope = (teeMeta && teeMeta.slope) ?? course.slope ?? 113;

      if (args.holeCount === 18) {
        return { ratingUsed: baseRating, slopeUsed: baseSlope, scaleTo18: 1 };
      }

      const allHoles = holeData.map((h) => h.hole);
      const isFront = allHoles.length > 0 && allHoles.every((h) => h <= 9);
      const isBack = allHoles.length > 0 && allHoles.every((h) => h >= 10);

      const frontRating = teeMeta?.frontRating as number | undefined;
      const frontSlope = teeMeta?.frontSlope as number | undefined;
      const backRating = teeMeta?.backRating as number | undefined;
      const backSlope = teeMeta?.backSlope as number | undefined;

      if (isFront && typeof frontRating === "number" && typeof frontSlope === "number") {
        return { ratingUsed: frontRating, slopeUsed: frontSlope, scaleTo18: 2 };
      }
      if (isBack && typeof backRating === "number" && typeof backSlope === "number") {
        return { ratingUsed: backRating, slopeUsed: backSlope, scaleTo18: 2 };
      }

      const rating9 = baseRating / 2;
      const slope9 = baseSlope;
      return { ratingUsed: rating9, slopeUsed: slope9, scaleTo18: 2 };
    };

    const now = Date.now();
    const canonicalDate = (() => {
      const match = /(\d{4}-\d{2}-\d{2})/.exec(args.date);
      return match ? match[1] : args.date;
    })();
    await ctx.db.patch(args.roundId, {
      courseId: args.courseId,
      date: canonicalDate,
      weather: args.weather,
      holeCount: args.holeCount,
      updatedAt: now,
    });

    // Delete existing scores for this round
    const existingScores = await ctx.db
      .query("scores")
      .withIndex("by_round", (q) => q.eq("roundId", args.roundId))
      .collect();
    for (const s of existingScores) {
      await ctx.db.delete(s._id);
    }

    let ownerPlayers = await ctx.db
      .query("players")
      .withIndex("by_owner", (q: any) => q.eq("ownerId", user._id))
      .collect();
    let selfPlayer = ownerPlayers.find((p: any) => p.isSelf);

    // Recreate scores
    for (const player of args.players) {
      let playerId = player.playerId;
      if (player.isSelf) {
        if (!selfPlayer) {
          const newSelfId = await ctx.db.insert("players", {
            ownerId: user._id,
            userId: user._id,
            name: player.name,
            handicap: player.handicap ?? undefined,
            gender: user.gender ?? undefined,
            isSelf: true,
            createdAt: now,
            updatedAt: now,
          });
          selfPlayer = (await ctx.db.get(newSelfId)) as any;
          ownerPlayers = [...ownerPlayers, selfPlayer!];
        }
        playerId = selfPlayer!._id;
      } else {
        if (!playerId) {
          const match = ownerPlayers.find(
            (p: any) => p.name.trim().toLowerCase() === player.name.trim().toLowerCase()
          );
          playerId = match?._id;
        }

        if (!playerId) {
          playerId = await ctx.db.insert("players", {
            ownerId: user._id,
            userId: undefined,
            name: player.name,
            handicap: player.handicap ?? undefined,
            gender: player.teeGender ?? undefined,
            isSelf: false,
            createdAt: now,
            updatedAt: now,
          });
          const created = await ctx.db.get(playerId);
          if (created) ownerPlayers = [...ownerPlayers, created as any];
        } else {
          // Update gender on existing player if provided
          const existingPlayer = await ctx.db.get(playerId);
          if (existingPlayer && player.teeGender && existingPlayer.gender !== player.teeGender) {
            await ctx.db.patch(playerId, { gender: player.teeGender, updatedAt: now });
          }
        }
      }

      const holeData = normalizeHoles(player.holeData, args.holeCount);
      const stats = computeStats(holeData);

      const teeMeta = pickTeeMeta(player.teeName, player.teeGender);
      const { ratingUsed, slopeUsed, scaleTo18 } = getRatingSlopeForScore(teeMeta, holeData);

      // Calculate course handicap first - needed for Net Double Bogey
      // Course Handicap = Handicap Index × (Slope / 113)
      const courseHandicap = player.handicap !== undefined && slopeUsed
        ? Math.round(player.handicap * (slopeUsed / 113))
        : player.handicap;

      // Apply Net Double Bogey adjustment using course handicap and hole stroke indexes
      const hasValidCourseHandicap = typeof courseHandicap === 'number' && courseHandicap >= 0;
      const courseHoles = (course.holes as Array<{ number: number; par: number; hcp: number }>) || [];

      let adjustedGross: number;
      let adjustedHoleData: Array<{ hole: number; score: number; par: number; adjustedScore?: number; hcp?: number }>;

      if (hasValidCourseHandicap && courseHoles.length > 0) {
        const adjustment = computeNetDoubleBogeyAdjustment(holeData, courseHoles, courseHandicap);
        adjustedGross = adjustment.adjustedGross;
        adjustedHoleData = adjustment.adjustedHoleData;
      } else {
        // Fallback to Par+3 cap if missing required data
        adjustedGross = computeAdjustedGrossFallback(holeData);
        adjustedHoleData = holeData.map(h => ({ ...h })); // No adjustment
      }

      let handicapDifferential: number | undefined = undefined;
      if (ratingUsed && slopeUsed) {
        const rawDiff = ((adjustedGross - ratingUsed) * 113) / slopeUsed;
        handicapDifferential = rawDiff * (scaleTo18 || 1);
      }

      await ctx.db.insert("scores", {
        roundId: args.roundId,
        playerId,
        courseId: args.courseId,
        grossScore: stats.grossScore,
        netScore: courseHandicap !== undefined ? stats.grossScore - courseHandicap : undefined,
        handicapUsed: courseHandicap ?? undefined,
        holeCount: args.holeCount,
        teeName: player.teeName ?? undefined,
        teeGender: player.teeGender ?? undefined,
        courseRatingUsed: ratingUsed,
        courseSlopeUsed: slopeUsed,
        handicapDifferential,
        adjustedGrossScore: adjustedGross,
        blowUpHoles: stats.blowUpHoles,
        par3Score: stats.par3Score,
        par4Score: stats.par4Score,
        par5Score: stats.par5Score,
        holeData: adjustedHoleData,
        createdAt: now,
        updatedAt: now,
      });
    }

    // After updating a round, recompute the user's handicap and rebuild history
    // so the dashboard, chart, and stats stay in sync
    await ctx.runMutation("handicap:rebuildHistory" as any, {});
  },
});

export const deleteRound = mutation({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const round = await ctx.db.get(args.roundId);
    if (!round) return;

    const clerkId = getClerkIdFromIdentity(identity);
    if (!clerkId) throw new Error("Missing Clerk ID");

    // Lookup by Clerk ID (required for all users)
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
      .unique();

    if (!user || round.hostId !== user._id) throw new Error("Not authorized");

    const scores = await ctx.db
      .query("scores")
      .withIndex("by_round", (q) => q.eq("roundId", args.roundId))
      .collect();

    // Track affected playerIds before deleting scores
    const affectedPlayerIds = new Set(scores.map(s => s.playerId));

    for (const s of scores) {
      await ctx.db.delete(s._id);
    }
    await ctx.db.delete(args.roundId);

    // Scan for and delete any linked game sessions
    const userSessions = await ctx.db
      .query("gameSessions")
      .withIndex("by_host", (q) => q.eq("hostId", user._id))
      .collect();

    for (const session of userSessions) {
      if (session.linkedRoundId === args.roundId) {
        await ctx.db.delete(session._id);
      }
    }

    // Cleanup orphaned players: delete if no remaining scores AND not isSelf
    for (const playerId of Array.from(affectedPlayerIds)) {
      const remainingScores = await ctx.db
        .query("scores")
        .withIndex("by_player", (q) => q.eq("playerId", playerId))
        .first();

      if (!remainingScores) {
        const player = await ctx.db.get(playerId);
        if (player && !(player as any).isSelf) {
          await ctx.db.delete(playerId);
        }
      }
    }

    // Cleanup orphaned scanJob: if this round had a scanJobId and no other round uses it
    if (round.scanJobId) {
      const otherRoundWithSameScan = await ctx.db
        .query("rounds")
        .filter((q) => q.eq(q.field("scanJobId"), round.scanJobId))
        .first();

      if (!otherRoundWithSameScan) {
        await ctx.db.delete(round.scanJobId);
      }
    }

    // After deleting a round, recompute the host user's handicap and rebuild history
    await ctx.runMutation("handicap:rebuildHistory" as any, {});
  },
});

export const getDetail = query({
  args: { roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) return null;

    const course = await ctx.db.get(round.courseId);
    const scores = await ctx.db
      .query("scores")
      .withIndex("by_round", (q) => q.eq("roundId", args.roundId))
      .collect();

    const players = await Promise.all(
      scores.map(async (s) => {
        const player = await ctx.db.get(s.playerId);
        return {
          playerId: s.playerId,
          playerName: player?.name ?? "Player",
          scores: s.holeData.map((h) => ({
            holeNumber: h.hole,
            strokes: h.score,
            adjustedScore: h.adjustedScore,
            confidence: undefined,
          })),
          totalScore: s.grossScore,
          handicapUsed: s.handicapUsed,
          teeColor: s.teeName ?? null,
          teeGender: (s as any).teeGender ?? player?.gender ?? null,
          // Surface self flag so the app can treat this row as "You"
          isSelf: !!player?.isSelf,
        };
      })
    );

    // Resolve course image: prefer Storage ID, fallback to legacy imageUrl
    let courseImageUrl: string | null = null;
    if ((course as any)?.imageStorageId) {
      courseImageUrl = await ctx.storage.getUrl((course as any).imageStorageId);
    }
    if (!courseImageUrl) {
      courseImageUrl = course?.imageUrl ?? null;
    }

    return {
      id: args.roundId,
      date: round.date,
      courseId: round.courseId,
      courseName: course?.name ?? "Unknown Course",
      courseExternalId: (course as any)?.externalId ?? null,
      courseImageUrl,
      courseLocation: course?.location ?? "Unknown location",
      holes: course?.holes ?? [],
      players,
      // Notes are intentionally local-only; keep empty on the server payload.
      notes: "",
      weather: round.weather,
      holeCount: round.holeCount,
      scorecardPhotos: [],
    };
  },
});

export const listWithSummary = query({
  args: {
    hostId: v.id("users"),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const cursor = args.cursor ?? Number.MAX_SAFE_INTEGER;

    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_host", (q) => q.eq("hostId", args.hostId))
      .filter((q) =>
        q.and(
          q.lte(q.field("createdAt"), cursor),
          q.or(
            q.eq(q.field("isSynthesized"), undefined),
            q.eq(q.field("isSynthesized"), false)
          )
        )
      )
      .order("desc")
      .take(limit);

    const results = [];
    for (const round of rounds) {
      const course = await ctx.db.get(round.courseId);
      const scores = await ctx.db
        .query("scores")
        .withIndex("by_round", (q) => q.eq("roundId", round._id))
        .collect();

      const players = await Promise.all(
        scores.map(async (s) => {
          const player = await ctx.db.get(s.playerId);
          return {
            playerId: s.playerId,
            playerName: player?.name ?? "Player",
            totalScore: s.grossScore,
            scores: s.holeData.map((h) => ({
              holeNumber: h.hole,
              strokes: h.score,
              adjustedScore: h.adjustedScore,
              confidence: undefined,
            })),
            handicapUsed: s.handicapUsed,
            teeColor: s.teeName ?? null,
            isSelf: !!player?.isSelf,
          };
        })
      );

      // Resolve course image: prefer Storage ID, fallback to legacy imageUrl
      let courseImageUrl: string | null = null;
      const externalId = (course as any)?.externalId;

      if ((course as any)?.imageStorageId) {
        courseImageUrl = await ctx.storage.getUrl((course as any).imageStorageId);
      }
      if (!courseImageUrl) {
        courseImageUrl = course?.imageUrl ?? null;
      }

      const isDefaultOrMissing = (url: string | null | undefined) =>
        !url || url.includes('unsplash.com') || url.includes('photo-1587174486073-ae5e5cff23aa');

      if (isDefaultOrMissing(courseImageUrl) && externalId) {
        // Try to find a course with the same externalId that has a real image
        const courseByExternalId = await ctx.db
          .query("courses")
          .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
          .first();
        // Prefer Storage image, then legacy imageUrl
        if ((courseByExternalId as any)?.imageStorageId) {
          const storageUrl = await ctx.storage.getUrl((courseByExternalId as any).imageStorageId);
          if (storageUrl) {
            courseImageUrl = storageUrl;
          }
        } else if (courseByExternalId?.imageUrl && !isDefaultOrMissing(courseByExternalId.imageUrl)) {
          courseImageUrl = courseByExternalId.imageUrl;
        }
      }

      results.push({
        id: round._id,
        date: round.date,
        courseId: round.courseId,
        // Also expose the externalId + imageUrl so the client can
        // reconcile Convex course ids with local deterministic ids
        courseExternalId: externalId ?? null,
        courseImageUrl,
        courseLocation: course?.location ?? null,
        courseName: course?.name ?? "Unknown Course",
        courseHoles: course?.holes ?? [],
        courseTeeSets: (course as any)?.teeSets ?? [],
        courseSlope: course?.slope ?? null,
        courseRating: course?.rating ?? null,
        players,
        notes: round.weather ?? "",
        holeCount: round.holeCount,
        scorecardPhotos: [],
      });
    }

    return results;
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// LIGHTWEIGHT QUERIES (for bandwidth optimization)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LIGHTWEIGHT: Returns just the count of rounds for a host.
 * Used by AnalyticsProvider instead of listWithSummary.
 */
export const countByHost = query({
  args: { hostId: v.id("users") },
  handler: async (ctx, args) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_host", (q) => q.eq("hostId", args.hostId))
      .filter((q) =>
        q.or(
          q.eq(q.field("isSynthesized"), undefined),
          q.eq(q.field("isSynthesized"), false)
        )
      )
      .collect();
    return rounds.length;
  },
});

/**
 * LIGHTWEIGHT: Returns only round dates for a host.
 * Used by ActivityCalendar instead of listWithSummary.
 */
export const listDatesByHost = query({
  args: { hostId: v.id("users"), year: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_host", (q) => q.eq("hostId", args.hostId))
      .filter((q) =>
        q.or(
          q.eq(q.field("isSynthesized"), undefined),
          q.eq(q.field("isSynthesized"), false)
        )
      )
      .collect();

    // Filter by year if provided
    const dates = rounds.map((r) => r.date);
    if (args.year) {
      return dates.filter((d) => new Date(d).getFullYear() === args.year);
    }
    return dates;
  },
});

/**
 * LIGHTWEIGHT: Returns minimal course references for each round.
 * Used by CourseSearchModal "My Courses" tab instead of listWithSummary.
 * Does NOT include players, scores, holes, or teeSets.
 */
export const listCourseRefsByHost = query({
  args: { hostId: v.id("users") },
  handler: async (ctx, args) => {
    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_host", (q) => q.eq("hostId", args.hostId))
      .filter((q) =>
        q.or(
          q.eq(q.field("isSynthesized"), undefined),
          q.eq(q.field("isSynthesized"), false)
        )
      )
      .collect();

    // Cache course docs (and resolved image URLs) to avoid re-reading the same
    // course for users who have multiple rounds on the same course.
    const courseCache = new Map<string, any>();
    const courseImageCache = new Map<string, string | null>();

    const loadCourse = async (courseId: string) => {
      if (courseCache.has(courseId)) return courseCache.get(courseId);
      const c = await ctx.db.get(courseId as any);
      courseCache.set(courseId, c);
      return c;
    };

    const resolveCourseImageUrl = async (courseId: string, course: any) => {
      if (courseImageCache.has(courseId)) return courseImageCache.get(courseId) ?? null;
      let url: string | null = null;
      if (course?.imageStorageId) {
        url = await ctx.storage.getUrl(course.imageStorageId);
      }
      if (!url) {
        url = course?.imageUrl ?? null;
      }
      courseImageCache.set(courseId, url);
      return url;
    };

    const results: Array<{
      roundId: string;
      courseId: string;
      courseExternalId: string | null;
      courseName: string;
      courseImageUrl: string | null;
      courseLocation: string | null;
      date: string;
    }> = [];

    for (const round of rounds) {
      const courseId = round.courseId as any as string;
      const course = await loadCourse(courseId);
      const courseImageUrl = await resolveCourseImageUrl(courseId, course);

      results.push({
        roundId: round._id,
        courseId: round.courseId,
        courseExternalId: (course as any)?.externalId ?? null,
        courseName: course?.name ?? "Unknown Course",
        courseImageUrl,
        courseLocation: course?.location ?? null,
        date: round.date,
      });
    }

    return results;
  },
});

/**
 * LIGHTWEIGHT: Check which round IDs exist in the database.
 * Used by RoundSyncer to prune deleted rounds without fetching full data.
 */
export const existsBatch = query({
  args: { roundIds: v.array(v.id("rounds")) },
  handler: async (ctx, args) => {
    const existing: string[] = [];
    for (const roundId of args.roundIds) {
      const round = await ctx.db.get(roundId);
      if (round) {
        existing.push(roundId);
      }
    }
    return existing;
  },
});
