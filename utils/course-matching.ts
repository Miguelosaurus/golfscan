import { Course } from '@/types';

/**
 * Robust course matching utilities for preventing duplicates and improving user experience
 */

export interface LocationData {
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
}

export interface CourseMatchResult {
  match: Course | null;
  confidence: number;
  reason: string;
}

/**
 * Normalize course name for consistent matching
 */
export const normalizeCourse = (courseName: string): string => {
  if (!courseName) return '';
  
  // Convert to lowercase and trim
  let normalized = courseName.toLowerCase().trim();
  
  // Remove common golf course terms
  const golfTerms = [
    'golf club', 'golf course', 'country club', 'golf links',
    'golf resort', 'golf & country club', 'golf and country club',
    'g.c.', 'g&cc', 'cc', 'gc', 'links', 'resort', 'golf'
  ];
  
  for (const term of golfTerms) {
    normalized = normalized.replace(new RegExp(`\\b${term}\\b`, 'gi'), '');
  }
  
  // Remove "the" at the beginning
  normalized = normalized.replace(/^the\s+/, '');
  
  // Handle common abbreviations
  const abbreviations: { [key: string]: string } = {
    'st.': 'saint',
    'st ': 'saint ',
    'mt.': 'mount',
    'mt ': 'mount ',
    'n.': 'north',
    'e.': 'east',
    's.': 'south',
    'w.': 'west',
    '&': 'and',
    'tpc': 'tournament players club'
  };
  
  for (const [abbrev, full] of Object.entries(abbreviations)) {
    normalized = normalized.replace(new RegExp(`\\b${abbrev}`, 'gi'), full);
  }
  
  // Remove extra punctuation and normalize spaces
  normalized = normalized
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return normalized;
};

/**
 * Calculate Levenshtein distance between two strings
 */
export const levenshteinDistance = (str1: string, str2: string): number => {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
};

/**
 * Calculate location bias between user location and course location
 */
export const calculateLocationBias = (
  userLocation: LocationData | null,
  courseLocation: LocationData | null
): number => {
  if (!userLocation || !courseLocation) return 0;
  
  let bias = 0;
  
  // City match gets highest priority
  if (userLocation.city && courseLocation.city) {
    const normalizedUserCity = userLocation.city.toLowerCase().trim();
    const normalizedCourseCity = courseLocation.city.toLowerCase().trim();
    if (normalizedUserCity === normalizedCourseCity) {
      bias += 30; // High boost for same city
    }
  }
  
  // State match gets medium priority
  if (userLocation.state && courseLocation.state) {
    const normalizedUserState = userLocation.state.toLowerCase().trim();
    const normalizedCourseState = courseLocation.state.toLowerCase().trim();
    if (normalizedUserState === normalizedCourseState) {
      bias += 15; // Medium boost for same state
    }
  }
  
  return bias;
};

/**
 * Get significant words from course name (ignore short/common words)
 */
const getSignificantWords = (normalizedName: string): string[] => {
  const words = normalizedName.split(' ').filter(word => word.length >= 3);
  const commonWords = ['the', 'and', 'club', 'golf', 'course', 'country', 'park', 'state'];
  return words.filter(word => !commonWords.includes(word));
};

/**
 * Calculate word-based matching score
 */
const calculateWordMatchScore = (name1: string, name2: string): number => {
  const words1 = getSignificantWords(normalizeCourse(name1));
  const words2 = getSignificantWords(normalizeCourse(name2));
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  let matchedWords = 0;
  let totalImportance = 0;
  
  for (const word1 of words1) {
    let bestMatch = 0;
    let wordImportance = 1;
    
    // Give higher importance to longer words and first words
    if (word1.length > 6) wordImportance *= 1.3;
    if (words1[0] === word1) wordImportance *= 1.2;
    
    for (const word2 of words2) {
      // Exact match
      if (word1 === word2) {
        bestMatch = 1;
        break;
      }
      
      // Substring match
      if (word1.includes(word2) || word2.includes(word1)) {
        bestMatch = Math.max(bestMatch, 0.8);
        continue;
      }
      
      // Typo tolerance using Levenshtein distance
      const distance = levenshteinDistance(word1, word2);
      const maxLength = Math.max(word1.length, word2.length);
      const similarity = 1 - (distance / maxLength);
      
      if (similarity >= 0.8) { // Allow 1-2 character differences
        bestMatch = Math.max(bestMatch, similarity * 0.9);
      }
    }
    
    matchedWords += bestMatch * wordImportance;
    totalImportance += wordImportance;
  }
  
  return totalImportance > 0 ? (matchedWords / totalImportance) : 0;
};

/**
 * Main course matching function
 */
export const matchCourseToLocal = (
  searchName: string,
  localCourses: Course[],
  userLocation: LocationData | null = null,
  isLocalCourseMatching: boolean = true
): CourseMatchResult => {
  if (!searchName || localCourses.length === 0) {
    return { match: null, confidence: 0, reason: 'No search name or local courses' };
  }
  
  const normalizedSearchName = normalizeCourse(searchName);
  let bestMatch: Course | null = null;
  let bestScore = 0;
  let bestReason = '';
  
  for (const course of localCourses) {
    const normalizedCourseName = normalizeCourse(course.name);
    let score = 0;
    let reason = '';
    
    // Layer 1: Exact match after normalization
    if (normalizedSearchName === normalizedCourseName) {
      score = 100;
      reason = 'Exact match after normalization';
    }
    // Layer 2: Substring match
    else if (normalizedSearchName.includes(normalizedCourseName) || 
             normalizedCourseName.includes(normalizedSearchName)) {
      score = 90;
      reason = 'Substring match';
    }
    // Layer 3: Word-based intelligent matching
    else {
      const wordScore = calculateWordMatchScore(searchName, course.name);
      score = wordScore * 100;
      reason = `Word-based match (${Math.round(wordScore * 100)}%)`;
    }
    
    // Layer 4: Location bias
    if (score > 0) {
      const locationBias = calculateLocationBias(
        userLocation,
        parseLocationFromString(course.location)
      );
      score += locationBias;
      if (locationBias > 0) {
        reason += ` + location bias (+${locationBias})`;
      }
    }
    
    // Cap at 100
    score = Math.min(score, 100);
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = course;
      bestReason = reason;
    }
  }
  
  // Different confidence thresholds based on context
  const confidenceThreshold = isLocalCourseMatching ? 50 : 75; // More lenient for local courses
  
  if (bestScore >= confidenceThreshold) {
    const context = isLocalCourseMatching ? 'local course' : 'API search';
    return { 
      match: bestMatch, 
      confidence: bestScore, 
      reason: `${bestReason} [${context} matching: ${confidenceThreshold}% threshold]` 
    };
  }
  
  const context = isLocalCourseMatching ? 'local course' : 'API search';
  return { 
    match: null, 
    confidence: bestScore, 
    reason: `Low confidence (${Math.round(bestScore)}%) for ${context} matching (need ${confidenceThreshold}%)` 
  };
};

/**
 * Parse location string into LocationData
 */
const parseLocationFromString = (locationString: string): LocationData | null => {
  if (!locationString) return null;
  
  // Expect format: "City, State" or similar
  const parts = locationString.split(',').map(part => part.trim());
  
  if (parts.length >= 2) {
    return {
      city: parts[0],
      state: parts[1]
    };
  } else if (parts.length === 1) {
    return {
      city: parts[0]
    };
  }
  
  return null;
};

/**
 * Extract user location from device location or manual input
 */
export const extractUserLocation = async (): Promise<LocationData | null> => {
  try {
    // Try to get device location
    // This is a placeholder - you'd implement actual location getting here
    // For now, we'll return null and rely on course location only
    return null;
  } catch (error) {
    console.error('Error getting user location:', error);
    return null;
  }
};