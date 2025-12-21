import { useState, useEffect } from 'react';
import { cacheCourseImage, getCachedCourseImage } from '@/utils/imageCache';
import { DEFAULT_COURSE_IMAGE } from '@/constants/images';

interface UseCourseImageOptions {
    courseId: string;
    /** The image URL from Convex (may be base64 or regular URL) */
    convexImageUrl?: string | null;
    /** The image URL from local store (deprecated, kept for compatibility) */
    localImageUrl?: string | null;
}

/**
 * Hook to get the best available course image with local caching.
 * Priority: local cache file → Convex URL → default image
 * 
 * When a Convex image is available but not cached locally, it will
 * automatically download and cache it for offline use.
 */
export const useCourseImage = ({
    courseId,
    convexImageUrl,
    localImageUrl,
}: UseCourseImageOptions): string => {
    const [imageUri, setImageUri] = useState<string>(DEFAULT_COURSE_IMAGE);
    const [hasCheckedCache, setHasCheckedCache] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const loadImage = async () => {
            try {
                // First, check if we have a locally cached file
                const cachedPath = await getCachedCourseImage(courseId);

                if (cachedPath && !cancelled) {
                    setImageUri(cachedPath);
                    setHasCheckedCache(true);
                    return;
                }

                // No local cache - use Convex URL if available
                const sourceUrl = convexImageUrl || localImageUrl;

                if (sourceUrl && !cancelled) {
                    // Set the source URL immediately (even if base64, RN Image can handle it)
                    setImageUri(sourceUrl);

                    // Cache the image for future offline use (in background)
                    cacheCourseImage(courseId, sourceUrl).then((localPath) => {
                        if (localPath && !cancelled) {
                            // Update to use the local file path for better performance
                            setImageUri(localPath);
                        }
                    });
                } else if (!cancelled) {
                    // No image available, use default
                    setImageUri(DEFAULT_COURSE_IMAGE);
                }

                if (!cancelled) {
                    setHasCheckedCache(true);
                }
            } catch (error) {
                console.warn('[useCourseImage] Error loading image:', courseId, error);
                if (!cancelled) {
                    setImageUri(convexImageUrl || localImageUrl || DEFAULT_COURSE_IMAGE);
                    setHasCheckedCache(true);
                }
            }
        };

        loadImage();

        return () => {
            cancelled = true;
        };
    }, [courseId, convexImageUrl, localImageUrl]);

    return imageUri;
};
