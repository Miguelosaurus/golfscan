import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    // Canonical identifier for linking to Clerk; stable across
    // auth flows and webhooks.
    clerkId: v.optional(v.string()),
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
});
