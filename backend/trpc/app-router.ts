// This file will be populated later with the tRPC app router.
import { z } from 'zod';
import { router, publicProcedure } from '../trpc/trpc';
import { golfCourseRouter } from './routes/golfCourse.router';
import { scorecardRouter } from './routes/scorecard.router';
import { courseImageRouter } from './routes/courseImage.router';

export const appRouter = router({
  hello: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return `Hello, ${input.name}!`;
    }),
  golfCourse: golfCourseRouter,
  scorecard: scorecardRouter,
  courseImage: courseImageRouter,
});

export type AppRouter = typeof appRouter; 
