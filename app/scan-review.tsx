import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  FlatList as RNFlatList,
  ActivityIndicator,
  TextInput,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
// @ts-ignore - local ambient types provided via declarations
import DraggableFlatList from 'react-native-draggable-flatlist';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams, usePathname } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import {
  X,
  Users,
  User,
  GripVertical,
  Plus,
  Link as LinkIcon,
  MapPin,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Trash2,
  Flag,
  RotateCcw,
  Check
} from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { generateUniqueId, ensureValidDate, formatLocalDateString, getLocalDateString, parseLocalDateString } from '@/utils/helpers';
import { useGolfStore } from '@/store/useGolfStore';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { mockCourses } from '@/mocks/courses';
import { CourseSearchModal } from '@/components/CourseSearchModal';
import { Button } from '@/components/Button';
import { Hole, ScorecardScanResult, ApiCourseData, Course, Player } from '@/types';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAction, useMutation, useQuery } from '@/lib/convex';
import { searchCourses } from '@/lib/golf-course-api';
import { trackRoundSaved, trackLimitReached } from '@/lib/analytics';
import { convertApiCourseToLocal, getDeterministicCourseId } from '@/utils/course-helpers';
import { matchCourseToLocal, extractUserLocation, LocationData } from '@/utils/course-matching';
import { DEFAULT_COURSE_IMAGE } from '@/constants/images';
import { calculateCourseHandicapForRound, roundHalfUpToInt } from '@/utils/handicapCourse';

interface DetectedPlayer {
  id: string;
  name: string;
  nameConfidence?: number;
  linkedPlayerId?: string;
  isUser?: boolean;
  handicap?: number;
  // Raw text input for handicap to support decimal typing (e.g., "11.")
  handicapInputText?: string;
  // Preserve previous linkage/handicap to support undoing "Select as me"
  prevLinkedPlayerId?: string;
  prevHandicap?: number;
  prevName?: string;
  teeColor?: string;
  teeGender?: 'M' | 'F';
  // When scanning from session, store the scanned name if different from session player name
  detectedAsName?: string;
  // Flag to indicate this player came from a pre-round session (locked, non-editable)
  isFromSession?: boolean;
  // Track which scanned player index was assigned (for cycling)
  scannedPlayerIndex?: number;
  scores: {
    holeNumber: number;
    strokes: number;
    confidence?: number;
  }[];
}

type ScanStage = 'preparing' | 'uploading' | 'analyzing' | 'processing' | 'complete' | 'error';

const TEE_COLORS = [
  { name: 'Black', color: '#000000' },
  { name: 'Blue', color: '#4169E1' },
  { name: 'White', color: '#FFFFFF' },
  { name: 'Yellow', color: '#FFD700' },
  { name: 'Red', color: '#FF0000' },
  { name: 'Green', color: '#008000' },
];

// Maximum number of scorecard images per scan (multi-page scorecards)
const MAX_IMAGES = 3;

export default function ScanScorecardScreen() {
  const { courseId, editRoundId, prefilled, review, onboardingMode, onboardingDemo } = useLocalSearchParams<{ courseId?: string, editRoundId?: string, prefilled?: string, review?: string, onboardingMode?: string, onboardingDemo?: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const isOnboardingMode = onboardingMode === 'true';
  const isOnboardingDemo = isOnboardingMode && (onboardingDemo === 'true' || onboardingDemo === '1');
  const instanceId = useRef(Math.random().toString(16).slice(2, 8));
  const insets = useSafeAreaInsets();
  const windowDims = useWindowDimensions();
  const onboardingDisplayName = useOnboardingStore((s) => s.displayName);
  const onboardingHasExistingHandicap = useOnboardingStore((s) => s.hasExistingHandicap);
  const onboardingExistingHandicap = useOnboardingStore((s) => s.existingHandicap);
  const reviewHeaderOptions = useMemo(() => {
    return {
      title: "Review Scorecard",
      gestureEnabled: !isOnboardingMode,
      headerStyle: {
        backgroundColor: colors.background,
      },
      headerTitleStyle: {
        color: colors.text,
      },
      headerTintColor: colors.text,
    };
  }, [isOnboardingMode]);
  useEffect(() => {
    console.log(`[scan-review ${instanceId.current}] mount`, {
      pathname,
      courseId,
      editRoundId,
      review,
      hasPrefilled: !!prefilled,
    });
    return () => console.log(`[scan-review ${instanceId.current}] unmount`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      console.log(`[scan-review ${instanceId.current}] focus`, { pathname });
      return () => console.log(`[scan-review ${instanceId.current}] blur`, { pathname });
    }, [pathname])
  );

  const {
    players,
    courses,
    rounds,
    addRound,
    updateRound,
    addPlayer,
    addCourse,
    getCourseById,
    updateCourse,
    scannedData,
    pendingScanPhotos,
    activeScanJob,
    clearScanData,
    setPendingScanPhotos,
    clearPendingScanPhotos,
    setActiveScanJob,
    updateActiveScanJob,
    markActiveScanReviewPending,
    markActiveScanReviewed,
    clearActiveScanJob,
    devMode,
    pendingScanCourseSelection,
    clearPendingScanCourseSelection,
  } = useGolfStore();
  const profile = useQuery(api.users.getProfile, isOnboardingMode ? "skip" : {});
  const roundsSummary = useQuery(
    api.rounds.listWithSummary,
    profile?._id ? { hostId: profile._id as Id<"users"> } : "skip"
  ) || [];
  // Get all Convex players for auto-link matching (includes aliases)
  const convexPlayers = useQuery(api.players.list, isOnboardingMode ? "skip" : {}) || [];
  const userGender = (profile as any)?.gender as "M" | "F" | undefined;

  // Get active session to pre-fill course data when scanning from pre-round flow
  // Note: activeSession is undefined while loading, null when no session exists
  const activeSessionRaw = useQuery(api.gameSessions.getActive, isOnboardingMode ? "skip" : {});
  const activeSessionLoaded = isOnboardingMode ? true : activeSessionRaw !== undefined;
  const activeSession = isOnboardingMode ? null : (activeSessionRaw as any);

  // Convex actions for course lookup (to check global cache before paid API)
  const getConvexCourseByExternalId = useAction(api.courses.getByExternalIdAction);
  const getOrCreateCourseImage = useAction(api.courseImages.getOrCreate);
  const upsertCourse = useMutation(api.courses.upsert);
  const addPlayerAlias = useMutation(api.players.addAlias);
  const completeSessionWithSettlement = useMutation(api.gameSessions.completeWithSettlementV2);
  const addPressMutation = useMutation(api.gameSessions.addPress);
  const removePressMutation = useMutation(api.gameSessions.removePress);
  const updateBetSettingsMutation = useMutation(api.gameSessions.updateBetSettings);
  const photos = pendingScanPhotos;
  const [processingComplete, setProcessingComplete] = useState(false);
  const [detectedPlayers, setDetectedPlayers] = useState<DetectedPlayer[]>([]);
  const [showPlayerLinking, setShowPlayerLinking] = useState(false);
  const [selectedPlayerIndex, setSelectedPlayerIndex] = useState<number | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [linkingWasRemoved, setLinkingWasRemoved] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(courseId || null);
  const [prefilledCourseName, setPrefilledCourseName] = useState<string | null>(null);
  const [showCourseSelector, setShowCourseSelector] = useState(false);
  const [showCourseSearchModal, setShowCourseSearchModal] = useState(false);
  const [coursePickerSource, setCoursePickerSource] = useState<'scan' | 'review' | null>(null);
  const [selectedTeeName, setSelectedTeeName] = useState<string | undefined>(undefined);
  const [showTeePicker, setShowTeePicker] = useState(false);
  const [teePickerPlayerIndex, setTeePickerPlayerIndex] = useState<number | null>(null);
  const [teePickerPlayerId, setTeePickerPlayerId] = useState<string | null>(null);
  const [teePickerGenderTab, setTeePickerGenderTab] = useState<'M' | 'F'>('M');
  // Store scanned players for the cycling feature in session mode
  const [sessionScannedPlayers, setSessionScannedPlayers] = useState<{
    index: number;
    name: string;
    scores: { holeNumber: number; strokes: number; confidence?: number }[];
  }[]>([]);

  const selectedLinkedIdForLinking = useMemo(() => {
    if (selectedPlayerId) {
      const p = detectedPlayers.find(dp => dp.id === selectedPlayerId);
      return p?.linkedPlayerId;
    }
    if (selectedPlayerIndex !== null && detectedPlayers[selectedPlayerIndex]) {
      return detectedPlayers[selectedPlayerIndex].linkedPlayerId;
    }
    return undefined;
  }, [detectedPlayers, selectedPlayerId, selectedPlayerIndex]);

  const handleCloseLinking = useCallback(() => {
    setShowPlayerLinking(false);
    setSelectedPlayerIndex(null);
    setSelectedPlayerId(null);
    setLinkingWasRemoved(false);
  }, []);

  const handleUnlinkSelectedPlayer = useCallback(() => {
    if (selectedPlayerIndex === null) return;
    setDetectedPlayers(prev => {
      const updated = [...prev];
      const current = { ...updated[selectedPlayerIndex] };
      current.linkedPlayerId = undefined;
      if (current.prevName !== undefined) {
        current.name = current.prevName;
        delete current.prevName;
      }
      if (current.prevLinkedPlayerId !== undefined) {
        current.linkedPlayerId = current.prevLinkedPlayerId;
        delete current.prevLinkedPlayerId;
      }
      if (current.prevHandicap !== undefined) {
        current.handicap = current.prevHandicap;
        delete current.prevHandicap;
      }
      updated[selectedPlayerIndex] = current;
      return updated;
    });
    setLinkingWasRemoved(true);
  }, [selectedPlayerIndex]);

  const linkPlayerScreenOptions = useMemo(() => {
    return {
      title: "Link to Existing Player",
      gestureEnabled: !isOnboardingMode,
      headerStyle: {
        backgroundColor: colors.background,
      },
      headerTitleStyle: {
        color: colors.text,
      },
      headerTintColor: colors.text,
      headerLeft: () => (
        <TouchableOpacity
          onPress={handleCloseLinking}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.headerButton}
        >
          <Text style={styles.headerButtonText}>{linkingWasRemoved ? 'Back' : 'Cancel'}</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        selectedLinkedIdForLinking ? (
          <TouchableOpacity
            onPress={handleUnlinkSelectedPlayer}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.headerButton}
          >
            <Text style={styles.headerButtonText}>Remove Link</Text>
          </TouchableOpacity>
        ) : null
      ),
    };
  }, [handleCloseLinking, handleUnlinkSelectedPlayer, linkingWasRemoved, selectedLinkedIdForLinking, isOnboardingMode]);
  const teePickerIndexRef = useRef<number | null>(null);
  const [notes, setNotes] = useState('');
  // Game type for winner calculation (only for post-round scans without pre-round setup)
  const [gameType, setGameType] = useState<'stroke_play' | 'match_play'>('stroke_play');
  const [date, setDate] = useState(() => getLocalDateString());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMonth, setDatePickerMonth] = useState<Date>(() => new Date());
  const [activeTab, setActiveTab] = useState<'players' | 'scores' | 'details'>('players');
  const [draggingPlayerIndex, setDraggingPlayerIndex] = useState<number | null>(null);
  const [selectedApiCourse, setSelectedApiCourse] = useState<{ apiCourse: ApiCourseData; selectedTee?: string } | null>(null);
  const [isLocalCourseSelected, setIsLocalCourseSelected] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<LocationData | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [listVersion, setListVersion] = useState(0);
  const [devSimReady, setDevSimReady] = useState(false);
  // Press modal state
  const [showPressModal, setShowPressModal] = useState(false);
  const [pressSegment, setPressSegment] = useState<'front' | 'back'>('front');
  const [pressStartHole, setPressStartHole] = useState('');
  const [isPressLoading, setIsPressLoading] = useState(false);
  // Bet amount edit modal state
  const [showBetEditModal, setShowBetEditModal] = useState(false);
  const [betEditAmount, setBetEditAmount] = useState('');
  const [betEditTarget, setBetEditTarget] = useState<'betPerUnit' | 'nassauFront' | 'nassauBack' | 'nassauOverall'>('betPerUnit');
  const lastProcessedScanId = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const isEditMode = !!editRoundId;
  // Review mode = NOT edit mode (if we're here and not editing, we're reviewing)
  const isReviewMode = !isEditMode;
  const preDragPlayersRef = useRef<DetectedPlayer[] | null>(null);
  const hasInitializedPrefill = useRef(false);
  const hasAppliedCourseSelection = useRef(false);
  const courseModalOpenPending = useRef(false);
  const currentUser = React.useMemo(
    () => {
      if (isOnboardingMode) return null;
      return (
        players.find((p) => p.isUser) ||
        (profile ? ({ id: profile._id, isUser: true, handicap: (profile as any)?.handicap, name: profile.name } as any) : null)
      );
    },
    [players, profile, isOnboardingMode]
  );
  const currentUserId = currentUser?.id as string | undefined;
  const currentUserName = (currentUser as any)?.name?.trim()?.toLowerCase?.();

  const openDatePicker = useCallback(() => {
    const parsed = parseLocalDateString(date) ?? new Date();
    setDatePickerMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    setShowDatePicker(true);
  }, [date]);

  const calendarMonthLabel = useMemo(() => {
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return `${months[datePickerMonth.getMonth()]} ${datePickerMonth.getFullYear()}`;
  }, [datePickerMonth]);

  const calendarWeeks = useMemo(() => {
    const year = datePickerMonth.getFullYear();
    const month = datePickerMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startDow = firstOfMonth.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const weeks: Array<Array<string | null>> = [];
    let day = 1;

    for (let row = 0; row < 6; row++) {
      const week: Array<string | null> = [];
      for (let col = 0; col < 7; col++) {
        const cellIndex = row * 7 + col;
        if (cellIndex < startDow || day > daysInMonth) {
          week.push(null);
        } else {
          week.push(getLocalDateString(new Date(year, month, day)));
          day += 1;
        }
      }
      weeks.push(week);
    }
    return weeks;
  }, [datePickerMonth]);

  const handleSelectDateFromPicker = useCallback((value: string) => {
    setDate(value);
    setShowDatePicker(false);
  }, []);

  const scrollMetricsRef = useRef({
    players: { y: 0, contentH: 0, layoutH: 0 },
    scores: { y: 0, contentH: 0, layoutH: 0 },
    details: { y: 0, contentH: 0, layoutH: 0 },
  });
  const [scrollDebug, setScrollDebug] = useState(scrollMetricsRef.current);
  const [rootLayoutH, setRootLayoutH] = useState<number>(0);
  const [tabBarBottom, setTabBarBottom] = useState<number>(0);
  useEffect(() => {
    if (!__DEV__) return;
    if (!devMode) return;
    const id = setInterval(() => {
      setScrollDebug({ ...scrollMetricsRef.current });
    }, 250);
    return () => clearInterval(id);
  }, [devMode]);

  const setScrollMetrics = useCallback(
    (
      key: keyof typeof scrollMetricsRef.current,
      patch: Partial<(typeof scrollMetricsRef.current)[keyof typeof scrollMetricsRef.current]>
    ) => {
      scrollMetricsRef.current[key] = { ...scrollMetricsRef.current[key], ...patch };
    },
    []
  );

  const updateScrollMetrics = useCallback(
    (key: keyof typeof scrollMetricsRef.current) => (e: any) => {
      const n = e?.nativeEvent;
      if (!n) return;
      setScrollMetrics(key, {
        y: n.contentOffset?.y ?? 0,
        contentH: n.contentSize?.height ?? 0,
        layoutH: n.layoutMeasurement?.height ?? 0,
      });
    },
    [setScrollMetrics]
  );

  const updateLayoutMetrics = useCallback(
    (key: keyof typeof scrollMetricsRef.current) => (e: any) => {
      const h = e?.nativeEvent?.layout?.height;
      if (typeof h !== 'number') return;
      setScrollMetrics(key, { layoutH: h });
    },
    [setScrollMetrics]
  );

  const updateContentMetrics = useCallback(
    (key: keyof typeof scrollMetricsRef.current) => (_w: number, h: number) => {
      if (typeof h !== 'number') return;
      setScrollMetrics(key, { contentH: h });
    },
    [setScrollMetrics]
  );

  // Linkable players: mirror the Players tab (ground truth) using the same Convex summary
  // First pass: extract unique player IDs from rounds
  const linkablePlayerData = React.useMemo(() => {
    const map = new Map<string, Player & { latestDate?: string }>();
    const userIds = new Set<string>();
    const userNames = new Set<string>();
    players.forEach((p) => {
      if (p.isUser) userIds.add(p.id);
      if (p.isUser && p.name) userNames.add(p.name.trim().toLowerCase());
    });
    if (currentUserId) userIds.add(currentUserId);
    if (currentUserName) userNames.add(currentUserName);

    // Sort rounds by date (newest first) to get most recent handicap
    const sortedRounds = [...roundsSummary].sort((a: any, b: any) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    sortedRounds.forEach((round: any) => {
      (round.players || []).forEach((p: any) => {
        if (!p.playerId) return;
        if (userIds.has(p.playerId as any)) return; // exclude the signed-in user from link targets
        const storePlayer = players.find((sp) => sp.id === p.playerId);
        if (storePlayer?.isUser) return; // extra guard in case ids mismatch
        if (p.playerName && userNames.has(p.playerName.trim().toLowerCase())) return; // exclude by name match to user

        // Only add if not already present (we process newest rounds first, so first match = most recent)
        if (!map.has(p.playerId)) {
          map.set(p.playerId, {
            id: p.playerId,
            name: p.playerName,
            // Use the player's handicap index (Scandicap). `handicapUsed` on rounds is course handicap.
            handicap: storePlayer?.handicap,
            isUser: storePlayer?.isUser,
            latestDate: round.date,
          } as Player & { latestDate?: string });
        }
      });
    });

    return Array.from(map.values()).filter((p) => !p.isUser && !userIds.has(p.id));
  }, [roundsSummary, players, currentUserId, currentUserName]);

  // Extract player IDs for batch query (only valid Convex IDs)
  const linkablePlayerIds = React.useMemo(() => {
    return linkablePlayerData
      .map(p => p.id)
      .filter(id => id && id.length > 0) as any[];
  }, [linkablePlayerData]);

  // Batch query for calculated Scandicaps - only query if we have player IDs
  const batchHandicaps = useQuery(
    api.players.getHandicapsBatch,
    isOnboardingMode ? "skip" : (linkablePlayerIds.length > 0 ? { playerIds: linkablePlayerIds } : "skip")
  ) as Record<string, { handicap: number | null; roundsPlayed: number }> | undefined;

  // Merge calculated Scandicaps into linkable players
  const linkablePlayers = React.useMemo(() => {
    if (!batchHandicaps) return linkablePlayerData;

    return linkablePlayerData.map(player => {
      const calculated = batchHandicaps[player.id];
      if (calculated?.handicap !== null && calculated?.handicap !== undefined) {
        return { ...player, handicap: calculated.handicap };
      }
      return player;
    });
  }, [linkablePlayerData, batchHandicaps]);

  // Stable user id to avoid re-renders and repeated network calls
  const [userId] = useState<string>(() => {
    if (isOnboardingMode) return generateUniqueId();
    const currentUser = players.find(p => p.isUser);
    return currentUser?.id || generateUniqueId();
  });

  const buildDevSampleResult = (): ScorecardScanResult => ({
    courseName: 'Dev National - Demo Course',
    courseNameConfidence: 0.9,
    date: getLocalDateString(),
    dateConfidence: 0.9,
    overallConfidence: 0.9,
    players: [
      {
        name: 'Miguel',
        nameConfidence: 0.95,
        scores: Array.from({ length: 18 }).map((_, idx) => ({
          hole: idx + 1,
          score: idx % 3 === 0 ? 5 : 4,
          confidence: 0.9,
        })),
      },
      {
        name: 'Alex',
        nameConfidence: 0.9,
        scores: Array.from({ length: 18 }).map((_, idx) => ({
          hole: idx + 1,
          score: idx % 4 === 0 ? 6 : 5,
          confidence: 0.85,
        })),
      },
    ],
  });

  // Helper function to get current user ID
  function getCurrentUserId(): string { return userId; }

  // Initialize state from prefilled edit data
  useEffect(() => {
    if (isEditMode && prefilled && !hasInitializedPrefill.current) {
      try {
        const data = JSON.parse(prefilled) as {
          courseId: string | null;
          courseName?: string | null;
          players: {
            id: string;
            name: string;
            scores: { holeNumber: number; strokes: number }[];
            teeColor?: string;
            handicap?: number;
            isUser?: boolean;
          }[];
          date: string;
          notes: string;
          scorecardPhotos?: string[];
        };
        if (data.courseId) {
          setSelectedCourse(data.courseId);
          setPrefilledCourseName(data.courseName ?? null);
        }
        setDate(ensureValidDate(data.date));
        setNotes(data.notes || '');
        const linkedPlayers: DetectedPlayer[] = (data.players || []).map((p) => ({
          id: generateUniqueId(),
          name: p.name,
          linkedPlayerId: p.id,
          teeColor: p.teeColor || 'Blue',
          handicap: p.handicap,
          isUser: !!p.isUser,
          scores: p.scores.map((s) => ({ holeNumber: s.holeNumber, strokes: s.strokes })),
        }));
        setDetectedPlayers(linkedPlayers);
        // Preserve previously saved photos when editing
        const anyData: any = data as any;
        if (Array.isArray(anyData.scorecardPhotos) && anyData.scorecardPhotos.length > 0) {
          setPendingScanPhotos(anyData.scorecardPhotos);
        }
        setProcessingComplete(true);
        setActiveTab('players');
        hasInitializedPrefill.current = true;
      } catch (e) {
        console.error('Failed to parse prefilled edit data', e);
      }
    }
  }, [isEditMode, prefilled]);

  useEffect(() => {
    if (!selectedCourse) return;
    const isLocal = courses.some(c => c.id === selectedCourse);
    setIsLocalCourseSelected((prev) => (prev === isLocal ? prev : isLocal));
  }, [selectedCourse, courses]);

  // Helper: to base64 (full quality)
  const convertImageToBase64 = async (uri: string): Promise<string> => {
    try {
      if (uri.startsWith('data:')) return uri;
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any } as any);
      // Best guess MIME
      const mime = uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      return `data:${mime};base64,${base64}`;
    } catch (e) {
      console.error('Error converting image to base64:', e);
      throw new Error('Failed to process image');
    }
  };

  // Enable LayoutAnimation for Android
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Update remaining scans from query
  // TODO: reinstate remaining scans fetch if needed; removed legacy tRPC hook usage.

  // Get user location for course matching bias
  useEffect(() => {
    const getUserLocation = async () => {
      try {
        const location = await extractUserLocation();
        setUserLocation(location);
      } catch (error) {
        console.log('Could not get user location for course matching, continuing without location bias');
      }
    };

    getUserLocation();
  }, []);

  useEffect(() => {
    if (isEditMode) return;

    // Wait until course modal is closed before processing results
    if (showCourseSearchModal) return;

    // Don't reprocess if already complete (prevents overwriting user edits)
    if (processingComplete) return;

    if (activeScanJob?.requiresReview && activeScanJob.result) {
      if (lastProcessedScanId.current !== activeScanJob.id) {
        lastProcessedScanId.current = activeScanJob.id;
        processAIResults(activeScanJob.result);
      }
    } else if (!activeScanJob) {
      lastProcessedScanId.current = null;
    }
  }, [activeScanJob, isEditMode, showCourseSearchModal, processingComplete]);

  // Auto-apply pending course selection from home screen, or open course selector if needed
  useEffect(() => {
    if (!isReviewMode || !processingComplete) return;

    // Skip if we've already applied course selection once (prevents repeated overwrites)
    if (hasAppliedCourseSelection.current) return;

    // If we have a pending course selection from home screen, apply it
    if (pendingScanCourseSelection) {
      console.log('[SCAN] Applying pending course selection from home screen:', pendingScanCourseSelection);
      setSelectedCourse(pendingScanCourseSelection.courseId);
      setSelectedTeeName(pendingScanCourseSelection.teeName);
      setIsLocalCourseSelected(true);

      // Apply tee to all players (like handleSelectCourse does)
      if (pendingScanCourseSelection.teeName) {
        setDetectedPlayers(prev =>
          prev.map(p => ({
            ...p,
            teeColor: pendingScanCourseSelection.teeName,
            teeGender: userGender ?? 'M',
          }))
        );
        setListVersion(v => v + 1);
      }

      // Also persist to activeScanJob so it survives app reload
      if (activeScanJob) {
        setActiveScanJob({
          ...activeScanJob,
          selectedCourseId: pendingScanCourseSelection.courseId,
          selectedTeeName: pendingScanCourseSelection.teeName,
        });
      }

      hasAppliedCourseSelection.current = true;
      clearPendingScanCourseSelection(); // Clear after applying
      return;
    }

    // If there's a course already selected in the active scan job, apply it
    if (activeScanJob?.selectedCourseId && !selectedCourse) {
      console.log('[SCAN] Restoring course selection from activeScanJob:', activeScanJob.selectedCourseId);
      setSelectedCourse(activeScanJob.selectedCourseId);
      if (activeScanJob.selectedTeeName) {
        setSelectedTeeName(activeScanJob.selectedTeeName);
        // Apply tee to all players
        setDetectedPlayers(prev =>
          prev.map(p => ({
            ...p,
            teeColor: activeScanJob.selectedTeeName,
            teeGender: userGender ?? 'M',
          }))
        );
        setListVersion(v => v + 1);
      }
      setIsLocalCourseSelected(true);
      hasAppliedCourseSelection.current = true;
      return;
    }

    // If we have an active session with course data, use that
    if (activeSession?.course && !hasAppliedCourseSelection.current) {
      const convexCourse = activeSession.course;
      // Use externalId as the canonical ID (matches local Zustand store format)
      const courseId = convexCourse.externalId || convexCourse._id;
      console.log('[SCAN] Applying course from active session:', courseId, convexCourse.name);

      // Convert Convex course format to local Course format and add to Zustand
      const localCourse: Course = {
        id: courseId,
        name: convexCourse.name,
        location: convexCourse.location || 'Unknown location',
        holes: convexCourse.holes?.map((h: any) => ({
          number: h.number,
          par: h.par,
          distance: h.yardage || 0,
          handicap: h.hcp,
        })) || [],
        imageUrl: convexCourse.imageUrl,
        slope: convexCourse.slope,
        rating: convexCourse.rating,
        teeSets: convexCourse.teeSets,
      };

      // Add to Zustand store for later lookups
      if (!getCourseById(courseId)) {
        addCourse(localCourse);
      }

      setSelectedCourse(courseId);
      setIsLocalCourseSelected(true);

      // Get the tee from the first participant (they all use the same course)
      const firstParticipant = activeSession.participants?.[0];
      if (firstParticipant?.teeName) {
        setSelectedTeeName(firstParticipant.teeName);
        setDetectedPlayers(prev =>
          prev.map(p => ({
            ...p,
            teeColor: firstParticipant.teeName,
            teeGender: (firstParticipant.teeGender || userGender || 'M') as 'M' | 'F',
          }))
        );
        setListVersion(v => v + 1);
      }

      // Persist to activeScanJob for consistency
      if (activeScanJob) {
        setActiveScanJob({
          ...activeScanJob,
          selectedCourseId: courseId,
          selectedCourseName: convexCourse.name,
          selectedTeeName: firstParticipant?.teeName,
        });
      }

      hasAppliedCourseSelection.current = true;
      return;
    }

    // Only auto-open course selector if:
    // 1. No course selected and modal not already shown
    // 2. Active session query has finished loading (to avoid opening while waiting)
    // 3. There's no active session at all
    console.log('[SCAN-REVIEW] Course modal check:', {
      isReviewMode,
      processingComplete,
      selectedCourse,
      selectedApiCourse,
      showCourseSearchModal,
      isLocalCourseSelected,
      activeSessionLoaded,
      activeSession: activeSession ? 'exists' : 'null',
      hasAppliedCourseSelection: hasAppliedCourseSelection.current,
      shouldOpenModal: !selectedCourse && !selectedApiCourse && !showCourseSearchModal && !isLocalCourseSelected && activeSessionLoaded && !activeSession,
    });
    if (!selectedCourse && !selectedApiCourse && !showCourseSearchModal && !isLocalCourseSelected && activeSessionLoaded && !activeSession && !courseModalOpenPending.current) {
      console.log('[SCAN-REVIEW] Opening course search modal');
      courseModalOpenPending.current = true;
      // Small timeout to ensure transition/mount is done
      const timer = setTimeout(() => {
        setShowCourseSearchModal(true);
        setCoursePickerSource('review');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isReviewMode, processingComplete, selectedCourse, selectedApiCourse, showCourseSearchModal, isLocalCourseSelected, pendingScanCourseSelection, activeScanJob, activeSession, activeSessionLoaded, courses, userGender]);

  // Helper function for confidence-based styling
  const getConfidenceStyle = (confidence?: number) => {
    if (confidence !== undefined && confidence < 0.6) {
      return { backgroundColor: '#FFF3CD', borderColor: '#FFEAA7' }; // Light yellow for low confidence
    }
    return {};
  };

  // Handle retake - navigate back to camera with full state cleanup
  const handleRetake = () => {
    // Clear ALL scan-related state to prevent auto-reopen loops
    clearPendingScanPhotos();
    clearPendingScanCourseSelection();
    clearScanData();
    clearActiveScanJob();  // CRITICAL: prevents auto-nav back to review

    // Navigate to camera
    router.replace('/scan-scorecard');
  };


  const processAIResults = (scanResult: ScorecardScanResult) => {
    const currentUser = isOnboardingMode ? undefined : players.find(p => p.isUser);
    const teeFromResult = (scanResult as any).teeName as string | undefined;
    const teeOverride = teeFromResult || activeScanJob?.selectedTeeName || selectedTeeName;

    // Check if we have an active session with participants
    const sessionParticipants = activeSession?.playerDetails || [];
    const hasActiveSession = activeSession && sessionParticipants.length > 0;

    // SESSION MODE: When scanning from pre-round flow, match scanned scores to session participants
    if (hasActiveSession) {
      console.log('[SCAN] Session mode - matching scanned players to session participants');

      // Parse all scanned players from AI results
      const scannedPlayers = scanResult.players.map((p, index) => ({
        index,
        name: p.name,
        nameLower: p.name.toLowerCase().trim(),
        scores: p.scores
          .filter(s => s.score !== null)
          .map(s => ({
            holeNumber: s.hole,
            strokes: s.score!,
            confidence: s.confidence
          }))
      }));

      // Track which scanned player indices have been assigned
      const usedIndices = new Set<number>();

      // STEP 1: Compute distance matrix for all session participants to all scanned players
      // This allows optimal global assignment instead of greedy per-participant
      const distanceMatrix: { pIdx: number; sIdx: number; distance: number; scanned: typeof scannedPlayers[0] }[] = [];

      for (let pIdx = 0; pIdx < sessionParticipants.length; pIdx++) {
        const participant = sessionParticipants[pIdx];
        const participantNameLower = (participant.name || '').toLowerCase().trim();
        const participantNamesToMatch = [
          participantNameLower,
          ...(participant.aliases || []).map((a: string) => a.toLowerCase().trim())
        ];

        for (const scanned of scannedPlayers) {
          // Find best match against primary name or any alias
          let bestDistance = Infinity;
          for (const nameToMatch of participantNamesToMatch) {
            const distance = levenshteinDistance(nameToMatch, scanned.nameLower);
            if (distance < bestDistance) {
              bestDistance = distance;
            }
          }
          distanceMatrix.push({ pIdx, sIdx: scanned.index, distance: bestDistance, scanned });
        }
      }

      // STEP 2: Sort by distance (best matches first) and assign greedily from global best
      distanceMatrix.sort((a, b) => a.distance - b.distance);

      const assignmentByParticipant: Map<number, { scanned: typeof scannedPlayers[0]; distance: number }> = new Map();

      for (const entry of distanceMatrix) {
        // Skip if this participant already has an assignment
        if (assignmentByParticipant.has(entry.pIdx)) continue;
        // Skip if this scanned player already used
        if (usedIndices.has(entry.sIdx)) continue;

        // Assign this scanned player to this participant
        assignmentByParticipant.set(entry.pIdx, { scanned: entry.scanned, distance: entry.distance });
        usedIndices.add(entry.sIdx);
      }

      // STEP 3: Create DetectedPlayers from session participants using optimal assignments
      const sessionModePlayers: DetectedPlayer[] = sessionParticipants.map((participant: any, pIdx: number) => {
        const participantNameLower = (participant.name || '').toLowerCase().trim();

        const assignment = assignmentByParticipant.get(pIdx);
        const assigned = assignment ? { ...assignment.scanned, distance: assignment.distance } : null;

        // Use assigned scores, or empty if no match
        const matchedScores = assigned ? assigned.scores : [];
        // Show detected name if it differs from participant name
        const detectedName = assigned && assigned.nameLower !== participantNameLower
          ? assigned.name
          : undefined;

        console.log('[SCAN] Name matching:', {
          participantName: participant.name,
          scannedName: assigned?.name,
          assignedIndex: assigned?.index,
          distance: assigned?.distance,
          detectedAsName: detectedName,
          teeName: participant.teeName,
        });

        const isCurrentUser = currentUserId && participant.playerId === currentUserId;

        return {
          id: generateUniqueId(),
          name: participant.name,
          linkedPlayerId: participant.playerId,
          isUser: isCurrentUser || false,
          handicap: participant.handicapIndex,
          teeColor: participant.teeName || teeOverride || 'Blue',
          teeGender: (participant.teeGender as 'M' | 'F') || userGender || 'M',
          detectedAsName: detectedName,
          isFromSession: true,
          scannedPlayerIndex: assigned?.index,
          scores: matchedScores,
        };
      });

      // Set date
      setDate(ensureValidDate(scanResult.date));
      // Save scanned players for cycling feature
      setSessionScannedPlayers(scannedPlayers.map(p => ({
        index: p.index,
        name: p.name,
        scores: p.scores,
      })));
      setDetectedPlayers(sessionModePlayers);
      setProcessingComplete(true);
      return;
    }

    // REGULAR MODE: Convert AI results to DetectedPlayer format
    const aiDetectedPlayers: DetectedPlayer[] = scanResult.players.map(player => ({
      id: generateUniqueId(),
      name: player.name,
      nameConfidence: player.nameConfidence,
      teeColor: 'Blue', // temporary default, overridden below if teeOverride is present
      scores: player.scores
        .filter(score => score.score !== null) // Filter out null scores
        .map(score => ({
          holeNumber: score.hole,
          strokes: score.score!,
          confidence: score.confidence
        }))
    }));

    // Auto-link players with existing players and mark user
    const linkedPlayers = autoLinkPlayers(aiDetectedPlayers);

    // If we have a tee chosen from course selection or dev sample, apply it to all players.
    const playersWithTee = teeOverride
      ? linkedPlayers.map(p => ({
        ...p,
        teeColor: teeOverride,
        teeGender: userGender ?? 'M',
      }))
      : linkedPlayers.map(p => ({ ...p, teeGender: userGender ?? 'M' }));

    // Set date - use detected date if valid, otherwise default to today's date
    setDate(ensureValidDate(scanResult.date));

    setDetectedPlayers(playersWithTee);
    setProcessingComplete(true);
  };

  // Simple Levenshtein distance function for name matching
  const levenshteinDistance = (str1: string, str2: string): number => {
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

  // Auto-link players with exact name matches after scanning
  // IMPORTANT: Use Convex players as source of truth, not Zustand store (which may be stale)
  const autoLinkPlayers = (detectedPlayers: DetectedPlayer[]): DetectedPlayer[] => {
    return detectedPlayers.map(player => {
      // Skip if already linked
      if (player.linkedPlayerId) return player;

      const normalizedDetectedName = player.name.toLowerCase().trim();

      // Look for exact match in Convex players (including aliases)
      const exactMatch = convexPlayers.find((p: any) => {
        // Check name match
        if (p.name?.toLowerCase().trim() === normalizedDetectedName) return true;
        // Check alias match
        const aliases = p.aliases || [];
        return aliases.some((alias: string) => alias.toLowerCase().trim() === normalizedDetectedName);
      });

      if (exactMatch) {
        const matchId = (exactMatch as any)._id;
        // If this exact match is the current user, treat as "You" (no Linked badge)
        const matchesUserById = currentUserId && matchId === currentUserId;
        const matchesUserByFlag = (exactMatch as any).isSelf;
        const matchesUserByName = currentUserName && exactMatch.name?.toLowerCase() === currentUserName;
        if (matchesUserById || matchesUserByFlag || matchesUserByName) {
          const resolvedHandicap =
            (exactMatch as any).handicap ??
            (!isOnboardingMode ? (profile as any)?.handicap : undefined) ??
            currentUser?.handicap;
          return {
            ...player,
            linkedPlayerId: matchId,
            handicap: resolvedHandicap,
            isUser: true,
            prevLinkedPlayerId: player.prevLinkedPlayerId,
            prevHandicap: player.prevHandicap,
          };
        }

        const updatedPlayer = {
          ...player,
          linkedPlayerId: matchId,
          handicap: (exactMatch as any).handicap
        };
        return updatedPlayer;
      }

      return player;
    });
  };

  const handleEditPlayerName = (index: number, newName: string) => {
    // legacy index-based handler retained for safety; forwards to id-based when possible
    const player = detectedPlayers[index];
    if (player) {
      handleEditPlayerNameById(player.id, newName);
    }
  };

  const handleEditPlayerNameById = (playerId: string, newName: string) => {
    const normalizedName = newName.toLowerCase().trim();

    setDetectedPlayers(prev => {
      const updated = prev.map(p => ({ ...p }));
      const idx = updated.findIndex(p => p.id === playerId);
      if (idx < 0) return prev;
      updated[idx].name = newName;

      // Skip auto-link if already linked
      if (updated[idx].linkedPlayerId) return updated;

      // Auto-link if exact match found in Convex players (by name or alias)
      const matchedPlayer = convexPlayers.find((p: any) => {
        // Check name match
        if (p.name?.toLowerCase().trim() === normalizedName) return true;
        // Check alias match
        const aliases = (p as any).aliases || [];
        return aliases.some((alias: string) => alias.toLowerCase().trim() === normalizedName);
      });

      if (matchedPlayer) {

        const matchId = (matchedPlayer as any)._id || (matchedPlayer as any).id;
        const matchesUserById = currentUserId && matchId === currentUserId;
        const matchesUserByFlag = (matchedPlayer as any).isSelf;
        const matchesUserByName = currentUserName && matchedPlayer.name?.toLowerCase().trim() === currentUserName;

        if (matchesUserById || matchesUserByFlag || matchesUserByName) {
          // Treat as "You": set isUser, avoid Linked badge
          updated.forEach(p => { p.isUser = false; });
          updated[idx].isUser = true;
          updated[idx].linkedPlayerId = matchId;
          updated[idx].handicap =
            (matchedPlayer as any).handicap ??
            (!isOnboardingMode ? (profile as any)?.handicap : undefined) ??
            currentUser?.handicap;
          // Preserve prior linkage/handicap for undo
          if (updated[idx].prevLinkedPlayerId === undefined) {
            updated[idx].prevLinkedPlayerId = updated[idx].linkedPlayerId;
          }
          if (updated[idx].prevHandicap === undefined && updated[idx].handicap !== undefined) {
            updated[idx].prevHandicap = updated[idx].handicap;
          }
        } else {
          updated[idx].linkedPlayerId = matchId;
          updated[idx].handicap = (matchedPlayer as any).handicap;
          if ((matchedPlayer as any).gender === "M" || (matchedPlayer as any).gender === "F") {
            updated[idx].teeGender = (matchedPlayer as any).gender;
          }
        }
      }
      return updated;
    });
  };

  // Cycle through available scanned players for session mode
  const handleCycleDetectedPlayer = (playerId: string) => {
    console.log('[CYCLE] Starting cycle for player:', playerId);
    console.log('[CYCLE] sessionScannedPlayers:', sessionScannedPlayers.length);
    if (sessionScannedPlayers.length === 0) {
      console.log('[CYCLE] No scanned players to cycle through');
      return;
    }

    setDetectedPlayers(prev => {
      const updated = [...prev];
      const playerIndex = updated.findIndex(p => p.id === playerId);
      if (playerIndex < 0) return prev;

      const player = updated[playerIndex];
      const currentScannedIndex = player.scannedPlayerIndex;

      // Get all scanned player indices to cycle through (not just unassigned)
      const allIndices = sessionScannedPlayers.map(sp => sp.index);

      if (allIndices.length <= 1) {
        console.log('[CYCLE] Only one scanned player, cannot cycle');
        return prev;
      }

      // Find next index in the cycle
      const currentPosition = allIndices.indexOf(currentScannedIndex ?? -1);
      const nextPosition = (currentPosition + 1) % allIndices.length;
      const nextScannedIndex = allIndices[nextPosition];

      const nextScanned = sessionScannedPlayers.find(sp => sp.index === nextScannedIndex);
      if (!nextScanned) return prev;

      // Check if someone else has this scanned player - if so, swap!
      const otherPlayerIndex = updated.findIndex((p, i) =>
        i !== playerIndex && p.scannedPlayerIndex === nextScannedIndex
      );

      if (otherPlayerIndex >= 0) {
        // Swap: give the other player our current scanned player
        const currentScanned = sessionScannedPlayers.find(sp => sp.index === currentScannedIndex);
        const otherPlayer = updated[otherPlayerIndex];

        updated[otherPlayerIndex] = {
          ...otherPlayer,
          scannedPlayerIndex: currentScannedIndex,
          scores: currentScanned?.scores || [],
          detectedAsName: currentScanned && currentScanned.name.toLowerCase().trim() !== otherPlayer.name.toLowerCase().trim()
            ? currentScanned.name
            : undefined,
        };
        console.log('[CYCLE] Swapped with player:', otherPlayer.name);
      }

      // Update this player with the next scanned assignment
      updated[playerIndex] = {
        ...player,
        scannedPlayerIndex: nextScannedIndex,
        scores: nextScanned.scores,
        detectedAsName: nextScanned.name.toLowerCase().trim() !== player.name.toLowerCase().trim()
          ? nextScanned.name
          : undefined,
      };

      return updated;
    });
    setListVersion(v => v + 1);
  };

  const handleEditPlayerHandicap = (index: number, handicap: string) => {
    const handicapValue = handicap.trim() === '' ? undefined : Number(handicap);

    setDetectedPlayers(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        handicap: isNaN(Number(handicap)) ? undefined : handicapValue
      };
      return updated;
    });
  };

  const sanitizeHandicapInput = (value: string) => {
    const raw = value.trim();
    const hasLeadingMinus = raw.startsWith("-");
    const cleaned = raw.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    const normalized = parts.length <= 1 ? cleaned : `${parts.shift()}.${parts.join("")}`;
    if (hasLeadingMinus) return normalized === "" ? "-" : `-${normalized}`;
    return normalized;
  };

  const handleEditPlayerHandicapById = (playerId: string, handicap: string) => {
    // Store raw text to allow typing decimals (e.g., "11." while typing "11.7")
    // Only convert to number if it's a valid complete number
    const trimmed = sanitizeHandicapInput(handicap.trim());
    const isValidNumber =
      trimmed !== "" && trimmed !== "-" && !isNaN(Number(trimmed)) && !trimmed.endsWith(".");
    const parsed = isValidNumber ? Number(trimmed) : undefined;
    const handicapValue =
      parsed !== undefined && parsed >= -10 && parsed <= 54 ? parsed : undefined;

    setDetectedPlayers(prev => {
      const idx = prev.findIndex(p => p.id === playerId);
      if (idx < 0) return prev;
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        handicapInputText: trimmed,
        handicap: isValidNumber ? (handicapValue ?? updated[idx].handicap) : updated[idx].handicap
      };
      return updated;
    });
  };

  const handleEditTeeColor = (index: number, teeColor: string) => {
    setDetectedPlayers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], teeColor };
      return updated;
    });
  };

  const handleEditScore = (playerIndex: number, holeNumber: number, strokes: number) => {
    setDetectedPlayers(prev => {
      const updated = [...prev];
      const scoreIndex = updated[playerIndex].scores.findIndex(s => s.holeNumber === holeNumber);

      if (scoreIndex >= 0) {
        updated[playerIndex].scores[scoreIndex].strokes = strokes;
      }

      return updated;
    });
  };

  const handleRemovePlayer = (index: number) => {
    Alert.alert(
      "Remove Player",
      "Are you sure you want to remove this player?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setDetectedPlayers(prev => prev.filter((_, i) => i !== index));
            setListVersion(v => v + 1);
          }
        }
      ]
    );
  };

  const handleRemovePlayerById = (playerId: string) => {
    Alert.alert(
      "Remove Player",
      "Are you sure you want to remove this player?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setDetectedPlayers(prev => prev.filter(p => p.id !== playerId));
            setListVersion(v => v + 1);
          }
        }
      ]
    );
  };

  const handleAddPlayer = () => {
    if (!detectedPlayers.length) return;

    // Copy scores structure from first player but set all scores to 0
    const scoreTemplate = detectedPlayers[0].scores.map(s => ({
      holeNumber: s.holeNumber,
      strokes: 0
    }));

    setDetectedPlayers(prev => [
      ...prev,
      {
        id: generateUniqueId(),
        name: "New Player",
        teeColor: 'White',
        scores: scoreTemplate
      }
    ]);
  };

  const handleLinkPlayer = (index: number) => {
    setSelectedPlayerIndex(index);
    const player = detectedPlayers[index];
    setSelectedPlayerId(player?.id || null);
    setLinkingWasRemoved(false);
    setShowPlayerLinking(true);
  };

  const handleLinkPlayerById = (playerId: string) => {
    setSelectedPlayerId(playerId);
    const idx = detectedPlayers.findIndex(p => p.id === playerId);
    setSelectedPlayerIndex(idx >= 0 ? idx : null);
    setLinkingWasRemoved(false);
    setShowPlayerLinking(true);
  };

  const handleSelectExistingPlayer = (existingPlayerId: string, playerName: string, handicap?: number) => {
    const idx = selectedPlayerId ? detectedPlayers.findIndex(p => p.id === selectedPlayerId) : selectedPlayerIndex ?? -1;
    if (idx === null || idx < 0) return;
    setDetectedPlayers(prev => {
      const updated = [...prev];
      const current = { ...updated[idx] };
      // Preserve original values for later restore if not already preserved
      if (current.prevName === undefined) current.prevName = current.name;
      if (current.prevLinkedPlayerId === undefined && current.linkedPlayerId !== undefined) current.prevLinkedPlayerId = current.linkedPlayerId;
      if (current.prevHandicap === undefined && current.handicap !== undefined) current.prevHandicap = current.handicap;
      // Apply link and overwrite visible name/handicap to the selected profile
      current.linkedPlayerId = existingPlayerId;
      current.name = playerName;
      current.handicap = handicap;
      updated[idx] = current;
      return updated;
    });
    setListVersion(v => v + 1);

    setShowPlayerLinking(false);
    setSelectedPlayerIndex(null);
    setSelectedPlayerId(null);
  };

  const handleMarkAsUser = (index: number) => {
    setDetectedPlayers(prev => {
      const updated = prev.map(p => ({ ...p, isUser: false }));
      if (index >= 0 && index < updated.length) {
        updated[index].isUser = true;
      }
      return updated;
    });
  };

  // Mark/unmark as current user by player id (works after reordering and when already linked)
  const handleMarkAsUserById = (playerId: string) => {
    const currentUser = players.find(p => p.isUser);
    // Get official Scandicap from Convex profile
    const profileHandicap = isOnboardingMode
      ? (onboardingHasExistingHandicap ? onboardingExistingHandicap : undefined)
      : (profile as any)?.handicap;
    const profileName = isOnboardingMode
      ? (onboardingDisplayName?.trim() || 'You')
      : ((profile as any)?.name || currentUser?.name || 'You');

    setDetectedPlayers(prev => {
      const updated = prev.map(p => ({ ...p }));
      const idx = updated.findIndex(p => p.id === playerId);
      if (idx >= 0) {
        const selected = { ...updated[idx] };
        const togglingOff = !!selected.isUser; // currently marked as user -> unmark

        if (togglingOff) {
          // Restore previous state
          selected.isUser = false;
          if (selected.prevLinkedPlayerId !== undefined) {
            selected.linkedPlayerId = selected.prevLinkedPlayerId;
          } else {
            delete selected.linkedPlayerId;
          }
          if (selected.prevHandicap !== undefined) {
            selected.handicap = selected.prevHandicap;
          } else {
            delete (selected as any).handicap;
          }
          if (selected.prevName !== undefined) {
            selected.name = selected.prevName;
          }
          delete selected.prevLinkedPlayerId;
          delete selected.prevHandicap;
          delete selected.prevName;
        } else {
          // Turning on: clear isUser on others and link this to current user
          updated.forEach(p => { p.isUser = false; });
          selected.isUser = true;

          // Save previous values for undo
          if (selected.prevLinkedPlayerId === undefined) {
            selected.prevLinkedPlayerId = selected.linkedPlayerId;
          }
          if (selected.prevHandicap === undefined && selected.handicap !== undefined) {
            selected.prevHandicap = selected.handicap;
          }
          if (selected.prevName === undefined) {
            selected.prevName = selected.name;
          }

          // Apply user's profile data
          if (!isOnboardingMode && currentUser) {
            selected.linkedPlayerId = currentUser.id;
          } else {
            delete selected.linkedPlayerId;
          }
          selected.name = profileName;
          selected.handicap = (profileHandicap ?? undefined) ?? (!isOnboardingMode ? currentUser?.handicap : undefined);
        }
        updated[idx] = selected;
      }
      return updated;
    });
    setListVersion(v => v + 1);
  };

  const handleReorderPlayers = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    setDetectedPlayers(prev => {
      const updated = [...prev];
      const [movedPlayer] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, movedPlayer);
      return updated;
    });
  };

  const startDragging = (index: number) => {
    setDraggingPlayerIndex(index);
  };

  const endDragging = () => {
    setDraggingPlayerIndex(null);
  };

  const handlePlayerDrop = (dropIndex: number) => {
    if (draggingPlayerIndex !== null && draggingPlayerIndex !== dropIndex) {
      handleReorderPlayers(draggingPlayerIndex, dropIndex);
    }
    endDragging();
  };

  // Helper function to get the display name of the selected course
  const getSelectedCourseName = (): string => {
    if (selectedApiCourse?.apiCourse) {
      const { apiCourse } = selectedApiCourse;
      return `${apiCourse.club_name} - ${apiCourse.course_name}`;
    }

    const localCourse = courses.find(c => c.id === selectedCourse);
    if (localCourse) return localCourse.name;
    if (selectedCourse && prefilledCourseName) return prefilledCourseName;
    return "Select Course";
  };

  const handleSelectCourse = (course: Course, meta?: { apiCourse?: ApiCourseData; selectedTee?: string }) => {
    setSelectedCourse(course.id);
    setSelectedApiCourse(meta?.apiCourse ? { apiCourse: meta.apiCourse, selectedTee: meta.selectedTee } : null);
    const teePicked = meta?.selectedTee;
    if (teePicked) {
      setSelectedTeeName(teePicked);
      // When course changes and a tee was picked, overwrite all players with the new tee.
      setDetectedPlayers(prev =>
        prev.map(p => ({
          ...p,
          teeColor: teePicked,
          teeGender: userGender ?? 'M', // default to user gender; per-player overrides happen on link
        }))
      );
      setListVersion(v => v + 1);
    }
    setShowCourseSearchModal(false);
    // In onboarding mode, go to players tab so users can identify themselves
    // In normal mode, go to details tab to confirm round info
    setActiveTab(onboardingMode === 'true' ? 'players' : 'details');

    if (activeScanJob) {
      setActiveScanJob({
        ...activeScanJob,
        selectedCourseId: course.id,
        selectedCourseName: course.name,
        ...(meta?.selectedTee
          ? { selectedTeeName: meta.selectedTee, selectedTeeGender: undefined }
          : {}),
      } as any);
    }

    const source = coursePickerSource;
    setCoursePickerSource(null);
    if (!isEditMode && source === 'scan') {
      // Clear all modal/stacked screens before navigating to home
      if (router.canDismiss()) {
        router.dismissAll();
      }
      router.replace('/(tabs)');
    }
  };

  const openTeePicker = (playerId: string, index: number) => {
    const tees = getAvailableTeeSets();
    const player = detectedPlayers[index];
    const defaultGender =
      player?.teeGender ??
      (tees.find((t: any) => t.gender === 'M')
        ? 'M'
        : tees.find((t: any) => t.gender === 'F')
          ? 'F'
          : 'M');

    setTeePickerPlayerIndex(index);
    teePickerIndexRef.current = index;
    setTeePickerPlayerId(playerId ?? null);
    setTeePickerGenderTab(defaultGender);
    setShowTeePicker(true);
  };

  const handleSelectTee = (teeName: string, gender?: 'M' | 'F') => {
    const stateIndex = teePickerPlayerIndex;
    const refIndex = teePickerIndexRef.current;

    const targetIndex =
      stateIndex ??
      refIndex ??
      (teePickerPlayerId ? detectedPlayers.findIndex(p => p.id === teePickerPlayerId) : -1);

    if (targetIndex === null || targetIndex === undefined || targetIndex < 0) {
      console.warn('[teePicker] missing target index', { stateIndex, refIndex, playerId: teePickerPlayerId });
      return;
    }

    setDetectedPlayers(prev => {
      const updated = [...prev];
      if (!updated[targetIndex]) return prev;
      updated[targetIndex] = { ...updated[targetIndex], teeColor: teeName, teeGender: gender };
      return updated;
    });
    setListVersion(v => v + 1);
    setShowTeePicker(false);
    setTeePickerPlayerIndex(null);
    setTeePickerPlayerId(null);
    teePickerIndexRef.current = null;
  };

  const buildPrefillHoles = (): Hole[] => {
    // For now, since we don't have actual par data from scorecard scanning yet,
    // we'll default to par 4 for all holes. When scorecard scanning is implemented,
    // this should extract the actual par data from the scanned scorecard.
    return Array.from({ length: 18 }, (_, i) => ({
      number: i + 1,
      par: 4,
      distance: 0
    }));
  };

  const getAvailableTeeSets = () => {
    const course = selectedCourse ? courses.find(c => c.id === selectedCourse) : null;
    const teeSets = (course as any)?.teeSets;
    if (Array.isArray(teeSets) && teeSets.length > 0) {
      return teeSets;
    }
    return [];
  };

  const handleAddCourseManually = () => {
    const holesPrefill = buildPrefillHoles();
    router.push({ pathname: '/manual-course-entry', params: { holes: JSON.stringify(holesPrefill) } });
  };

  const validateForm = () => {
    if (!selectedCourse) {
      Alert.alert("Error", "Please select a course before continuing");
      return false;
    }

    if (detectedPlayers.length === 0) {
      Alert.alert("Error", "No players detected. Please try scanning again or add players manually");
      return false;
    }

    // Check if all players have names
    const emptyNamePlayer = detectedPlayers.find(p => !p.name.trim());
    if (emptyNamePlayer) {
      Alert.alert("Error", "All players must have names");
      return false;
    }

    // Check if all scores are entered
    for (const player of detectedPlayers) {
      if (player.scores.some(s => s.strokes === 0)) {
        Alert.alert("Error", "Please enter scores for all holes");
        return false;
      }
    }

    return true;
  };

  const handleSaveRound = async () => {
    if (!validateForm()) {
      return;
    }

    // Require at least one player to be linked as the current user
    const hasUserLinked = detectedPlayers.some(p => p.isUser);
    if (!hasUserLinked) {
      Alert.alert(
        'Link Yourself',
        'Please link at least one player as "You" by tapping on the player card and tapping the "Link as Me" button.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Auto-link check before save: match any unlinked players by name or alias
    const playersWithAutoLink = detectedPlayers.map(player => {
      if (player.linkedPlayerId) return player; // Already linked

      const normalizedName = player.name.toLowerCase().trim();

      // Check Convex players (by name or alias)
      const convexMatch = convexPlayers.find((p: any) => {
        if (p.name?.toLowerCase().trim() === normalizedName) return true;
        const aliases = (p as any).aliases || [];
        return aliases.some((alias: string) => alias.toLowerCase().trim() === normalizedName);
      });

      // Fallback to Zustand players
      const zustandMatch = !convexMatch ? players.find(p => p.name?.toLowerCase().trim() === normalizedName) : null;
      const matchedPlayer = convexMatch || zustandMatch;

      if (matchedPlayer) {
        const matchId = (matchedPlayer as any)._id || (matchedPlayer as any).id;

        return {
          ...player,
          linkedPlayerId: matchId,
          handicap: player.handicap ?? (matchedPlayer as any).handicap,
          teeGender: (matchedPlayer as any).gender === "M" || (matchedPlayer as any).gender === "F"
            ? (matchedPlayer as any).gender
            : player.teeGender,
        };
      }
      return player;
    });

    // Create aliases for linked players whose detected name differs from stored name
    // This helps auto-link work better on future scans
    for (const player of playersWithAutoLink) {
      if (player.linkedPlayerId) {
        // Find the linked player to get their stored name
        const linkedPlayer = convexPlayers.find((cp: any) =>
          (cp as any)._id === player.linkedPlayerId || cp.name === player.linkedPlayerId
        );
        if (linkedPlayer) {
          const storedName = linkedPlayer.name?.toLowerCase().trim();
          const detectedName = player.name.toLowerCase().trim();

          // If names differ, create an alias (addAlias handles deduplication)
          if (storedName && detectedName && storedName !== detectedName) {
            try {
              await addPlayerAlias({
                playerId: (linkedPlayer as any)._id,
                alias: player.name,
              });
            } catch (e) {
              // Alias creation is best-effort, don't fail the save
              console.warn('Failed to create alias:', e);
            }
          }
        }
      }
    }

    // Calculate total scores for each player
    const playersWithTotalScores = playersWithAutoLink.map(player => {
      const totalScore = player.scores.reduce((sum, score) => sum + score.strokes, 0);
      return {
        ...player,
        totalScore
      };
    });

    // Ensure course persistence/image when saving
    let finalCourseId = selectedCourse as string;
    let finalCourseName = 'Unknown Course';

    if (selectedApiCourse) {
      const { apiCourse, selectedTee } = selectedApiCourse;
      const apiCourseName = `${apiCourse.club_name} - ${apiCourse.course_name}`;
      const deterministicId = getDeterministicCourseId(apiCourse, selectedTee);

      let matchedCourse = courses.find(c => c.id === deterministicId);

      if (!matchedCourse) {
        const localMatchResult = matchCourseToLocal(apiCourseName, courses, userLocation, true);
        if (localMatchResult.match) {
          matchedCourse = localMatchResult.match;
          console.log(`✅ SAVE MATCH: Using existing local course "${matchedCourse.name}" (${localMatchResult.confidence}% confidence)`);
        }
      }

      if (matchedCourse) {
        finalCourseId = matchedCourse.id;
        finalCourseName = matchedCourse.name;

        const needsImage = !matchedCourse.imageUrl || matchedCourse.imageUrl === DEFAULT_COURSE_IMAGE;
        if (needsImage) {
          try {
            const refreshedCourse = await convertApiCourseToLocal(apiCourse, {
              selectedTee,
              fetchImage: true,
              fetchImageFn: (args) => getOrCreateCourseImage(args),
            });
            updateCourse(refreshedCourse);
          } catch (error) {
            console.error('Failed to refresh course image on save:', error);
          }
        }

        if (selectedCourse !== matchedCourse.id) {
          setSelectedCourse(matchedCourse.id);
        }
        setIsLocalCourseSelected(true);
      } else {
        // Check Convex global cache before calling paid API
        // This allows reusing course data that other users have already fetched
        let convexCourse: any = null;
        try {
          console.log(`🔍 SAVE: Checking Convex cache for externalId: ${deterministicId}`);
          convexCourse = await getConvexCourseByExternalId({ externalId: deterministicId });
          if (convexCourse) {
            console.log(`✅ SAVE: Found course in Convex cache: ${convexCourse.name}`);
          }
        } catch (err) {
          console.warn('Convex course lookup failed, falling back to API:', err);
        }

        if (convexCourse) {
          // Found in Convex - convert to local format and use
          // externalId is the link to the original API ID for future updates
          const courseFromConvex: Course = {
            id: convexCourse.externalId || convexCourse._id,
            name: convexCourse.name,
            location: convexCourse.location,
            holes: convexCourse.holes?.map((h: any) => ({
              number: h.number,
              par: h.par,
              distance: h.yardage || 0,
              handicap: h.hcp,
            })) || [],
            imageUrl: convexCourse.imageUrl,
            slope: convexCourse.slope,
            rating: convexCourse.rating,
            teeSets: convexCourse.teeSets,
            isApiCourse: true,
            apiId: convexCourse.externalId ? Number(convexCourse.externalId) : undefined,
          };
          addCourse(courseFromConvex); // Add to local Zustand cache
          finalCourseId = courseFromConvex.id;
          finalCourseName = courseFromConvex.name;
          setSelectedCourse(courseFromConvex.id);
          setIsLocalCourseSelected(true);
          console.log(`📥 SAVE: Added course from Convex cache to local store`);
        } else {
          // Not in Convex - call paid API and save to both Convex AND local
          console.log(`➕ SAVE: Course not cached. Fetching from API: "${apiCourseName}"`);
          try {
            const newLocalCourse = await convertApiCourseToLocal(apiCourse, {
              selectedTee,
              fetchImage: true,
              fetchImageFn: (args) => getOrCreateCourseImage(args),
            });
            addCourse(newLocalCourse);
            finalCourseId = newLocalCourse.id;
            finalCourseName = newLocalCourse.name;
            setSelectedCourse(newLocalCourse.id);
            setIsLocalCourseSelected(true);

            // Also save to Convex global cache for other users
            try {
              await upsertCourse({
                externalId: newLocalCourse.id, // This is the API ID, the key link for future updates
                name: newLocalCourse.name,
                location: newLocalCourse.location || "Unknown",
                slope: (newLocalCourse as any).slope,
                rating: (newLocalCourse as any).rating,
                teeSets: (newLocalCourse as any).teeSets?.map((t: any) => ({
                  name: t.name,
                  rating: t.rating,
                  slope: t.slope,
                  gender: t.gender,
                  frontRating: t.frontRating,
                  frontSlope: t.frontSlope,
                  backRating: t.backRating,
                  backSlope: t.backSlope,
                  holes: t.holes?.map((h: any, idx: number) => ({
                    number: h.number ?? idx + 1,
                    par: h.par,
                    hcp: h.handicap ?? h.hcp ?? idx + 1,
                    yardage: h.distance ?? h.yardage,
                  })),
                })),
                holes: newLocalCourse.holes.map((h) => ({
                  number: h.number,
                  par: h.par,
                  hcp: (h as any).handicap ?? (h as any).hcp ?? h.number,
                  yardage: (h as any).distance ?? (h as any).yardage,
                })),
                imageUrl: (newLocalCourse as any).imageUrl !== DEFAULT_COURSE_IMAGE
                  ? (newLocalCourse as any).imageUrl
                  : undefined,
              });
              console.log(`☁️ SAVE: Cached course to Convex for other users`);
            } catch (convexErr) {
              console.warn('Convex upsert failed (non-fatal):', convexErr);
            }
          } catch (error: any) {
            console.error('Failed to convert API course while saving round:', error);

            // Extract rate limit info from ConvexError message if applicable
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('COURSE_API_LIMIT_REACHED')) {
              const parts = errorMessage.split(':');
              const resetsInHours = parts[1] || 'some';

              Alert.alert(
                'Course Info Limit',
                `Daily limit for fetching new course details reached. Resets in ${resetsInHours}h. Saving without full course data.`,
                [{ text: 'OK' }]
              );

              trackLimitReached({
                service: 'courseApi',
                limitType: 'daily',
                resetsInHours: parseInt(resetsInHours, 10),
              });
            }

            finalCourseName = apiCourseName;
            finalCourseId = deterministicId;
          }
        }
      }

      setSelectedApiCourse(null);
    } else {
      const localCourse = courses.find(c => c.id === selectedCourse);
      finalCourseName = localCourse?.name || 'Unknown Course';
    }


    // Helper to ensure every saved player carries tee info
    const teeSetsForCourse = getAvailableTeeSets();
    const resolveTeeForPlayer = (player: any) => {
      const baseName = player.teeColor || selectedTeeName || undefined;
      let gender = player.teeGender as "M" | "F" | undefined;

      if (!gender && baseName && Array.isArray(teeSetsForCourse) && teeSetsForCourse.length > 0) {
        const match = teeSetsForCourse.find(
          (t: any) =>
            typeof t.name === "string" &&
            t.name.toLowerCase() === baseName.toString().toLowerCase()
        );
        if (match && (match.gender === "M" || match.gender === "F")) {
          gender = match.gender as "M" | "F";
        }
      }

      return { teeColor: baseName, teeGender: gender };
    };

    // Helper to check if ID is a valid Convex ID (32 alphanumeric chars)
    const isConvexId = (id: string | undefined | null) => !!id && /^[a-z0-9]{32}$/i.test(id);

    // Create the round object
    const roundId = isEditMode && editRoundId ? editRoundId : generateUniqueId();

    // Find existing round to preserve remoteId if it was synced
    const existingRound = isEditMode
      ? rounds.find((r: any) => r.id === editRoundId || r.remoteId === editRoundId)
      : null;

    // Determine the remoteId:
    // 1. If existingRound has a remoteId, use it
    // 2. Else if editRoundId is a valid Convex ID, use it as remoteId (round came from Convex)
    const resolvedRemoteId = existingRound?.remoteId
      ?? (isEditMode && isConvexId(editRoundId) ? editRoundId : undefined);

    // Determine hole count from detected players' scores
    const holeCount = detectedPlayers.length > 0 ?
      Math.max(...detectedPlayers[0].scores.map(score => score.holeNumber)) : 18;

	      const courseForHandicap =
	        courses.find((c) => c.id === finalCourseId) ??
	        (selectedCourse ? courses.find((c) => c.id === selectedCourse) : undefined);

	      const newRound = {
	      id: existingRound?.id ?? roundId,
      ...(resolvedRemoteId ? { remoteId: resolvedRemoteId } : {}),
      date,
      courseId: finalCourseId,
      courseName: finalCourseName,
	      players: playersWithTotalScores.map(player => {
	        const teeMeta = resolveTeeForPlayer(player);
	        const holeNumbers = (player.scores ?? []).map((s: any) => s.holeNumber).filter((n: any) => typeof n === 'number');
	        const handicapIndex = typeof player.handicap === 'number' ? player.handicap : undefined;
	        const courseHandicap =
	          courseForHandicap
	            ? calculateCourseHandicapForRound({
	              handicapIndex,
	              course: courseForHandicap,
	              teeName: teeMeta.teeColor,
	              teeGender: teeMeta.teeGender,
	              holeNumbers,
	            })
	            : undefined;
	        return {
	          playerId: player.linkedPlayerId || player.id,
	          playerName: player.name,
	          scores: player.scores,
	          totalScore: player.scores.reduce((sum, score) => sum + score.strokes, 0),
	          handicapIndex,
	          handicapUsed: courseHandicap ?? (handicapIndex !== undefined ? roundHalfUpToInt(handicapIndex) : undefined),
	          // Persist tee selection so Round Details and Convex sync
	          // can show tee name + gender.
	          teeColor: teeMeta.teeColor,
	          teeGender: teeMeta.teeGender,
	          isUser: !!player.isUser,
        };
      }),
      notes,
      holeCount: holeCount <= 9 ? 9 : 18,
      scorecardPhotos: photos,
      // Mark as pending so RoundSyncer will push to Convex (including dev-mode rounds)
      syncStatus: 'pending' as const,
      // Store session ID so RoundSyncer can link and complete it after sync
      gameSessionId: activeSession?._id as string | undefined,
      // Store selected game type for winner calculation (post-round scans)
      ...(gameType ? { gameType } : {}),
    };

    // Save detected names as aliases for better future matching
    for (const player of playersWithTotalScores) {
      if (player.detectedAsName && player.linkedPlayerId) {
        try {
          // Check if the linkedPlayerId is a valid Convex ID
          const linkedId = player.linkedPlayerId;
          if (linkedId && /^[a-z0-9]{32}$/i.test(linkedId)) {
            await addPlayerAlias({
              playerId: linkedId as any,
              alias: player.detectedAsName,
            });
            console.log('[SCAN] Added alias:', player.detectedAsName, 'for player:', player.name);
          }
        } catch (err) {
          console.warn('[SCAN] Failed to add alias:', err);
        }
      }
    }

	    if (isEditMode) {
	      // Ensure any new players are added to the store
	      newRound.players.forEach(p => {
	        if (!players.some(existing => existing.id === p.playerId)) {
	          addPlayer({ id: p.playerId, name: p.playerName, handicap: (p as any).handicapIndex ?? p.handicapUsed });
	        }
	      });
      updateRound(newRound as any);
      // Return to the existing Round Details screen without pushing a duplicate
      router.back();
    } else {
      // Add the round to the store and go straight to Round Details
      // Session linking and settlement will be handled by RoundSyncer after round syncs
      addRound(newRound as any);

      // Track round saved
      trackRoundSaved({
        playerCount: newRound.players.length,
        holeCount: newRound.holeCount as 9 | 18,
        source: 'scan',
      });

      // If in onboarding mode, pass the flag to round details for Continue button
      if (onboardingMode === 'true') {
        router.replace(`/round/${roundId}?onboardingMode=true`);
      } else {
        router.replace(`/round/${roundId}`);
      }
    }

    markActiveScanReviewed();
    clearActiveScanJob();
    clearPendingScanPhotos();
    clearScanData();
    if (isMountedRef.current) {
      setProcessingComplete(false);
      setDetectedPlayers([]);
      setSelectedApiCourse(null);
      setIsLocalCourseSelected(false);
    }
  };

  // expo-router's `<Stack.Screen />` calls `navigation.setOptions(options)` whenever the
  // `options` object identity changes. Keep callbacks/options stable to avoid update loops.
  const handleSaveRoundRef = useRef(handleSaveRound);
  useEffect(() => {
    handleSaveRoundRef.current = handleSaveRound;
  }, [handleSaveRound]);
  const onPressSaveRound = useCallback(() => {
    void handleSaveRoundRef.current();
  }, []);
  const onPressCancelEdit = useCallback(() => {
    // Clear all modal/stacked screens before navigating to home
    if (router.canDismiss()) {
      router.dismissAll();
    }
    router.replace('/(tabs)');
  }, [router]);
  const handleOnboardingContinueWithoutSave = useCallback(() => {
    // Demo onboarding: don't persist anything; just continue the onboarding flow.
    markActiveScanReviewed();
    clearActiveScanJob();
    clearPendingScanPhotos();
    clearScanData();
    if (router.canDismiss()) {
      router.dismissAll();
    }
    router.replace('/(onboarding)/paywall');
  }, [clearActiveScanJob, clearPendingScanPhotos, clearScanData, markActiveScanReviewed, router]);
  const resultsScreenOptions = useMemo(() => {
    return {
      title: isEditMode ? "Edit Round" : "Scorecard Results",
      gestureEnabled: !isOnboardingMode,
      headerStyle: {
        backgroundColor: colors.background,
      },
      headerTitleStyle: {
        color: colors.text,
      },
      headerTintColor: colors.text,
      headerLeft: isEditMode ? () => (
        <TouchableOpacity
          onPress={onPressCancelEdit}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.headerButton}
        >
          <Text style={styles.headerButtonText}>Cancel</Text>
        </TouchableOpacity>
      ) : undefined,
      headerRight: () => (
        <TouchableOpacity
          onPress={onPressSaveRound}
          style={styles.headerButton}
        >
          <Text style={styles.headerButtonText}>Save</Text>
        </TouchableOpacity>
      )
    };
  }, [isEditMode, onPressCancelEdit, onPressSaveRound, isOnboardingMode]);

  if (showPlayerLinking) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={linkPlayerScreenOptions} />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
        >
          <Text style={styles.linkingTitle}>
            Select an existing player to link with{" "}
            <Text style={styles.highlightText}>
              {(() => {
                const p = selectedPlayerId ? detectedPlayers.find(dp => dp.id === selectedPlayerId) : (selectedPlayerIndex !== null ? detectedPlayers[selectedPlayerIndex] : null);
                return p ? p.name : "";
              })()}
            </Text>
          </Text>

          {linkablePlayers.length > 0 ? (
            linkablePlayers
              .filter(p => !p.isUser) // hide the current user from merge targets
              .map((player, idx) => {
                const isSelected = selectedLinkedIdForLinking === player.id;
                return (
                  <TouchableOpacity
                    key={player.id || `${player.name}-${idx}`}
                    style={[styles.playerLinkItem, isSelected && styles.playerLinkItemSelected]}
                    onPress={() => handleSelectExistingPlayer(player.id, player.name, player.handicap)}
                  >
                    <View style={styles.playerLinkAvatar}>
                      <Text style={styles.playerLinkInitial}>{player.name.charAt(0)}</Text>
                    </View>
                    <View style={styles.playerLinkInfo}>
                      <View style={styles.playerLinkNameRow}>
                        <Text style={styles.playerLinkName}>{player.name}</Text>
                        {(() => {
                          // Get aliases from convexPlayers
                          const convexPlayer = convexPlayers.find((cp: any) =>
                            (cp as any)._id === player.id || cp.name === player.name
                          );
                          const aliases = (convexPlayer as any)?.aliases || [];
                          if (aliases.length > 0) {
                            return (
                              <Text style={styles.playerLinkAlias}>
                                {' '}aka {aliases.slice(0, 2).join(', ')}
                                {aliases.length > 2 && '...'}
                              </Text>
                            );
                          }
                          return null;
                        })()}
                      </View>
                      {player.handicap !== undefined && (
                        <Text style={styles.playerLinkHandicap}>Scandicap: {player.handicap}</Text>
                      )}
                    </View>
                    {isSelected ? (
                      <Check size={20} color={colors.primary} />
                    ) : (
                      <LinkIcon size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })
          ) : (
            <View style={styles.noPlayersContainer}>
              <Text style={styles.noPlayersText}>No existing players found.</Text>
              <Text style={styles.noPlayersSubtext}>
                Continue without linking to create a new player profile.
              </Text>
              <Button
                title="Continue Without Linking"
                onPress={() => {
                  setShowPlayerLinking(false);
                  setSelectedPlayerIndex(null);
                }}
                style={styles.noPlayersButton}
              />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if ((isEditMode || isReviewMode) && processingComplete) {
    return (
      <SafeAreaView
        style={[styles.container, { height: windowDims.height, minHeight: 0 }]}
        edges={[]}
        onLayout={(e) => setRootLayoutH(e.nativeEvent.layout.height)}
      >
        <Stack.Screen options={resultsScreenOptions} />

        {/* Custom Modal Header */}
        <View style={styles.customHeader}>
          {onboardingMode === 'true' ? (
            // Onboarding mode - centered title, no back button, Continue button
            <>
              <View style={{ width: 50 }} />
              <Text style={styles.customHeaderTitle}>Review Your Round</Text>
              <TouchableOpacity
                style={styles.customHeaderButton}
                onPress={isOnboardingDemo ? handleOnboardingContinueWithoutSave : onPressSaveRound}
              >
                <Text style={styles.customHeaderButtonText}>Continue</Text>
              </TouchableOpacity>
            </>
          ) : (
            // Normal mode - standard header
            <>
              <View style={{ width: 50 }} />
              <Text style={styles.customHeaderTitle}>Scorecard Results</Text>
              <TouchableOpacity style={styles.customHeaderButton} onPress={onPressSaveRound}>
                <Text style={styles.customHeaderButtonText}>Save</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View
          style={styles.tabContainer}
          onLayout={(e) => {
            const { y, height } = e.nativeEvent.layout;
            setTabBarBottom(y + height);
          }}
        >
          <TouchableOpacity
            style={[styles.tab, activeTab === 'players' && styles.activeTab]}
            onPress={() => setActiveTab('players')}
          >
            <User size={18} color={colors.text} />
            <Text style={[styles.tabText, activeTab === 'players' && styles.activeTabText]}>Players</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'scores' && styles.activeTab]}
            onPress={() => setActiveTab('scores')}
          >
            <Users size={18} color={colors.text} />
            <Text style={[styles.tabText, activeTab === 'scores' && styles.activeTabText]}>Scores</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'details' && styles.activeTab]}
            onPress={() => setActiveTab('details')}
          >
            <MapPin size={18} color={colors.text} />
            <Text style={[styles.tabText, activeTab === 'details' && styles.activeTabText]}>Details</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'players' ? (
          <View style={styles.flexFill} pointerEvents="box-none" onLayout={updateLayoutMetrics('players')}>
            <DraggableFlatList
              data={detectedPlayers}
              extraData={listVersion}
              keyExtractor={(item: DetectedPlayer) => item.id}
              activationDistance={6}
              // DraggableFlatList uses an internal container view; it needs flex to render/scroll
              // properly inside formSheet with a pinned root height.
              containerStyle={styles.flexFill}
              style={styles.scrollView}
              contentContainerStyle={{
                padding: 16,
                paddingBottom: 24 + Math.max(insets.bottom, 0),
              }}
              autoscrollThreshold={40}
              autoscrollSpeed={280}
              bounces={false}
              scrollEnabled={true}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              scrollEventThrottle={16}
              onScroll={updateScrollMetrics('players')}
              onContentSizeChange={updateContentMetrics('players')}
              simultaneousHandlers={[]}
              dragItemOverflow
              onDragBegin={() => {
                preDragPlayersRef.current = detectedPlayers.map(p => ({ ...p }));
                setIsDragging(true);
              }}
              onDragEnd={({ data }: { data: DetectedPlayer[] }) => {
                const anchored = data.map((player, index) => {
                  const original = preDragPlayersRef.current ? preDragPlayersRef.current[index] : detectedPlayers[index];
                  return {
                    ...player,
                    scores: original ? original.scores : player.scores,
                  };
                });
                setDetectedPlayers(anchored);
                setIsDragging(false);
              }}
              ListHeaderComponent={
                <View>
                  <View style={[styles.sectionHeader, isDragging && { pointerEvents: 'none' }]}>
                    <Text style={styles.sectionTitle}>
                      {detectedPlayers.some(p => p.isFromSession) ? 'Session Players' : 'Detected Players'}
                    </Text>
                    {!detectedPlayers.some(p => p.isFromSession) && (
                      <TouchableOpacity style={styles.addPlayerButton} onPress={handleAddPlayer} disabled={isDragging}>
                        <Plus size={16} color={colors.primary} />
                        <Text style={styles.addPlayerText}>Add Player</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {/* Onboarding guidance - show when in onboarding mode and no player is marked as "You" yet */}
                  {onboardingMode === 'true' && !detectedPlayers.some(p => p.isUser) && (
                    <View style={styles.onboardingBanner}>
                      <Text style={styles.onboardingBannerTitle}>Select Your Player</Text>
                      <Text style={styles.onboardingBannerText}>
                        Tap the person icon next to your name to link scores to your profile and track your handicap.
                      </Text>
                    </View>
                  )}
                </View>
              }
              ListFooterComponent={
                detectedPlayers.some(p => p.isFromSession) ? (
                  <View style={[styles.infoBox, isDragging && { pointerEvents: 'none' }]}>
                    <Text style={styles.infoTitle}>Score Assignment</Text>
                    <Text style={styles.infoText}>• Players are from your pre-round setup</Text>
                    <Text style={styles.infoText}>• Scores are automatically matched to players</Text>
                    <Text style={styles.infoText}>• Tap "Detected as" to cycle through options</Text>
                  </View>
                ) : (
                  <View style={[styles.infoBox, isDragging && { pointerEvents: 'none' }]}>
                    <Text style={styles.infoTitle}>Player Management</Text>
                    <Text style={styles.infoText}>• Drag to reorder players if they were detected incorrectly</Text>
                    <Text style={styles.infoText}>• Edit names by clicking on them and changing the text</Text>
                    <Text style={styles.infoText}>• Link players to existing profiles using the link icon</Text>
                    <Text style={styles.infoText}>• Mark yourself using the user icon</Text>
                    <Text style={styles.infoText}>• Set Scandicaps and tee colors for accurate scoring</Text>
                    <Text style={styles.infoText}>• Tap tee color to cycle through available options</Text>
                  </View>
                )
              }
              renderItem={({ item: player, index, drag, isActive, getIndex }: any) => (
                <TouchableOpacity
                  key={player.id}
                  activeOpacity={1}
                  onLongPress={player.isFromSession ? undefined : drag}
                  delayLongPress={120}
                  style={[
                    styles.playerCard,
                    player.isUser && styles.userPlayerCard,
                    isActive && styles.draggingPlayerCard,
                  ]}
                >
                  <View style={styles.playerHeaderRow}>
                    {/* Only show drag handle for non-session players */}
                    {!player.isFromSession && (
                      <TouchableOpacity
                        style={styles.dragHandle}
                        onLongPress={drag}
                        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                      >
                        <GripVertical size={18} color={isActive ? colors.primary : colors.text} />
                      </TouchableOpacity>
                    )}
                    <View style={{ flex: 1 }}>
                      <TextInput
                        style={[
                          styles.playerNameInline,
                          getConfidenceStyle(player.nameConfidence),
                          player.isFromSession && { marginLeft: 4 }
                        ]}
                        value={player.name}
                        onChangeText={(text) => handleEditPlayerNameById(player.id, text)}
                        editable={!player.linkedPlayerId && !player.isFromSession}
                        placeholder="Player Name"
                      />
                      {/* Session mode: always show detected assignment and allow cycling through all scanned players */}
                      {player.isFromSession && (
                        <TouchableOpacity
                          onPress={() => handleCycleDetectedPlayer(player.id)}
                          disabled={sessionScannedPlayers.length === 0}
                          style={{ flexDirection: 'row' }}
                        >
                          <Text style={styles.detectedAsText}>Detected as </Text>
                          <Text
                            style={[
                              styles.detectedAsText,
                              {
                                color: sessionScannedPlayers.length === 0 ? colors.text : colors.primary,
                                textDecorationLine: sessionScannedPlayers.length === 0 ? 'none' : 'underline',
                              },
                            ]}
                          >
                            "{(
                              sessionScannedPlayers.find(sp => sp.index === player.scannedPlayerIndex)?.name ??
                              player.detectedAsName ??
                              'Tap to assign'
                            )}"
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.headerRightRow}>
                      {player.isUser && (
                        <View style={styles.userBadge}><Text style={styles.userBadgeText}>You</Text></View>
                      )}
                      {/* Show Pre-Round badge for session players */}
                      {player.isFromSession && (
                        <View style={styles.sessionBadge}><Text style={styles.sessionBadgeText}>Pre-Round</Text></View>
                      )}
                      {/* Show Linked badge for non-session linked players */}
                      {player.linkedPlayerId && !player.isUser && !player.isFromSession && (
                        <View style={styles.linkedBadge}><Text style={styles.linkedBadgeText}>Linked</Text></View>
                      )}
                      {/* Hide action icons for session players */}
                      {!player.isFromSession && (
                        <>
                          <TouchableOpacity style={styles.playerAction} onPress={() => handleLinkPlayerById(player.id)}>
                            <LinkIcon
                              size={18}
                              color={
                                player.isUser
                                  ? colors.primary // keep orange for "You"
                                  : player.linkedPlayerId
                                    ? colors.text
                                    : colors.primary
                              }
                            />
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.playerAction} onPress={() => handleMarkAsUserById(player.id)}>
                            <User size={18} color={player.isUser ? colors.text : colors.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.playerAction} onPress={() => handleRemovePlayerById(player.id)}>
                            <X size={18} color={colors.error} />
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                  <View style={styles.playerDetailsRow}>
                    <View style={styles.handicapContainer}>
                      <Text style={styles.handicapLabel}>Scandicap:</Text>
                      <TextInput
                        style={[styles.handicapInput, player.isUser && styles.handicapInputDisabled]}
                        value={player.handicapInputText ?? (player.handicap !== undefined ? String(player.handicap) : '')}
                        onChangeText={(text) => handleEditPlayerHandicapById(player.id, text)}
                        placeholder="Not set"
                        placeholderTextColor={colors.text}
                        keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad'}
                        editable={!player.isUser}
                      />
                    </View>
                    <View style={styles.teeColorContainer}>
                      <Text style={styles.teeColorLabel}>Tee:</Text>
                      <TouchableOpacity
                        style={styles.teeColorSelector}
                        onPress={() => openTeePicker(player.id, getIndex ? getIndex() : index)}
                        activeOpacity={0.9}
                      >
                        <Text style={styles.teeColorText}>
                          {player.teeColor || 'Select'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        ) : activeTab === 'scores' ? (
          <View style={styles.flexFill} onLayout={updateLayoutMetrics('scores')}>
            <RNFlatList
              data={detectedPlayers.length > 0 ? detectedPlayers[0].scores : []}
              keyExtractor={(item) => String(item.holeNumber)}
              style={styles.scrollView}
              contentContainerStyle={[
                styles.contentContainer,
                { paddingBottom: 24 + Math.max(insets.bottom, 0) },
              ]}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              scrollEventThrottle={16}
              onScroll={updateScrollMetrics('scores')}
              onContentSizeChange={updateContentMetrics('scores')}
              ListHeaderComponent={
                <View style={styles.tabContent}>
                  <View style={styles.sectionHeaderColumn}>
                    <Text style={styles.sectionTitle}>Scores</Text>
                    <Text style={styles.sectionSubtitle}>Review and edit scores for each hole</Text>
                    <View style={styles.retakeRow}>
                      <RotateCcw size={18} color={colors.text} style={{ marginRight: 10 }} />
                      <Text style={styles.retakeRowText}>Scores look off? Retake a clearer photo.</Text>
                      <Button
                        title="Retake"
                        variant="outline"
                        size="small"
                        onPress={handleRetake}
                        style={styles.retakeButton}
                      />
                    </View>
                  </View>

                  <View style={styles.scoresTable}>
                    <View style={styles.scoresTableHeader}>
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="clip"
                        style={[
                          styles.scoresTableHeaderCell,
                          styles.holeBandCell,
                          styles.holeHeaderLabel,
                        ]}
                      >
                        HOLE
                      </Text>
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="clip"
                        style={[styles.scoresTableHeaderCell, styles.holeParCell, styles.headerLabel]}
                      >
                        PAR
                      </Text>
                      {detectedPlayers.map((player) => (
                        <Text
                          key={player.id}
                          numberOfLines={1}
                          ellipsizeMode="clip"
                          style={[
                            styles.scoresTableHeaderCell,
                            styles.playerScoreCell,
                            styles.headerWhiteCell,
                            styles.headerLabel,
                          ]}
                        >
                          {player.name}
                          {player.isUser ? " (You)" : ""}
                        </Text>
                      ))}
                    </View>
                  </View>
                </View>
              }
              renderItem={({ item }) => {
                const course = selectedCourse ? courses.find((c) => c.id === selectedCourse) : null;
                const holes = course?.holes ?? [];
                const hole = holes.find((h) => h.number === item.holeNumber);
                const par = hole ? hole.par : 4;

                return (
                  <View style={styles.scoresTableRow}>
                    <Text style={[styles.scoresTableCell, styles.holeBandCell, styles.holeNumberText]}>
                      {item.holeNumber}
                    </Text>

                    <Text style={[styles.scoresTableCell, styles.holeParCell]}>{par}</Text>

                    {detectedPlayers.map((player, playerIndex) => {
                      const playerScore = player.scores.find((s) => s.holeNumber === item.holeNumber);
                      const strokes = playerScore ? playerScore.strokes : 0;

                      let scoreColor = colors.text;
                      if (strokes > 0) {
                        if (strokes < par) scoreColor = colors.success;
                        else if (strokes > par) scoreColor = colors.error;
                      }

                      return (
                        <TextInput
                          key={player.id}
                          style={[
                            styles.scoresTableCell,
                            styles.playerScoreCell,
                            styles.scoreInput,
                            { color: scoreColor },
                            getConfidenceStyle(playerScore?.confidence),
                          ]}
                          value={strokes > 0 ? strokes.toString() : ""}
                          onChangeText={(text) => {
                            const newStrokes = parseInt(text, 10);
                            if (!isNaN(newStrokes)) {
                              handleEditScore(playerIndex, item.holeNumber, newStrokes);
                            } else if (text === "") {
                              handleEditScore(playerIndex, item.holeNumber, 0);
                            }
                          }}
                          keyboardType="number-pad"
                          maxLength={2}
                          placeholder="-"
                          placeholderTextColor={colors.inactive}
                        />
                      );
                    })}
                  </View>
                );
              }}
            />
          </View>
        ) : (
          <View style={styles.flexFill} onLayout={updateLayoutMetrics('details')}>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.contentContainer}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              scrollEventThrottle={16}
              onScroll={updateScrollMetrics('details')}
              onContentSizeChange={updateContentMetrics('details')}
            >
              {activeTab === 'details' && (
                <View style={styles.tabContent}>
                  <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitle}>Course</Text>
                    <TouchableOpacity
                      style={styles.courseSelector}
                      onPress={() => setShowCourseSearchModal(true)}
                    >
                      <Text style={selectedCourse ? styles.selectedCourseText : styles.placeholderText}>
                        {selectedCourse ? getSelectedCourseName() : "Search for a course"}
                      </Text>
                      <ChevronDown size={20} color={colors.text} />
                    </TouchableOpacity>
                  </View>

	                  <View style={styles.sectionContainer}>
	                    <Text style={styles.sectionTitle}>Date</Text>
	                    <TouchableOpacity style={styles.dateContainer} onPress={openDatePicker} activeOpacity={0.85}>
	                      <Calendar size={20} color={colors.text} style={styles.dateIcon} />
	                      <Text style={styles.dateInput}>
	                        {formatLocalDateString(date, 'short')}
	                      </Text>
	                      <ChevronDown size={18} color={colors.text} />
	                    </TouchableOpacity>
	                  </View>

                  {/* Game Type - only show for post-round scans (no active session) */}
                  {!activeSession && (
                    <View style={styles.sectionContainer}>
                      <Text style={styles.sectionTitle}>Game Type</Text>
                      <Text style={styles.sectionSubtitle}>How the winner will be determined</Text>
                      <View style={styles.gameTypeDropdown}>
                        <TouchableOpacity
                          style={[styles.gameTypeDropdownOption, gameType === 'stroke_play' && styles.gameTypeDropdownOptionActive]}
                          onPress={() => setGameType('stroke_play')}
                        >
                          <Text style={[styles.gameTypeDropdownText, gameType === 'stroke_play' && styles.gameTypeDropdownTextActive]}>Stroke Play</Text>
                          <Text style={styles.gameTypeDropdownDesc}>Lowest score wins</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.gameTypeDropdownOption, gameType === 'match_play' && styles.gameTypeDropdownOptionActive]}
                          onPress={() => setGameType('match_play')}
                        >
                          <Text style={[styles.gameTypeDropdownText, gameType === 'match_play' && styles.gameTypeDropdownTextActive]}>Match Play</Text>
                          <Text style={styles.gameTypeDropdownDesc}>Most holes won</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Bets - unified bet display for active sessions */}
                  {activeSession?.betSettings?.enabled && (
                    <View style={styles.sectionContainer}>
                      <View style={styles.betCardHeader}>
                        <Text style={styles.sectionTitle}>Bets</Text>
                        <View style={styles.betTypeBadge}>
                          <Text style={styles.betTypeBadgeText}>
                            {activeSession.gameType === 'nassau' ? 'Nassau' :
                              activeSession.gameType === 'match_play' ? 'Match Play' :
                                activeSession.gameType === 'skins' ? 'Skins' : 'Stroke Play'}
                          </Text>
                        </View>
                      </View>

                  {/* Nassau Breakdown - tap to edit */}
                  {activeSession.gameType === 'nassau' && (
                        <View style={styles.nassauBreakdown}>
                          <View style={styles.nassauRow}>
                            <TouchableOpacity
                              style={styles.nassauItem}
                              onPress={() => {
                                const frontCents = activeSession.betSettings.nassauAmounts?.frontCents ?? activeSession.betSettings.betPerUnitCents ?? 0;
                                setBetEditTarget('nassauFront');
                                setBetEditAmount(String(frontCents / 100));
                                setShowBetEditModal(true);
                              }}
                            >
                              <Text style={styles.nassauLabel}>Front 9</Text>
                              <Text style={styles.nassauValue}>
                                ${(((activeSession.betSettings.nassauAmounts?.frontCents ?? activeSession.betSettings.betPerUnitCents ?? 0)) / 100).toFixed(0)}
                              </Text>
                            </TouchableOpacity>
                            <View style={styles.nassauDivider} />
                            <TouchableOpacity
                              style={styles.nassauItem}
                              onPress={() => {
                                const backCents = activeSession.betSettings.nassauAmounts?.backCents ?? activeSession.betSettings.betPerUnitCents ?? 0;
                                setBetEditTarget('nassauBack');
                                setBetEditAmount(String(backCents / 100));
                                setShowBetEditModal(true);
                              }}
                            >
                              <Text style={styles.nassauLabel}>Back 9</Text>
                              <Text style={styles.nassauValue}>
                                ${(((activeSession.betSettings.nassauAmounts?.backCents ?? activeSession.betSettings.betPerUnitCents ?? 0)) / 100).toFixed(0)}
                              </Text>
                            </TouchableOpacity>
                            <View style={styles.nassauDivider} />
                            <TouchableOpacity
                              style={styles.nassauItem}
                              onPress={() => {
                                const overallCents = activeSession.betSettings.nassauAmounts?.overallCents ?? (activeSession.betSettings.betPerUnitCents ?? 0) * 2;
                                setBetEditTarget('nassauOverall');
                                setBetEditAmount(String(overallCents / 100));
                                setShowBetEditModal(true);
                              }}
                            >
                              <Text style={styles.nassauLabel}>Overall</Text>
                              <Text style={styles.nassauValueTotal}>
                                ${(((activeSession.betSettings.nassauAmounts?.overallCents ?? (activeSession.betSettings.betPerUnitCents ?? 0) * 2)) / 100).toFixed(0)}
                              </Text>
                            </TouchableOpacity>
                          </View>
                          {activeSession.betSettings.carryover && (
                            <Text style={styles.carryoverBadge}>Ties carry over</Text>
                          )}
                          <Text style={styles.tapToEditHint}>Tap an amount to edit</Text>
                        </View>
                      )}

                      {/* Match Play / Stroke Play / Skins: Simple amount display - tap to edit */}
                      {activeSession.gameType !== 'nassau' && (
                        <TouchableOpacity
                          style={styles.simpleAmountBox}
                          onPress={() => {
                            setBetEditTarget('betPerUnit');
                            setBetEditAmount(String((activeSession.betSettings.betPerUnitCents || 0) / 100));
                            setShowBetEditModal(true);
                          }}
                        >
                          <Text style={styles.simpleAmountLabel}>
                            {activeSession.gameType === 'match_play'
                              ? (activeSession.betSettings?.betUnit === 'match' ? 'Per Match' : 'Per Hole')
                              : activeSession.gameType === 'skins'
                                ? 'Per Skin'
                                : activeSession.gameType === 'stroke_play'
                                  ? (activeSession.payoutMode === 'pot' ? 'Buy-in' : 'Per Stroke')
                                  : 'Bet'}
                          </Text>
                          <View style={styles.simpleAmountRight}>
                            <Text style={styles.simpleAmountValue}>
                              ${((activeSession.betSettings.betPerUnitCents || 0) / 100).toFixed(0)}
                            </Text>
                            <Text style={styles.tapToEditHint}>Tap to edit</Text>
                          </View>
                        </TouchableOpacity>
                      )}

                      {/* Skins carryover info */}
                      {activeSession.gameType === 'skins' && activeSession.betSettings.carryover && (
                        <Text style={styles.carryoverBadge}>Tied holes carry over to next skin</Text>
                      )}

                      {/* Side Bets - applicable to all game types */}
                      {activeSession.betSettings.sideBets &&
                        (activeSession.betSettings.sideBets.greenies || activeSession.betSettings.sideBets.sandies) && (
                          <View style={styles.sideBetsBox}>
                            <Text style={styles.sideBetsTitle}>Side Bets</Text>
                            <View style={styles.sideBetsRow}>
                              {activeSession.betSettings.sideBets.greenies && (
                                <View style={styles.sideBetChip}>
                                  <Text style={styles.sideBetChipText}>🌿 Greenies</Text>
                                </View>
                              )}
                              {activeSession.betSettings.sideBets.sandies && (
                                <View style={styles.sideBetChip}>
                                  <Text style={styles.sideBetChipText}>🏖️ Sandies</Text>
                                </View>
                              )}
                              <Text style={styles.sideBetAmount}>
                                ${((activeSession.betSettings.sideBets.amountCents || 0) / 100).toFixed(0)} each
                              </Text>
                            </View>
                          </View>
                        )}

                      {/* Presses - Nassau only */}
                      {activeSession.gameType === 'nassau' && activeSession.betSettings.pressEnabled && (
                        <View style={styles.pressesSection}>
                          <View style={styles.pressesSectionHeader}>
                            <Text style={styles.pressesSectionTitle}>
                              Presses {activeSession.presses?.length > 0 ? `(${activeSession.presses.length})` : ''}
                            </Text>
                            <TouchableOpacity
                              style={styles.addPressButton}
                              onPress={() => setShowPressModal(true)}
                            >
                              <Text style={styles.addPressButtonText}>+ Add</Text>
                            </TouchableOpacity>
                          </View>

                          {activeSession.presses && activeSession.presses.length > 0 ? (
                            <View style={styles.pressReviewList}>
                              {activeSession.presses.map((press: any, idx: number) => (
                                <View key={press.pressId || idx} style={styles.pressReviewItem}>
                                  <View style={styles.pressReviewItemLeft}>
                                    <Text style={styles.pressReviewSegment}>
                                      {press.segment === 'front' ? 'Front 9' : 'Back 9'}
                                    </Text>
                                    <Text style={styles.pressReviewHole}>
                                      Hole {press.startHole}
                                    </Text>
                                  </View>
                                  <View style={styles.pressReviewItemRight}>
                                    <Text style={styles.pressReviewValue}>
                                      ${(press.valueCents / 100).toFixed(0)}
                                    </Text>
                                    <TouchableOpacity
                                      style={styles.removePressButton}
                                      onPress={async () => {
                                        try {
                                          await removePressMutation({
                                            sessionId: activeSession._id,
                                            pressId: press.pressId,
                                          });
                                        } catch (e: any) {
                                          Alert.alert('Error', e.message || 'Failed to remove press');
                                        }
                                      }}
                                    >
                                      <X size={16} color={colors.error} />
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text style={styles.noPressesText}>
                              No presses added yet
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  )}

                  <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitle}>Notes</Text>
                    <TextInput
                      style={styles.notesInput}
                      value={notes}
                      onChangeText={setNotes}
                      placeholder="Add notes about this round..."
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                    />
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        )}

        {activeTab === 'details' && (
          <View
            style={[
              styles.bottomBar,
              { paddingBottom: 44 + Math.max(insets.bottom, 0) },
            ]}
          >
            <Button
              title="Save Round"
              onPress={handleSaveRound}
              style={styles.saveButton}
            />
          </View>
        )}

        {__DEV__ && devMode && (
          <View pointerEvents="none" style={[styles.scrollDebugOverlay, { top: tabBarBottom + 8 }]}>
            <Text style={styles.scrollDebugText}>
              tab:{activeTab} root:{Math.round(rootLayoutH)}/{Math.round(windowDims.height)}
            </Text>
            <Text style={styles.scrollDebugText}>
              players:{detectedPlayers.length} holes:{detectedPlayers[0]?.scores?.length ?? 0}
            </Text>
            <Text style={styles.scrollDebugText}>
              players y:{Math.round(scrollDebug.players.y)} h:{Math.round(scrollDebug.players.contentH)}/{Math.round(scrollDebug.players.layoutH)}
            </Text>
            <Text style={styles.scrollDebugText}>
              scores y:{Math.round(scrollDebug.scores.y)} h:{Math.round(scrollDebug.scores.contentH)}/{Math.round(scrollDebug.scores.layoutH)}
            </Text>
            <Text style={styles.scrollDebugText}>
              details y:{Math.round(scrollDebug.details.y)} h:{Math.round(scrollDebug.details.contentH)}/{Math.round(scrollDebug.details.layoutH)}
            </Text>
          </View>
        )}

	        <Modal
	          visible={showDatePicker}
	          animationType="slide"
	          transparent
	          onRequestClose={() => setShowDatePicker(false)}
	        >
	          <TouchableOpacity
	            style={styles.sheetOverlay}
	            activeOpacity={1}
	            onPress={() => setShowDatePicker(false)}
	          >
	            <TouchableOpacity
	              activeOpacity={1}
	              style={styles.datePickerSheet}
	              onPress={() => { }}
	            >
	              <View style={styles.datePickerHeader}>
	                <TouchableOpacity
	                  style={styles.datePickerNavButton}
	                  onPress={() =>
	                    setDatePickerMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
	                  }
	                >
	                  <ChevronLeft size={22} color={colors.text} />
	                </TouchableOpacity>
	                <Text style={styles.datePickerTitle}>{calendarMonthLabel}</Text>
	                <TouchableOpacity
	                  style={styles.datePickerNavButton}
	                  onPress={() =>
	                    setDatePickerMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
	                  }
	                >
	                  <ChevronRight size={22} color={colors.text} />
	                </TouchableOpacity>
	              </View>

	              <View style={styles.datePickerWeekHeader}>
	                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, index) => (
	                  <Text key={`${d}-${index}`} style={styles.datePickerWeekday}>
	                    {d}
	                  </Text>
	                ))}
	              </View>

	              <View style={styles.datePickerGrid}>
	                {calendarWeeks.map((week, weekIndex) => (
	                  <View key={weekIndex} style={styles.datePickerWeekRow}>
	                    {week.map((ymd, dayIndex) => {
	                      if (!ymd) {
	                        return <View key={`${weekIndex}-${dayIndex}`} style={styles.datePickerDayCell} />;
	                      }
	                      const dayNum = Number(ymd.split('-')[2]);
	                      const selected = ymd === date;
	                      return (
	                        <TouchableOpacity
	                          key={ymd}
	                          style={[
	                            styles.datePickerDayCell,
	                            selected && styles.datePickerDayCellSelected,
	                          ]}
	                          onPress={() => handleSelectDateFromPicker(ymd)}
	                          activeOpacity={0.8}
	                        >
	                          <Text
	                            style={[
	                              styles.datePickerDayText,
	                              selected && styles.datePickerDayTextSelected,
	                            ]}
	                          >
	                            {dayNum}
	                          </Text>
	                        </TouchableOpacity>
	                      );
	                    })}
	                  </View>
	                ))}
	              </View>

	              <TouchableOpacity
	                style={styles.datePickerDoneButton}
	                onPress={() => setShowDatePicker(false)}
	                activeOpacity={0.85}
	              >
	                <Text style={styles.datePickerDoneText}>Done</Text>
	              </TouchableOpacity>
	            </TouchableOpacity>
	          </TouchableOpacity>
	        </Modal>

        <Modal
          visible={showTeePicker}
          animationType="slide"
          transparent
          onRequestClose={() => setShowTeePicker(false)}
        >
          <TouchableOpacity
            style={styles.sheetOverlay}
            activeOpacity={1}
            onPress={() => setShowTeePicker(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={styles.sheetContainer}
              onPress={() => { }}
            >
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Select a Tee</Text>
                <View style={styles.sheetTabs}>
                  <TouchableOpacity
                    style={[styles.sheetTab, teePickerGenderTab === 'M' && styles.sheetTabActive]}
                    onPress={() => setTeePickerGenderTab('M')}
                  >
                    <Text style={[styles.sheetTabText, teePickerGenderTab === 'M' && styles.sheetTabTextActive]}>Men</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sheetTab, teePickerGenderTab === 'F' && styles.sheetTabActive]}
                    onPress={() => setTeePickerGenderTab('F')}
                  >
                    <Text style={[styles.sheetTabText, teePickerGenderTab === 'F' && styles.sheetTabTextActive]}>Women</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
                {getAvailableTeeSets()
                  .filter((t: any) => !t.gender || t.gender === teePickerGenderTab)
                  .map((tee: any) => (
                    <TouchableOpacity
                      key={`${tee.gender ?? 'U'}-${tee.name}`}
                      style={styles.teeOptionRow}
                      onPress={() => handleSelectTee(tee.name, (tee.gender as 'M' | 'F') || teePickerGenderTab)}
                    >
                      <View>
                        <Text style={styles.teeOptionName}>{tee.name}</Text>
                        {tee.rating || tee.slope ? (
                          <Text style={styles.teeOptionGender}>
                            {tee.rating ? `${tee.rating}` : '--'}/{tee.slope ? `${tee.slope}` : '--'}
                          </Text>
                        ) : (
                          <Text style={styles.teeOptionGender}>
                            {tee.gender === 'F' ? 'Women' : 'Men'}
                          </Text>
                        )}
                      </View>
                      <View style={styles.radioOuter}>
                        <View
                          style={
                            (() => {
                              const p = detectedPlayers[teePickerPlayerIndex ?? 0];
                              const matchesName =
                                p?.teeColor &&
                                p.teeColor.toString().toLowerCase() === tee.name.toString().toLowerCase();
                              const matchesGender =
                                (p?.teeGender ?? teePickerGenderTab) === (tee.gender || teePickerGenderTab);
                              return matchesName && matchesGender ? styles.radioInnerActive : styles.radioInner;
                            })()
                          }
                        />
                      </View>
                    </TouchableOpacity>
                  ))}
                {getAvailableTeeSets().length === 0 && (
                  <Text style={styles.emptyTeeText}>No tee data available for this course.</Text>
                )}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Add Press Modal */}
        <Modal
          visible={showPressModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPressModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowPressModal(false)}
          >
            <TouchableOpacity activeOpacity={1} style={styles.pressModalContent}>
              <Text style={styles.sheetTitle}>Add Press</Text>

              <View style={styles.pressModalSection}>
                <Text style={styles.pressModalLabel}>Segment</Text>
                <View style={styles.segmentToggle}>
                  <TouchableOpacity
                    style={[
                      styles.segmentButton,
                      pressSegment === 'front' && styles.segmentButtonActive
                    ]}
                    onPress={() => setPressSegment('front')}
                  >
                    <Text style={[
                      styles.segmentButtonText,
                      pressSegment === 'front' && styles.segmentButtonTextActive
                    ]}>Front 9</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.segmentButton,
                      pressSegment === 'back' && styles.segmentButtonActive
                    ]}
                    onPress={() => setPressSegment('back')}
                  >
                    <Text style={[
                      styles.segmentButtonText,
                      pressSegment === 'back' && styles.segmentButtonTextActive
                    ]}>Back 9</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.pressModalSection}>
                <Text style={styles.pressModalLabel}>Starting Hole</Text>
                <TextInput
                  style={styles.pressModalInput}
                  value={pressStartHole}
                  onChangeText={setPressStartHole}
                  placeholder={pressSegment === 'front' ? '1-9' : '10-18'}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>

              <View style={styles.pressModalButtons}>
                <TouchableOpacity
                  style={styles.pressModalCancelButton}
                  onPress={() => {
                    setShowPressModal(false);
                    setPressStartHole('');
                  }}
                >
                  <Text style={styles.pressModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.pressModalAddButton, isPressLoading && { opacity: 0.6 }]}
                  disabled={isPressLoading}
                  onPress={async () => {
                    if (!activeSession?._id) return;
                    const holeNum = parseInt(pressStartHole, 10);
                    if (isNaN(holeNum)) {
                      Alert.alert('Error', 'Please enter a valid hole number');
                      return;
                    }
                    setIsPressLoading(true);
                    try {
                      await addPressMutation({
                        sessionId: activeSession._id,
                        pressId: `press_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        segment: pressSegment,
                        startHole: holeNum,
                        valueCents: activeSession.betSettings?.betPerUnitCents || 1000,
                      });
                      setShowPressModal(false);
                      setPressStartHole('');
                    } catch (e: any) {
                      Alert.alert('Error', e.message || 'Failed to add press');
                    } finally {
                      setIsPressLoading(false);
                    }
                  }}
                >
                  <Text style={styles.pressModalAddText}>
                    {isPressLoading ? 'Adding...' : 'Add Press'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Bet Amount Edit Modal */}
        <Modal
          visible={showBetEditModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowBetEditModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowBetEditModal(false)}
          >
            <TouchableOpacity activeOpacity={1} style={styles.pressModalContent}>
              <Text style={styles.sheetTitle}>Edit Bet Amount</Text>

              <View style={styles.pressModalSection}>
                <Text style={styles.pressModalLabel}>
                  {activeSession?.gameType === 'nassau'
                    ? betEditTarget === 'nassauFront' ? 'Front 9 amount' :
                      betEditTarget === 'nassauBack' ? 'Back 9 amount' :
                        betEditTarget === 'nassauOverall' ? 'Overall amount' :
                          'Bet amount'
                    :
                    activeSession?.gameType === 'match_play'
                      ? (activeSession?.betSettings?.betUnit === 'match' ? 'Amount per match' : 'Amount per hole')
                      : activeSession?.gameType === 'skins'
                        ? 'Amount per skin'
                        : activeSession?.gameType === 'stroke_play'
                          ? (activeSession?.payoutMode === 'pot' ? 'Buy-in amount' : 'Amount per stroke')
                          : 'Bet amount'}
                </Text>
                <View style={styles.betEditInputRow}>
                  <Text style={styles.betEditDollarSign}>$</Text>
                  <TextInput
                    style={styles.betEditInput}
                    value={betEditAmount}
                    onChangeText={setBetEditAmount}
                    placeholder="0"
                    keyboardType="number-pad"
                    maxLength={4}
                    autoFocus
                  />
                </View>
              </View>

              <View style={styles.pressModalButtons}>
                <TouchableOpacity
                  style={styles.pressModalCancelButton}
                  onPress={() => {
                    setShowBetEditModal(false);
                    setBetEditAmount('');
                  }}
                >
                  <Text style={styles.pressModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.pressModalAddButton}
                  onPress={async () => {
                    if (!activeSession?._id) return;
                    const amount = parseFloat(betEditAmount);
                    if (isNaN(amount) || amount <= 0) {
                      Alert.alert('Error', 'Please enter a valid amount');
                      return;
                    }
                    try {
                      const cents = Math.round(amount * 100);
                      if (activeSession.gameType === 'nassau' && betEditTarget !== 'betPerUnit') {
                        await updateBetSettingsMutation({
                          sessionId: activeSession._id,
                          nassauAmounts: {
                            ...(betEditTarget === 'nassauFront' ? { frontCents: cents } : {}),
                            ...(betEditTarget === 'nassauBack' ? { backCents: cents } : {}),
                            ...(betEditTarget === 'nassauOverall' ? { overallCents: cents } : {}),
                          },
                        });
                      } else {
                        await updateBetSettingsMutation({
                          sessionId: activeSession._id,
                          betPerUnitCents: cents,
                        });
                      }
                      setShowBetEditModal(false);
                      setBetEditAmount('');
                    } catch (e: any) {
                      Alert.alert('Error', e.message || 'Failed to update bet');
                    }
                  }}
                >
                  <Text style={styles.pressModalAddText}>Save</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {showCourseSearchModal && (
          <CourseSearchModal
            visible={showCourseSearchModal}
            testID="scan-review-course-modal"
            onClose={() => setShowCourseSearchModal(false)}
            onSelectCourse={handleSelectCourse}
            onAddManualCourse={handleAddCourseManually}
            showMyCoursesTab={onboardingMode !== 'true'}
            isGuest={onboardingMode === 'true'}
          />
        )}
      </SafeAreaView>
    );
  }

  // Fallback: processing not complete yet - show loading state
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={reviewHeaderOptions} />
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.processingText, { marginTop: 16 }]}>
          {activeScanJob?.message || 'Processing your scorecard...'}
        </Text>
        {activeScanJob?.progress !== undefined && activeScanJob.progress > 0 && (
          <Text style={styles.processingSubText}>
            {activeScanJob.progress}% complete
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  customHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  customHeaderButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  customHeaderButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  processingSubText: {
    fontSize: 14,
    color: colors.text,
    opacity: 0.7,
    marginTop: 8,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionIcon: {
    marginBottom: 24,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    minWidth: 200,
  },
  cameraContainer: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 12,
    margin: 16,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: '80%',
    height: '60%',
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 8,
  },
  webFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 24,
  },
  webFallbackText: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginTop: 16,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 16,
  },
  controlButton: {
    alignItems: 'center',
  },
  controlText: {
    fontSize: 14,
    color: colors.text,
    marginTop: 4,
  },
  disabledText: {
    color: colors.inactive,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  instructions: {
    padding: 16,
    marginBottom: 16,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
  },
  previewContainer: {
    flex: 1,
    margin: 16,
  },
  photosScrollView: {
    flex: 1,
    marginBottom: 16,
  },
  photoContainer: {
    width: 350,
    position: 'relative',
  },
  previewImage: {
    flex: 1,
    borderRadius: 12,
    width: '100%',
  },
  removePhotoButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoIndicator: {
    alignItems: 'center',
    marginBottom: 16,
  },
  photoIndicatorText: {
    fontSize: 14,
    color: colors.text,
  },
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  scanningOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  scanningText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(29, 90, 84, 0.10)',
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(29, 90, 84, 0.12)',
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'transparent',
  },
  activeTab: {
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 6,
  },
  activeTabText: {
    color: colors.text,
    fontWeight: '700',
  },
  tabContent: {
    width: '100%',
  },
  flexFill: {
    flex: 1,
    minHeight: 0,
  },
  scrollView: {
    flex: 1,
    minHeight: 0,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 200,
  },
  scrollDebugOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    zIndex: 9999,
    elevation: 9999,
  },
  scrollDebugText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  sectionContainer: {
    marginBottom: 24,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionHeaderColumn: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 8,
  },
  courseSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
  },
  selectedCourseText: {
    fontSize: 16,
    color: colors.text,
  },
  placeholderText: {
    fontSize: 16,
    color: colors.text,
  },
  addPlayerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: `${colors.primary}15`,
    borderRadius: 16,
  },
  addPlayerText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
    marginLeft: 4,
  },
  playersContainer: {
    marginBottom: 16,
  },
  playerCard: {
    backgroundColor: colors.card,
    borderRadius: 8,
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userPlayerCard: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}01`,
  },
  draggingPlayerCard: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  playerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dragHandle: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginRight: 6,
  },
  playerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  playerNameInline: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginLeft: 8,
    marginRight: 8,
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  playerNameInput: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
  },
  playerDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  handicapContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  handicapLabel: {
    fontSize: 14,
    color: colors.text,
    marginRight: 8,
  },
  handicapInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    color: colors.text,
  },
  handicapInputDisabled: {
    backgroundColor: '#f5f5f5',
    color: colors.textSecondary,
  },
  teeColorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teeColorLabel: {
    fontSize: 14,
    color: colors.text,
    marginRight: 8,
  },
  teeColorSelector: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  teeColorText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  userBadge: {
    backgroundColor: colors.primary,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginLeft: 8,
  },
  userBadgeText: {
    fontSize: 12,
    color: colors.background,
    fontWeight: '500',
  },
  linkedBadge: {
    backgroundColor: colors.text,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginLeft: 8,
  },
  linkedBadgeText: {
    fontSize: 12,
    color: colors.card,
    fontWeight: '500',
  },
  sessionBadge: {
    backgroundColor: colors.primary,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginLeft: 8,
  },
  sessionBadgeText: {
    fontSize: 12,
    color: colors.background,
    fontWeight: '500',
  },
  detectedAsText: {
    fontSize: 12,
    color: colors.text,
    fontStyle: 'italic',
    marginLeft: 4,
  },
  playerActions: {
    flexDirection: 'row',
  },
  playerAction: {
    padding: 8,
    marginLeft: 4,
  },
  infoBox: {
    backgroundColor: `${colors.text}10`,
    borderRadius: 10,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E6EAE9',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
  },
  scoresTable: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  scoresTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scoresTableHeaderCell: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    fontWeight: '700',
    fontSize: 13,
    color: colors.text,
    textAlign: 'center',
    includeFontPadding: false,
  },
  scoresTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scoresTableCell: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    textAlign: 'center',
    color: colors.text,
  },
  holeBandCell: {
    width: 56,
    backgroundColor: colors.text,
    color: '#FFFFFF',
  },
  holeHeaderLabel: {
    color: '#FFFFFF',
    letterSpacing: 1.1,
    fontSize: 12,
  },
  holeNumberText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  holeParCell: {
    width: 64,
    backgroundColor: '#F2F4F3',
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  playerScoreCell: {
    flex: 1,
    minWidth: 60,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  scoreInput: {
    textAlign: 'center',
    fontSize: 15,
  },
  headerLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  headerWhiteCell: {
    backgroundColor: '#FFFFFF',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
  },
  dateIcon: {
    marginRight: 8,
  },
  dateInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    height: 100,
    backgroundColor: colors.background,
  },
  gameTypeDropdown: {
    flexDirection: 'row',
    gap: 12,
  },
  gameTypeDropdownOption: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  gameTypeDropdownOptionActive: {
    borderColor: colors.primary,
    backgroundColor: '#E8F5E9',
  },
  gameTypeDropdownText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  gameTypeDropdownTextActive: {
    color: colors.primary,
  },
  gameTypeDropdownDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  // Deprecated - kept for backwards compat
  gameTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gameTypeOption: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  gameTypeOptionActive: {
    borderColor: colors.primary,
    backgroundColor: '#E8F5E9',
  },
  gameTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  gameTypeTextActive: {
    color: colors.primary,
  },
  gameTypeDesc: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  retakeBox: {
    backgroundColor: `${colors.primary}08`,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  retakeText: {
    fontSize: 12,
    color: colors.text,
  },
  retakeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  // New compact retake row design
  retakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#EEF2EF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 10,
  },
  retakeRowText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },
  retakeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    justifyContent: 'flex-end',
    zIndex: 1000,
    elevation: 1000,
  },
  saveButton: {
    width: '100%',
  },
  headerButton: {
    paddingHorizontal: 16,
  },
  headerButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '500',
  },
  linkingTitle: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
  },
  highlightText: {
    fontWeight: '600',
    color: colors.primary,
  },
  playerLinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  playerLinkItemSelected: {
    backgroundColor: `${colors.primary}10`,
  },
  playerLinkAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  playerLinkInitial: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.background,
  },
  playerLinkInfo: {
    flex: 1,
  },
  playerLinkName: {
    fontSize: 16,
    color: colors.text,
  },
  playerLinkNameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  playerLinkAlias: {
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  playerLinkHandicap: {
    fontSize: 14,
    color: colors.text,
  },
  noPlayersContainer: {
    alignItems: 'center',
    padding: 24,
  },
  noPlayersText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  noPlayersSubtext: {
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  noPlayersButton: {
    minWidth: 200,
  },
  dropZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  dropZoneText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '500',
    textAlign: 'center',
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 8,
  },
  scanLimitContainer: {
    padding: 8,
    backgroundColor: `${colors.primary}15`,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  scanLimitText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  // Progress overlay styles
  progressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  progressContainer: {
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 32,
    margin: 24,
    alignItems: 'center',
    minWidth: 300,
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  progressHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  progressTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  progressSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  progressBarContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  progressBarBackground: {
    width: '100%',
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  analysisIndicator: {
    alignItems: 'center',
  },
  analysisGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 180,
    height: 36,
    marginBottom: 16,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
    padding: 6,
  },
  analysisCell: {
    width: 26,
    height: 10,
    marginHorizontal: 1,
    marginVertical: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  analysisCellFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
    position: 'absolute',
    left: 0,
    top: 0,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  analysisCellActive: {
    backgroundColor: colors.primary,
  },
  analysisText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: '70%',
    height: '54%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  datePickerSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  datePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  datePickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  datePickerNavButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
  },
  datePickerWeekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginBottom: 6,
  },
  datePickerWeekday: {
    width: 36,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  datePickerGrid: {
    paddingHorizontal: 6,
    paddingBottom: 10,
  },
  datePickerWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  datePickerDayCell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePickerDayCellSelected: {
    backgroundColor: colors.primary,
  },
  datePickerDayText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  datePickerDayTextSelected: {
    color: '#FFFFFF',
  },
  datePickerDoneButton: {
    marginTop: 6,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePickerDoneText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  sheetTabs: {
    flexDirection: 'row',
    backgroundColor: `${colors.text}10`,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: `${colors.text}15`,
  },
  sheetTab: {
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  sheetTabActive: {
    backgroundColor: colors.card,
  },
  sheetTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  sheetTabTextActive: {
    color: colors.text,
  },
  sheetList: {
    flexGrow: 0,
  },
  sheetListContent: {
    paddingBottom: 16,
  },
  teeOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  teeOptionName: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  teeOptionGender: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyTeeText: {
    textAlign: 'center',
    color: colors.textSecondary,
    paddingVertical: 12,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  radioInnerActive: {
    backgroundColor: colors.primary,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  onboardingBanner: {
    backgroundColor: '#FFF5F0',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  onboardingBannerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  onboardingBannerText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },
  // Session info and press review styles
  sessionInfoCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sessionInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sessionInfoLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  sessionInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  pressReviewList: {
    marginTop: 8,
  },
  pressReviewItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  pressReviewItemLeft: {
    flex: 1,
  },
  pressReviewItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pressReviewSegment: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E6059',
  },
  pressReviewHole: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pressReviewValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  removePressButton: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: `${colors.error}33`,
  },
  // Your Bet card styles
  betCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  betTypeBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  betTypeBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E6059',
  },
  nassauBreakdown: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  nassauRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nassauItem: {
    flex: 1,
    alignItems: 'center',
  },
  nassauLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  nassauValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  nassauValueTotal: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E6059',
  },
  nassauDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
    marginHorizontal: 8,
  },
  carryoverBadge: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  simpleAmountBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  simpleAmountLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  simpleAmountValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  sideBetsBox: {
    backgroundColor: '#FFF8E1',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  sideBetsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  sideBetsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  sideBetChip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  sideBetChipText: {
    fontSize: 12,
    color: colors.text,
  },
  sideBetAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E6059',
    marginLeft: 'auto',
  },
  pressesSection: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressesSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pressesSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  addPressButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: `${colors.primary}15`,
    borderRadius: 16,
  },
  addPressButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  noPressesText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
  // Press modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pressModalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  pressModalSection: {
    marginTop: 16,
  },
  pressModalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  segmentToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    backgroundColor: colors.background,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentButtonActive: {
    backgroundColor: colors.primary,
  },
  segmentButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  segmentButtonTextActive: {
    color: '#FFFFFF',
  },
  pressModalInput: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressModalButtons: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  pressModalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressModalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  pressModalAddButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  pressModalAddText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Bet edit styles
  tapToEditHint: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
  simpleAmountRight: {
    alignItems: 'flex-end',
  },
  betEditInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  betEditDollarSign: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginRight: 4,
  },
  betEditInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
});
