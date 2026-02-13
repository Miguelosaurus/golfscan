import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Course, Player, Round, ScorecardScanResult } from "@/types";
import { calculateCourseHandicapForRound, roundHalfUpToInt } from "@/utils/handicapCourse";

type ScanStage = "preparing" | "uploading" | "analyzing" | "processing" | "complete" | "error";
type ScanStatus = "processing" | "complete" | "error";

interface ActiveScanJob {
  id: string;
  status: ScanStatus;
  stage?: ScanStage;
  progress?: number;
  message?: string;
  createdAt?: string;
  updatedAt?: string;
  thumbnailUri?: string | null;
  result?: ScorecardScanResult | null;
  requiresReview?: boolean;
  autoReviewLaunched?: boolean;
  // Onboarding demo scan (prevents Home from auto-navigating in the background)
  onboardingDemo?: boolean;
  // Course/tee selection during scan flow
  selectedCourseId?: string;
  selectedCourseName?: string;
  selectedTeeName?: string;
  selectedTeeGender?: 'M' | 'F';
}

interface GolfUIState {
  // UI-only domain placeholders (no persistence)
  courses: Course[];
  players: Player[];
  rounds: Round[];
  courseUsage: any[];
  devMode: boolean;
  profileSetupSeen: boolean;

  _hasHydrated: boolean;

  // Scanning/UI state
  scannedData: ScorecardScanResult | null;
  isScanning: boolean;
  remainingScans: number;
  pendingScanPhotos: string[];
  activeScanJob: ActiveScanJob | null;

  // Scan flow coordination (for home screen course modal)
  shouldShowScanCourseModal: boolean;
  pendingScanCourseSelection: { courseId: string; teeName: string } | null;

  // Game setup intent (triggered from camera screen's "Setup Game Instead" button)
  pendingGameSetupIntent: 'new_game' | 'quick_strokes' | null;

  // Hidden courses (for courses derived from rounds that user wants to hide)
  hiddenCourseIds: string[];

  // No-op domain mutators to satisfy call sites
  addCourse: (course: Course) => void;
  updateCourse: (course: Course) => void;
  deleteCourse: (courseId: string) => void;
  addPlayer: (player: Player) => void;
  updatePlayer: (player: Player) => void;
  deletePlayer: (playerId: string) => void;
  addRound: (round: Round) => void;
  updateRound: (round: Round) => void;
  deleteRound: (roundId: string) => void;
  linkPlayerToUser: (playerId: string) => void;
  removeLegacyPlayers: () => void;
  getCourseById: (courseId: string) => Course | undefined;
  getFrequentCourses: () => any[];
  trackCourseUsage: (courseId: string, courseName: string) => void;
  removeLegacyCourses: () => void;
  hideCourse: (courseId: string) => void;
  unhideCourse: (courseId: string) => void;
  isCourseHidden: (courseId: string) => boolean;

  // Scanning actions
  setScannedData: (data: ScorecardScanResult | null) => void;
  setIsScanning: (scanning: boolean) => void;
  setRemainingScans: (scans: number) => void;
  clearScanData: () => void;
  setPendingScanPhotos: (photos: string[]) => void;
  clearPendingScanPhotos: () => void;
  setActiveScanJob: (job: ActiveScanJob | null) => void;
  updateActiveScanJob: (updates: Partial<ActiveScanJob>) => void;
  markActiveScanReviewPending: () => void;
  markActiveScanReviewed: () => void;
  clearActiveScanJob: () => void;
  setDevMode: (enabled: boolean) => void;
  setProfileSetupSeen: (seen: boolean) => void;

  // Scan flow coordination actions
  setShouldShowScanCourseModal: (show: boolean) => void;
  setPendingScanCourseSelection: (selection: { courseId: string; teeName: string } | null) => void;
  clearPendingScanCourseSelection: () => void;

  // Game setup intent action
  setPendingGameSetupIntent: (intent: 'new_game' | 'quick_strokes' | null) => void;

  // Reset all local data (used on logout/account switch)
  resetGolfStore: () => void;
}

export const useGolfStore = create<GolfUIState>()(
  persist(
    (set, get) => ({
      courses: [],
      players: [],
      rounds: [],
      courseUsage: [],
      devMode: false,
      profileSetupSeen: false,
      _hasHydrated: false,

      scannedData: null,
      isScanning: false,
      remainingScans: 50,
      pendingScanPhotos: [],
      activeScanJob: null,
      shouldShowScanCourseModal: false,
      pendingScanCourseSelection: null,
      pendingGameSetupIntent: null,
      hiddenCourseIds: [],

      // Domain mutators
      addCourse: (course) => set((state) => ({ courses: [...state.courses, course] })),
      updateCourse: (course) =>
        set((state) => ({ courses: state.courses.map((c) => (c.id === course.id ? course : c)) })),
      deleteCourse: (courseId) =>
        set((state) => ({
          courses: state.courses.filter((c) => c.id !== courseId),
          // Also hide the course so it doesn't reappear from derived courses
          hiddenCourseIds: state.hiddenCourseIds.includes(courseId)
            ? state.hiddenCourseIds
            : [...state.hiddenCourseIds, courseId],
        })),
      addPlayer: (player) => set((state) => ({ players: [...state.players, player] })),
      updatePlayer: (player) =>
        set((state) => ({ players: state.players.map((p) => (p.id === player.id ? player : p)) })),
      deletePlayer: (playerId) =>
        set((state) => ({ players: state.players.filter((p) => p.id !== playerId) })),
      addRound: (round) => set((state) => ({ rounds: [...state.rounds, round] })),
      updateRound: (round) =>
        set((state) => {
          const matchIndex = state.rounds.findIndex(
            (r) => r.id === round.id || (r as any).remoteId === round.id || round.remoteId === r.id
          );
          if (matchIndex >= 0) {
            const updated = [...state.rounds];
            updated[matchIndex] = round;
            return { rounds: updated };
          }
          return { rounds: [...state.rounds, round] };
        }),
      deleteRound: (roundId) =>
        set((state) => ({ rounds: state.rounds.filter((r) => r.id !== roundId) })),
      linkPlayerToUser: (playerId) =>
        set((state) => ({
          players: state.players.map((p) => ({ ...p, isUser: p.id === playerId })),
        })),
      removeLegacyPlayers: () =>
        set((state) => {
          const isConvexId = (id: string) => /^[a-z0-9]{15,}$/i.test(id);
          return {
            players: state.players.filter((p) => isConvexId(p.id)),
          };
        }),
      getCourseById: (courseId: string) => get().courses.find((c) => c.id === courseId),
      getFrequentCourses: () =>
        [...get().courseUsage].sort((a, b) => b.count - a.count).slice(0, 5),
      trackCourseUsage: (courseId: string, courseName: string) =>
        set((state) => ({
          courseUsage: [
            ...state.courseUsage,
            { courseId, courseName, count: 1, lastUsed: new Date().toISOString() },
          ],
        })),
      removeLegacyCourses: () =>
        set((state) => {
          const isConvexId = (id: string) => /^[a-z0-9]{15,}$/i.test(id);
          return {
            courses: state.courses.filter((c) => isConvexId(c.id)),
          };
        }),
      hideCourse: (courseId) =>
        set((state) => ({
          hiddenCourseIds: state.hiddenCourseIds.includes(courseId)
            ? state.hiddenCourseIds
            : [...state.hiddenCourseIds, courseId],
        })),
      unhideCourse: (courseId) =>
        set((state) => ({
          hiddenCourseIds: state.hiddenCourseIds.filter((id) => id !== courseId),
        })),
      isCourseHidden: (courseId) => get().hiddenCourseIds.includes(courseId),

      setScannedData: (data) => set({ scannedData: data }),
      setIsScanning: (scanning) => set({ isScanning: scanning }),
      setRemainingScans: (scans) => set({ remainingScans: scans }),
      clearScanData: () => set({ scannedData: null }),
      setPendingScanPhotos: (photos) => set({ pendingScanPhotos: photos }),
      clearPendingScanPhotos: () => set({ pendingScanPhotos: [] }),
      setActiveScanJob: (job) => set({ activeScanJob: job }),
      updateActiveScanJob: (updates) =>
        set((state) =>
          state.activeScanJob ? { activeScanJob: { ...state.activeScanJob, ...updates } } : {}
        ),
      markActiveScanReviewPending: () =>
        set((state) =>
          state.activeScanJob
            ? { activeScanJob: { ...state.activeScanJob, autoReviewLaunched: true } }
            : {}
        ),
      markActiveScanReviewed: () =>
        set((state) =>
          state.activeScanJob
            ? { activeScanJob: { ...state.activeScanJob, requiresReview: false } }
            : {}
        ),
      clearActiveScanJob: () => set({ activeScanJob: null }),
      setDevMode: (enabled) => set({ devMode: enabled }),
      setProfileSetupSeen: (seen) => set({ profileSetupSeen: seen }),
      setShouldShowScanCourseModal: (show) => set({ shouldShowScanCourseModal: show }),
      setPendingScanCourseSelection: (selection) => set({ pendingScanCourseSelection: selection }),
      clearPendingScanCourseSelection: () => set({ pendingScanCourseSelection: null }),
      setPendingGameSetupIntent: (intent: 'new_game' | 'quick_strokes' | null) => set({ pendingGameSetupIntent: intent }),

      resetGolfStore: () =>
        set((state) => ({
          courses: [],
          players: [],
          rounds: [],
          courseUsage: [],
          devMode: false,
          profileSetupSeen: false,
          _hasHydrated: state._hasHydrated,

          scannedData: null,
          isScanning: false,
          remainingScans: 50,
          pendingScanPhotos: [],
          activeScanJob: null,
          shouldShowScanCourseModal: false,
          pendingScanCourseSelection: null,
          pendingGameSetupIntent: null,
          hiddenCourseIds: [],
        })),
	    }),
	    {
	      version: 2,
	      migrate: (persistedState: any, version: number) => {
	        // v2 introduces `handicapIndex` on round players and standardizes `handicapUsed` as Course Handicap.
	        if (!persistedState || version >= 2) return persistedState;

	        const courses: Course[] = Array.isArray(persistedState.courses) ? persistedState.courses : [];
	        const rounds: any[] = Array.isArray(persistedState.rounds) ? persistedState.rounds : [];

	        const migratedRounds = rounds.map((round) => {
	          const course = courses.find((c) => c.id === round.courseId);
	          const players = Array.isArray(round.players) ? round.players : [];

	          const migratedPlayers = players.map((p: any) => {
	            if (typeof p?.handicapIndex === "number") return p;
	            if (typeof p?.handicapUsed !== "number") return p;

	            // Heuristic: legacy local rounds stored Handicap Index in `handicapUsed`.
	            // Avoid touching synced integer course handicaps unless they look legacy (non-integer) or unsynced.
	            const looksLikeIndex = !Number.isInteger(p.handicapUsed);
	            const shouldMigrate = looksLikeIndex || round.syncStatus !== "synced";
	            if (!shouldMigrate) return p;

	            const holeNumbers = Array.isArray(p.scores)
	              ? p.scores.map((s: any) => s.holeNumber).filter((n: any) => typeof n === "number")
	              : [];

	            const handicapIndex = p.handicapUsed;
	            const courseHandicap =
	              course
	                ? calculateCourseHandicapForRound({
	                  handicapIndex,
	                  course,
	                  teeName: p.teeColor,
	                  teeGender: p.teeGender,
	                  holeNumbers,
	                })
	                : undefined;

	            return {
	              ...p,
	              handicapIndex,
	              handicapUsed: courseHandicap ?? roundHalfUpToInt(handicapIndex),
	            };
	          });

	          return { ...round, players: migratedPlayers };
	        });

	        return { ...persistedState, rounds: migratedRounds };
	      },
	      name: "golfscan-store",
	      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        courses: state.courses,
        players: state.players,
        rounds: state.rounds,
        courseUsage: state.courseUsage,
        hiddenCourseIds: state.hiddenCourseIds,
        scannedData: state.scannedData,
        isScanning: state.isScanning,
        remainingScans: state.remainingScans,
        pendingScanPhotos: state.pendingScanPhotos,
        activeScanJob: state.activeScanJob,
        profileSetupSeen: state.profileSetupSeen,
        // devMode intentionally left out to keep it temporary/non-persistent
      }),
      onRehydrateStorage: () => (state) => {
        // Simple approach: always mark as hydrated once this callback fires
        if (state) {
          state._hasHydrated = true;
        }
      },
    }
  )
);
