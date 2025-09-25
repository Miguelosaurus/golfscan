export interface Player {
    id: string;
    name: string;
    photoUrl?: string;
    handicap?: number;
    isUser?: boolean;
  }
  
  export interface PlayerSummary {
    id: string;
    name: string;
    roundsPlayed: number;
    totalScore: number;
    isUser?: boolean;
    handicap?: number;
  }
  
  export interface Hole {
    number: number;
    par: number;
    distance: number;
    handicap?: number;
  }
  
  export interface Course {
    id: string;
    name: string;
    location: string;
    holes: Hole[];
    imageUrl?: string;
    slope?: number;
    rating?: number;
    isApiCourse?: boolean;
    apiId?: number;
  }
  
  export interface ApiCourseData {
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
  
  export interface Score {
    holeNumber: number;
    strokes: number;
    putts?: number;
    fairwayHit?: boolean;
    greenInRegulation?: boolean;
  }
  
  export interface PlayerRound {
    playerId: string;
    playerName: string;
    scores: Score[];
    totalScore: number;
    handicapUsed?: number;
    netScore?: number;
  }
  
  export interface Round {
    id: string;
    date: string;
    courseId: string;
    courseName: string;
    players: PlayerRound[];
    notes?: string;
    weather?: string;
    imageUrl?: string;
    holeCount?: number; // 9 or 18, determined from scores
    scorecardPhotos?: string[]; // URIs or base64 strings of scanned scorecard images
  }

  // Scorecard Scanning Types
  export interface ScorecardScanResult {
    courseName: string | null;  // Null if confidence < 0.7 or no match after fuzzy lookup
    courseNameConfidence: number;  // 0.0-1.0
    date: string | null;  // YYYY-MM-DD
    dateConfidence: number;
    players: Array<{
      name: string;
      nameConfidence: number;
      scores: Array<{
        hole: number;
        score: number;
        confidence: number;
      }>;
    }>;
    holes: Array<{
      hole: number;
      par: number | null;
      parConfidence: number;
    }>;
    overallConfidence: number;  // Average of all confidences for UI decisions
  }

  export interface ScanResponse {
    data: ScorecardScanResult;
    remainingScans: number;
  }

// Allow import of react-native-draggable-flatlist without types available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DraggableFlatListAny = any;

// Ambient declaration to satisfy TS for draggable list without external types