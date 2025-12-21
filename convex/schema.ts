import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    // Canonical identifier for linking to Clerk; required for all users.
    clerkId: v.string(),
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    avatarUrl: v.optional(v.string()),
    gender: v.optional(v.string()),
    // Marks whether the user has completed the in-app profile
    // setup flow (name + optional photo). Used to avoid showing
    // the setup modal on every app launch.
    profileSetupComplete: v.optional(v.boolean()),
    handicap: v.optional(v.number()),
    handicapIndexHistory: v.array(
      v.object({
        date: v.string(),
        value: v.number(),
        isSynthesized: v.optional(v.boolean()),
      })
    ),
    isPro: v.boolean(),
    scansRemaining: v.number(),
    preferredAiModel: v.optional(v.union(
      v.literal("gemini-3-pro-preview"),
      v.literal("gemini-3-flash-preview")
    )),
    stats: v.optional(
      v.object({
        roundsPlayed: v.number(),
        avgScore: v.number(),
        blowUpHolesPerRound: v.number(),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_clerkId", ["clerkId"]),

  players: defineTable({
    ownerId: v.id("users"),
    userId: v.optional(v.id("users")),
    name: v.string(),
    handicap: v.optional(v.number()),
    isSelf: v.boolean(),
    gender: v.optional(v.string()),
    // Alternative names/nicknames for scorecard matching
    aliases: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_user", ["userId"]),

  courses: defineTable({
    externalId: v.string(),
    name: v.string(),
    location: v.string(),
    slope: v.optional(v.number()),
    rating: v.optional(v.number()),
    teeSets: v.optional(
      v.array(
        v.object({
          name: v.string(),
          rating: v.number(),
          slope: v.number(),
          gender: v.optional(v.string()),
          frontRating: v.optional(v.number()),
          frontSlope: v.optional(v.number()),
          backRating: v.optional(v.number()),
          backSlope: v.optional(v.number()),
          holes: v.optional(
            v.array(
              v.object({
                number: v.number(),
                par: v.number(),
                hcp: v.number(),
                yardage: v.optional(v.number()),
              })
            )
          ),
        })
      )
    ),
    holes: v.array(
      v.object({
        number: v.number(),
        par: v.number(),
        hcp: v.number(),
        yardage: v.optional(v.number()),
      })
    ),
    imageUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_name", ["name"]),

  rounds: defineTable({
    hostId: v.id("users"),
    courseId: v.id("courses"),
    date: v.string(),
    weather: v.optional(v.string()),
    holeCount: v.union(v.literal(9), v.literal(18)),
    scanJobId: v.optional(v.id("scanJobs")),
    isSynthesized: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_host", ["hostId"])
    .index("by_course", ["courseId"]),

  scores: defineTable({
    roundId: v.id("rounds"),
    playerId: v.id("players"),
    courseId: v.id("courses"),
    grossScore: v.number(),
    netScore: v.optional(v.number()),
    handicapUsed: v.optional(v.number()),
    // Denormalized from rounds (holeCount) and tee selection
    holeCount: v.optional(v.union(v.literal(9), v.literal(18))),
    teeName: v.optional(v.string()),
    teeGender: v.optional(v.string()),
    // Scandicap engine inputs + result
    courseRatingUsed: v.optional(v.number()),
    courseSlopeUsed: v.optional(v.number()),
    handicapDifferential: v.optional(v.number()),
    isSynthesized: v.optional(v.boolean()),
    blowUpHoles: v.number(),
    par3Score: v.number(),
    par4Score: v.number(),
    par5Score: v.number(),
    holeData: v.array(
      v.object({
        hole: v.number(),
        score: v.number(),
        par: v.number(),
        putts: v.optional(v.number()),
        fairwayHit: v.optional(v.boolean()),
        gir: v.optional(v.boolean()),
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_player", ["playerId"])
    .index("by_round", ["roundId"]),

  scanJobs: defineTable({
    userId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("complete"),
      v.literal("failed")
    ),
    progress: v.number(),
    message: v.optional(v.string()),
    imageCount: v.number(),
    thumbnailUrl: v.optional(v.string()),
    rawResult: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user_status", ["userId", "status"]),

  // ═══════════════════════════════════════════════════════════════════════════
  // GAME SESSIONS - Pre-round betting and game configuration
  // ═══════════════════════════════════════════════════════════════════════════
  gameSessions: defineTable({
    hostId: v.id("users"),
    courseId: v.id("courses"),
    startAt: v.number(),

    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled")
    ),

    holeSelection: v.union(
      v.literal("18"),
      v.literal("front_9"),
      v.literal("back_9")
    ),

    // V1: 4 game types
    gameType: v.union(
      v.literal("stroke_play"),
      v.literal("match_play"),
      v.literal("nassau"),
      v.literal("skins")
    ),

    // Structure of competition
    gameMode: v.union(
      v.literal("individual"),
      v.literal("head_to_head"),
      v.literal("teams")
    ),

    // How winnings are distributed
    payoutMode: v.union(
      v.literal("war"),
      v.literal("pot")
    ),

    // Only for head_to_head/teams (default: usga)
    strokeFormat: v.optional(
      v.union(v.literal("usga"), v.literal("modified"))
    ),

    // Participants from existing players table
    participants: v.array(
      v.object({
        playerId: v.id("players"),
        handicapIndex: v.number(),
        teeName: v.optional(v.string()),
        teeGender: v.optional(v.string()),
        courseHandicap: v.number(),
      })
    ),

    // Teams/matchups
    sides: v.array(
      v.object({
        sideId: v.string(),
        name: v.optional(v.string()),
        playerIds: v.array(v.id("players")),
      })
    ),

    // NET stroke allocation (always 18 elements, index = hole-1)
    netStrokeAllocations: v.array(
      v.object({
        playerId: v.id("players"),
        strokesByHole: v.array(v.number()),
      })
    ),

    // Bet settings (money in CENTS)
    betSettings: v.optional(
      v.object({
        enabled: v.boolean(),
        betPerUnitCents: v.number(),
        carryover: v.optional(v.boolean()),
        pressEnabled: v.optional(v.boolean()),
        pressThreshold: v.optional(v.number()),
      })
    ),

    // Nassau presses
    presses: v.optional(
      v.array(
        v.object({
          pressId: v.string(),
          startHole: v.number(),
          segment: v.union(v.literal("front"), v.literal("back")),
          initiatedBy: v.id("players"),
          valueCents: v.number(),
        })
      )
    ),

    // Fingerprint for scan matching
    sessionFingerprint: v.object({
      courseExternalId: v.string(),
      playerNames: v.array(v.string()),
      startAt: v.number(),
    }),

    linkedRoundId: v.optional(v.id("rounds")),

    // Settlement (money in CENTS)
    settlement: v.optional(
      v.object({
        calculated: v.boolean(),
        transactions: v.array(
          v.object({
            fromPlayerId: v.id("players"),
            toPlayerId: v.id("players"),
            amountCents: v.number(),
            reason: v.string(),
          })
        ),
      })
    ),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_host", ["hostId"])
    .index("by_host_status", ["hostId", "status"]),
});
