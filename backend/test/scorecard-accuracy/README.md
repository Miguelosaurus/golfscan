# GPT-4o-mini Scorecard Accuracy Testing Suite

This test suite evaluates GPT-4o-mini's accuracy in reading handwritten golf scorecards across different reasoning effort levels.

## Setup

1. Copy `.env.example` to `.env` and add your OpenAI API key:
   ```bash
   cp .env.example .env
   # Edit .env and add your API key
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Running Tests

```bash
npm run test
```

## Test Design

- **6 scorecards** with varying difficulty levels (easy to harder)
- **3 reasoning efforts** (low, medium, high) 
- **Comprehensive metrics** including accuracy, token usage, latency, and confidence calibration

## What Gets Tested

- **Accuracy**: Hole-by-hole score extraction compared to ground truth
- **Performance**: Token usage and response latency
- **Confidence**: How well the model's reported confidence correlates with actual accuracy
- **Efficiency**: Accuracy per token spent across reasoning levels

## Expected Results

The test generates:
- Raw results JSON with all metrics
- Detailed console analysis with breakdowns by effort level and difficulty
- Recommendations for optimal reasoning effort settings

## Key Insights Expected

1. **Reasoning vs Accuracy**: Does higher reasoning effort meaningfully improve accuracy?
2. **Cost Efficiency**: Which reasoning level provides the best accuracy/token ratio?
3. **Confidence Calibration**: How reliable are the model's confidence scores?
4. **Difficulty Scaling**: Do harder scorecards benefit more from higher reasoning effort?