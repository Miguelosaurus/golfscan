import OpenAI from 'openai';

export const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

export const SCORECARD_PROMPT = `
Extract scorecard data from these images. Return JSON with this structure:
{"courseName":"string or null","courseNameConfidence":0.0-1.0,"date":"YYYY-MM-DD or null","dateConfidence":0.0-1.0,"players":[{"name":"string","nameConfidence":0.0-1.0,"scores":[{"hole":1,"score":4,"confidence":0.9}]}],"holes":[{"hole":1,"par":4,"parConfidence":0.9}]}

Key rules:
- For scores: Only use null if absolutely no marks visible. For any marks (even unclear), provide best reasonable guess.
- For course names: Only include if confidence >0.7, otherwise null.
- For dates: YYYY-MM-DD format or null.
- Extract raw data only - no calculations.
- If multiple images, process sequentially.
- Confidence scores 0.0-1.0 for certainty level, be honest, below 0.65 user will be asked to review.
`; 