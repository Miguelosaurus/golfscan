import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { PROMPTS, REASONING_EFFORTS } from './prompts';
import { ScorecardScanResult } from '../../../types';

// Initialize OpenAI client exactly like the app does
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

interface TestResult {
  scorecard: string;
  reasoningEffort: keyof typeof REASONING_EFFORTS;
  success: boolean;
  error?: string;
  response?: ScorecardScanResult;
  metrics: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    latencyMs: number;
  };
  accuracy?: {
    overallAccuracy: number;
    playerAccuracies: Array<{
      name: string;
      accuracy: number;
      correctScores: number;
      totalScores: number;
    }>;
  };
}

interface GroundTruth {
  [key: string]: {
    difficulty: string;
    players: Array<{
      name: string;
      scores: number[] | { gross?: number[]; net?: number[] };
      notes?: string;
    }>;
  };
}

// Load ground truth data
const groundTruth: GroundTruth = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'ground-truth.json'), 'utf8')
);

// Get all scorecard images
const scorecardDir = path.join(__dirname, '../../../test/scorecards');
const scorecardFiles = fs.readdirSync(scorecardDir)
  .filter(file => file.endsWith('.png'))
  .sort();

console.log(`Found ${scorecardFiles.length} scorecard images:`, scorecardFiles);

function imageToBase64DataUrl(imagePath: string): string {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64 = imageBuffer.toString('base64');
  return `data:image/png;base64,${base64}`;
}

function calculateAccuracy(
  response: ScorecardScanResult, 
  truth: GroundTruth[string]
): TestResult['accuracy'] {
  const playerAccuracies: Array<{
    name: string;
    accuracy: number;
    correctScores: number;
    totalScores: number;
  }> = [];
  let totalCorrect = 0;
  let totalScores = 0;

  for (const truthPlayer of truth.players) {
    // Find matching player in response (fuzzy match by name)
    const responsePlayer = response.players.find(p => 
      p.name.toLowerCase().includes(truthPlayer.name.toLowerCase()) ||
      truthPlayer.name.toLowerCase().includes(p.name.toLowerCase())
    );

    if (!responsePlayer) {
      playerAccuracies.push({
        name: truthPlayer.name,
        accuracy: 0,
        correctScores: 0,
        totalScores: Array.isArray(truthPlayer.scores) 
          ? truthPlayer.scores.length 
          : (truthPlayer.scores.gross?.length || truthPlayer.scores.net?.length || 0)
      });
      continue;
    }

    // Handle both simple array and gross/net structure
    let truthScores: number[];
    if (Array.isArray(truthPlayer.scores)) {
      truthScores = truthPlayer.scores;
    } else {
      // For now, prioritize gross scores, fall back to net
      truthScores = truthPlayer.scores.gross || truthPlayer.scores.net || [];
    }

    let correctScores = 0;
    const responseScores = responsePlayer.scores.map(s => s.score);

    for (let i = 0; i < Math.min(truthScores.length, responseScores.length); i++) {
      if (truthScores[i] === responseScores[i]) {
        correctScores++;
      }
      // Special case: scorecard 2, hole 3 can be 5 or 6
      else if (truthPlayer.notes?.includes('hole 3 could be 5 or 6') && 
               i === 2 && // hole 3 (0-indexed)
               (truthScores[i] === 5 || truthScores[i] === 6) &&
               (responseScores[i] === 5 || responseScores[i] === 6)) {
        correctScores++;
      }
    }

    const accuracy = truthScores.length > 0 ? correctScores / truthScores.length : 0;
    playerAccuracies.push({
      name: truthPlayer.name,
      accuracy,
      correctScores,
      totalScores: truthScores.length
    });

    totalCorrect += correctScores;
    totalScores += truthScores.length;
  }

  return {
    overallAccuracy: totalScores > 0 ? totalCorrect / totalScores : 0,
    playerAccuracies
  };
}

async function testScorecardWithEffort(
  scorecardFile: string, 
  effort: keyof typeof REASONING_EFFORTS
): Promise<TestResult> {
  const scorecardPath = path.join(scorecardDir, scorecardFile);
  const scorecardKey = scorecardFile.replace('.png', '');
  
  console.log(`\n🧪 Testing ${scorecardFile} with ${effort} reasoning effort...`);
  
  const startTime = Date.now();
  
  try {
    // Convert image to base64 data URL
    const base64Image = imageToBase64DataUrl(scorecardPath);
    
    // Build image content exactly like the app does
    const imageContents = [{
      type: 'input_image' as const,
      image_url: base64Image,
      detail: 'high' as const,
    }];

    // Call OpenAI API exactly like the app does
    const response = await openai.responses.create({
      model: 'o4-mini',
      text: { format: { type: 'json_object' } },
      reasoning: { effort: REASONING_EFFORTS[effort] },
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: PROMPTS[effort] },
            ...imageContents,
          ],
        },
      ],
      // Removed token cap to ensure we always get responses
    });

    const endTime = Date.now();
    const latencyMs = endTime - startTime;

    // Parse response
    const rawContent = response.output_text;
    if (!rawContent) {
      throw new Error('No response content from OpenAI');
    }

    const parsedJson: ScorecardScanResult = JSON.parse(rawContent);
    
    // Calculate accuracy
    const truthData = groundTruth[scorecardKey];
    const accuracy = truthData ? calculateAccuracy(parsedJson, truthData) : undefined;

    return {
      scorecard: scorecardKey,
      reasoningEffort: effort,
      success: true,
      response: parsedJson,
      metrics: {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
        reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
        latencyMs
      },
      accuracy
    };

  } catch (error) {
    const endTime = Date.now();
    const latencyMs = endTime - startTime;
    
    return {
      scorecard: scorecardKey,
      reasoningEffort: effort,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      metrics: {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        latencyMs
      }
    };
  }
}

async function runAllTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  console.log('🚀 Starting GPT-4o-mini scorecard accuracy testing...');
  console.log(`📊 Testing ${scorecardFiles.length} scorecards with 3 reasoning efforts each`);
  console.log(`📊 Total tests: ${scorecardFiles.length * 3}`);
  
  for (const scorecardFile of scorecardFiles) {
    for (const effort of Object.keys(REASONING_EFFORTS) as Array<keyof typeof REASONING_EFFORTS>) {
      const result = await testScorecardWithEffort(scorecardFile, effort);
      results.push(result);
      
      // Brief progress update
      console.log(`${result.success ? '✅' : '❌'} ${scorecardFile} (${effort}): ${result.success ? 
        `${(result.accuracy?.overallAccuracy || 0 * 100).toFixed(1)}% accuracy, ${result.metrics.latencyMs}ms, ${result.metrics.totalTokens} tokens` : 
        result.error}`);
    }
  }
  
  return results;
}

// Save results and generate analysis
async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    console.error('📝 Please create a .env file with your OpenAI API key:');
    console.error('   echo "OPENAI_API_KEY=your_key_here" > .env');
    process.exit(1);
  }

  const results = await runAllTests();
  
  // Save raw results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsPath = path.join(__dirname, `results-${timestamp}.json`);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  
  console.log(`\n📄 Results saved to: ${resultsPath}`);
  
  // Generate analysis
  generateAnalysis(results);
}

function generateAnalysis(results: TestResult[]) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 GPT-4o-mini SCORECARD ACCURACY ANALYSIS');
  console.log('='.repeat(80));
  
  // Group results by reasoning effort
  const byEffort = results.reduce((acc, result) => {
    if (!acc[result.reasoningEffort]) acc[result.reasoningEffort] = [];
    acc[result.reasoningEffort].push(result);
    return acc;
  }, {} as Record<string, TestResult[]>);
  
  // Overall stats by reasoning effort
  console.log('\n📈 ACCURACY BY REASONING EFFORT:');
  Object.entries(byEffort).forEach(([effort, effortResults]) => {
    const successfulResults = effortResults.filter(r => r.success && r.accuracy);
    const avgAccuracy = successfulResults.length > 0 
      ? successfulResults.reduce((sum, r) => sum + (r.accuracy?.overallAccuracy || 0), 0) / successfulResults.length
      : 0;
    const avgTokens = effortResults.reduce((sum, r) => sum + r.metrics.totalTokens, 0) / effortResults.length;
    const avgLatency = effortResults.reduce((sum, r) => sum + r.metrics.latencyMs, 0) / effortResults.length;
    const avgReasoningTokens = effortResults.reduce((sum, r) => sum + r.metrics.reasoningTokens, 0) / effortResults.length;
    
    console.log(`  ${effort.toUpperCase()}: ${(avgAccuracy * 100).toFixed(1)}% accuracy | Avg: ${avgTokens.toFixed(0)} tokens (${avgReasoningTokens.toFixed(0)} reasoning) | ${avgLatency.toFixed(0)}ms`);
  });
  
  // Accuracy by difficulty
  console.log('\n📈 ACCURACY BY SCORECARD DIFFICULTY:');
  const byDifficulty = results.reduce((acc, result) => {
    const truthData = groundTruth[result.scorecard];
    if (truthData && result.success && result.accuracy) {
      const difficulty = truthData.difficulty;
      if (!acc[difficulty]) acc[difficulty] = [];
      acc[difficulty].push(result);
    }
    return acc;
  }, {} as Record<string, TestResult[]>);
  
  Object.entries(byDifficulty).forEach(([difficulty, diffResults]) => {
    const avgAccuracy = diffResults.reduce((sum, r) => sum + (r.accuracy?.overallAccuracy || 0), 0) / diffResults.length;
    console.log(`  ${difficulty}: ${(avgAccuracy * 100).toFixed(1)}% accuracy (${diffResults.length} tests)`);
  });
  
  // Individual scorecard breakdown
  console.log('\n📋 DETAILED SCORECARD RESULTS:');
  scorecardFiles.forEach(file => {
    const scorecardKey = file.replace('.png', '');
    const scorecardResults = results.filter(r => r.scorecard === scorecardKey);
    const truthData = groundTruth[scorecardKey];
    
    console.log(`\n  📄 ${file} (${truthData?.difficulty || 'unknown'})`);
    scorecardResults.forEach(result => {
      if (result.success && result.accuracy) {
        console.log(`    ${result.reasoningEffort}: ${(result.accuracy.overallAccuracy * 100).toFixed(1)}% | ${result.metrics.totalTokens}t | ${result.metrics.latencyMs}ms`);
      } else {
        console.log(`    ${result.reasoningEffort}: FAILED - ${result.error}`);
      }
    });
  });
  
  // Token efficiency analysis
  console.log('\n💰 TOKEN EFFICIENCY ANALYSIS:');
  Object.entries(byEffort).forEach(([effort, effortResults]) => {
    const successfulResults = effortResults.filter(r => r.success && r.accuracy);
    if (successfulResults.length === 0) return;
    
    const avgAccuracy = successfulResults.reduce((sum, r) => sum + (r.accuracy?.overallAccuracy || 0), 0) / successfulResults.length;
    const avgTotalTokens = successfulResults.reduce((sum, r) => sum + r.metrics.totalTokens, 0) / successfulResults.length;
    const avgReasoningTokens = successfulResults.reduce((sum, r) => sum + r.metrics.reasoningTokens, 0) / successfulResults.length;
    const efficiencyScore = avgAccuracy / (avgTotalTokens / 1000); // accuracy per 1k tokens
    
    console.log(`  ${effort.toUpperCase()}: ${efficiencyScore.toFixed(3)} accuracy/1k tokens | ${(avgReasoningTokens / avgTotalTokens * 100).toFixed(1)}% reasoning tokens`);
  });
  
  // Confidence calibration
  console.log('\n🎯 CONFIDENCE CALIBRATION ANALYSIS:');
  Object.entries(byEffort).forEach(([effort, effortResults]) => {
    const successfulResults = effortResults.filter(r => r.success && r.accuracy && r.response);
    if (successfulResults.length === 0) return;
    
    // Analyze how well reported confidence correlates with actual accuracy
    let totalConfidenceAccuracyDiff = 0;
    let validComparisons = 0;
    
    successfulResults.forEach(result => {
      if (result.response && result.accuracy) {
        const reportedConfidence = result.response.overallConfidence || 0;
        const actualAccuracy = result.accuracy.overallAccuracy;
        totalConfidenceAccuracyDiff += Math.abs(reportedConfidence - actualAccuracy);
        validComparisons++;
      }
    });
    
    const avgConfidenceError = validComparisons > 0 ? totalConfidenceAccuracyDiff / validComparisons : 0;
    console.log(`  ${effort.toUpperCase()}: Avg confidence error: ${(avgConfidenceError * 100).toFixed(1)}% (lower is better)`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Analysis complete! Raw results saved with timestamp.');
  console.log('='.repeat(80));
}

if (require.main === module) {
  main().catch(console.error);
}

export { runAllTests, generateAnalysis };