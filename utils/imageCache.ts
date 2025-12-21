import * as FileSystem from 'expo-file-system/legacy';

// Directory to store cached course images
const IMAGE_CACHE_DIR = `${FileSystem.cacheDirectory}course-images/`;

/**
 * Get the local cache path for a course image
 */
export const getCourseImageCachePath = (courseId: string): string => {
    return `${IMAGE_CACHE_DIR}${courseId}.jpg`;
};

/**
 * Check if a course image is cached locally
 */
export const isCourseImageCached = async (courseId: string): Promise<boolean> => {
    try {
        const path = getCourseImageCachePath(courseId);
        const info = await FileSystem.getInfoAsync(path);
        return info.exists;
    } catch {
        return false;
    }
};

/**
 * Get the local URI for a cached course image (if it exists)
 */
export const getCachedCourseImage = async (courseId: string): Promise<string | null> => {
    try {
        const path = getCourseImageCachePath(courseId);
        const info = await FileSystem.getInfoAsync(path);
        if (info.exists) {
            return path;
        }
        return null;
    } catch {
        return null;
    }
};

/**
 * Download and cache a course image from a URL (including base64 data URLs)
 * Returns the local file path if successful, null otherwise
 */
export const cacheCourseImage = async (
    courseId: string,
    imageUrl: string
): Promise<string | null> => {
    try {
        // Ensure cache directory exists
        const dirInfo = await FileSystem.getInfoAsync(IMAGE_CACHE_DIR);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(IMAGE_CACHE_DIR, { intermediates: true });
        }

        const cachePath = getCourseImageCachePath(courseId);

        // Handle base64 data URLs
        if (imageUrl.startsWith('data:')) {
            // Extract base64 data from data URL
            const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (matches && matches[2]) {
                await FileSystem.writeAsStringAsync(cachePath, matches[2], {
                    encoding: FileSystem.EncodingType.Base64,
                });
                return cachePath;
            }
            return null;
        }

        // Handle regular URLs - download the file
        const downloadResult = await FileSystem.downloadAsync(imageUrl, cachePath);
        if (downloadResult.status === 200) {
            return cachePath;
        }
        return null;
    } catch (error) {
        console.warn('[ImageCache] Failed to cache image:', courseId, error);
        return null;
    }
};

/**
 * Delete a cached course image
 */
export const deleteCachedCourseImage = async (courseId: string): Promise<void> => {
    try {
        const path = getCourseImageCachePath(courseId);
        const info = await FileSystem.getInfoAsync(path);
        if (info.exists) {
            await FileSystem.deleteAsync(path);
        }
    } catch (error) {
        console.warn('[ImageCache] Failed to delete cached image:', courseId, error);
    }
};

/**
 * Clear all cached course images
 */
export const clearImageCache = async (): Promise<void> => {
    try {
        const info = await FileSystem.getInfoAsync(IMAGE_CACHE_DIR);
        if (info.exists) {
            await FileSystem.deleteAsync(IMAGE_CACHE_DIR, { idempotent: true });
        }
    } catch (error) {
        console.warn('[ImageCache] Failed to clear cache:', error);
    }
};
