import { ApiCourseData, Course, Hole, TeeBox } from '@/types';
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

/**
 * Cleans up duplicate course names from the Golf Course API.
 * When a facility has only one course, the API returns names like
 * "Dominion Country Club - Dominion Country Club". This function
 * removes the redundant suffix.
 * 
 * @example
 * cleanCourseDisplayName("Dominion Country Club - Dominion Country Club") 
 * // Returns: "Dominion Country Club"
 * 
 * cleanCourseDisplayName("TPC San Antonio - Oaks") 
 * // Returns: "TPC San Antonio - Oaks" (unchanged - different parts)
 */
export const cleanCourseDisplayName = (name: string): string => {
  const separator = ' - ';
  const separatorIndex = name.indexOf(separator);

  if (separatorIndex === -1) {
    return name;
  }

  const clubName = name.slice(0, separatorIndex).trim();
  const courseName = name.slice(separatorIndex + separator.length).trim();

  if (clubName.toLowerCase() === courseName.toLowerCase()) {
    return clubName;
  }

  return name;
};


const getAllTeeBoxes = (apiCourse: ApiCourseData): TeeBox[] => {
  const maleTeesRaw = apiCourse.tees?.male;
  const femaleTeesRaw = apiCourse.tees?.female;
  const maleTees = Array.isArray(maleTeesRaw) ? maleTeesRaw : [];
  const femaleTees = Array.isArray(femaleTeesRaw) ? femaleTeesRaw : [];
  return [...maleTees, ...femaleTees];
};

// Use a deterministic id per underlying course, not per tee selection,
// so picking a different tee does not create a new course entry.
export const getDeterministicCourseId = (apiCourse: ApiCourseData, _teeName?: string): string => {
  return `${apiCourse.id}`;
};

interface ConvertCourseOptions {
  selectedTee?: string;
  fetchImage?: boolean;
  fetchImageFn?: (args: {
    courseName: string;
    locationText?: string;
    latitude?: number;
    longitude?: number;
  }) => Promise<{ url: string | null } | null>;
}

export const convertApiCourseToLocal = async (
  apiCourse: ApiCourseData,
  options: ConvertCourseOptions = {}
): Promise<Course> => {
  const { selectedTee, fetchImage = false, fetchImageFn } = options;
  // Get the appropriate tee box (default to first male tee if not specified)
  // Pull male/female tees and tag with gender for downstream selection
  const teeBoxes = [
    ...(apiCourse.tees.male?.map((tee) => ({ ...tee, gender: "M" })) ?? []),
    ...(apiCourse.tees.female?.map((tee) => ({ ...tee, gender: "F" })) ?? []),
  ];

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

  // Tee set summaries for prompting tee selection later
  const teeSets = teeBoxes.map((tee) => ({
    name: tee.tee_name,
    rating: tee.course_rating,
    slope: tee.slope_rating,
    gender: tee.gender as string | undefined,
    frontRating: tee.front_course_rating,
    frontSlope: tee.front_slope_rating,
    backRating: tee.back_course_rating,
    backSlope: tee.back_slope_rating,
    holes: tee.holes.map((hole, index) => ({
      number: index + 1,
      par: hole.par,
      distance: hole.yardage,
      handicap: hole.handicap,
    })),
  }));

  // Use a deterministic id so that the same course / tee combination maps to the same record
  const deterministicId = getDeterministicCourseId(apiCourse, selectedTeeBox.tee_name);

  const courseName = cleanCourseDisplayName(getCourseDisplayName(apiCourse));
  let imageUri = DEFAULT_COURSE_IMAGE;

  if (fetchImage && fetchImageFn) {
    try {
      const imageResponse = await fetchImageFn({
        courseName,
        locationText: formatCourseLocation(apiCourse.location),
        latitude: apiCourse.location.latitude,
        longitude: apiCourse.location.longitude,
      });
      if (imageResponse?.url) {
        imageUri = imageResponse.url;
      }
    } catch (error) {
      console.error("Course image lookup failed, using fallback image:", error);
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
    teeSets,
    imageUrl: imageUri,
  };
};

export const getTeeBoxOptions = (apiCourse: ApiCourseData): { name: string; teeBox: TeeBox }[] => {
  return getAllTeeBoxes(apiCourse).map(tee => ({
    name: tee.tee_name,
    teeBox: tee,
  }));
};
