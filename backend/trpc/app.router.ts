import { golfCourseRouter } from './routes/golfCourse.router';
import { router } from '../trpc/trpc';

export const appRouter = router({
  golfCourse: golfCourseRouter,
}); 