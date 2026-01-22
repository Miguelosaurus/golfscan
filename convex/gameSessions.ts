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
import {
    calculateSettlement as calculateSettlementV2,
    PlayerScore as PlayerScoreV2,
    SettlementArgs,
    SettlementResultV2,
    NassauConfig,
    MatchPlayConfig,
    StrokePlayConfig,
    SkinsConfig,
    DEFAULT_PRESS_CONFIG,
    RawTransaction,
    NettedPayment,
    // V2 engine primitives for press validation
    buildMatchState,
    validateManualPress,
    Pairing,
    Segment,
    SegmentName,
    ManualPressRequest,
    PressRegistry,
    StrokeAllocation,
    MatchConfig,
    PressState,
} from "./lib/gameSettlementV2";


// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

const participantValidator = v.object({
    playerId: v.id("players"),
    // Optional userId to identify which Clerk user this participant is (for press attribution)
    userId: v.optional(v.id("users")),
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
    // Nassau-specific: separate amounts for each segment
    nassauAmounts: v.optional(v.object({
        frontCents: v.number(),
        backCents: v.number(),
        overallCents: v.number(),
    })),
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
    // 1. Basic Structure
    if (gameMode === "individual") {
        if (sides.length !== participantIds.size) {
            throw new Error("Individual mode requires exactly one side per participant");
        }
    } else {
        // Teams or Head-to-Head
        if (sides.length !== 2) {
            throw new Error(`${gameMode} requires exactly 2 sides`);
        }
    }

    // 2. Player Assignments & Exclusivity
    const assignedPlayerIds = new Set<string>();
    for (const side of sides) {
        if (side.playerIds.length === 0) {
            throw new Error(`Side ${side.sideId} cannot be empty`);
        }
        for (const playerId of side.playerIds) {
            if (!participantIds.has(playerId)) {
                throw new Error(`Side contains unknown player: ${playerId}`);
            }
            if (assignedPlayerIds.has(playerId)) {
                throw new Error(`Player ${playerId} is assigned to multiple sides`);
            }
            assignedPlayerIds.add(playerId);
        }
    }

    // 3. Exhaustiveness
    if (assignedPlayerIds.size !== participantIds.size) {
        throw new Error("All participants must be assigned to a side");
    }

    // 4. Mode-specific constraints
    if (gameMode === "individual") {
        for (const side of sides) {
            if (side.playerIds.length !== 1) {
                throw new Error("Individual mode sides must have exactly 1 player");
            }
        }
    } else if (gameMode === "head_to_head") {
        for (const side of sides) {
            if (side.playerIds.length !== 1) {
                throw new Error("Head-to-head sides must have exactly 1 player");
            }
        }
    } else if (gameMode === "teams") {
        for (const side of sides) {
            if (side.playerIds.length !== 2) {
                throw new Error("Team sides must have exactly 2 players (v1)");
            }
        }
    }
}

function validateGameTypeMode(
    gameType: "stroke_play" | "match_play" | "nassau" | "skins",
    gameMode: "individual" | "head_to_head" | "teams",
    playerCount: number
): void {
    // Hard player caps
    if (playerCount < 2) {
        throw new Error("Game sessions require at least 2 players");
    }

    // O(n^2) consideration for transaction settlement: cap for skins/stroke-play
    // 12 players = 132 pairings/transactions per hole. 18 holes = 2,376 transactions.
    if (playerCount > 12) {
        throw new Error("Maximum 12 players supported per session");
    }

    // Match focus caps (Match Play and Nassau are typically 2-4 players)
    if ((gameType === "match_play" || gameType === "nassau") && playerCount > 4) {
        throw new Error(`${gameType} is capped at 4 players`);
    }

    // match_play / nassau: Strict Matrix Enforcement
    if (gameType === "match_play" || gameType === "nassau") {
        if (playerCount === 2 && gameMode !== "head_to_head") {
            throw new Error(`${gameType} with 2 players must be head_to_head`);
        }
        if (playerCount === 3 && gameMode !== "individual") {
            throw new Error(`${gameType} with 3 players must be individual`);
        }
        // 4 players can be individual or teams
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
        const courseDoc = await ctx.db.get(activeSession.courseId);
        let course = null;
        if (courseDoc) {
            let imageUrl = courseDoc.imageUrl;
            if ((courseDoc as any).imageStorageId) {
                const storageUrl = await ctx.storage.getUrl((courseDoc as any).imageStorageId);
                if (storageUrl) imageUrl = storageUrl;
            }
            course = { ...courseDoc, imageUrl };
        }

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

        const courseDoc = await ctx.db.get(session.courseId);
        let course = null;
        if (courseDoc) {
            let imageUrl = courseDoc.imageUrl;
            if ((courseDoc as any).imageStorageId) {
                const storageUrl = await ctx.storage.getUrl((courseDoc as any).imageStorageId);
                if (storageUrl) imageUrl = storageUrl;
            }
            course = { ...courseDoc, imageUrl };
        }

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
                    name: (player as any)?.name ?? "Unknown",
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

        // Validate participants
        validateParticipants(args.participants);
        const participantIds = new Set(args.participants.map((p) => p.playerId as string));
        const playerCount = participantIds.size;

        // Force modes based on strict matrix (ignore client state drift)
        let effectiveGameMode = args.gameMode;
        if (args.gameType === "stroke_play" || args.gameType === "skins") {
            effectiveGameMode = "individual";
        } else if (args.gameType === "match_play" || args.gameType === "nassau") {
            if (playerCount === 2) {
                effectiveGameMode = "head_to_head";
            } else if (playerCount === 3) {
                effectiveGameMode = "individual";
            }
            // 4 players: keep client request (individual or teams)
        }

        // Validate game type ↔ mode + player caps
        validateGameTypeMode(args.gameType, effectiveGameMode, playerCount);

        // Normalize sides based on effective game mode
        let effectiveSides = args.sides;
        if (effectiveGameMode === "individual" || (effectiveGameMode === "head_to_head" && playerCount === 2)) {
            // Reconstruct sides for individual or auto-normalized 1v1
            // This ensures deterministic side IDs and one-player-per-side structure
            effectiveSides = args.participants.map((p) => ({
                sideId: p.playerId,
                playerIds: [p.playerId],
            }));
        }

        // Validate (normalized) sides
        validateSides(effectiveSides, effectiveGameMode, participantIds);

        // Validate stroke allocations
        validateStrokeAllocations(args.netStrokeAllocations, participantIds);

        // Validate bet settings cents
        if (args.betSettings?.enabled) {
            validateCentsIsInteger(args.betSettings.betPerUnitCents, "betPerUnitCents");
        }

        // Apply strokeFormat default for non-individual modes
        let strokeFormat = args.strokeFormat;
        if (effectiveGameMode !== "individual" && !strokeFormat) {
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

        // Enrich participants with userId from player.userId for press attribution
        // Only the self-player has userId set, so only that participant will match the current user
        const enrichedParticipants = await Promise.all(
            args.participants.map(async (p) => {
                const player = await ctx.db.get(p.playerId);
                return {
                    ...p,
                    // Use player.userId (NOT ownerId) - only self-player has this set
                    userId: player?.userId ?? undefined,
                };
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
            gameMode: effectiveGameMode,
            payoutMode: args.payoutMode,
            strokeFormat,
            participants: enrichedParticipants,
            sides: effectiveSides,
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
 * Update bet settings for a session (before settlement)
 */
export const updateBetSettings = mutation({
    args: {
        sessionId: v.id("gameSessions"),
        betPerUnitCents: v.optional(v.number()),
        nassauAmounts: v.optional(v.object({
            frontCents: v.optional(v.number()),
            backCents: v.optional(v.number()),
            overallCents: v.optional(v.number()),
        })),
        carryover: v.optional(v.boolean()),
        sideBetAmountCents: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        // Auth check
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Not authenticated");

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
            .first();
        if (!user) throw new Error("User not found");

        const session = await ctx.db.get(args.sessionId);
        if (!session) throw new Error("Session not found");

        // Only allow updates before settlement
        if (session.status === "completed") {
            throw new Error("Cannot update bet settings after settlement");
        }

        // Verify user is host or participant
        const isHost = session.hostId === user._id;
        const isParticipant = session.participants.some(p => p.userId === user._id);
        if (!isHost && !isParticipant) {
            throw new Error("Not authorized to update this session");
        }

        // Validate cents are integers
        if (args.betPerUnitCents !== undefined) {
            validateCentsIsInteger(args.betPerUnitCents, "betPerUnitCents");
        }
        if (args.nassauAmounts?.frontCents !== undefined) {
            validateCentsIsInteger(args.nassauAmounts.frontCents, "nassauAmounts.frontCents");
        }
        if (args.nassauAmounts?.backCents !== undefined) {
            validateCentsIsInteger(args.nassauAmounts.backCents, "nassauAmounts.backCents");
        }
        if (args.nassauAmounts?.overallCents !== undefined) {
            validateCentsIsInteger(args.nassauAmounts.overallCents, "nassauAmounts.overallCents");
        }
        if (args.sideBetAmountCents !== undefined) {
            validateCentsIsInteger(args.sideBetAmountCents, "sideBetAmountCents");
        }

        // Build updated bet settings
        const currentSettings = session.betSettings || { enabled: true, betPerUnitCents: 0 };
        const updatedSettings: typeof currentSettings = {
            ...currentSettings,
            ...(args.betPerUnitCents !== undefined && { betPerUnitCents: args.betPerUnitCents }),
            ...(args.nassauAmounts && {
                nassauAmounts: {
                    ...(currentSettings as any).nassauAmounts,
                    ...args.nassauAmounts,
                },
            }),
            ...(args.carryover !== undefined && { carryover: args.carryover }),
        };

        // Handle side bets update separately
        if (args.sideBetAmountCents !== undefined && 'sideBets' in currentSettings && currentSettings.sideBets) {
            updatedSettings.sideBets = {
                ...currentSettings.sideBets,
                amountCents: args.sideBetAmountCents,
            };
        }

        await ctx.db.patch(args.sessionId, {
            betSettings: updatedSettings,
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
        // initiatedBy is derived server-side from authenticated user, not trusted from client
        valueCents: v.number(),
        // Required for individual mode (round-robin), optional for head-to-head/teams
        pairingId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Auth check - require authenticated user
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Not authenticated");

        const clerkId = getClerkIdFromIdentity(identity);
        if (!clerkId) throw new Error("Missing Clerk ID");

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
            .unique();
        if (!user) throw new Error("User not found");

        const session = await ctx.db.get(args.sessionId);
        if (!session) throw new Error("Session not found");

        // Ownership check - must be host or participant
        const isHost = session.hostId === user._id;
        const isParticipant = session.participants.some(p => p.userId === user._id);
        if (!isHost && !isParticipant) {
            throw new Error("Only the host or participants can add presses");
        }

        if (session.gameType !== "nassau") {
            throw new Error("Presses only available for Nassau games");
        }

        // Validate pairingId is provided for individual mode
        if (session.gameMode === "individual" && !args.pairingId) {
            throw new Error("pairingId is required for individual mode (round-robin) presses. Please select which matchup to press.");
        }

        // Derive initiatedBy from authenticated user - don't trust client
        const participantMatch = session.participants.find(p => p.userId === user._id);
        if (!participantMatch) {
            throw new Error("You must be a participant to add a press");
        }
        const initiatedBy = participantMatch.playerId;

        // Canonicalize pairingId server-side for ALL modes
        let canonicalPairingId: string;
        if (session.gameMode === "individual" && args.pairingId) {
            // Individual mode: canonicalize from client-provided pairingId
            const parts = args.pairingId.split("_vs_");
            if (parts.length !== 2) {
                throw new Error("Invalid pairingId format");
            }
            const [idA, idB] = parts.sort();  // Sort alphabetically
            canonicalPairingId = `${idA}_vs_${idB}`;

            // Validate both players are in session.participants
            const participantIds = new Set(session.participants.map(p => p.playerId.toString()));
            if (!participantIds.has(idA) || !participantIds.has(idB)) {
                throw new Error("Invalid pairingId - players not in session");
            }
        } else {
            // Teams/head-to-head: compute pairingId from sideId (matches settlement)
            // Use sideId-based format: ${sideA.sideId}_vs_${sideB.sideId} (sorted for determinism)
            if (session.sides.length >= 2) {
                const [sideIdA, sideIdB] = [session.sides[0].sideId, session.sides[1].sideId].sort();
                canonicalPairingId = `${sideIdA}_vs_${sideIdB}`;
            } else {
                canonicalPairingId = "default";
            }
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
            initiatedBy,  // Derived from auth user, not client
            valueCents: args.valueCents,
            // Use canonicalized pairingId
            pairingId: canonicalPairingId,
        };

        const existingPresses = session.presses ?? [];

        // ═══════════════════════════════════════════════════════════════════
        // SIMPLE VALIDATION (without scores)
        // Eligibility is validated at settlement time when scores are available
        // ═══════════════════════════════════════════════════════════════════

        // Press config from session (same as settlement uses)
        const pressConfig = (session as any).pressConfig ?? DEFAULT_PRESS_CONFIG;
        if (!pressConfig.pressEnabled) {
            throw new Error("Presses are disabled for this session");
        }

        // 1. Duplicate check - can't add press at same startHole/segment/pairing
        const duplicateKey = `${canonicalPairingId}:${args.segment}:${args.startHole}`;
        const existingKeys = new Set(
            existingPresses.map((p: any) => {
                // Normalize existing press pairingIds the same way
                let existingPairingId = p.pairingId;
                if (session.gameMode !== "individual" && session.sides.length >= 2) {
                    const [sideIdA, sideIdB] = [session.sides[0].sideId, session.sides[1].sideId].sort();
                    existingPairingId = `${sideIdA}_vs_${sideIdB}`;
                }
                return `${existingPairingId}:${p.segment}:${p.startHole}`;
            })
        );
        if (existingKeys.has(duplicateKey)) {
            throw new Error("Press already exists at this hole");
        }

        // 2. Cap check - max presses per segment per pairing
        const segmentPresses = existingPresses.filter((p: any) => {
            let existingPairingId = p.pairingId;
            if (session.gameMode !== "individual" && session.sides.length >= 2) {
                const [sideIdA, sideIdB] = [session.sides[0].sideId, session.sides[1].sideId].sort();
                existingPairingId = `${sideIdA}_vs_${sideIdB}`;
            }
            return existingPairingId === canonicalPairingId && p.segment === args.segment;
        });
        if (segmentPresses.length >= pressConfig.maxPressesPerSegment) {
            throw new Error(`Maximum ${pressConfig.maxPressesPerSegment} presses per segment`);
        }

        // Note: "Must be down to press" eligibility is validated at settlement
        // when scores are available. If the press was invalid, settlement will
        // ignore it (no payout) so it won't affect the settlement.

        await ctx.db.patch(args.sessionId, {
            presses: [...existingPresses, newPress],
            updatedAt: Date.now(),
        });
    },
});

/**
 * Remove a press from a Nassau game (before settlement)
 */
export const removePress = mutation({
    args: {
        sessionId: v.id("gameSessions"),
        pressId: v.string(),
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

        const session = await ctx.db.get(args.sessionId);
        if (!session) throw new Error("Session not found");

        // Only allow removal before settlement
        if (session.status === "completed") {
            throw new Error("Cannot remove presses after settlement");
        }

        // Must be host or participant
        const isHost = session.hostId === user._id;
        const isParticipant = session.participants.some(p => p.userId === user._id);
        if (!isHost && !isParticipant) {
            throw new Error("Only the host or participants can remove presses");
        }

        const existingPresses = session.presses ?? [];
        const updatedPresses = existingPresses.filter(p => p.pressId !== args.pressId);

        if (updatedPresses.length === existingPresses.length) {
            throw new Error("Press not found");
        }

        await ctx.db.patch(args.sessionId, {
            presses: updatedPresses,
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
                    nassauAmounts: session.betSettings.nassauAmounts,
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

/**
 * Complete session with V2 settlement engine
 * Supports: round-robin pairings, presses, global netting, explanations
 */
export const completeWithSettlementV2 = mutation({
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
                settlement: {
                    settlementVersion: "v2" as const,
                    calculated: true,
                    rawTransactions: [],
                    nettedPayments: [],
                },
                updatedAt: Date.now(),
            });
            return { rawTransactions: [], nettedPayments: [] };
        }

        // Fetch the linked round
        const round = await ctx.db.get(session.linkedRoundId);
        if (!round) throw new Error("Linked round not found");

        // Get scores from the scores table
        const scores = await ctx.db
            .query("scores")
            .withIndex("by_round", (q) => q.eq("roundId", session.linkedRoundId!))
            .collect();

        // Build player scores - use null for missing holes to prevent fake winners
        const playerScores: PlayerScoreV2[] = scores.map((score) => {
            // Initialize all holes as null (not entered)
            const holeScores: (number | null)[] = new Array(18).fill(null);
            (score.holeData || []).forEach((hd: any) => {
                if (hd.hole >= 1 && hd.hole <= 18 && typeof hd.score === "number" && hd.score > 0) {
                    holeScores[hd.hole - 1] = hd.score;
                }
            });
            return {
                playerId: score.playerId,
                holeScores,
            };
        });

        // Build player names map
        const playerNames = new Map<Id<"players">, string>();
        for (const p of session.participants) {
            const player = await ctx.db.get(p.playerId);
            playerNames.set(p.playerId, player?.name ?? "Unknown");
        }

        // Get par by hole from course (if available)
        let parByHole: number[] | undefined;
        if (round.courseId) {
            const course = await ctx.db.get(round.courseId);
            if (course?.holes) {
                parByHole = course.holes.map((h: any) => h.par ?? 4);
            }
        }

        // Build settlement args with all required fields
        const settlementArgs: SettlementArgs = {
            roundId: session.linkedRoundId as string,
            playerScores,
            strokeAllocations: session.netStrokeAllocations.map(a => ({
                playerId: a.playerId,
                strokesByHole: a.strokesByHole,
            })),
            playerNames,
            holeSelection: session.holeSelection,
            gameMode: session.gameMode,
            sides: session.sides.map(s => ({
                sideId: s.sideId,
                name: s.name,
                // Sort playerIds for determinism
                playerIds: [...s.playerIds].sort((a, b) =>
                    (a as string).localeCompare(b as string)
                ),
            })),
            matchConfig: {
                teamScoring: (session as any).teamScoring ?? "bestBall",
            },
            // Wire manual presses from session.presses
            // Note: Schema stores {pressId, startHole, segment, initiatedBy, valueCents}
            // For head-to-head/teams (single pairing), we can infer pairingId
            // For individual mode (round-robin), pairingId must be in press or we skip
            manualPresses: (() => {
                const presses = session.presses ?? [];
                if (presses.length === 0) return [];

                // For head-to-head/teams with exactly 2 sides, there's one pairing
                if (session.gameMode !== "individual" && session.sides.length === 2) {
                    // Use canonical ordering (sorted sideIds) to match sidesToPairing
                    const [first, second] = session.sides[0].sideId < session.sides[1].sideId
                        ? [session.sides[0], session.sides[1]]
                        : [session.sides[1], session.sides[0]];
                    const pairingId = `${first.sideId}_vs_${second.sideId}`;

                    return presses.map((p: any) => ({
                        pairingId,
                        segment: p.segment,
                        startHole: p.startHole,
                        valueCents: p.valueCents,
                        initiatedBy: p.initiatedBy,
                    }));
                }

                // For individual mode with stored pairingId (future-proofing)
                return presses
                    .filter((p: any) => p.pairingId) // Only include presses with explicit pairingId
                    .map((p: any) => ({
                        pairingId: p.pairingId,
                        segment: p.segment,
                        startHole: p.startHole,
                        valueCents: p.valueCents,
                        initiatedBy: p.initiatedBy,
                    }));
            })(),
            // Wire side bets config
            sideBetsConfig: session.betSettings.sideBets ? {
                greenies: session.betSettings.sideBets.greenies ?? false,
                sandies: session.betSettings.sideBets.sandies ?? false,
                birdies: session.betSettings.sideBets.birdies ?? false,
                amountCents: session.betSettings.sideBets.amountCents ?? 0,
            } : undefined,
            // Wire tracked side bet counts from session.sideBetTracking
            trackedSideBetCounts: session.sideBetTracking,
            parByHole,
        };

        // Calculate settlement based on game type
        let result: SettlementResultV2;

        switch (session.gameType) {
            case "nassau": {
                const config: NassauConfig = {
                    frontCents: session.betSettings.nassauAmounts?.frontCents ?? session.betSettings.betPerUnitCents,
                    backCents: session.betSettings.nassauAmounts?.backCents ?? session.betSettings.betPerUnitCents,
                    overallCents: session.betSettings.nassauAmounts?.overallCents ?? session.betSettings.betPerUnitCents,
                    pressConfig: (session as any).pressConfig ?? DEFAULT_PRESS_CONFIG,
                };
                result = calculateSettlementV2("nassau", settlementArgs, config);
                break;
            }
            case "match_play": {
                const config: MatchPlayConfig = {
                    betPerUnitCents: session.betSettings.betPerUnitCents,
                    betUnit: session.betSettings.betUnit === "hole" ? "hole" : "match",
                };
                result = calculateSettlementV2("match_play", settlementArgs, config);
                break;
            }
            case "stroke_play": {
                const config: StrokePlayConfig = {
                    betPerUnitCents: session.betSettings.betPerUnitCents,
                    payoutMode: session.payoutMode === "pot" ? "pot" : "war",
                    tieBreakMethod: "split",
                };
                result = calculateSettlementV2("stroke_play", settlementArgs, config);
                break;
            }
            case "skins": {
                const config: SkinsConfig = {
                    skinValueCents: session.betSettings.betPerUnitCents,
                    carryover: session.betSettings.carryover ?? true,
                    finalCarryoverMode: "no_winner",
                };
                result = calculateSettlementV2("skins", settlementArgs, config);
                break;
            }
            default:
                throw new Error(`Unknown game type: ${session.gameType}`);
        }


        // Persist V2 settlement
        await ctx.db.patch(args.sessionId, {
            status: "completed",
            settlement: {
                settlementVersion: "v2" as const,
                calculated: true,
                calculatedAt: Date.now(),
                configSnapshot: {
                    gameType: session.gameType,
                    gameMode: session.gameMode,
                    holeSelection: session.holeSelection,
                    betSettings: session.betSettings,
                },
                rawTransactions: result.rawTransactions.map(tx => ({
                    id: tx.id,
                    fromPlayerId: tx.fromPlayerId,
                    toPlayerId: tx.toPlayerId,
                    amountCents: tx.amountCents,
                    reason: tx.reason,
                    explanation: tx.explanation,
                    gameType: tx.gameType,
                    segment: tx.segment,
                    pairingId: tx.pairingId,
                    pressId: tx.pressId,
                })),
                nettedPayments: result.nettedPayments.map(p => ({
                    fromPlayerId: p.fromPlayerId,
                    toPlayerId: p.toPlayerId,
                    amountCents: p.amountCents,
                    breakdown: p.breakdown,
                    allocatedContributions: p.allocatedContributions,
                })),
                matchResults: result.matchResults,
            },
            updatedAt: Date.now(),
        });

        return {
            rawTransactions: result.rawTransactions,
            nettedPayments: result.nettedPayments,
        };
    },
});
