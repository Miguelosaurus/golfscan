import { action, mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { GoogleGenAI, MediaResolution, createPartFromUri } from "@google/genai";
import { api } from "./_generated/api";

const scanInput = v.object({
  storageIds: v.array(v.id("_storage")),
  thumbnailUrl: v.optional(v.string()),
});

const SCORECARD_PROMPT = `
Extract scorecard data from these images and return JSON only (no prose).

Rules:
- Use the exact response schema (courseName/courseNameConfidence/date/dateConfidence/players with scores/holes).
- For scores: Only use null if absolutely no marks visible; otherwise best reasonable guess.
- Course names: include only if confidence > 0.7, else null.
- Dates: YYYY-MM-DD format or null.
- Extract raw data only—no calculations; process images sequentially.
- Confidence scores 0.0-1.0 and honest; <0.65 flagged for review.
`;

// Structured output schema for Gemini 3
const SCORECARD_SCHEMA = {
  type: "object",
  properties: {
    courseName: { type: "string", nullable: true },
    courseNameConfidence: { type: "number" },
    date: { type: "string", nullable: true },
    dateConfidence: { type: "number" },
    players: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          nameConfidence: { type: "number" },
          scores: {
            type: "array",
            items: {
              type: "object",
              properties: {
                hole: { type: "integer" },
                score: { type: "integer" },
                confidence: { type: "number" },
              },
              required: ["hole", "score"],
            },
          },
        },
        required: ["name", "scores"],
      },
    },
    holes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          hole: { type: "integer" },
          par: { type: "integer" },
          parConfidence: { type: "number" },
        },
        required: ["hole", "par"],
      },
    },
  },
  required: ["players", "holes"],
};

const calculateOverallConfidence = (data: any): number => {
  const confidences: number[] = [];
  if (data.courseNameConfidence !== undefined) confidences.push(data.courseNameConfidence);
  if (data.dateConfidence !== undefined) confidences.push(data.dateConfidence);
  data.players?.forEach((p: any) => {
    if (p.nameConfidence !== undefined) confidences.push(p.nameConfidence);
    p.scores?.forEach((s: any) => {
      if (s.confidence !== undefined) confidences.push(s.confidence);
    });
  });
  data.holes?.forEach((h: any) => {
    if (h.parConfidence !== undefined) confidences.push(h.parConfidence);
  });
  return confidences.length
    ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
    : 0;
};

export const processScan = action({
  args: scanInput,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.runQuery(api.users.getProfile, {});

    // Allow overriding limits in dev by setting ALLOW_FREE_SCANS=true in Convex env.
    const allowFreeScans = process.env.ALLOW_FREE_SCANS === "true";

    if (!user) {
      throw new Error("User not found; call syncUser first");
    }

    if (!allowFreeScans && !user.isPro && user.scansRemaining <= 0) {
      throw new ConvexError("LIMIT_REACHED");
    }

    const now = Date.now();

    let scansRemaining = user.scansRemaining;
    if (!allowFreeScans && !user.isPro) {
      scansRemaining = Math.max(0, user.scansRemaining - 1);
      await ctx.runMutation(api.scorecard.setUserScansRemaining, {
        userId: user._id,
        scansRemaining,
        updatedAt: now,
      });
    }

    const jobId = await ctx.runMutation(api.scorecard.createScanJob, {
      job: {
        userId: user._id,
        status: "processing",
        progress: 10,
        message: "Starting scan...",
        imageCount: args.storageIds.length,
        thumbnailUrl: args.thumbnailUrl ?? undefined,
        rawResult: undefined,
        createdAt: now,
        updatedAt: now,
      },
    });

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(api.scorecard.updateScanJob, {
        jobId,
        patch: {
          status: "failed",
          message: "Missing Google API key",
          updatedAt: Date.now(),
        },
      });
      throw new Error("GOOGLE_API_KEY not configured");
    }

    try {
      const genAI = new GoogleGenAI({ apiKey });

      // Fetch images from Convex storage and upload to Google File API
      const uploadedFiles: Array<{ uri: string; mimeType: string }> = [];

      for (let i = 0; i < args.storageIds.length; i++) {
        const storageId = args.storageIds[i];

        // Get the URL for this storage item
        const storageUrl = await ctx.storage.getUrl(storageId);
        if (!storageUrl) {
          throw new Error(`Failed to get URL for storage ID: ${storageId}`);
        }

        // Fetch the image blob from Convex storage
        const response = await fetch(storageUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch image from storage: ${response.statusText}`);
        }

        // Upload to Google File API
        const blob = await response.blob();
        const filename = `scorecard-${Date.now()}-${i}.jpg`;

        const uploadResult = await genAI.files.upload({
          file: blob,
          config: {
            mimeType: "image/jpeg",
            displayName: filename,
          },
        });

        if (!uploadResult.uri) {
          throw new Error("Failed to upload image to Google File API");
        }

        uploadedFiles.push({
          uri: uploadResult.uri,
          mimeType: uploadResult.mimeType || "image/jpeg",
        });

        // Delete from Convex storage - we don't need it anymore
        await ctx.storage.delete(storageId);
      }

      // Build parts with prompt + file references (not inline base64)
      const parts: any[] = [
        { text: SCORECARD_PROMPT },
        ...uploadedFiles.map((f) => createPartFromUri(f.uri, f.mimeType)),
      ];

      await ctx.runMutation(api.scorecard.updateScanJob, {
        jobId,
        patch: {
          status: "processing" as const,
          progress: 25,
          message: "Sending to AI…",
          updatedAt: Date.now(),
        },
      });

      const aiResponse = await genAI.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: [{ role: "user", parts }],
        config: {
          temperature: 1,
          maxOutputTokens: 5000,
          responseMimeType: "application/json",
          responseSchema: SCORECARD_SCHEMA as any,
          thinkingConfig: { thinkingLevel: "low" },
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
        } as any,
      });

      // Clean up: delete uploaded files from Google (they're only stored 48h anyway)
      for (const f of uploadedFiles) {
        try {
          const fileName = f.uri.split("/").pop();
          if (fileName) {
            await genAI.files.delete({ name: `files/${fileName}` });
          }
        } catch {
          // Ignore cleanup errors
        }
      }

      const parsedFromSdk = (aiResponse as any)?.parsed;

      if (!aiResponse?.candidates?.length) {
        console.error("[SCAN] No candidates returned");
        console.error("[SCAN] promptFeedback:", JSON.stringify((aiResponse as any)?.promptFeedback ?? null));
        console.error("[SCAN] error field:", JSON.stringify((aiResponse as any)?.error ?? null));
        throw new Error("No response content from Gemini");
      }

      const rawContent = aiResponse.candidates[0]?.content?.parts
        ?.map((p: any) => p.text ?? "")
        .join("") ?? null;
      if (!rawContent) {
        console.error("[SCAN] Empty parts in first candidate:", JSON.stringify(aiResponse.candidates[0] ?? null));
        throw new Error("No response content from Gemini");
      }

      const tryParseJson = (text: string) => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      };

      let parsed: any =
        parsedFromSdk ||
        tryParseJson(rawContent) ||
        (() => {
          const match = rawContent.match(/```(?:json)?\n([\s\S]*?)\n```/);
          if (match) return tryParseJson(match[1]);
          const firstBrace = rawContent.indexOf("{");
          const lastBrace = rawContent.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            return tryParseJson(rawContent.slice(firstBrace, lastBrace + 1));
          }
          return null;
        })();

      if (!parsed) {
        const partsJson = (() => {
          try {
            return JSON.stringify(aiResponse.candidates?.[0]?.content?.parts ?? null);
          } catch {
            return "[unstringifiable parts]";
          }
        })();
        console.error("[SCAN] Gemini raw length:", rawContent.length);
        console.error("[SCAN] Gemini raw full:", rawContent);
        console.error("[SCAN] Gemini parts:", partsJson);
        throw new Error("Failed to parse JSON from Gemini response");
      }

      // Force date to today; we don't rely on OCR for dates
      const todayIso = new Date().toISOString().split("T")[0];
      parsed.date = todayIso;
      parsed.dateConfidence = 1.0;

      parsed.overallConfidence = calculateOverallConfidence(parsed);

      await ctx.runMutation(api.scorecard.updateScanJob, {
        jobId,
        patch: {
          status: "complete",
          progress: 100,
          message: "Scan complete",
          rawResult: JSON.stringify(parsed),
          updatedAt: Date.now(),
        },
      });

      return { jobId, scansRemaining, result: parsed };
    } catch (error: any) {
      await ctx.runMutation(api.scorecard.updateScanJob, {
        jobId,
        patch: {
          status: "failed",
          message: error?.message ?? "Scan failed",
          updatedAt: Date.now(),
        },
      });
      throw error;
    }
  },
});

export const getJobStatus = query({
  args: { jobId: v.id("scanJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    return {
      status: job.status,
      progress: job.progress,
      message: job.message,
      updatedAt: job.updatedAt,
    };
  },
});

export const getJobResult = query({
  args: { jobId: v.id("scanJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job?.rawResult) return null;
    try {
      return JSON.parse(job.rawResult);
    } catch {
      return job.rawResult;
    }
  },
});

export const setUserScansRemaining = mutation({
  args: {
    userId: v.id("users"),
    scansRemaining: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      scansRemaining: args.scansRemaining,
      updatedAt: args.updatedAt,
    });
  },
});

export const createScanJob = mutation({
  args: {
    job: v.object({
      userId: v.id("users"),
      status: v.string(),
      progress: v.number(),
      message: v.string(),
      imageCount: v.number(),
      thumbnailUrl: v.optional(v.string()),
      rawResult: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("scanJobs", args.job);
  },
});

export const updateScanJob = mutation({
  args: {
    jobId: v.id("scanJobs"),
    patch: v.object({
      status: v.optional(v.string()),
      progress: v.optional(v.number()),
      message: v.optional(v.string()),
      rawResult: v.optional(v.string()),
      updatedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, args.patch);
  },
});
