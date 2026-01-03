import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { getClerkIdFromIdentity } from "./lib/authUtils";
import {
    calculateStrokePlaySettlement,
    calculateMatchPlaySettlement,
    calculateNassauSettlement,
    calculateSkinsSettlement,
    calculateSideBetsSettlement,
    PlayerScore,
} from "./lib/gameSettlement";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

const participantValidator = v.object({
    playerId: v.id("players"),
    handicapIndex: v.number(),
    teeName: v.optional(v.string()),
    teeGender: v.optional(v.string()),
    courseHandicap: v.number(),
});

const sideValidator = v.object({
    sideId: v.string(),
    name: v.optional(v.string()),
    playerIds: v.array(v.id("players")),
});

const strokeAllocationValidator = v.object({
    playerId: v.id("players"),
    strokesByHole: v.array(v.number()),
});

const betSettingsValidator = v.object({
    enabled: v.boolean(),
    betPerUnitCents: v.number(),
    betUnit: v.optional(v.union(
        v.literal("match"),
        v.literal("hole"),
        v.literal("stroke_margin"),
        v.literal("winner"),
        v.literal("point"),
        v.literal("skin")
    )),
    carryover: v.optional(v.boolean()),
    pressEnabled: v.optional(v.boolean()),
    pressThreshold: v.optional(v.number()),
    sideBets: v.optional(v.object({
        greenies: v.boolean(),
        sandies: v.boolean(),
        birdies: v.boolean(),
        amountCents: v.number(),
    })),
});

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function validateParticipants(
    participants: Array<{ playerId: Id<"players">; handicapIndex: number; courseHandicap: number }>
): void {
    if (participants.length < 2) {
        throw new Error("At least 2 participants required");
    }
    const playerIds = participants.map((p) => p.playerId);
    const uniqueIds = new Set(playerIds);
    if (uniqueIds.size !== playerIds.length) {
        throw new Error("Duplicate player IDs not allowed");
    }
}

function validateStrokeAllocations(
    allocations: Array<{ playerId: Id<"players">; strokesByHole: number[] }>,
    participantIds: Set<string>
): void {
    for (const alloc of allocations) {
        if (!participantIds.has(alloc.playerId)) {
            throw new Error(`Stroke allocation for unknown player: ${alloc.playerId}`);
        }
        if (alloc.strokesByHole.length !== 18) {
            throw new Error("strokesByHole must have exactly 18 elements");
        }
        for (const strokes of alloc.strokesByHole) {
            if (!Number.isInteger(strokes) || strokes < 0 || strokes > 2) {
                throw new Error("strokesByHole values must be 0, 1, or 2");
            }
        }
    }
}

function validateSides(
    sides: Array<{ sideId: string; playerIds: Id<"players">[] }>,
    gameMode: "individual" | "head_to_head" | "teams",
    participantIds: Set<string>
): void {
    // Validate all playerIds exist in participants
    for (const side of sides) {
        for (const playerId of side.playerIds) {
            if (!participantIds.has(playerId)) {
                throw new Error(`Side contains unknown player: ${playerId}`);
            }
        }
    }

    switch (gameMode) {
        case "individual":
            // Each player should be their own side
            if (sides.length !== participantIds.size) {
                throw new Error("Individual mode requires one side per participant");
            }
            for (const side of sides) {
                if (side.playerIds.length !== 1) {
                    throw new Error("Individual mode sides must have exactly 1 player");
                }
            }
            break;
        case "head_to_head":
            if (sides.length !== 2) {
                throw new Error("Head-to-head mode requires exactly 2 sides");
            }
            for (const side of sides) {
                if (side.playerIds.length !== 1) {
                    throw new Error("Head-to-head sides must have exactly 1 player");
                }
            }
            break;
        case "teams":
            if (sides.length !== 2) {
                throw new Error("Teams mode requires exactly 2 sides");
            }
            for (const side of sides) {
                if (side.playerIds.length !== 2) {
                    throw new Error("Team sides must have exactly 2 players");
                }
            }
            break;
    }
}

function validateGameTypeMode(
    gameType: "stroke_play" | "match_play" | "nassau" | "skins",
    gameMode: "individual" | "head_to_head" | "teams"
): void {
    // match_play / nassau: Cannot be individual
    if ((gameType === "match_play" || gameType === "nassau") && gameMode === "individual") {
        throw new Error(`${gameType} cannot use individual mode`);
    }
    // stroke_play / skins: v1 only individual or head_to_head (no teams)
    if ((gameType === "stroke_play" || gameType === "skins") && gameMode === "teams") {
        throw new Error(`${gameType} does not support teams mode in v1`);
    }
}

function validateCentsIsInteger(cents: number, fieldName: string): void {
    if (!Number.isInteger(cents)) {
        throw new Error(`${fieldName} must be an integer (cents)`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the current user's active game session (if any)
 */
export const getActive = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const clerkId = getClerkIdFromIdentity(identity);
        if (!clerkId) return null;

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
            .unique();

        if (!user) return null;

        // Query for pending or active sessions
        const sessions = await ctx.db
            .query("gameSessions")
            .withIndex("by_host_status", (q) => q.eq("hostId", user._id))
            .collect();

        // Find first pending or active session
        const activeSession = sessions.find(
            (s) => s.status === "pending" || s.status === "active"
        );

        if (!activeSession) return null;

        // Fetch course and player details
        const course = await ctx.db.get(activeSession.courseId);
        const playerDetails = await Promise.all(
            activeSession.participants.map(async (p) => {
                const player = await ctx.db.get(p.playerId);
                return {
                    ...p,
                    name: player?.name ?? "Unknown",
                    aliases: player?.aliases ?? [],
                };
            })
        );

        return {
            ...activeSession,
            course,
            playerDetails,
        };
    },
});

/**
 * Get a specific game session by ID
 */
export const getById = query({
    args: { sessionId: v.id("gameSessions") },
    handler: async (ctx, args) => {
        const session = await ctx.db.get(args.sessionId);
        if (!session) return null;

        const course = await ctx.db.get(session.courseId);
        const playerDetails = await Promise.all(
            session.participants.map(async (p) => {
                const player = await ctx.db.get(p.playerId);
                return { ...p, name: player?.name ?? "Unknown" };
            })
        );

        return {
            ...session,
            course,
            playerDetails,
        };
    },
});

/**
 * Get recent completed sessions for history
 */
export const getRecent = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const user = await ctx.db
            .query("users")
            .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
            .unique();

        if (!user) return [];

        const limit = args.limit ?? 20;
        const sessions = await ctx.db
            .query("gameSessions")
            .withIndex("by_host", (q) => q.eq("hostId", user._id))
            .order("desc")
            .take(limit);

        return Promise.all(
            sessions.map(async (session) => {
                const course = await ctx.db.get(session.courseId);
                return {
                    ...session,
                    courseName: course?.name ?? "Unknown Course",
                };
            })
        );
    },
});

/**
 * Get a session by its linked round ID
 */
export const getByLinkedRound = query({
    args: {
        roundId: v.id("rounds"),
    },
    handler: async (ctx, args) => {
        const sessions = await ctx.db
            .query("gameSessions")
            .filter((q) => q.eq(q.field("linkedRoundId"), args.roundId))
            .take(1);

        if (!sessions.length) return null;

        const session = sessions[0];
        const course = await ctx.db.get(session.courseId);

        // Also resolve player names for display
        const participantDetails = await Promise.all(
            (session.participants || []).map(async (p: any) => {
                const player = await ctx.db.get(p.playerId);
                return {
                    ...p,
                    name: player?.name ?? "Unknown",
                };
            })
        );

        return {
            ...session,
            courseName: course?.name ?? "Unknown Course",
            participants: participantDetails,
        };
    },
});

// ═══════════════════════════════════════════════════════════════════════════

// MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new game session
 */
export const create = mutation({
    args: {
        courseId: v.optional(v.id("courses")),
        courseExternalId: v.optional(v.string()),
        startAt: v.number(),
        holeSelection: v.union(v.literal("18"), v.literal("front_9"), v.literal("back_9")),
        gameType: v.union(
            v.literal("stroke_play"),
            v.literal("match_play"),
            v.literal("nassau"),
            v.literal("skins")
        ),
        gameMode: v.union(v.literal("individual"), v.literal("head_to_head"), v.literal("teams")),
        payoutMode: v.union(v.literal("war"), v.literal("pot")),
        strokeFormat: v.optional(v.union(v.literal("usga"), v.literal("modified"))),
        participants: v.array(participantValidator),
        sides: v.array(sideValidator),
        netStrokeAllocations: v.array(strokeAllocationValidator),
        betSettings: v.optional(betSettingsValidator),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Not authenticated");

        const clerkId = getClerkIdFromIdentity(identity);
        if (!clerkId) throw new Error("Missing Clerk ID");

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
            .unique();

        if (!user) throw new Error("User not found");

        // Validate game type ↔ mode
        validateGameTypeMode(args.gameType, args.gameMode);

        // Validate participants
        validateParticipants(args.participants);
        const participantIds = new Set(args.participants.map((p) => p.playerId as string));

        // Validate sides
        validateSides(args.sides, args.gameMode, participantIds);

        // Validate stroke allocations
        validateStrokeAllocations(args.netStrokeAllocations, participantIds);

        // Validate bet settings cents
        if (args.betSettings?.enabled) {
            validateCentsIsInteger(args.betSettings.betPerUnitCents, "betPerUnitCents");
        }

        // Apply strokeFormat default for non-individual modes
        let strokeFormat = args.strokeFormat;
        if (args.gameMode !== "individual" && !strokeFormat) {
            strokeFormat = "usga";
        }

        // Resolve courseId - either from direct ID or by looking up external ID
        let resolvedCourseId = args.courseId;
        if (!resolvedCourseId && args.courseExternalId) {
            // Look up course by external ID
            const courseByExternal = await ctx.db
                .query("courses")
                .withIndex("by_externalId", (q) => q.eq("externalId", args.courseExternalId!))
                .first();
            if (courseByExternal) {
                resolvedCourseId = courseByExternal._id;
            }
        }

        if (!resolvedCourseId) {
            throw new Error("Course not found - provide courseId or valid courseExternalId");
        }

        // Get course for fingerprint
        const course = await ctx.db.get(resolvedCourseId);
        if (!course) throw new Error("Course not found");

        // Resolve player names server-side for fingerprint
        const playerNames = await Promise.all(
            args.participants.map(async (p) => {
                const player = await ctx.db.get(p.playerId);
                return player?.name ?? "Unknown";
            })
        );

        const now = Date.now();
        const sessionId = await ctx.db.insert("gameSessions", {
            hostId: user._id,
            courseId: resolvedCourseId,
            startAt: args.startAt,
            status: "pending",
            holeSelection: args.holeSelection,
            gameType: args.gameType,
            gameMode: args.gameMode,
            payoutMode: args.payoutMode,
            strokeFormat,
            participants: args.participants,
            sides: args.sides,
            netStrokeAllocations: args.netStrokeAllocations,
            betSettings: args.betSettings,
            sessionFingerprint: {
                courseExternalId: course.externalId ?? course._id.toString(),
                playerNames,
                startAt: args.startAt,
            },
            createdAt: now,
            updatedAt: now,
        });

        return sessionId;
    },
});

/**
 * Start an active session (move from pending to active)
 */
export const start = mutation({
    args: { sessionId: v.id("gameSessions") },
    handler: async (ctx, args) => {
        const session = await ctx.db.get(args.sessionId);
        if (!session) throw new Error("Session not found");
        if (session.status !== "pending") {
            throw new Error("Can only start pending sessions");
        }

        await ctx.db.patch(args.sessionId, {
            status: "active",
            updatedAt: Date.now(),
        });
    },
});

/**
 * Cancel a session
 */
export const cancel = mutation({
    args: { sessionId: v.id("gameSessions") },
    handler: async (ctx, args) => {
        const session = await ctx.db.get(args.sessionId);
        if (!session) throw new Error("Session not found");
        if (session.status === "completed" || session.status === "cancelled") {
            throw new Error("Cannot cancel completed or already cancelled sessions");
        }

        await ctx.db.patch(args.sessionId, {
            status: "cancelled",
            updatedAt: Date.now(),
        });
    },
});

/**
 * Update side bet tracking counts for a player
 */
export const updateSideBetCounts = mutation({
    args: {
        sessionId: v.id("gameSessions"),
        playerId: v.id("players"),
        greenies: v.number(),
        sandies: v.number(),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db.get(args.sessionId);
        if (!session) throw new Error("Session not found");

        // Get existing tracking or create new array
        const currentTracking = session.sideBetTracking || [];

        // Find existing entry for this player
        const existingIndex = currentTracking.findIndex(t => t.playerId === args.playerId);

        const newEntry = {
            playerId: args.playerId,
            greenies: args.greenies,
            sandies: args.sandies,
        };

        let updatedTracking;
        if (existingIndex >= 0) {
            // Update existing entry
            updatedTracking = [...currentTracking];
            updatedTracking[existingIndex] = newEntry;
        } else {
            // Add new entry
            updatedTracking = [...currentTracking, newEntry];
        }

        await ctx.db.patch(args.sessionId, {
            sideBetTracking: updatedTracking,
            updatedAt: Date.now(),
        });
    },
});

/**
 * Link a scanned round to this session
 */
export const linkRound = mutation({
    args: {
        sessionId: v.id("gameSessions"),
        roundId: v.id("rounds"),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db.get(args.sessionId);
        if (!session) throw new Error("Session not found");

        await ctx.db.patch(args.sessionId, {
            linkedRoundId: args.roundId,
            status: "active", // Ensure active when round is linked
            updatedAt: Date.now(),
        });
    },
});

/**
 * Complete session with settlement
 */
export const complete = mutation({
    args: {
        sessionId: v.id("gameSessions"),
        transactions: v.array(
            v.object({
                fromPlayerId: v.id("players"),
                toPlayerId: v.id("players"),
                amountCents: v.number(),
                reason: v.string(),
            })
        ),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db.get(args.sessionId);
        if (!session) throw new Error("Session not found");

        // Validate all amounts are integers
        for (const tx of args.transactions) {
            validateCentsIsInteger(tx.amountCents, "transaction amountCents");
        }

        await ctx.db.patch(args.sessionId, {
            status: "completed",
            settlement: {
                calculated: true,
                transactions: args.transactions,
            },
            updatedAt: Date.now(),
        });
    },
});

/**
 * Add a press to a Nassau game
 */
export const addPress = mutation({
    args: {
        sessionId: v.id("gameSessions"),
        pressId: v.string(),
        startHole: v.number(),
        segment: v.union(v.literal("front"), v.literal("back")),
        initiatedBy: v.id("players"),
        valueCents: v.number(),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db.get(args.sessionId);
        if (!session) throw new Error("Session not found");
        if (session.gameType !== "nassau") {
            throw new Error("Presses only available for Nassau games");
        }

        // Validate cents
        validateCentsIsInteger(args.valueCents, "valueCents");

        // Validate press against holeSelection
        if (session.holeSelection === "front_9" && args.segment !== "front") {
            throw new Error("Front 9 games can only have front segment presses");
        }
        if (session.holeSelection === "back_9" && args.segment !== "back") {
            throw new Error("Back 9 games can only have back segment presses");
        }
        if (args.segment === "front" && (args.startHole < 1 || args.startHole > 9)) {
            throw new Error("Front segment presses must start on holes 1-9");
        }
        if (args.segment === "back" && (args.startHole < 10 || args.startHole > 18)) {
            throw new Error("Back segment presses must start on holes 10-18");
        }

        const newPress = {
            pressId: args.pressId,
            startHole: args.startHole,
            segment: args.segment,
            initiatedBy: args.initiatedBy,
            valueCents: args.valueCents,
        };

        const existingPresses = session.presses ?? [];
        await ctx.db.patch(args.sessionId, {
            presses: [...existingPresses, newPress],
            updatedAt: Date.now(),
        });
    },
});

/**
 * Complete session with auto-calculated settlement
 * Fetches round data and calculates transactions based on game type
 */
export const completeWithSettlement = mutation({
    args: {
        sessionId: v.id("gameSessions"),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db.get(args.sessionId);
        if (!session) throw new Error("Session not found");
        if (!session.linkedRoundId) throw new Error("No round linked to session");
        if (!session.betSettings?.enabled) {
            // No betting, just mark as completed
            await ctx.db.patch(args.sessionId, {
                status: "completed",
                settlement: { calculated: true, transactions: [] },
                updatedAt: Date.now(),
            });
            return { transactions: [] };
        }

        // Fetch the linked round
        const round = await ctx.db.get(session.linkedRoundId);
        if (!round) throw new Error("Linked round not found");

        // Get scores from the scores table (players are linked by roundId)
        const scores = await ctx.db
            .query("scores")
            .withIndex("by_round", (q) => q.eq("roundId", session.linkedRoundId!))
            .collect();

        // Extract player scores from scores data
        const playerScores: PlayerScore[] = scores.map((score) => {
            const holeScores = new Array(18).fill(0);
            (score.holeData || []).forEach((hd: any) => {
                if (hd.hole >= 1 && hd.hole <= 18) {
                    holeScores[hd.hole - 1] = hd.score || 0;
                }
            });
            return {
                playerId: score.playerId,
                holeScores,
            };
        });

        // Build stroke allocations from session data
        const strokeAllocations = session.netStrokeAllocations.map((a) => ({
            playerId: a.playerId,
            strokesByHole: a.strokesByHole,
        }));

        // Build sides from session data
        const sides = session.sides.map((s) => ({
            sideId: s.sideId,
            name: s.name,
            playerIds: s.playerIds,
        }));

        let transactions: any[] = [];

        switch (session.gameType) {
            case "stroke_play":
                transactions = calculateStrokePlaySettlement({
                    playerScores,
                    strokeAllocations,
                    betPerUnitCents: session.betSettings.betPerUnitCents,
                    payoutMode: session.payoutMode || "war",
                    holeSelection: session.holeSelection,
                });
                break;

            case "match_play":
                transactions = calculateMatchPlaySettlement({
                    sides,
                    playerScores,
                    strokeAllocations,
                    betPerUnitCents: session.betSettings.betPerUnitCents,
                    holeSelection: session.holeSelection,
                    betUnit: session.betSettings.betUnit,
                });
                break;

            case "nassau":
                transactions = calculateNassauSettlement({
                    sides,
                    playerScores,
                    strokeAllocations,
                    betPerUnitCents: session.betSettings.betPerUnitCents,
                    holeSelection: session.holeSelection,
                    presses: session.presses?.map(p => ({
                        startHole: p.startHole,
                        segment: p.segment,
                        valueCents: p.valueCents,
                    })),
                });
                break;

            case "skins":
                transactions = calculateSkinsSettlement({
                    playerScores,
                    strokeAllocations,
                    skinValueCents: session.betSettings.betPerUnitCents,
                    carryover: session.betSettings.carryover ?? true,
                    holeSelection: session.holeSelection,
                    payoutMode: session.payoutMode || "war",
                });
                break;
        }

        // Calculate side bets if enabled
        if (session.betSettings.sideBets) {
            // Get par for each hole from course
            const course = await ctx.db.get(session.courseId);
            if (course && course.holes) {
                const parByHole = course.holes.map((h: { par: number }) => h.par);
                const sideBetTransactions = calculateSideBetsSettlement({
                    playerScores,
                    parByHole,
                    holeSelection: session.holeSelection,
                    sideBets: session.betSettings.sideBets,
                    // Pass the manually tracked greenies/sandies counts
                    trackedCounts: session.sideBetTracking,
                });
                transactions = [...transactions, ...sideBetTransactions];
            }
        }

        // Persist settlement
        await ctx.db.patch(args.sessionId, {
            status: "completed",
            settlement: {
                calculated: true,
                transactions,
            },
            updatedAt: Date.now(),
        });

        return { transactions };
    },
});
