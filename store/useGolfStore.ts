import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Course, Player, Round, ScorecardScanResult } from "@/types";

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
  mergePlayerData: (targetPlayerId: string, sourcePlayerId: string, finalName: string) => void;
  getCourseById: (courseId: string) => Course | undefined;
  getFrequentCourses: () => any[];
  trackCourseUsage: (courseId: string, courseName: string) => void;
  removeLegacyCourses: () => void;

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

      // Domain mutators
      addCourse: (course) => set((state) => ({ courses: [...state.courses, course] })),
      updateCourse: (course) =>
        set((state) => ({ courses: state.courses.map((c) => (c.id === course.id ? course : c)) })),
      deleteCourse: (courseId) =>
        set((state) => ({ courses: state.courses.filter((c) => c.id !== courseId) })),
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
      mergePlayerData: () => undefined,
      getCourseById: (courseId) => get().courses.find((c) => c.id === courseId),
      getFrequentCourses: () =>
        [...get().courseUsage].sort((a, b) => b.count - a.count).slice(0, 5),
      trackCourseUsage: (courseId, courseName) =>
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
            ? { activeScanJob: { ...state.activeScanJob, requiresReview: true } }
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
    }),
    {
      name: "golfscan-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        courses: state.courses,
        players: state.players,
        rounds: state.rounds,
        courseUsage: state.courseUsage,
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
