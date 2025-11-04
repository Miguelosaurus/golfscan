import { ApiCourseData, Course, Hole, TeeBox } from '@/types';
import { trpcClient } from '@/lib/trpc';
import { DEFAULT_COURSE_IMAGE } from '@/constants/images';
import * as FileSystem from 'expo-file-system';

type ExpoFileSystemModule = typeof FileSystem & {
  documentDirectory?: string | null;
  cacheDirectory?: string | null;
  EncodingType?: { Base64: string };
};

const fs = FileSystem as ExpoFileSystemModule;

const COURSE_IMAGE_DIR_NAME = 'course-images';
let courseImageDirPromise: Promise<string | null> | null = null;

const ensureCourseImageDirectory = async (): Promise<string | null> => {
  if (!courseImageDirPromise) {
    courseImageDirPromise = (async () => {
      const baseDir = fs.documentDirectory ?? fs.cacheDirectory;
      if (!baseDir) {
        console.warn('[CourseHelpers] File system directory is unavailable; falling back to in-memory image');
        return null;
      }
      const dir = `${baseDir}${COURSE_IMAGE_DIR_NAME}/`;
      try {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      } catch (error: unknown) {
        const message = (error as Error)?.message || '';
        if (!message.includes('File already exists')) {
          throw error;
        }
      }
      console.log('[CourseHelpers] ensured image directory', dir);
      return dir;
    })();
  }
  return courseImageDirPromise;
};

const saveDataUrlToFile = async (dataUrl: string, fileName: string): Promise<string | null> => {
  const match = dataUrl.match(/^data:(?<mime>.*?);base64,(?<data>.+)$/);
  if (!match?.groups?.data) {
    return null;
  }

  const mime = match.groups.mime || 'image/jpeg';
  const extension = mime.split('/')[1] || 'jpg';
  const directory = await ensureCourseImageDirectory();
  if (!directory) {
    return null;
  }
  const fileUri = `${directory}${fileName}.${extension}`;

  try {
    await FileSystem.writeAsStringAsync(fileUri, match.groups.data, {
      encoding: 'base64',
    });
    console.log('[CourseHelpers] saved course image', {
      fileUri,
      size: match.groups.data.length,
    });
    return fileUri;
  } catch (error) {
    console.error('Failed to persist course image locally:', error);
    return null;
  }
};

export const formatCourseLocation = (location: ApiCourseData['location']): string => {
  return `${location.city}, ${location.state}`;
};

export const getCourseDisplayName = (apiCourse: ApiCourseData): string => {
  return `${apiCourse.club_name} - ${apiCourse.course_name}`;
};

const getAllTeeBoxes = (apiCourse: ApiCourseData): TeeBox[] => {
  const maleTeesRaw = apiCourse.tees?.male;
  const femaleTeesRaw = apiCourse.tees?.female;
  const maleTees = Array.isArray(maleTeesRaw) ? maleTeesRaw : [];
  const femaleTees = Array.isArray(femaleTeesRaw) ? femaleTeesRaw : [];
  return [...maleTees, ...femaleTees];
};

export const getDeterministicCourseId = (apiCourse: ApiCourseData, teeName?: string): string => {
  const normalizedTee = (teeName ?? '').replace(/\s+/g, '').toLowerCase();
  return `${apiCourse.id}-${normalizedTee || 'default'}`;
};

interface ConvertCourseOptions {
  selectedTee?: string;
  fetchImage?: boolean;
}

export const convertApiCourseToLocal = async (
  apiCourse: ApiCourseData,
  options: ConvertCourseOptions = {}
): Promise<Course> => {
  const { selectedTee, fetchImage = false } = options;
  // Get the appropriate tee box (default to first male tee if not specified)
  const teeBoxes = getAllTeeBoxes(apiCourse);
  const selectedTeeBox = selectedTee 
    ? teeBoxes.find(tee => tee.tee_name.toLowerCase() === selectedTee.toLowerCase())
    : teeBoxes[0];
  
  if (!selectedTeeBox) {
    throw new Error('No tee box found for course');
  }
  
  // Convert holes
  const holes: Hole[] = selectedTeeBox.holes.map((hole, index) => ({
    number: index + 1,
    par: hole.par,
    distance: hole.yardage,
    handicap: hole.handicap
  }));
  
  // Use a deterministic id so that the same course / tee combination maps to the same record
  const deterministicId = getDeterministicCourseId(apiCourse, selectedTeeBox.tee_name);
  
  const courseName = getCourseDisplayName(apiCourse);
  let imageUri = DEFAULT_COURSE_IMAGE;

  if (fetchImage) {
    try {
      const imageResponse = await trpcClient.courseImage.getOrCreate.mutate({
        courseName,
        locationText: formatCourseLocation(apiCourse.location),
        latitude: apiCourse.location.latitude,
        longitude: apiCourse.location.longitude,
      });

      const remoteImage = imageResponse.imageDataUrl || DEFAULT_COURSE_IMAGE;

      if (!imageResponse.usedFallback && remoteImage.startsWith('data:')) {
        const persistedPath = await saveDataUrlToFile(remoteImage, deterministicId);
        imageUri = persistedPath || remoteImage;
      } else {
        imageUri = remoteImage;
      }
    } catch (error) {
      console.error('Course image lookup failed, using fallback image:', error);
    }
  }

  return {
    id: deterministicId,
    name: courseName,
    location: `${apiCourse.location.city}, ${apiCourse.location.state}`,
    holes,
    slope: selectedTeeBox.slope_rating,
    rating: selectedTeeBox.course_rating,
    isApiCourse: true,
    apiId: apiCourse.id,
    imageUrl: imageUri,
  };
};

export const getTeeBoxOptions = (apiCourse: ApiCourseData): { name: string; teeBox: TeeBox }[] => {
  return getAllTeeBoxes(apiCourse).map(tee => ({
    name: tee.tee_name,
    teeBox: tee,
  }));
};
