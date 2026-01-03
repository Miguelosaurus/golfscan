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
                const sourceUrl = convexImageUrl || localImageUrl;

                // Helper to detect if URL is a real course image (not default)
                const isRealImage = (url?: string | null): url is string =>
                    !!url && (url.startsWith('data:image') || (!url.includes('unsplash.com') && !url.includes('photo-1587174486073-ae5e5cff23aa')));

                // If Convex has a real image, prefer it over potentially stale cache
                if (isRealImage(sourceUrl) && !cancelled) {
                    setImageUri(sourceUrl);

                    // Cache the image for future offline use (in background)
                    cacheCourseImage(courseId, sourceUrl).then((localPath) => {
                        if (localPath && !cancelled) {
                            setImageUri(localPath);
                        }
                    });
                    setHasCheckedCache(true);
                    return;
                }

                // No real Convex image - check local cache
                const cachedPath = await getCachedCourseImage(courseId);

                if (cachedPath && !cancelled) {
                    setImageUri(cachedPath);
                    setHasCheckedCache(true);
                    return;
                }

                // No local cache - use source URL if available (even if default)
                if (sourceUrl && !cancelled) {
                    setImageUri(sourceUrl);
                } else if (!cancelled) {
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
