import { z } from 'zod';
import { GoogleGenAI, MediaResolution, type Part, type Content } from '@google/genai';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { publicProcedure, router } from '../trpc';
import { SCORECARD_PROMPT } from '../../lib/openai';
import { ScorecardScanResult } from '@/types';

// Simple in-memory rate limiting store
// In production, this should be moved to a proper database
const userScans = new Map<string, { count: number; lastReset: Date }>();

const DAILY_SCAN_LIMIT = 50;

const checkAndIncrementDailyScans = async (userId: string): Promise<number> => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const userScanData = userScans.get(userId);

  if (!userScanData || userScanData.lastReset < today) {
    // Reset daily counter
    userScans.set(userId, { count: 1, lastReset: today });
    return DAILY_SCAN_LIMIT - 1;
  }

  if (userScanData.count >= DAILY_SCAN_LIMIT) {
    throw new Error(`Daily scan limit of ${DAILY_SCAN_LIMIT} reached. Try again tomorrow.`);
  }

  userScanData.count += 1;
  return DAILY_SCAN_LIMIT - userScanData.count;
};

const calculateSimilarity = (str1: string, str2: string): number => {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
};

const levenshteinDistance = (str1: string, str2: string): number => {
  const matrix = [];
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
};

const fuzzyMatchCourse = async (courseName: string): Promise<any> => {
  try {
    // This would integrate with your golf course API
    // For now, return null (no match) - implement based on your API
    return null;
  } catch (error) {
    console.warn('Course matching error:', error);
    return null;
  }
};

const calculateOverallConfidence = (data: ScorecardScanResult): number => {
  const confidences: number[] = [];

  if (data.courseNameConfidence !== undefined) confidences.push(data.courseNameConfidence);
  if (data.dateConfidence !== undefined) confidences.push(data.dateConfidence);

  data.players.forEach(player => {
    if (player.nameConfidence !== undefined) confidences.push(player.nameConfidence);
    player.scores.forEach(score => {
      if (score.confidence !== undefined) confidences.push(score.confidence);
    });
  });

  return confidences.length > 0
    ? confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length
    : 0;
};

// Shared scan implementation used by both direct call and background job
async function scanScorecardImpl(input: { images?: string[]; files?: { path: string; mimeType: string }[]; userId: string }): Promise<{ data: ScorecardScanResult; remainingScans: number }> {
  try {
    const routeStart = Date.now();
    console.log(`[SCAN] start ${new Date(routeStart).toLocaleTimeString()} user=${input.userId}`);
    // Validate Google API key
    if (!process.env.GOOGLE_API_KEY) {
      console.error('❌ GOOGLE_API_KEY not found in environment variables');
      throw new Error('Google API key not configured. Please add GOOGLE_API_KEY to your .env file.');
    }

    // Rate limiting check
    const remainingScans = await checkAndIncrementDailyScans(input.userId);

    // Validate inputs
    if ((!input.images || input.images.length === 0) && (!input.files || input.files.length === 0)) {
      throw new Error('No images provided for scanning');
    }

    console.log('🔵 Calling Google Gemini API with gemini-3-pro-preview model...');
    console.log('📸 Processing images:', (input.images?.length || input.files?.length || 0));
    console.log('⏰ Scan started at:', new Date().toLocaleTimeString());

    const parseDataUrl = (dataUrl: string): { mimeType: string; data: string } => {
      const match = dataUrl.match(/^data:(.*?);base64,(.+)$/);
      if (!match) {
        throw new Error('Invalid image data URL provided');
      }
      return { mimeType: match[1], data: match[2] };
    };

    // Upload images to Gemini Files API to avoid massive base64 payloads
    const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! });
    const uploadedFiles: Array<{ uri: string; mimeType: string; localPath: string }> = [];
    try {
      const uploadStart = Date.now();
      console.log(`[SCAN] upload start ${new Date(uploadStart).toLocaleTimeString()}`);
      if (input.images && input.images.length > 0) {
        for (let i = 0; i < input.images.length; i++) {
          const { mimeType, data } = parseDataUrl(input.images[i]);
          const filename = `scorecard-${Date.now()}-${i}.${mimeType.split('/')[1] || 'jpg'}`;
          const localPath = path.join(tmpdir(), filename);
          writeFileSync(localPath, Buffer.from(data, 'base64'));

          const upload = await genAI.files.upload({
            file: localPath,
            config: { mimeType, displayName: filename }
          });

          if (!upload.uri) throw new Error('Failed to upload file');
          uploadedFiles.push({ uri: upload.uri, mimeType, localPath });
        }
      }

      if (input.files && input.files.length > 0) {
        for (let i = 0; i < input.files.length; i++) {
          const f = input.files[i];
          const filename = path.basename(f.path);

          const upload = await genAI.files.upload({
            file: f.path,
            config: { mimeType: f.mimeType, displayName: filename }
          });

          if (!upload.uri) throw new Error('Failed to upload file');
          uploadedFiles.push({ uri: upload.uri, mimeType: f.mimeType, localPath: f.path });
        }
      }

      const uploadElapsed = Date.now() - uploadStart;
      console.log(`[SCAN] upload end ${new Date().toLocaleTimeString()} | ${uploadElapsed}ms | files=${uploadedFiles.length}`);

      // genAI instance already created above

      // Build parts with prompt + file references
      const parts: Part[] = [{ text: SCORECARD_PROMPT }];
      for (const f of uploadedFiles) {
        parts.push({ fileData: { fileUri: f.uri, mimeType: f.mimeType } as any });
      }

      const userContent: Content = { role: 'user', parts };
      const aiStart = Date.now();
      console.log(`[SCAN] ai call start ${new Date(aiStart).toLocaleTimeString()}`);
      const result = await genAI.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [userContent],
        config: {
          temperature: 1,
          maxOutputTokens: 5000,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              courseName: { type: 'string', nullable: true },
              courseNameConfidence: { type: 'number' },
              date: { type: 'string', nullable: true },
              dateConfidence: { type: 'number' },
              players: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    nameConfidence: { type: 'number' },
                    scores: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          hole: { type: 'integer' },
                          score: { type: 'integer' },
                          confidence: { type: 'number' },
                        },
                        required: ['hole', 'score'],
                      },
                    },
                  },
                  required: ['name', 'scores'],
                },
              },
            },
            required: ['players'],
          } as any,
          thinkingConfig: { thinkingLevel: 'low' },
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
        } as any,
      });

      const gemResponse = result;
      const aiElapsed = Date.now() - aiStart;
      console.log(`[SCAN] ai call end ${new Date().toLocaleTimeString()} | ${aiElapsed}ms`);
      const usage = gemResponse.usageMetadata;
      console.log('🟢 Gemini API Response Received at:', new Date().toLocaleTimeString());
      if (usage) {
        console.log('📊 ============ TOKEN USAGE BREAKDOWN ============');
        console.log('📊 Prompt tokens:', usage.promptTokenCount);
        console.log('📊 Candidates tokens:', usage.candidatesTokenCount);
        console.log('📊 Total tokens:', usage.totalTokenCount);
        console.log('📊 =============================================');
      }

      // Parse response
      const rawContent = gemResponse.text;

      if (!rawContent) {
        console.error('❌ No content found in Gemini response');
        try {
          console.error('📊 Full response structure:', JSON.stringify(gemResponse, null, 2));
        } catch { }
        throw new Error('No response content from Gemini');
      }

      console.log('📄 Raw content from AI:', rawContent.substring(0, 200) + '...');

      const parsedFromSdk = (gemResponse as any)?.parsed as ScorecardScanResult | undefined;
      const tryParseJson = (text: string): ScorecardScanResult | null => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      };

      let parsedJson: ScorecardScanResult | null =
        parsedFromSdk ||
        tryParseJson(rawContent) ||
        (() => {
          const match = rawContent.match(/```(?:json)?\n([\s\S]*?)\n```/);
          if (match) return tryParseJson(match[1]);
          const firstBrace = rawContent.indexOf('{');
          const lastBrace = rawContent.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            return tryParseJson(rawContent.slice(firstBrace, lastBrace + 1));
          }
          return null;
        })();

      if (!parsedJson) {
        const partsJson = (() => {
          try {
            return JSON.stringify(gemResponse.candidates?.[0]?.content?.parts ?? null);
          } catch {
            return '[unstringifiable parts]';
          }
        })();
        console.error('❌ JSON Parse Error: raw length', rawContent.length);
        console.error('❌ Raw content that failed to parse:', rawContent);
        console.error('❌ Parts:', partsJson);
        throw new Error('Failed to parse JSON from Gemini response.');
      }

      // Calculate overall confidence
      parsedJson.overallConfidence = calculateOverallConfidence(parsedJson);

      // Course matching if course name detected with high confidence
      if (parsedJson.courseName && parsedJson.courseNameConfidence >= 0.7) {
        const matchedCourse = await fuzzyMatchCourse(parsedJson.courseName);

        if (matchedCourse) {
          parsedJson.courseName = matchedCourse.course_name || matchedCourse.club_name;
        } else {
          parsedJson.courseName = null;
        }
      }

      const routeElapsed = Date.now() - routeStart;
      console.log(`[SCAN] success total ${routeElapsed}ms`);
      return {
        data: parsedJson,
        remainingScans
      };
    } finally {
      // Cleanup local temp files
      for (const f of uploadedFiles) {
        try { unlinkSync(f.localPath); } catch { }
      }
      const routeElapsed = Date.now() - routeStart;
      console.log(`[SCAN] finally total ${routeElapsed}ms`);
    }

  } catch (error: unknown) {
    console.error('❌ Scorecard scan error:', error);


    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('Unknown error occurred during scorecard scanning');
  }
}

const _jobs: Record<string, any> = {};

export const scorecardRouter = router({

  startScanScorecard: publicProcedure
    .input(z.object({
      images: z.array(z.string()).min(1).max(5).optional(),
      files: z.array(z.object({ path: z.string(), mimeType: z.string().default('image/jpeg') })).min(1).max(5).optional(),
      userId: z.string(),
    }))
    .mutation(async ({ input }) => {
      const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      _jobs[jobId] = {
        status: 'pending', createdAt: new Date(), updatedAt: new Date(), progress: 0,
      };

      // Fire and forget processing
      (async () => {
        const jobs = _jobs;
        try {
          jobs[jobId].status = 'processing';
          jobs[jobId].updatedAt = new Date();
          jobs[jobId].progress = 5;

          const result = await scanScorecardImpl(input);
          jobs[jobId].status = 'complete';
          jobs[jobId].updatedAt = new Date();
          jobs[jobId].progress = 100;
          jobs[jobId].result = result;
        } catch (e: any) {
          jobs[jobId].status = 'error';
          jobs[jobId].updatedAt = new Date();
          jobs[jobId].error = e?.message || 'Unknown error';
        }
      })();

      return { jobId };
    }),

  getScanStatus: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input }) => {
      const job = _jobs[input.jobId];
      if (!job) return { status: 'not_found' };
      return job;
    }),

  scanScorecard: publicProcedure
    .input(z.object({
      images: z.array(z.string()).min(1).max(5).optional(), // base64 data URLs
      files: z.array(z.object({ path: z.string(), mimeType: z.string().default('image/jpeg') })).min(1).max(5).optional(),
      userId: z.string()
    }))
    .mutation(async ({ input }) => {
      return scanScorecardImpl(input);
    }),

  getRemainingScans: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const userScanData = userScans.get(input.userId);

      if (!userScanData || userScanData.lastReset < today) {
        return DAILY_SCAN_LIMIT;
      }

      return DAILY_SCAN_LIMIT - userScanData.count;
    }),
}); 
