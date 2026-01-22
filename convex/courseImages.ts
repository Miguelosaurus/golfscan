import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { api } from "./_generated/api";
import { DEFAULT_COURSE_IMAGE } from "../constants/images";
import { Buffer } from "buffer";

const isDefaultImage = (url?: string | null) =>
  !!url && url.includes("photo-1587174486073-ae5e5cff23aa");

const GOOGLE_PLACES_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
// Include addressComponents to extract city/state for courses with missing location
const FIELD_MASK = "places.id,places.displayName,places.photos,places.addressComponents";

/**
 * Extract city and state from Google Places addressComponents array.
 * Returns format like "San Antonio, TX" or null if not found.
 */
const extractCityState = (addressComponents: any[] | undefined): string | null => {
  if (!Array.isArray(addressComponents) || addressComponents.length === 0) {
    return null;
  }

  let city: string | null = null;
  let state: string | null = null;

  for (const component of addressComponents) {
    const types = component?.types ?? [];
    // City can be locality or sublocality
    if (types.includes("locality") && !city) {
      city = component.longText || component.shortText;
    }
    // State/province is administrative_area_level_1
    if (types.includes("administrative_area_level_1")) {
      // Use shortText for state abbreviation (e.g., "TX" instead of "Texas")
      state = component.shortText || component.longText;
    }
  }

  if (city && state) {
    return `${city}, ${state}`;
  } else if (city) {
    return city;
  } else if (state) {
    return state;
  }
  return null;
};

export const getOrCreate = action({
  args: {
    courseId: v.optional(v.id("courses")),
    courseName: v.string(),
    locationText: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    needsLocation: v.optional(v.boolean()), // Hint to force location fetch even if image is cached
  },
  handler: async (ctx, args): Promise<{ url: string | null; cached: boolean; location: string | null }> => {
    // 1) Check Convex courses table first for a cached imageUrl
    const courseDoc: any = args.courseId
      ? await ctx.runQuery(api.courses.getById, { courseId: args.courseId as any })
      : null;
    // Check for cached image: prefer Storage, fallback to legacy imageUrl
    const hasStorageImage = !!courseDoc?.imageStorageId;
    const hasLegacyImage =
      !!courseDoc?.imageUrl &&
      courseDoc.imageUrl !== DEFAULT_COURSE_IMAGE &&
      !isDefaultImage(courseDoc.imageUrl);
    const hasRealImage = hasStorageImage || hasLegacyImage;

    // Check if course location is missing/invalid (needs resolution)
    const locationMissing = !courseDoc?.location ||
      courseDoc.location === 'Unknown location' ||
      courseDoc.location.includes('undefined') ||
      courseDoc.location.includes('Unknown');

    // If we have image AND location, return cache hit
    if (courseDoc && hasRealImage && !locationMissing && !args.needsLocation) {
      let imageUrl: string | null = null;

      if (hasStorageImage) {
        // Resolve Storage URL on-demand (handle null)
        imageUrl = await ctx.storage.getUrl(courseDoc.imageStorageId);
        if (!imageUrl && hasLegacyImage) {
          imageUrl = courseDoc.imageUrl;
        }
      } else {
        imageUrl = courseDoc.imageUrl;
      }

      if (imageUrl) {
        console.log("[courseImages] cache hit", { courseId: args.courseId, hasStorageImage });
        return { url: imageUrl, cached: true, location: courseDoc.location };
      }
    }

    // Lazy migration: if imageUrl is base64 but no storageId, migrate it
    if (courseDoc?.imageUrl?.startsWith("data:") && !courseDoc.imageStorageId && args.courseId) {
      try {
        console.log("[courseImages] lazy migrating base64 to Storage", { courseId: args.courseId });
        const base64Data = courseDoc.imageUrl.split(",")[1];
        const mimeMatch = courseDoc.imageUrl.match(/data:([^;]+);/);
        const mime = mimeMatch?.[1] || "image/jpeg";
        const buffer = Buffer.from(base64Data, "base64");
        const blob = new Blob([buffer], { type: mime });

        // Store in Convex Storage
        // Note: Accept races (multiple calls migrating same course) - harmless, minor storage leak
        const storageId = await ctx.storage.store(blob);
        await ctx.runMutation(api.courses.setImageStorageId, {
          courseId: args.courseId,
          storageId,
        });

        const freshUrl = await ctx.storage.getUrl(storageId);
        console.log("[courseImages] lazy migration complete", { courseId: args.courseId });
        if (!freshUrl) {
          return { url: courseDoc.imageUrl, cached: true, location: courseDoc.location };
        }
        return { url: freshUrl, cached: true, location: courseDoc.location };
      } catch (e) {
        console.warn("[courseImages] lazy migration failed", e);
        return { url: courseDoc.imageUrl, cached: true, location: courseDoc.location };
      }
    }

    const googleKey = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!googleKey) {
      // No key available; return null so the client can use fallback image.
      console.warn("[courseImages] missing GOOGLE_PLACES_API_KEY");
      if (!courseDoc || !hasRealImage) {
        return { url: null, cached: false, location: null };
      }

      let imageUrl: string | null = null;
      if (hasStorageImage) {
        imageUrl = await ctx.storage.getUrl(courseDoc.imageStorageId);
      }
      if (!imageUrl && hasLegacyImage) {
        imageUrl = courseDoc.imageUrl;
      }

      return { url: imageUrl, cached: !!imageUrl, location: null };
    }

    // Check rate limit for Google Places API (10/day) - only counted for uncached courses
    // Wrap in try-catch to handle unauthenticated users (onboarding guest mode)
    let rateLimitAllowed = true;
    try {
      const rateLimitResult = await ctx.runMutation(api.users.checkRateLimit, {
        service: "googlePlaces",
      });
      rateLimitAllowed = rateLimitResult.allowed;
    } catch (e) {
      // Not authenticated (guest mode during onboarding) - allow without rate limiting
      console.log("[courseImages] skipping rate limit check for unauthenticated user");
    }

    if (!rateLimitAllowed) {
      console.warn("[courseImages] rate limit reached, returning cached or null");
      // Don't throw error, just return cached/null result gracefully
      if (!courseDoc || !hasRealImage) {
        return { url: null, cached: false, location: courseDoc?.location ?? null };
      }

      let imageUrl: string | null = null;
      if (hasStorageImage) {
        imageUrl = await ctx.storage.getUrl(courseDoc.imageStorageId);
      }
      if (!imageUrl && hasLegacyImage) {
        imageUrl = courseDoc.imageUrl;
      }

      return { url: imageUrl, cached: !!imageUrl, location: courseDoc?.location ?? null };
    }

    const headers = {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": googleKey,
      "X-Goog-Field-Mask": FIELD_MASK,
    };

    const textQueries = Array.from(
      new Set(
        [
          args.courseName,
          `${args.courseName} golf course`,
          args.locationText ? `${args.courseName} ${args.locationText}` : null,
          args.locationText ? `${args.courseName.split("-")[0]?.trim() ?? args.courseName} ${args.locationText}` : null,
        ].filter(Boolean) as string[]
      )
    );

    const buildLocationBias = () => {
      if (args.latitude === undefined || args.longitude === undefined) return undefined;
      return {
        circle: {
          center: { latitude: args.latitude, longitude: args.longitude },
          radius: 50000,
        },
      };
    };

    const tryTextSearch = async (query: string): Promise<{ photoName: string | null; location: string | null }> => {
      const url = new URL(GOOGLE_PLACES_TEXT_URL);
      url.searchParams.set("fields", FIELD_MASK);
      const body: any = {
        textQuery: query,
        languageCode: "en",
      };
      const bias = buildLocationBias();
      if (bias) body.locationBias = bias;

      const res = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn("[courseImages] text search failed", { status: res.status });
        return { photoName: null, location: null };
      }
      const data = (await res.json()) as any;
      const place = data?.places?.[0];
      const photoName = place?.photos?.[0]?.name as string | undefined;
      const location = extractCityState(place?.addressComponents);
      return { photoName: photoName ?? null, location };
    };

    const tryNearby = async (): Promise<{ photoName: string | null; location: string | null }> => {
      if (args.latitude === undefined || args.longitude === undefined) {
        return { photoName: null, location: null };
      }
      const url = new URL(GOOGLE_PLACES_NEARBY_URL);
      url.searchParams.set("fields", FIELD_MASK);
      const body: any = {
        locationRestriction: {
          circle: {
            center: { latitude: args.latitude, longitude: args.longitude },
            radius: 20000,
          },
        },
        includedTypes: ["golf_course"],
        languageCode: "en",
        maxResultCount: 10,
      };
      const res = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn("[courseImages] nearby search failed", { status: res.status });
        return { photoName: null, location: null };
      }
      const data = (await res.json()) as any;
      const place = data?.places?.find((p: any) => p?.photos?.[0]?.name);
      const photoName = place?.photos?.[0]?.name as string | undefined;
      const location = extractCityState(place?.addressComponents);
      return { photoName: photoName ?? null, location };
    };

    let photoName: string | null = null;
    let resolvedLocation: string | null = null;

    for (const q of textQueries) {
      const result = await tryTextSearch(q);
      if (result.photoName) {
        photoName = result.photoName;
        resolvedLocation = result.location;
        break;
      }
      // Even if no photo, capture location if we got it
      if (result.location && !resolvedLocation) {
        resolvedLocation = result.location;
      }
    }

    if (!photoName) {
      const nearbyResult = await tryNearby();
      photoName = nearbyResult.photoName;
      if (nearbyResult.location && !resolvedLocation) {
        resolvedLocation = nearbyResult.location;
      }
    }

    if (!photoName) {
      console.warn("[courseImages] no photo found", { courseId: args.courseId, courseName: args.courseName });
      // Even if no photo, persist and return location if we found one
      if (resolvedLocation && args.courseId) {
        await ctx.runMutation(api.courses.setLocation, {
          courseId: args.courseId as any,
          location: resolvedLocation,
        });
      }
      if (!courseDoc || !hasRealImage) {
        return { url: null, cached: false, location: resolvedLocation };
      }

      let imageUrl: string | null = null;
      if (hasStorageImage) {
        imageUrl = await ctx.storage.getUrl(courseDoc.imageStorageId);
      }
      if (!imageUrl && hasLegacyImage) {
        imageUrl = courseDoc.imageUrl;
      }

      return { url: imageUrl, cached: !!imageUrl, location: resolvedLocation };
    }

    const photoUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=600&key=${googleKey}`;
    console.log("[courseImages] fetching new image", { courseId: args.courseId, resolvedLocation });

    // Fetch the photo bytes and store in Convex Storage (NOT as base64 in the document).
    try {
      const resPhoto = await fetch(photoUrl);
      if (!resPhoto.ok) {
        const text = await resPhoto.text().catch(() => "");
        console.warn("[courseImages] photo fetch failed", { status: resPhoto.status });
        return { url: null, cached: false, location: resolvedLocation };
      }
      const arrayBuffer = await resPhoto.arrayBuffer();
      const mime = resPhoto.headers.get("content-type") || "image/jpeg";
      const blob = new Blob([arrayBuffer], { type: mime });

      // 3) Store in Convex Storage and save the ID (not URL - URLs expire)
      const storageId = await ctx.storage.store(blob);
      if (args.courseId) {
        await ctx.runMutation(api.courses.setImageStorageId, {
          courseId: args.courseId,
          storageId,
        });
      }

      // 4) Persist resolved location if we found one
      if (resolvedLocation && args.courseId) {
        await ctx.runMutation(api.courses.setLocation, {
          courseId: args.courseId as any,
          location: resolvedLocation,
        });
      }

      // Get fresh URL to return to client
      const freshUrl = await ctx.storage.getUrl(storageId);
      return { url: freshUrl, cached: false, location: resolvedLocation };
    } catch (error) {
      console.warn("[courseImages] photo fetch exception", { error });
      return { url: null, cached: false, location: resolvedLocation };
    }
  },
});
