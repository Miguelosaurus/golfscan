const API_BASE_URL = 'https://api.golfcourseapi.com';
// Check both possible environment variable names
const API_KEY = process.env.EXPO_PUBLIC_GOLF_COURSE_API_KEY || process.env.GOLF_COURSE_API_KEY;

export interface ApiCourse {
  id: number;
  club_name: string;
  course_name: string;
  location: {
    address: string;
    city: string;
    state: string;
    country: string;
    latitude: number;
    longitude: number;
  };
  tees: {
    male: TeeBox[];
    female: TeeBox[];
  };
}

export interface TeeBox {
  tee_name: string;
  course_rating: number;
  slope_rating: number;
  bogey_rating: number;
  total_yards: number;
  total_meters: number;
  number_of_holes: number;
  par_total: number;
  front_course_rating: number;
  front_slope_rating: number;
  front_bogey_rating: number;
  back_course_rating: number;
  back_slope_rating: number;
  back_bogey_rating: number;
  holes: Array<{
    par: number;
    yardage: number;
    handicap: number;
  }>;
}

export interface CourseSearchResult {
  courses: ApiCourse[];
}

class GolfCourseApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'GolfCourseApiError';
  }
}

const makeApiRequest = async (endpoint: string): Promise<any> => {
  if (!API_KEY) {
    throw new GolfCourseApiError('Golf Course API key is not configured. Please set EXPO_PUBLIC_GOLF_COURSE_API_KEY or GOLF_COURSE_API_KEY environment variable.');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Authorization': `Key ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new GolfCourseApiError('Invalid API key', 401);
    }
    throw new GolfCourseApiError(`API request failed: ${response.statusText}`, response.status);
  }

  return response.json();
};

export const searchCourses = async (query: string): Promise<ApiCourse[]> => {
  try {
    const data = await makeApiRequest(`/v1/search?search_query=${encodeURIComponent(query)}`);
    return data.courses || [];
  } catch (error) {
    console.error('Error searching courses:', error);
    throw error;
  }
};

export const getCourseById = async (id: number): Promise<ApiCourse> => {
  try {
    return await makeApiRequest(`/v1/courses/${id}`);
  } catch (error) {
    console.error('Error getting course by ID:', error);
    throw error;
  }
};

export const healthCheck = async (): Promise<any> => {
  try {
    return await makeApiRequest('/v1/healthcheck');
  } catch (error) {
    console.error('Error checking API health:', error);
    throw error;
  }
};