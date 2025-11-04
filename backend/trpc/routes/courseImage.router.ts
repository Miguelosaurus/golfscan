import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { fetchCourseImageFromGooglePlaces } from '@/backend/services/googlePlaces';
import { DEFAULT_COURSE_IMAGE } from '@/constants/images';

const courseImageInput = z.object({
  courseName: z.string().min(1, 'Course name is required'),
  locationText: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export const courseImageRouter = router({
  getOrCreate: publicProcedure
    .input(courseImageInput)
    .mutation(async ({ input }) => {
      console.log('[CourseImageRouter] getOrCreate input', input);
      const googleImage = await fetchCourseImageFromGooglePlaces({
        courseName: input.courseName,
        locationText: input.locationText,
        latitude: input.latitude,
        longitude: input.longitude,
      });

      if (googleImage?.imageDataUrl) {
        console.log('[CourseImageRouter] google image success', {
          placeId: googleImage.placeId,
          imageLength: googleImage.imageDataUrl.length,
        });
        return {
          imageDataUrl: googleImage.imageDataUrl,
          source: 'google_places' as const,
          googlePlaceId: googleImage.placeId,
          usedFallback: false,
        };
      }

      console.warn('[CourseImageRouter] google image fallback');
      return {
        imageDataUrl: DEFAULT_COURSE_IMAGE,
        source: 'fallback' as const,
        googlePlaceId: undefined,
        usedFallback: true,
      };
    }),
});
