import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
  Modal
} from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
// @ts-ignore - local ambient types provided via declarations
import DraggableFlatList from 'react-native-draggable-flatlist';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
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
  Calendar,
  Trash2,
  Flag,
  RotateCcw,
  Check
} from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { generateUniqueId, ensureValidDate } from '@/utils/helpers';
import { useGolfStore } from '@/store/useGolfStore';
import { mockCourses } from '@/mocks/courses';
import { CourseSearchModal } from '@/components/CourseSearchModal';
import { Button } from '@/components/Button';
import { Hole, ScorecardScanResult, ApiCourseData, Course, Player } from '@/types';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAction, useMutation, useQuery } from '@/lib/convex';
import { searchCourses } from '@/lib/golf-course-api';
import { convertApiCourseToLocal, getDeterministicCourseId } from '@/utils/course-helpers';
import { matchCourseToLocal, extractUserLocation, LocationData } from '@/utils/course-matching';
import { DEFAULT_COURSE_IMAGE } from '@/constants/images';

interface DetectedPlayer {
  id: string;
  name: string;
  nameConfidence?: number;
  linkedPlayerId?: string;
  isUser?: boolean;
  handicap?: number;
  // Preserve previous linkage/handicap to support undoing "Select as me"
  prevLinkedPlayerId?: string;
  prevHandicap?: number;
  prevName?: string;
  teeColor?: string;
  teeGender?: 'M' | 'F';
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
  const { courseId, editRoundId, prefilled, review } = useLocalSearchParams<{ courseId?: string, editRoundId?: string, prefilled?: string, review?: string }>();
  const router = useRouter();
  const {
    players,
    courses,
    rounds,
    addRound,
    updateRound,
    addPlayer,
    addCourse,
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
  const profile = useQuery(api.users.getProfile);
  const roundsSummary = useQuery(
    api.rounds.listWithSummary,
    profile?._id ? { hostId: profile._id as Id<"users"> } : "skip"
  ) || [];
  // Get all Convex players for auto-link matching (includes aliases)
  const convexPlayers = useQuery(api.players.list) || [];
  const userGender = (profile as any)?.gender as "M" | "F" | undefined;

  // Convex actions for course lookup (to check global cache before paid API)
  const getConvexCourseByExternalId = useAction(api.courses.getByExternalIdAction);
  const upsertCourse = useMutation(api.courses.upsert);
  const addPlayerAlias = useMutation(api.players.addAlias);
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
  const teePickerIndexRef = useRef<number | null>(null);
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<'players' | 'scores' | 'details'>('players');
  const [draggingPlayerIndex, setDraggingPlayerIndex] = useState<number | null>(null);
  const [selectedApiCourse, setSelectedApiCourse] = useState<{ apiCourse: ApiCourseData; selectedTee?: string } | null>(null);
  const [isLocalCourseSelected, setIsLocalCourseSelected] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<LocationData | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [listVersion, setListVersion] = useState(0);
  const [devSimReady, setDevSimReady] = useState(false);
  const lastProcessedScanId = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const isEditMode = !!editRoundId;
  // Review mode = NOT edit mode (if we're here and not editing, we're reviewing)
  const isReviewMode = !isEditMode;
  const preDragPlayersRef = useRef<DetectedPlayer[] | null>(null);
  const hasInitializedPrefill = useRef(false);
  const hasAppliedCourseSelection = useRef(false);
  const currentUser = React.useMemo(
    () => players.find((p) => p.isUser) || (profile ? ({ id: profile._id, isUser: true, handicap: (profile as any)?.handicap, name: profile.name } as any) : null),
    [players, profile]
  );
  const currentUserId = currentUser?.id as string | undefined;
  const currentUserName = (currentUser as any)?.name?.trim()?.toLowerCase?.();

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
            handicap: p.handicapUsed ?? storePlayer?.handicap,  // Fallback to handicapUsed for now
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
    linkablePlayerIds.length > 0 ? { playerIds: linkablePlayerIds } : "skip"
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
    const currentUser = players.find(p => p.isUser);
    return currentUser?.id || generateUniqueId();
  });

  const buildDevSampleResult = (): ScorecardScanResult => ({
    courseName: 'Dev National - Demo Course',
    courseNameConfidence: 0.9,
    date: new Date().toISOString().split('T')[0],
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
        processAIResults(activeScanJob.result);
        lastProcessedScanId.current = activeScanJob.id;
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

    // Only auto-open course selector if no course selected and modal not already shown
    if (!selectedCourse && !selectedApiCourse && !showCourseSearchModal && !isLocalCourseSelected) {
      // Small timeout to ensure transition/mount is done
      const timer = setTimeout(() => {
        setShowCourseSearchModal(true);
        setCoursePickerSource('review');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isReviewMode, processingComplete, selectedCourse, selectedApiCourse, showCourseSearchModal, isLocalCourseSelected, pendingScanCourseSelection, activeScanJob]);

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
    const currentUser = players.find(p => p.isUser);
    const teeFromResult = (scanResult as any).teeName as string | undefined;
    const teeOverride = teeFromResult || activeScanJob?.selectedTeeName || selectedTeeName;

    // Restore course selection from activeScanJob if present (e.g., after app reload)
    if (activeScanJob?.selectedCourseId) {
      console.log('[SCAN] processAIResults: Restoring course from activeScanJob:', activeScanJob.selectedCourseId);
      setSelectedCourse(activeScanJob.selectedCourseId as string);
      setIsLocalCourseSelected(true);  // Prevent modal from reopening
      if (activeScanJob.selectedTeeName) {
        setSelectedTeeName(activeScanJob.selectedTeeName);
      }
    }

    // Convert AI results to DetectedPlayer format
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
  const autoLinkPlayers = (detectedPlayers: DetectedPlayer[]): DetectedPlayer[] => {
    return detectedPlayers.map(player => {
      // Skip if already linked
      if (player.linkedPlayerId) return player;

      // Look for exact match first
      const exactMatch = players.find(p => p.name.toLowerCase() === player.name.toLowerCase());
      if (exactMatch) {
        // If this exact match is the current user, treat as "You" (no Linked badge)
        const matchesUserById = currentUserId && exactMatch.id === currentUserId;
        const matchesUserByFlag = exactMatch.isUser;
        const matchesUserByName = currentUserName && exactMatch.name.toLowerCase() === currentUserName;
        if (matchesUserById || matchesUserByFlag || matchesUserByName) {
          const resolvedHandicap =
            exactMatch.handicap ??
            (profile as any)?.handicap ??
            currentUser?.handicap;
          return {
            ...player,
            linkedPlayerId: exactMatch.id,
            handicap: resolvedHandicap,
            isUser: true,
            prevLinkedPlayerId: player.prevLinkedPlayerId,
            prevHandicap: player.prevHandicap,
          };
        }

        const updatedPlayer = {
          ...player,
          linkedPlayerId: exactMatch.id,
          handicap: exactMatch.handicap
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
      const exactMatch = convexPlayers.find(p => {
        // Check name match
        if (p.name?.toLowerCase().trim() === normalizedName) return true;
        // Check alias match
        const aliases = (p as any).aliases || [];
        return aliases.some((alias: string) => alias.toLowerCase().trim() === normalizedName);
      });

      // Also check Zustand players as fallback
      const zustandMatch = !exactMatch ? players.find(p => p.name?.toLowerCase().trim() === normalizedName) : null;
      const matchedPlayer = exactMatch || zustandMatch;

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
            (profile as any)?.handicap ??
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

  const handleEditPlayerHandicapById = (playerId: string, handicap: string) => {
    const handicapValue = handicap.trim() === '' ? undefined : Number(handicap);
    const finalValue = isNaN(Number(handicap)) ? undefined : handicapValue;

    setDetectedPlayers(prev => {
      const idx = prev.findIndex(p => p.id === playerId);
      if (idx < 0) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], handicap: finalValue };
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
    const profileHandicap = (profile as any)?.handicap;
    const profileName = (profile as any)?.name || currentUser?.name || 'You';

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
          if (currentUser) {
            selected.linkedPlayerId = currentUser.id;
          }
          selected.name = profileName;
          selected.handicap = profileHandicap ?? currentUser?.handicap;
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
    setActiveTab('details');

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
      router.replace('/');
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

    // Auto-link check before save: match any unlinked players by name or alias
    const playersWithAutoLink = detectedPlayers.map(player => {
      if (player.linkedPlayerId) return player; // Already linked

      const normalizedName = player.name.toLowerCase().trim();

      // Check Convex players (by name or alias)
      const convexMatch = convexPlayers.find(p => {
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
        const linkedPlayer = convexPlayers.find(cp =>
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
            const refreshedCourse = await convertApiCourseToLocal(apiCourse, { selectedTee, fetchImage: true });
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
            const newLocalCourse = await convertApiCourseToLocal(apiCourse, { selectedTee, fetchImage: true });
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
          } catch (error) {
            console.error('Failed to convert API course while saving round:', error);
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

    const newRound = {
      id: existingRound?.id ?? roundId,
      ...(resolvedRemoteId ? { remoteId: resolvedRemoteId } : {}),
      date,
      courseId: finalCourseId,
      courseName: finalCourseName,
      players: playersWithTotalScores.map(player => {
        const teeMeta = resolveTeeForPlayer(player);
        return {
          playerId: player.linkedPlayerId || player.id,
          playerName: player.name,
          scores: player.scores,
          totalScore: player.scores.reduce((sum, score) => sum + score.strokes, 0),
          handicapUsed: player.handicap,
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
    };

    if (isEditMode) {
      // Ensure any new players are added to the store
      newRound.players.forEach(p => {
        if (!players.some(existing => existing.id === p.playerId)) {
          addPlayer({ id: p.playerId, name: p.playerName, handicap: p.handicapUsed });
        }
      });
      updateRound(newRound as any);
      // Return to the existing Round Details screen without pushing a duplicate
      router.back();
    } else {
      // Add the round to the store and go straight to Round Details
      addRound(newRound as any);
      router.replace(`/round/${roundId}`);
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

  if (showPlayerLinking) {
    const selectedLinkedId = (() => {
      if (selectedPlayerId) {
        const p = detectedPlayers.find(dp => dp.id === selectedPlayerId);
        return p?.linkedPlayerId;
      }
      if (selectedPlayerIndex !== null && detectedPlayers[selectedPlayerIndex]) {
        return detectedPlayers[selectedPlayerIndex].linkedPlayerId;
      }
      return undefined;
    })();

    const handleUnlinkSelectedPlayer = () => {
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
    };

    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen
          options={{
            title: "Link to Existing Player",
            headerStyle: {
              backgroundColor: colors.background,
            },
            headerTitleStyle: {
              color: colors.text,
            },
            headerTintColor: colors.text,
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  setShowPlayerLinking(false);
                  setSelectedPlayerIndex(null);
                  setSelectedPlayerId(null);
                  setLinkingWasRemoved(false);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.headerButton}
              >
                <Text style={styles.headerButtonText}>{linkingWasRemoved ? 'Back' : 'Cancel'}</Text>
              </TouchableOpacity>
            ),
            headerRight: () => (
              selectedLinkedId ? (
                <TouchableOpacity
                  onPress={handleUnlinkSelectedPlayer}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.headerButton}
                >
                  <Text style={styles.headerButtonText}>Remove Link</Text>
                </TouchableOpacity>
              ) : null
            )
          }}
        />

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
                const isSelected = selectedLinkedId === player.id;
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
                          const convexPlayer = convexPlayers.find(cp =>
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
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen
          options={{
            title: isEditMode ? "Edit Round" : "Scorecard Results",
            headerStyle: {
              backgroundColor: colors.background,
            },
            headerTitleStyle: {
              color: colors.text,
            },
            headerTintColor: colors.text,
            // Always disable modal swipe-to-dismiss while on Players tab (no-scroll zone behavior)
            gestureEnabled: activeTab !== 'players',
            headerLeft: isEditMode ? () => (
              <TouchableOpacity
                onPress={() => router.replace('/')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.headerButton}
              >
                <Text style={styles.headerButtonText}>Cancel</Text>
              </TouchableOpacity>
            ) : undefined,
            headerRight: () => (
              <TouchableOpacity
                onPress={handleSaveRound}
                style={styles.headerButton}
              >
                <Text style={styles.headerButtonText}>Save</Text>
              </TouchableOpacity>
            )
          }}
        />

        <View style={styles.tabContainer}>
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
          <View pointerEvents="box-none">
            <DraggableFlatList
              data={detectedPlayers}
              extraData={listVersion}
              keyExtractor={(item: DetectedPlayer) => item.id}
              activationDistance={6}
              contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
              autoscrollThreshold={40}
              autoscrollSpeed={280}
              bounces={false}
              scrollEnabled={true}
              keyboardShouldPersistTaps="handled"
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
                <View style={[styles.sectionHeader, isDragging && { pointerEvents: 'none' }]}>
                  <Text style={styles.sectionTitle}>Detected Players</Text>
                  <TouchableOpacity style={styles.addPlayerButton} onPress={handleAddPlayer} disabled={isDragging}>
                    <Plus size={16} color={colors.primary} />
                    <Text style={styles.addPlayerText}>Add Player</Text>
                  </TouchableOpacity>
                </View>
              }
              ListFooterComponent={
                <View style={[styles.infoBox, isDragging && { pointerEvents: 'none' }]}>
                  <Text style={styles.infoTitle}>Player Management</Text>
                  <Text style={styles.infoText}>• Drag to reorder players if they were detected incorrectly</Text>
                  <Text style={styles.infoText}>• Edit names by clicking on them and changing the text</Text>
                  <Text style={styles.infoText}>• Link players to existing profiles using the link icon</Text>
                  <Text style={styles.infoText}>• Mark yourself using the user icon</Text>
                  <Text style={styles.infoText}>• Set Scandicaps and tee colors for accurate scoring</Text>
                  <Text style={styles.infoText}>• Tap tee color to cycle through available options</Text>
                </View>
              }
              renderItem={({ item: player, index, drag, isActive, getIndex }: any) => (
                <TouchableOpacity
                  key={player.id}
                  activeOpacity={1}
                  onLongPress={drag}
                  delayLongPress={120}
                  style={[
                    styles.playerCard,
                    player.isUser && styles.userPlayerCard,
                    isActive && styles.draggingPlayerCard,
                  ]}
                >
                  <View style={styles.playerHeaderRow}>
                    <TouchableOpacity style={styles.dragHandle} onLongPress={drag} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
                      <GripVertical size={18} color={isActive ? colors.primary : colors.text} />
                    </TouchableOpacity>
                    <TextInput
                      style={[styles.playerNameInline, getConfidenceStyle(player.nameConfidence)]}
                      value={player.name}
                      onChangeText={(text) => handleEditPlayerNameById(player.id, text)}
                      editable={!player.linkedPlayerId}
                      placeholder="Player Name"
                    />
                    <View style={styles.headerRightRow}>
                      {player.isUser && (
                        <View style={styles.userBadge}><Text style={styles.userBadgeText}>You</Text></View>
                      )}
                      {player.linkedPlayerId && !player.isUser && (
                        <View style={styles.linkedBadge}><Text style={styles.linkedBadgeText}>Linked</Text></View>
                      )}
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
                    </View>
                  </View>
                  <View style={styles.playerDetailsRow}>
                    <View style={styles.handicapContainer}>
                      <Text style={styles.handicapLabel}>Scandicap:</Text>
                      <TextInput
                        style={[styles.handicapInput, player.isUser && styles.handicapInputDisabled]}
                        value={player.handicap !== undefined ? String(player.handicap) : ''}
                        onChangeText={(text) => handleEditPlayerHandicapById(player.id, text)}
                        placeholder="Not set"
                        placeholderTextColor={colors.text}
                        keyboardType="numeric"
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
                        <Text
                          style={styles.teeColorText}
                        >
                          {player.teeColor || 'Select'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        ) : (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
            {activeTab === 'scores' && (
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
                    <Text numberOfLines={1} ellipsizeMode="clip" style={[styles.scoresTableHeaderCell, styles.holeBandCell, styles.holeHeaderLabel]}>HOLE</Text>
                    <Text numberOfLines={1} ellipsizeMode="clip" style={[styles.scoresTableHeaderCell, styles.holeParCell, styles.headerLabel]}>PAR</Text>
                    {detectedPlayers.map(player => (
                      <Text
                        key={player.id}
                        numberOfLines={1}
                        ellipsizeMode="clip"
                        style={[styles.scoresTableHeaderCell, styles.playerScoreCell, styles.headerWhiteCell, styles.headerLabel]}
                      >
                        {player.name}
                        {player.isUser ? " (You)" : ""}
                      </Text>
                    ))}
                  </View>

                  {detectedPlayers.length > 0 && detectedPlayers[0].scores.map(score => {
                    // Find the course to get par for this hole
                    const course = selectedCourse ? courses.find(c => c.id === selectedCourse) : null;
                    const hole = course ? course.holes.find(h => h.number === score.holeNumber) : null;
                    const par = hole ? hole.par : 4; // Default to par 4 if not found

                    return (
                      <View key={score.holeNumber} style={styles.scoresTableRow}>
                        <Text style={[styles.scoresTableCell, styles.holeBandCell, styles.holeNumberText]}>
                          {score.holeNumber}
                        </Text>

                        <Text style={[styles.scoresTableCell, styles.holeParCell]}>
                          {par}
                        </Text>

                        {detectedPlayers.map((player, playerIndex) => {
                          const playerScore = player.scores.find(s => s.holeNumber === score.holeNumber);
                          const strokes = playerScore ? playerScore.strokes : 0;

                          // Determine score color based on relation to par
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
                                getConfidenceStyle(playerScore?.confidence)
                              ]}
                              value={strokes > 0 ? strokes.toString() : ""}
                              onChangeText={(text) => {
                                const newStrokes = parseInt(text, 10);
                                if (!isNaN(newStrokes)) {
                                  handleEditScore(playerIndex, score.holeNumber, newStrokes);
                                } else if (text === '') {
                                  handleEditScore(playerIndex, score.holeNumber, 0);
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
                  })}

                  {/* Totals row */}
                  {/* Totals row intentionally removed by design */}
                </View>
              </View>
            )}

            {activeTab === 'details' && (
              <View style={styles.tabContent}>
                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>Course</Text>
                  <TouchableOpacity
                    style={styles.courseSelector}
                    onPress={() => setShowCourseSearchModal(true)}
                  >
                    <Text style={selectedCourse ? styles.selectedCourseText : styles.placeholderText}>
                      {selectedCourse
                        ? getSelectedCourseName()
                        : "Search for a course"}
                    </Text>
                    <ChevronDown size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>

                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>Date</Text>
                  <View style={styles.dateContainer}>
                    <Calendar size={20} color={colors.text} style={styles.dateIcon} />
                    <TextInput
                      style={styles.dateInput}
                      value={date || new Date().toISOString().split('T')[0]}
                      onChangeText={(value) => setDate(value || new Date().toISOString().split('T')[0])}
                      placeholder="YYYY-MM-DD"
                    />
                  </View>
                </View>

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
        )}

        <View style={styles.bottomBar}>
          <Button
            title="Save Round"
            onPress={handleSaveRound}
            style={styles.saveButton}
          />
        </View>

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

        {showCourseSearchModal && (
          <CourseSearchModal
            visible={showCourseSearchModal}
            testID="scan-review-course-modal"
            onClose={() => setShowCourseSearchModal(false)}
            onSelectCourse={handleSelectCourse}
            onAddManualCourse={handleAddCourseManually}
            showMyCoursesTab={true}
          />
        )}
      </SafeAreaView>
    );
  }

  // Fallback: processing not complete yet - show loading state
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: "Review Scorecard",
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTitleStyle: {
            color: colors.text,
          },
          headerTintColor: colors.text,
        }}
      />
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
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
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
    padding: 16,
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
});
