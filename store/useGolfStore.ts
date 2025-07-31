import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Course, Player, Round, ScorecardScanResult } from '@/types';
import { calculateHandicap } from '@/utils/helpers';

interface CourseUsage {
  courseId: string;
  courseName: string;
  count: number;
  lastUsed: string;
}

interface GolfState {
  courses: Course[];
  players: Player[];
  rounds: Round[];
  courseUsage: CourseUsage[];
  _hasHydrated: boolean;
  // Scorecard scanning state
  scannedData: ScorecardScanResult | null;
  isScanning: boolean;
  remainingScans: number;
  addCourse: (course: Course) => void;
  updateCourse: (course: Course) => void;
  deleteCourse: (courseId: string) => void;
  addPlayer: (player: Player) => void;
  updatePlayer: (player: Player) => void;
  deletePlayer: (playerId: string) => void;
  addRound: (round: Round) => void;
  updateRound: (round: Round) => void;
  deleteRound: (roundId: string) => void;
  updatePlayerHandicap: (playerId: string, handicap: number) => void;
  calculatePlayerHandicap: (playerId: string) => number | null;
  linkPlayerToUser: (playerId: string) => void;
  mergePlayerData: (targetPlayerId: string, sourcePlayerId: string, finalName: string) => void;
  getCourseById: (courseId: string) => Course | undefined;
  getFrequentCourses: () => CourseUsage[];
  trackCourseUsage: (courseId: string, courseName: string) => void;
  // Scorecard scanning actions
  setScannedData: (data: ScorecardScanResult | null) => void;
  setIsScanning: (scanning: boolean) => void;
  setRemainingScans: (scans: number) => void;
  clearScanData: () => void;
}

export const useGolfStore = create<GolfState>()(
  persist(
    (set, get) => ({
      courses: [],
      players: [],
      rounds: [],
      courseUsage: [],
      _hasHydrated: false,
      // Scorecard scanning state
      scannedData: null,
      isScanning: false,
      remainingScans: 50,
      
      addCourse: (course) => set((state) => ({
        courses: [...state.courses, course]
      })),
      
      updateCourse: (course) => set((state) => ({
        courses: state.courses.map(c => c.id === course.id ? course : c)
      })),
      
      deleteCourse: (courseId) => set((state) => ({
        courses: state.courses.filter(c => c.id !== courseId)
      })),
      
      addPlayer: (player) => set((state) => {
        // If this is the first player added, mark them as the user
        const isFirstPlayer = state.players.length === 0;
        const newPlayer = {
          ...player,
          isUser: isFirstPlayer || player.isUser
        };
        
        return {
          players: [...state.players, newPlayer]
        };
      }),
      
      updatePlayer: (player) => set((state) => ({
        players: state.players.map(p => p.id === player.id ? player : p)
      })),
      
      deletePlayer: (playerId) => set((state) => ({
        players: state.players.filter(p => p.id !== playerId)
      })),
      
      addRound: (round) => set((state) => {
        // Track course usage
        get().trackCourseUsage(round.courseId, round.courseName);
        
        // Add players that don't exist yet
        const newPlayers = [...state.players];
        
        round.players.forEach(playerRound => {
          // Check if player already exists
          const existingPlayer = newPlayers.find(p => p.id === playerRound.playerId);
          
          if (!existingPlayer) {
            // Create new player
            const newPlayer: Player = {
              id: playerRound.playerId,
              name: playerRound.playerName,
              handicap: playerRound.handicapUsed,
              isUser: false // Will be set properly if needed
            };
            
            // If this is the first player and no user exists, mark as user
            if (newPlayers.length === 0 || !newPlayers.some(p => p.isUser)) {
              newPlayer.isUser = true;
            }
            
            newPlayers.push(newPlayer);
          }
        });
        
        // Add the round
        const newRounds = [...state.rounds, round];
        
        // Update handicaps for all players in the round
        const updatedPlayers = [...newPlayers];
        round.players.forEach(playerRound => {
          const playerIndex = updatedPlayers.findIndex(p => p.id === playerRound.playerId);
          if (playerIndex >= 0) {
            // Calculate new handicap
            const handicap = get().calculatePlayerHandicap(playerRound.playerId);
            if (handicap !== null) {
              updatedPlayers[playerIndex] = {
                ...updatedPlayers[playerIndex],
                handicap
              };
            }
          }
        });
        
        return {
          rounds: newRounds,
          players: updatedPlayers
        };
      }),
      
      updateRound: (round) => set((state) => ({
        rounds: state.rounds.map(r => r.id === round.id ? round : r)
      })),
      
      deleteRound: (roundId) => set((state) => ({
        rounds: state.rounds.filter(r => r.id !== roundId)
      })),
      
      updatePlayerHandicap: (playerId, handicap) => set((state) => ({
        players: state.players.map(p => 
          p.id === playerId ? { ...p, handicap } : p
        )
      })),
      
      calculatePlayerHandicap: (playerId) => {
        const { rounds, courses } = get();
        
        // Get all rounds for this player
        const playerRounds = rounds.filter(round => 
          round.players.some(player => player.playerId === playerId)
        );
        
        if (playerRounds.length < 5) {
          return null; // Not enough rounds to calculate handicap
        }
        
        // Calculate differentials for each round
        const differentials: number[] = [];
        
        playerRounds.forEach(round => {
          const playerData = round.players.find(player => player.playerId === playerId);
          if (!playerData) return;
          
          const course = courses.find(c => c.id === round.courseId);
          if (!course) return;
          
          const coursePar = course.holes.reduce((sum, hole) => sum + hole.par, 0);
          const courseRating = course.rating || coursePar;
          const courseSlope = course.slope || 113; // Default slope rating
          
          // Calculate handicap differential
          const differential = ((playerData.totalScore - courseRating) * 113) / courseSlope;
          differentials.push(differential);
        });
        
        // Calculate handicap using the helper function
        return calculateHandicap(differentials);
      },
      
      linkPlayerToUser: (playerId) => set((state) => {
        // Remove isUser flag from all players
        const updatedPlayers = state.players.map(p => ({
          ...p,
          isUser: p.id === playerId
        }));
        
        return { players: updatedPlayers };
      }),
      
      mergePlayerData: (targetPlayerId, sourcePlayerId, finalName) => set((state) => {
        // Find both players
        const targetPlayer = state.players.find(p => p.id === targetPlayerId);
        const sourcePlayer = state.players.find(p => p.id === sourcePlayerId);
        
        if (!targetPlayer || !sourcePlayer) return state;
        
        // Update the target player with the final name and keep better handicap
        const mergedPlayer = {
          ...targetPlayer,
          name: finalName,
          handicap: targetPlayer.handicap ?? sourcePlayer.handicap,
          isUser: targetPlayer.isUser || sourcePlayer.isUser, // Keep user status if either has it
        };
        
        // Update all rounds to use the target player ID
        const updatedRounds = state.rounds.map(round => ({
          ...round,
          players: round.players.map(player => 
            player.playerId === sourcePlayerId 
              ? { ...player, playerId: targetPlayerId, playerName: finalName }
              : player
          )
        }));
        
        // Remove the source player and update the target player
        const updatedPlayers = state.players
          .filter(p => p.id !== sourcePlayerId)
          .map(p => p.id === targetPlayerId ? mergedPlayer : p);
        
        return {
          players: updatedPlayers,
          rounds: updatedRounds
        };
      }),
      
      getCourseById: (courseId) => {
        const { courses } = get();
        return courses.find(c => c.id === courseId);
      },
      
      getFrequentCourses: () => {
        const { courseUsage } = get();
        return courseUsage
          .sort((a, b) => {
            // Sort by count first, then by last used date
            if (b.count !== a.count) {
              return b.count - a.count;
            }
            return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
          })
          .slice(0, 5); // Return top 5 frequent courses
      },
      
      trackCourseUsage: (courseId, courseName) => set((state) => {
        const existingUsage = state.courseUsage.find(usage => usage.courseId === courseId);
        
        if (existingUsage) {
          // Update existing usage
          return {
            courseUsage: state.courseUsage.map(usage =>
              usage.courseId === courseId
                ? {
                    ...usage,
                    count: usage.count + 1,
                    lastUsed: new Date().toISOString()
                  }
                : usage
            )
          };
        } else {
          // Add new usage
          return {
            courseUsage: [
              ...state.courseUsage,
              {
                courseId,
                courseName,
                count: 1,
                lastUsed: new Date().toISOString()
              }
            ]
          };
        }
      }),
      
      // Scorecard scanning actions
      setScannedData: (data) => set({ scannedData: data }),
      setIsScanning: (scanning) => set({ isScanning: scanning }),
      setRemainingScans: (scans) => set({ remainingScans: scans }),
      clearScanData: () => set({ 
        scannedData: null
        // Don't reset isScanning here - it should be managed separately
      }),
    }),
    {
      name: 'golf-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        courses: state.courses,
        players: state.players,
        rounds: state.rounds,
        courseUsage: state.courseUsage,
        _hasHydrated: state._hasHydrated,
        // Exclude scanning states from persistence (they should be temporary)
        // scannedData: excluded
        // isScanning: excluded  
        // remainingScans: excluded
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true;
          // Reset scanning states on rehydration
          state.isScanning = false;
          state.scannedData = null;
          state.remainingScans = 50;
        }
      },
    }
  )
);