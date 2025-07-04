import { publicProcedure, router } from '../trpc';
import { z } from 'zod';

const API_BASE_URL = 'https://api.golfcourseapi.com';
const API_KEY = process.env.GOLF_COURSE_API_KEY || process.env.EXPO_PUBLIC_GOLF_COURSE_API_KEY;

const makeApiRequest = async (endpoint: string) => {
  if (!API_KEY) throw new Error('Golf Course API key is not configured.');
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Authorization': `Key ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Golf Course API error: ${response.statusText}`);
  return response.json();
};

export const golfCourseRouter = router({
  searchCourses: publicProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const data = await makeApiRequest(`/v1/search?search_query=${encodeURIComponent(input.query)}`);
      return data.courses || [];
    }),
  getCourseById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return await makeApiRequest(`/v1/courses/${input.id}`);
    }),
  healthCheck: publicProcedure
    .query(async () => {
      return await makeApiRequest('/v1/healthcheck');
    }),
}); 