import { ApiCourseData, Course, Hole, TeeBox } from '@/types';

export const convertApiCourseToLocal = (apiCourse: ApiCourseData, selectedTee?: string): Course => {
  // Get the appropriate tee box (default to first male tee if not specified)
  const teeBoxes = [...apiCourse.tees.male, ...apiCourse.tees.female];
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
  const deterministicId = `${apiCourse.id}-${selectedTeeBox.tee_name.replace(/\s+/g, '').toLowerCase()}`;
  
  return {
    id: deterministicId,
    name: `${apiCourse.club_name} - ${apiCourse.course_name}`,
    location: `${apiCourse.location.city}, ${apiCourse.location.state}`,
    holes,
    slope: selectedTeeBox.slope_rating,
    rating: selectedTeeBox.course_rating,
    isApiCourse: true,
    apiId: apiCourse.id,
    imageUrl: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80"
  };
};

export const getTeeBoxOptions = (apiCourse: ApiCourseData): { name: string; teeBox: TeeBox }[] => {
  const options: { name: string; teeBox: TeeBox }[] = [];
  
  apiCourse.tees.male.forEach(tee => {
    options.push({ name: tee.tee_name, teeBox: tee });
  });
  
  apiCourse.tees.female.forEach(tee => {
    options.push({ name: tee.tee_name, teeBox: tee });
  });
  
  return options;
};

export const formatCourseLocation = (location: ApiCourseData['location']): string => {
  return `${location.city}, ${location.state}`;
};

export const getCourseDisplayName = (apiCourse: ApiCourseData): string => {
  return `${apiCourse.club_name} - ${apiCourse.course_name}`;
};