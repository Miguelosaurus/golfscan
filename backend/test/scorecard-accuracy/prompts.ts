export const BASE_PROMPT = `
Extract scorecard data from these images. Return JSON with this structure:
{"players":[{"name":"string","nameConfidence":0.0-1.0,"scores":[{"hole":1,"score":4,"confidence":0.9}]}]}

Key rules:
- For scores: Only use null if absolutely no marks visible. For any marks (even unclear), provide best reasonable guess.
- Do not extract course name, date, or hole pars.
- Extract raw data only - no calculations.
- If multiple images, process sequentially.
- Confidence scores 0.0-1.0 for certainty level, be honest, below 0.65 user will be asked to review.
`;

export const MINIMAL_EFFORT_PROMPT = BASE_PROMPT + `

Approach: Minimal reasoning. Prioritize speed over depth. Extract only the most clearly legible numbers; avoid overthinking ambiguous marks.`;

export const LOW_EFFORT_PROMPT = BASE_PROMPT + `

Approach: Quick scan for clear handwritten scores. Focus on obvious numbers.`;

export const MEDIUM_EFFORT_PROMPT = BASE_PROMPT + `

Approach: Careful examination of handwriting. Look for context clues like crossing out, corrections, and partial numbers. Compare similar looking digits across the scorecard for consistency.`;

export const HIGH_EFFORT_PROMPT = BASE_PROMPT + `

Approach: Thorough analysis with maximum attention to detail. Examine each handwritten mark carefully, consider writing style patterns, look for faint marks or partial erasures, analyze pen pressure and stroke patterns. Cross-reference scores with par values and typical golf scoring patterns. Pay special attention to numbers that could be confused (6/8, 4/9, 1/7, etc.). Consider the physical constraints of golf scoring and flag any unusual patterns.`;

export const REASONING_EFFORTS = {
  minimal: 'minimal' as const,
  low: 'low' as const,
  medium: 'medium' as const,
  high: 'high' as const
};

export const PROMPTS = {
  minimal: MINIMAL_EFFORT_PROMPT,
  low: LOW_EFFORT_PROMPT,
  medium: MEDIUM_EFFORT_PROMPT,
  high: HIGH_EFFORT_PROMPT
};
