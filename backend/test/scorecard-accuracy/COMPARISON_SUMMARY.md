# Multi-Model Scorecard OCR Comparison (o4-mini vs GPT-5 family)

Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)

## Models Tested
- o4-mini (baseline; now also with 'minimal')
- gpt-5
- gpt-5-mini
- gpt-5-chat (invalid: model ID not found)

## Reasoning Efforts
- minimal, low, medium, high (when supported; we auto-retried without reasoning if unsupported)

## Key Findings
- gpt-5-mini: Best overall. Medium effort ≈ 71.6% accuracy; top accuracy-per-token (≈0.103/1k tkn). Good latency.
- o4-mini: Solid baseline. Minimal/medium best (≈69.3–64.6%). High effort hurts accuracy and latency.
- gpt-5: Underperformed on handwriting OCR (≈23–35%); very high latency. Not recommended.
- gpt-5-chat: Invalid model ID (400). Excluded.

## Token Efficiency (accuracy per 1k tokens)
- gpt-5-mini: ≈ 0.103
- o4-mini: ≈ 0.073
- gpt-5: ≈ 0.048

## Practical Recommendation
- Default: gpt-5-mini (medium) for accuracy; allow minimal/low for faster scans. Avoid high.
- Keep o4-mini as fallback.
- Remove gpt-5 and gpt-5-chat from production consideration for this task.

## Notable Issues
- Occasional null player names (added guard recommended).
- Rare JSON parse errors at high effort; add robust parse fallback.

## Artifacts
- Results file: results-$(ls -t results-*.json | head -1)
- Harness: updated runner.ts (multi-model, 4 efforts) and prompts.ts (added minimal).
