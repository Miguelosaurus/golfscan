import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  calculateHandicapFromDiffs,
  validateDifferential,
  computeAdjustedGross,
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

// For Scandicap: adjusted gross score with a cap of Par + 3 on each hole.
const computeAdjustedGrossForHandicap = (
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
  const scores = await ctx.db
    .query("scores")
    .withIndex("by_player", (q: any) => q.eq("playerId", playerId))
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
    const roundId = await ctx.db.insert("rounds", {
      hostId: user._id,
      courseId: args.courseId,
      date: args.date,
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

      const adjustedGross = computeAdjustedGrossForHandicap(holeData);
      const teeMeta = pickTeeMeta(player.teeName, player.teeGender);

      // Warn if tee not found but was specified
      if (player.teeName && !teeMeta) {
        console.warn(`[Handicap] Tee "${player.teeName}" not found for course "${course.name}". Using fallback rating/slope.`);
      }

      const { ratingUsed, slopeUsed, scaleTo18 } = getRatingSlopeForScore(teeMeta, holeData);

      let handicapDifferential: number | undefined = undefined;
      if (ratingUsed && slopeUsed) {
        const rawDiff = ((adjustedGross - ratingUsed) * 113) / slopeUsed;
        const scaled = rawDiff * (scaleTo18 || 1);

        // Validate differential range
        validateDifferential(scaled, { courseName: course.name, grossScore: stats.grossScore });

        handicapDifferential = scaled;
      }

      // Calculate course handicap from handicap index using slope
      // Course Handicap = Handicap Index × (Slope / 113)
      const courseHandicap = player.handicap !== undefined && slopeUsed
        ? Math.round(player.handicap * (slopeUsed / 113))
        : player.handicap;

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
        blowUpHoles: stats.blowUpHoles,
        par3Score: stats.par3Score,
        par4Score: stats.par4Score,
        par5Score: stats.par5Score,
        holeData,
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
    await ctx.db.patch(args.roundId, {
      courseId: args.courseId,
      date: args.date,
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

      const adjustedGross = computeAdjustedGrossForHandicap(holeData);
      const teeMeta = pickTeeMeta(player.teeName, player.teeGender);
      const { ratingUsed, slopeUsed, scaleTo18 } = getRatingSlopeForScore(teeMeta, holeData);
      let handicapDifferential: number | undefined = undefined;
      if (ratingUsed && slopeUsed) {
        const rawDiff = ((adjustedGross - ratingUsed) * 113) / slopeUsed;
        handicapDifferential = rawDiff * (scaleTo18 || 1);
      }

      // Calculate course handicap from handicap index using slope
      // Course Handicap = Handicap Index × (Slope / 113)
      const courseHandicap = player.handicap !== undefined && slopeUsed
        ? Math.round(player.handicap * (slopeUsed / 113))
        : player.handicap;

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
        blowUpHoles: stats.blowUpHoles,
        par3Score: stats.par3Score,
        par4Score: stats.par4Score,
        par5Score: stats.par5Score,
        holeData,
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
    for (const playerId of affectedPlayerIds) {
      const remainingScores = await ctx.db
        .query("scores")
        .withIndex("by_player", (q) => q.eq("playerId", playerId))
        .first();

      if (!remainingScores) {
        const player = await ctx.db.get(playerId);
        if (player && !player.isSelf) {
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

    return {
      id: args.roundId,
      date: round.date,
      courseId: round.courseId,
      courseName: course?.name ?? "Unknown Course",
      courseExternalId: (course as any)?.externalId ?? null,
      courseImageUrl: course?.imageUrl ?? null,
      courseLocation: course?.location ?? "Unknown location",
      holes: course?.holes ?? [],
      players,
      notes: round.weather ?? "",
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
              confidence: undefined,
            })),
            handicapUsed: s.handicapUsed,
            teeColor: s.teeName ?? null,
            isSelf: !!player?.isSelf,
          };
        })
      );

      results.push({
        id: round._id,
        date: round.date,
        courseId: round.courseId,
        // Also expose the externalId + imageUrl so the client can
        // reconcile Convex course ids with local deterministic ids
        courseExternalId: (course as any)?.externalId ?? null,
        courseImageUrl: course?.imageUrl ?? null,
        courseName: course?.name ?? "Unknown Course",
        players,
        notes: round.weather ?? "",
        holeCount: round.holeCount,
        scorecardPhotos: [],
      });
    }

    return results;
  },
});
