export const SCORECARD_PROMPT = `
Extract scorecard data from these images. Return JSON with this structure:
{"players":[{"name":"string","nameConfidence":0.0-1.0,"scores":[{"hole":1,"score":4,"confidence":0.9}]}]}

Key rules:
- For scores: Only use null if absolutely no marks visible. For any marks (even unclear), provide best reasonable guess.
- Do not extract course name, date, or hole pars.
- Extract raw data only - no calculations.
- If multiple images, process sequentially.
- Confidence scores 0.0-1.0 for certainty level, be honest, below 0.65 user will be asked to review.
`;
