import { z } from 'zod';
import OpenAI from 'openai';
import { publicProcedure, router } from '../trpc';
import { openai, SCORECARD_PROMPT } from '../../lib/openai';
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
  
  data.holes.forEach(hole => {
    if (hole.parConfidence !== undefined) confidences.push(hole.parConfidence);
  });
  
  return confidences.length > 0 
    ? confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length 
    : 0;
};

export const scorecardRouter = router({
  scanScorecard: publicProcedure
    .input(z.object({ 
      images: z.array(z.string()).min(1).max(5), // base64 data URLs
      userId: z.string() 
    }))
    .mutation(async ({ input }) => {
      try {
        // Validate OpenAI API key
        if (!process.env.OPENAI_API_KEY) {
          console.error('❌ OPENAI_API_KEY not found in environment variables');
          throw new Error('OpenAI API key not configured. Please add OPENAI_API_KEY to your .env file.');
        }

        // Rate limiting check
        const remainingScans = await checkAndIncrementDailyScans(input.userId);
        
        // Validate and prepare images for OpenAI
        if (!input.images || input.images.length === 0) {
          throw new Error('No images provided for scanning');
        }

        console.log('🔵 Calling OpenAI API with o4-mini model...');
        console.log('📸 Processing images:', input.images.length);
        console.log('⏰ Scan started at:', new Date().toLocaleTimeString());

        // Build image content for Responses API
        const imageContents = input.images.map((base64Image) => ({
          type: 'input_image' as const,
          image_url: base64Image, // full data URL: data:image/jpeg;base64,...
          detail: 'high' as const,
        }));

        // Use Responses API with o4-mini - single message structure to minimize reasoning tokens
        const response = await openai.responses.create({
          model: 'o4-mini',
          text: { format: { type: 'json_object' } },
          reasoning: { effort: 'low' },
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: SCORECARD_PROMPT },
                ...imageContents,
              ],
            },
          ],
          max_output_tokens: 4000,
        });
        
        console.log('🟢 OpenAI API Response Received at:', new Date().toLocaleTimeString());
        console.log('📊 ============ TOKEN USAGE BREAKDOWN ============');
        console.log('📊 Response status:', response.status);
        console.log('📊 Input tokens:', response.usage?.input_tokens);
        console.log('📊 Output tokens used:', response.usage?.output_tokens);
        console.log('📊 Reasoning tokens:', response.usage?.output_tokens_details?.reasoning_tokens);
        console.log('📊 Total tokens:', response.usage?.total_tokens);
        console.log('📊 Reasoning effort:', response.reasoning?.effort || 'not specified');
        console.log('📊 =============================================');

        // Parse response
        const rawContent = response.output_text;
        
        if (!rawContent) {
          console.error('❌ No content found in OpenAI response');
          console.error('📊 Full response structure:', JSON.stringify(response, null, 2));
          throw new Error('No response content from OpenAI - likely hit token limit. Response status: ' + response.status);
        }

        console.log('📄 Raw content from AI:', rawContent.substring(0, 200) + '...');

        // Parse and validate JSON
        let parsedJson: ScorecardScanResult;
        try {
          parsedJson = JSON.parse(rawContent);
          console.log('✅ Successfully parsed JSON response');
        } catch (parseError) {
          console.error('❌ JSON Parse Error:', parseError);
          console.error('❌ Raw content that failed to parse:', rawContent);
          throw new Error('Failed to parse JSON from OpenAI response.');
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

        return {
          data: parsedJson,
          remainingScans
        };
        
      } catch (error: unknown) {
        console.error('❌ Scorecard scan error:', error);
        
        if (error instanceof OpenAI.APIError) {
          console.error('❌ OpenAI API Error Details:', {
            status: error.status,
            code: error.code,
            type: error.type,
            message: error.message,
          });
          throw new Error('Invalid request to OpenAI API. Please check image format and try again.');
        }
        
        if (error instanceof Error) {
          throw new Error(error.message);
        }
        
        throw new Error('Unknown error occurred during scorecard scanning');
      }
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