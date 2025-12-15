import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { DEFAULT_COURSE_IMAGE } from "../constants/images";
import { Buffer } from "buffer";

const isDefaultImage = (url?: string | null) =>
  !!url && url.includes("photo-1587174486073-ae5e5cff23aa");

const GOOGLE_PLACES_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const FIELD_MASK = "places.id,places.displayName,places.photos";

export const getOrCreate = action({
  args: {
    courseId: v.id("courses"),
    courseName: v.string(),
    locationText: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // 1) Check Convex courses table first for a cached imageUrl
    const courseDoc = await ctx.runQuery(api.courses.getById, {
      courseId: args.courseId,
    });
    const hasRealImage =
      courseDoc?.imageUrl &&
      courseDoc.imageUrl !== DEFAULT_COURSE_IMAGE &&
      !isDefaultImage(courseDoc.imageUrl);
    if (courseDoc && hasRealImage) {
      console.log("[courseImages] cache hit", { courseId: args.courseId });
      return { url: courseDoc.imageUrl, cached: true };
    }

    const googleKey = process.env.GOOGLE_PLACES_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!googleKey) {
      // No key available; return null so the client can use fallback image.
      console.warn("[courseImages] missing GOOGLE_PLACES_API_KEY");
      return { url: null, cached: false };
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

    const tryTextSearch = async (query: string) => {
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
        return null;
      }
      const data = (await res.json()) as any;
      const photoName = data?.places?.[0]?.photos?.[0]?.name as string | undefined;
      if (photoName) return photoName;
      return null;
    };

    const tryNearby = async () => {
      if (args.latitude === undefined || args.longitude === undefined) return null;
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
        return null;
      }
      const data = (await res.json()) as any;
      const photoName = data?.places?.find((p: any) => p?.photos?.[0]?.name)?.photos?.[0]?.name as
        | string
        | undefined;
      return photoName ?? null;
    };

    let photoName: string | null = null;
    for (const q of textQueries) {
      photoName = await tryTextSearch(q);
      if (photoName) break;
    }

    if (!photoName) {
      photoName = await tryNearby();
    }

    if (!photoName) {
      console.warn("[courseImages] no photo found", { courseId: args.courseId, courseName: args.courseName });
      return { url: null, cached: false };
    }

    const photoUrl = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=800&key=${googleKey}`;
    console.log("[courseImages] fetching new image", { courseId: args.courseId });

    // Fetch the photo bytes and persist as a data URL so the client
    // never needs to re-fetch from Google (avoids RN Image quirks on remote URLs).
    try {
      const resPhoto = await fetch(photoUrl);
      if (!resPhoto.ok) {
        const text = await resPhoto.text().catch(() => "");
        console.warn("[courseImages] photo fetch failed", { status: resPhoto.status });
        return { url: null, cached: false };
      }
      const arrayBuffer = await resPhoto.arrayBuffer();
      const mime = resPhoto.headers.get("content-type") || "image/jpeg";
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const dataUrl = `data:${mime};base64,${base64}`;

      // 3) Persist in Convex so future calls don't hit Google again
      await ctx.runMutation(api.courses.setImageUrl, {
        courseId: args.courseId,
        imageUrl: dataUrl,
      });

      return { url: dataUrl, cached: false };
    } catch (error) {
      console.warn("[courseImages] photo fetch exception", { error });
      return { url: null, cached: false };
    }
  },
});
