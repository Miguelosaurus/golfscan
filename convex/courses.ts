import { mutation, query, action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

const truncate = (s?: string | null, len = 32) =>
  s ? (s.length > len ? `${s.slice(0, len)}…` : s) : undefined;

export const upsert = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("courses")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .unique();

    console.log("[courses.upsert] start", {
      externalId: args.externalId,
      incomingImage: truncate(args.imageUrl),
      hasExisting: !!existing,
    });

    if (existing) {
      const patch: any = {
        name: args.name,
        location: args.location,
        slope: args.slope,
        rating: args.rating,
        teeSets: args.teeSets,
        holes: args.holes,
        updatedAt: now,
      };
      // Only update imageUrl if provided and NOT a base64 data URL; otherwise keep existing.
      if (args.imageUrl !== undefined && !args.imageUrl.startsWith("data:")) {
        patch.imageUrl = args.imageUrl;
      }
      console.log("[courses.upsert] patch existing", {
        courseId: existing._id,
        appliedImage: truncate(patch.imageUrl ?? existing.imageUrl),
      });
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    const courseId = await ctx.db.insert("courses", {
      externalId: args.externalId,
      name: args.name,
      location: args.location,
      slope: args.slope,
      rating: args.rating,
      teeSets: args.teeSets,
      holes: args.holes,
      imageUrl: args.imageUrl?.startsWith("data:") ? undefined : args.imageUrl,
      createdAt: now,
      updatedAt: now,
    });

    console.log("[courses.upsert] inserted", {
      courseId,
      externalId: args.externalId,
      appliedImage: truncate(args.imageUrl),
    });

    return courseId;
  },
});

export const getById = query({
  args: { courseId: v.id("courses") },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) return null;

    let imageUrl = course.imageUrl;
    if ((course as any).imageStorageId) {
      const storageUrl = await ctx.storage.getUrl((course as any).imageStorageId);
      if (storageUrl) imageUrl = storageUrl;
    }

    return { ...course, imageUrl };
  },
});

export const getByExternalId = query({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    const course = await ctx.db
      .query("courses")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .unique();

    if (!course) return null;

    let imageUrl = course.imageUrl;
    if ((course as any).imageStorageId) {
      const storageUrl = await ctx.storage.getUrl((course as any).imageStorageId);
      if (storageUrl) imageUrl = storageUrl;
    }

    return { ...course, imageUrl };
  },
});

export const searchByName = query({
  args: {
    term: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const term = args.term.trim();
    if (!term || term.length < 2) return [];

    const limit = args.limit ?? 20;

    // Use Convex search index for efficient full-text search (avoids full table scan).
    // Note: Search index uses tokenization, not substring matching.
    // The UI falls back to paid API when results are insufficient.
    const results = await ctx.db
      .query("courses")
      .withSearchIndex("search_name", (q) => q.search("name", term))
      .take(limit);

    // Resolve image URL on-demand when Storage is present (URLs can expire).
    return await Promise.all(
      results.map(async (c) => {
        let imageUrl = c.imageUrl;
        if ((c as any).imageStorageId) {
          const storageUrl = await ctx.storage.getUrl((c as any).imageStorageId);
          if (storageUrl) imageUrl = storageUrl;
        }
        return { ...c, imageUrl };
      })
    );
  },
});

export const searchByNameAction = action({
  args: {
    term: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any[]> => {
    return await ctx.runQuery(api.courses.searchByName, args);
  },
});

// Action wrapper for imperative calls (e.g., in save round flow)
export const getByExternalIdAction = action({
  args: { externalId: v.string() },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runQuery(api.courses.getByExternalId, args);
  },
});

export const setImageUrl = mutation({
  args: {
    courseId: v.id("courses"),
    imageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.courseId, {
      imageUrl: args.imageUrl,
      updatedAt: Date.now(),
    });
  },
});

export const setImageStorageId = mutation({
  args: {
    courseId: v.id("courses"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const course = await ctx.db.get(args.courseId);
    if (!course) return;

    const patch: any = {
      imageStorageId: args.storageId,
      updatedAt: Date.now(),
    };

    // Clear legacy base64 blobs to reclaim document size (the Storage ID is the source of truth).
    if (typeof course.imageUrl === "string" && course.imageUrl.startsWith("data:")) {
      patch.imageUrl = undefined;
    }

    await ctx.db.patch(args.courseId, patch);
  },
});

/**
 * Update course location from Google Places data.
 * Used when a course has missing/invalid location and we resolve it from Places API.
 */
export const setLocation = mutation({
  args: {
    courseId: v.id("courses"),
    location: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.courseId, {
      location: args.location,
      updatedAt: Date.now(),
    });
  },
});
