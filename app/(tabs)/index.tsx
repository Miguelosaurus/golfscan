import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  Alert,
  Animated,
  Platform,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PreRoundFlowModal } from '@/components/PreRoundFlowModal';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/constants/colors';
import { useGolfStore } from '@/store/useGolfStore';
import { RoundCard } from '@/components/RoundCard';
import { mockCourses } from '@/mocks/courses';
import { Settings, User, Edit3, Crown, ArrowDown, Flag, Camera, Trash2, Info, X } from 'lucide-react-native';
import { Round, ScorecardScanResult, Course } from '@/types';
import { calculateAverageScoreWithHoleAdjustment, calculateNetScore } from '@/utils/helpers';
import Svg, { Path, Circle } from 'react-native-svg';
import { useMutation, useQuery } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { DEFAULT_COURSE_IMAGE } from '@/constants/images';
import { CourseSearchModal } from '@/components/CourseSearchModal';
import { SessionBanner } from '@/components/SessionBanner';
import { useCourseImage } from '@/hooks/useCourseImage';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { LinearGradient } from 'expo-linear-gradient';

export default function HomeScreen() {
  const router = useRouter();


  const {
    rounds,
    courses,
    addCourse,
    players,
    activeScanJob,
    clearActiveScanJob,
    setActiveScanJob,
    devMode,
    setScannedData,
    markActiveScanReviewPending,
    setIsScanning,
    profileSetupSeen,
    setProfileSetupSeen,
    shouldShowScanCourseModal,
    setShouldShowScanCourseModal,
    setPendingScanCourseSelection,
    pendingGameSetupIntent,
    setPendingGameSetupIntent,
  } = useGolfStore();

  // Scan flow state - for course selection during scan
  const [selectedScanCourse, setSelectedScanCourse] = useState<{ id: string; teeName: string } | null>(null);

  // Ref to track if we've already navigated to scan-review in onboarding (prevents duplicate navigation)
  const hasNavigatedToReviewRef = React.useRef(false);

  // Scan flow: when modal closes AND results are ready, navigate to review
  useEffect(() => {
    console.log('[HOME] Scan flow check:', {
      status: activeScanJob?.status,
      hasResult: !!activeScanJob?.result,
      requiresReview: activeScanJob?.requiresReview,
      selectedScanCourse,
      shouldShowScanCourseModal,
    });

    // Only act when modal is closed (user finished selecting course)
    if (shouldShowScanCourseModal) return;

    // Check if we have a pending course selection and results are ready
    if (activeScanJob?.requiresReview && activeScanJob.result && selectedScanCourse) {
      // Store the course selection for the review screen
      setPendingScanCourseSelection({
        courseId: selectedScanCourse.id,
        teeName: selectedScanCourse.teeName,
      });
      // Navigate to review
      router.push('/scan-review');
      // Clear local selection
      setSelectedScanCourse(null);
    }
  }, [shouldShowScanCourseModal, activeScanJob, selectedScanCourse, router, setPendingScanCourseSelection]);

  // Onboarding mode: auto-navigate to scan-review when scan completes
  // (In onboarding, we skip the course modal on home and go straight to scan-review)
  useEffect(() => {
    const isInOnboarding = !useOnboardingStore.getState().hasCompletedOnboarding;
    if (!isInOnboarding) return;

    // Use ref to immediately guard against duplicate navigation (faster than state)
    if (hasNavigatedToReviewRef.current) return;

    // Check if scan just completed and requires review
    if (activeScanJob?.requiresReview && activeScanJob.result && activeScanJob.status !== 'processing') {
      console.log('[HOME] Onboarding: scan complete, navigating to scan-review');
      // Set ref immediately to prevent any re-runs from navigating again
      hasNavigatedToReviewRef.current = true;
      // Also mark in store for persistence
      markActiveScanReviewPending();
      router.push('/scan-review?onboardingMode=true');
    }
  }, [activeScanJob, router, markActiveScanReviewPending]);

  const { user, isLoaded: isUserLoaded } = useUser();
  const updateProfile = useMutation(api.users.updateProfile);
  const seedHandicap = useMutation(api.handicap.seedHandicap);
  const [showHandicapModal, setShowHandicapModal] = useState(false);
  const [handicapInput, setHandicapInput] = useState('');
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [profileGender, setProfileGender] = useState<"M" | "F" | null>(null);
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  const [hasCheckedProfile, setHasCheckedProfile] = useState(false);

  // Animated progress and status messages for processing card
  // Using Animated.Value for smooth interpolation (prevents re-renders)
  const progressAnim = useRef(new Animated.Value(30)).current;
  const [displayProgress, setDisplayProgress] = useState(30);
  const [processingMessageIndex, setProcessingMessageIndex] = useState(0);
  const processingMessages = [
    'AI is reading your scorecard...',
    'Detecting scorecard format...',
    'Analyzing handwriting...',
    'Identifying players...',
    'Extracting scores...',
    'Calculating stats...',
  ];

  // Animate progress smoothly when processing
  useEffect(() => {
    if (activeScanJob?.status !== 'processing') {
      // Reset when not processing
      progressAnim.setValue(30);
      setDisplayProgress(30);
      setProcessingMessageIndex(0);
      return;
    }

    let targetProgress = 30;
    const animateToTarget = () => {
      // Slow down as we approach 95%
      const increment = targetProgress < 50 ? 8 : targetProgress < 75 ? 5 : 2;
      targetProgress = Math.min(targetProgress + increment, 95);

      Animated.timing(progressAnim, {
        toValue: targetProgress,
        duration: 800, // Smooth 800ms transition
        useNativeDriver: false,
      }).start();

      // Update display value for percentage text
      setDisplayProgress(Math.round(targetProgress));
    };

    // Start first animation immediately
    animateToTarget();

    // Continue animating every 800ms
    const progressInterval = setInterval(animateToTarget, 800);

    // Message cycling: change every 2 seconds
    const messageInterval = setInterval(() => {
      setProcessingMessageIndex(prev => (prev + 1) % processingMessages.length);
    }, 2000);

    return () => {
      clearInterval(progressInterval);
      clearInterval(messageInterval);
    };
  }, [activeScanJob?.status]);


  const profile = useQuery(api.users.getProfile);

  // Add mock courses on first load if no courses exist
  useEffect(() => {
    if (courses.length === 0) {
      mockCourses.forEach(course => {
        addCourse(course);
      });
    }
  }, []);

  // Get current user
  const currentUser = players.find(p => p.isUser);
  const selfPlayer = useQuery(api.players.getSelf, {}) as any;
  // Removed: players.getStats subscription - too expensive for home screen (172.6 MB)
  // Use handicapSummary.roundsCount instead for "rounds played" display
  const convexRounds = useQuery(
    api.rounds.listWithSummary,
    profile?._id ? { hostId: profile._id as Id<'users'> } : 'skip'
  ) as Round[] | undefined;

  // Active game session
  const activeSession = useQuery(api.gameSessions.getActive) as any;
  const cancelSession = useMutation(api.gameSessions.cancel);

  // Keep Convex user profile in sync with Clerk when Clerk has a real name.
  // Show the setup modal only for "new" users (no meaningful name yet and no
  // rounds), not on every refresh.
  useEffect(() => {
    if (!isUserLoaded || !user || profile === undefined || hasCheckedProfile) return;

    const clerkName =
      user.fullName ||
      user.firstName ||
      user.username ||
      null;

    const emailLocal =
      (user.primaryEmailAddress?.emailAddress || '').split('@')[0] || '';
    const hasMeaningfulProfileName =
      !!(profile && profile.name && profile.name !== 'New Golfer');
    const hasCompletedSetup = !!profile?.profileSetupComplete;

    // 1) If Clerk has a real name and Convex doesn't, sync it once.
    if (clerkName && (!profile || !hasMeaningfulProfileName)) {
      updateProfile({ name: clerkName }).catch(() => { });
    }

    // If setup has been completed (server flag) or we've already shown it once, never show again.
    if (hasCompletedSetup || profileSetupSeen) {
      setProfileSetupSeen(true);
      setHasCheckedProfile(true);
      return;
    }

    // 2) Only show the setup modal for users who don't have a meaningful
    // name yet. Once they save, profileSetupComplete will be true and
    // this effect will stop showing the modal on future loads.
    if (!hasMeaningfulProfileName) {
      const initialName =
        (hasMeaningfulProfileName && profile?.name) ||
        clerkName ||
        emailLocal ||
        '';
      setProfileNameInput(initialName);
      setProfilePhotoUri(profile?.avatarUrl ?? null);
      setProfileGender((profile?.gender as "M" | "F") ?? null);
      setShowProfileSetup(true);
      setProfileSetupSeen(true);
      setHasCheckedProfile(true);
      return;
    }

    setHasCheckedProfile(true);
  }, [isUserLoaded, user, profile, updateProfile, hasCheckedProfile, profileSetupSeen, setProfileSetupSeen]);

  const findUserPlayer = (round: Round) => {
    if (!round?.players?.length) return null;
    const playersWithFlags = round.players as any[];
    const selfFlag = playersWithFlags.find((p) => p.isSelf);
    const userFlag = playersWithFlags.find((p) => p.isUser);
    const candidate = selfFlag || userFlag || null;
    return candidate;
  };

  // Rounds to show on home: Convex is source of truth for any
  // synced rounds; keep local-only rounds for offline/dev use.
  const serverRoundIds = new Set((convexRounds ?? []).map((r) => r.id));
  const pendingLocalRounds = rounds.filter(
    (r: any) => !r.remoteId && !serverRoundIds.has(r.id)
  );
  // During onboarding (no profile), don't block on convexRounds - use local rounds only
  const isOnboardingMode = !useOnboardingStore.getState().hasCompletedOnboarding;
  const isRoundsLoading = !isOnboardingMode && convexRounds === undefined;
  const serverRounds = convexRounds ?? [];
  // Deduplicate: prefer server rounds, exclude local rounds that match
  const userRounds = [...serverRounds, ...pendingLocalRounds] as Round[];

  const totalRounds = userRounds.length;

  // Calculate average score with proper 9-hole vs 18-hole adjustment
  const averageScore = totalRounds > 0 ?
    calculateAverageScoreWithHoleAdjustment(
      userRounds
        .map(round => {
          const userPlayer = findUserPlayer(round) || round.players[0];
          if (!userPlayer) return null;
          const course = courses.find(c => c.id === round.courseId);
          return { round, playerData: userPlayer, course };
        })
        .filter(Boolean) as { round: Round; playerData: any; course: any }[]
    ) : 0;

  // Handicap: use the CALCULATED Scandicap index (same as Scandicap details page)
  // Using lightweight getSummary instead of getDetails to reduce bandwidth by 97%
  const handicapSummary = useQuery(
    api.handicap.getSummary,
    profile?._id ? { userId: profile._id as any } : "skip"
  );
  const userHandicapValue =
    typeof handicapSummary?.currentHandicap === 'number'
      ? handicapSummary.currentHandicap
      : (typeof profile?.handicap === 'number' ? profile.handicap : 0);
  const displayName = profile?.name ?? currentUser?.name ?? 'Golf Player';
  const avatarUrl = profile?.avatarUrl ?? currentUser?.photoUrl;
  const canSaveProfileName = profileNameInput.trim().length > 0;

  const handlePickProfilePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Media library permission is required to select a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setProfilePhotoUri(result.assets[0].uri);
    }
  };

  // Check if "you" won each round (by id or name)
  const getRoundWithWinStatus = (round: Round) => {
    const userPlayer = findUserPlayer(round);
    if (!userPlayer) return { ...round, userWon: false };

    const players = round.players as any[];
    const withHcp = players.filter((p) => p.handicapUsed !== undefined);
    let winner: any;

    if (withHcp.length) {
      const withNet = withHcp.map((p) => ({
        player: p,
        netScore: calculateNetScore(p.totalScore, p.handicapUsed),
      }));
      winner = withNet.reduce(
        (best, cur) => (cur.netScore < best.netScore ? cur : best),
        withNet[0]
      ).player;
    } else {
      winner = players.reduce(
        (best, cur) => (cur.totalScore < best.totalScore ? cur : best),
        players[0]
      );
    }

    const userWon = winner && winner.playerId === (userPlayer as any).playerId;

    return { ...round, userWon };
  };

  const recentRounds = userRounds
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3)
    .map(getRoundWithWinStatus);

  const scanJob = activeScanJob;
  const hasActiveScanCard = !!scanJob && (
    scanJob.status === 'processing' ||
    scanJob.status === 'error' ||
    scanJob.requiresReview
  );

  const buildDevSampleResult = (): ScorecardScanResult => ({
    courseName: "Dev National Doral - Blue",
    courseNameConfidence: 0.92,
    date: new Date().toISOString().split("T")[0],
    dateConfidence: 0.9,
    overallConfidence: 0.9,
    players: [
      {
        name: "Miguel",
        nameConfidence: 0.95,
        scores: Array.from({ length: 18 }).map((_, idx) => ({
          hole: idx + 1,
          score: idx % 3 === 0 ? 5 : 4,
          confidence: Math.max(0.75, 0.93 - idx * 0.01),
        })),
      },
      {
        name: "Alex",
        nameConfidence: 0.88,
        scores: Array.from({ length: 18 }).map((_, idx) => ({
          hole: idx + 1,
          score: idx % 4 === 0 ? 6 : 5,
          confidence: Math.max(0.72, 0.86 - idx * 0.008),
        })),
      },
    ],
  });

  const ProgressRing = ({
    percentage,
    status,
  }: {
    percentage: number;
    status: 'processing' | 'complete' | 'error';
  }) => {
    const size = 64;
    const strokeWidth = 6;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.min(100, Math.max(0, Math.round(percentage)));
    const ratio = status === 'processing' ? clamped / 100 : status === 'complete' ? 1 : 0;
    const strokeDashoffset = circumference - ratio * circumference;
    const ringColor = status === 'error' ? colors.error : status === 'complete' ? colors.success : colors.primary;
    const label = status === 'error'
      ? '!'
      : status === 'complete'
        ? 'Done'
        : `${clamped}%`;

    return (
      <View style={styles.scanCardProgressWrapper}>
        <Svg width={size} height={size}>
          <Circle
            stroke="rgba(255,255,255,0.2)"
            fill="transparent"
            strokeWidth={strokeWidth}
            cx={size / 2}
            cy={size / 2}
            r={radius}
          />
          <Circle
            stroke={ringColor}
            fill="transparent"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={status === 'error' ? circumference : strokeDashoffset}
            cx={size / 2}
            cy={size / 2}
            r={radius}
          />
        </Svg>
        <Text
          style={[styles.scanCardProgressLabel, status === 'error' && styles.scanCardProgressLabelError]}
          maxFontSizeMultiplier={1.2}
        >
          {label}
        </Text>
      </View>
    );
  };

  const renderActiveScanCard = () => {
    if (!scanJob) return null;

    const isProcessing = scanJob.status === 'processing';
    const isError = scanJob.status === 'error';
    const isReady = !isProcessing && !isError && scanJob.requiresReview;
    const status: 'processing' | 'complete' | 'error' = isError ? 'error' : isReady ? 'complete' : 'processing';

    console.log('[HOME] Card Render State:', { isProcessing, isError, isReady, status, jobStatus: scanJob.status });

    // Show user-friendly message with cycling messages during processing
    const message = isError
      ? 'Something went wrong. Please try again.'
      : isReady
        ? 'Ready for review'
        : processingMessages[processingMessageIndex];
    const subtext = isProcessing
      ? "We'll notify you when done."
      : isError
        ? 'Tap to try again.'
        : 'Tap to review and save your round.';

    // Use animated progress when processing, otherwise use actual progress
    const progressValue = isProcessing ? displayProgress : (scanJob.progress ?? 100);

    const handlePress = () => {
      console.log('[HOME] Card pressed, state:', { isProcessing, isError, status, isOnboardingMode });
      if (isProcessing) return;
      if (isError) {
        clearActiveScanJob();
        router.push('/scan-scorecard');
        return;
      }
      // Pass onboarding mode to scan-review if in onboarding
      router.push(isOnboardingMode ? '/scan-review?onboardingMode=true' : '/scan-review');
    };

    const isDevJob =
      devMode ||
      (scanJob.message && scanJob.message.toLowerCase().includes('dev mode'));
    const cardDisabled = isProcessing && !isDevJob;

    const handleDevSimulateResponse = () => {
      if (!isDevJob || !scanJob) return;
      const sample: any = buildDevSampleResult();
      if ((scanJob as any).selectedTeeName) {
        sample.teeName = (scanJob as any).selectedTeeName;
      }
      const now = new Date().toISOString();
      setActiveScanJob({
        ...scanJob,
        status: 'complete',
        stage: 'complete',
        progress: 100,
        message: 'Dev mode: simulated AI response',
        updatedAt: now,
        requiresReview: true,
        result: sample,
        autoReviewLaunched: false,
      });
      setScannedData(sample as any);
      markActiveScanReviewPending();
      setIsScanning(false);
      router.push('/scan-review');
    };

    const handleDevDiscardScan = () => {
      if (!isDevJob || !scanJob) return;
      clearActiveScanJob();
      setScannedData(null);
      setIsScanning(false);
    };

    return (
      <TouchableOpacity
        style={[
          styles.scanCard,
          isProcessing && styles.scanCardDisabled,
          activeSession && styles.scanCardSession
        ]}
        activeOpacity={0.85}
        onPress={handlePress}
        disabled={cardDisabled}
      >
        {/* Dismiss button - hidden during onboarding to prevent breaking the flow */}
        {!isOnboardingMode && (
          <TouchableOpacity
            style={styles.scanCardDismiss}
            onPress={() => {
              clearActiveScanJob();
              setScannedData(null);
              setIsScanning(false);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={18} color={colors.text} />
          </TouchableOpacity>
        )}

        <View style={styles.scanCardImageWrapper}>
          {scanJob.thumbnailUri ? (
            <Image source={{ uri: scanJob.thumbnailUri }} style={styles.scanCardImage} />
          ) : (
            <View style={[styles.scanCardImage, styles.scanCardImagePlaceholder]}>
              <Flag size={24} color={colors.inactive} />
            </View>
          )}
          <View style={styles.scanCardDimmer} />
          <View style={styles.scanCardProgressOverlay}>
            <ProgressRing percentage={progressValue} status={status} />
          </View>
        </View>

        <View style={styles.scanCardInfo}>
          <Text style={styles.scanCardTitle} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {isProcessing ? 'Processing scorecard…' : isError ? 'Scan failed' : 'Ready to review'}
          </Text>
          <Text style={styles.scanCardMessage} numberOfLines={2} maxFontSizeMultiplier={1.2}>
            {message}
          </Text>
          <Text
            style={isReady ? styles.scanCardSubtextAction : styles.scanCardSubtext}
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
          >
            {subtext}
          </Text>
          {isDevJob && (
            <View style={styles.scanCardDevRow}>
              <TouchableOpacity style={styles.scanCardDevButton} onPress={handleDevSimulateResponse}>
                <Text style={styles.scanCardDevButtonText}>Simulate response</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.scanCardDevIcon} onPress={handleDevDiscardScan} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Trash2 size={18} color={colors.error} />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.scanCardSkeletonRow}>
            <View style={styles.scanCardSkeletonBlock} />
            <View style={styles.scanCardSkeletonBlockShort} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const navigateToScanScorecard = () => {
    if (!devMode && activeScanJob && activeScanJob.status === 'processing') {
      Alert.alert(
        'Scan in progress',
        'Please wait for your current scorecard to finish processing before starting another.'
      );
      return;
    }
    router.push('/scan-scorecard');
  };

  const navigateToRoundDetails = (roundId: string) => {
    router.push(`/round/${roundId}`);
  };

  const navigateToProfile = () => {
    router.push('/profile');
  };

  const navigateToSettings = () => {
    router.push('/settings');
  };

  const handleHandicapPress = () => {
    router.push('/scandicap-details');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  };

  const formatAverageScore = () => {
    if (typeof averageScore === 'number') {
      return averageScore.toFixed(1);
    }
    if (typeof averageScore === 'string') {
      const parsed = parseFloat(averageScore);
      if (!isNaN(parsed)) return parsed.toFixed(1);
    }
    return '0.0';
  };

  const RoundListItem = React.memo(({ item }: { item: Round & { userWon: boolean } }) => {
    const courseExternalId = (item as any).courseExternalId as string | undefined;
    const remoteCourseImage = (item as any).courseImageUrl as string | undefined;
    const remoteCourseLocation = (item as any).courseLocation as string | undefined;
    const course =
      (courseExternalId && courses.find((c) => c.id === courseExternalId)) ||
      courses.find((c) => c.id === item.courseId);
    const userPlayer = findUserPlayer(item) || item.players[0];

    // Use the image caching hook for consistent behavior
    const imageUri = useCourseImage({
      courseId: courseExternalId || item.courseId,
      convexImageUrl: remoteCourseImage,
      localImageUrl: course?.imageUrl,
    });

    // Prefer Convex location (most up-to-date), fall back to local store
    const isValidLocation = (loc?: string | null) =>
      loc && !loc.includes('undefined') && !loc.includes('Unknown');
    const displayLocation = isValidLocation(remoteCourseLocation)
      ? remoteCourseLocation
      : (isValidLocation(course?.location) ? course?.location : 'Unknown Location');

    return (
      <TouchableOpacity
        style={styles.roundCard}
        onPress={() => navigateToRoundDetails(item.id)}
      >
        <View style={styles.roundHeader}>
          <Text style={styles.roundTitle}>Game {formatDate(item.date)}</Text>
          <Text style={styles.roundArrow}>›</Text>
        </View>

        <View style={styles.roundImageContainer}>
          <Image
            source={{ uri: imageUri }}
            style={styles.roundImage}
          />
          {/* Removed dark shade for a cleaner overlay */}
          {item.userWon && (
            <View style={styles.crownContainer}>
              <Crown size={20} color="#FFD700" fill="#FFD700" />
            </View>
          )}
          <View style={styles.scoreOverlay}>
            <Text style={styles.scoreText}>Total</Text>
            <Text style={styles.scoreValue}>{userPlayer?.totalScore ?? 0}</Text>
          </View>
          {/* Overlay course info on image */}
          <View style={styles.roundInfoOverlay}>
            <Text style={styles.roundLocationOnImage} numberOfLines={1}>
              {displayLocation}
            </Text>
            <Text style={styles.roundCourseOnImage} numberOfLines={1}>
              {item.courseName}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, (prevProps, nextProps) => {
    // Only re-render if the item itself changed
    return prevProps.item.id === nextProps.item.id &&
      prevProps.item.userWon === nextProps.item.userWon;
  });

  const HomeSkeleton: React.FC = () => (
    <View style={{ paddingHorizontal: 6, paddingBottom: 24 }}>
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 16,
          padding: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <View style={{ width: '52%', height: 16, backgroundColor: '#e6e6e6', borderRadius: 8 }} />
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#e6e6e6' }} />
        </View>

        <View
          style={{
            height: 190,
            borderRadius: 12,
            backgroundColor: '#e0e0e0',
            overflow: 'hidden',
            marginBottom: 12,
          }}
        >
          <View style={{ position: 'absolute', bottom: 12, left: 12, right: 12 }}>
            <View style={{ width: '40%', height: 12, backgroundColor: '#d6d6d6', borderRadius: 6, marginBottom: 6 }} />
            <View style={{ width: '70%', height: 14, backgroundColor: '#d6d6d6', borderRadius: 7 }} />
          </View>
          <View
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: '#eaeaea',
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: 12,
              right: 12,
              width: 64,
              height: 52,
              borderRadius: 12,
              backgroundColor: '#eaeaea',
            }}
          />
        </View>
        <View style={{ width: '35%', height: 12, backgroundColor: '#e6e6e6', borderRadius: 6, marginBottom: 8 }} />
        <View style={{ width: '55%', height: 12, backgroundColor: '#e6e6e6', borderRadius: 6 }} />
      </View>
    </View>
  );

  // Curved arrow component for empty state
  const CurvedArrow = () => (
    <View style={styles.curvedArrowContainer}>
      <Svg width="200" height="140" viewBox="0 0 200 100">
        <Path
          d="M35 0 Q 60 85, 120 100"
          stroke={colors.primary}
          strokeWidth="2"
          strokeDasharray="5,5"
          fill="none"
        />
        <Path
          d="M112 92 L 120 100 L 115 89"
          stroke={colors.primary}
          strokeWidth="2"
          fill="none"
        />
      </Svg>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#F5F3EF', '#E8F5E9', '#F5F3EF']}
        locations={[0.3, 0.8, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={navigateToProfile}
          >
            <User size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>ScanCaddie</Text>

          <TouchableOpacity
            style={styles.headerButton}
            onPress={navigateToSettings}
          >
            <Settings size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.profileSection}>
          <View style={[styles.avatarContainer, styles.homeAvatarContainer]}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.homeAvatarImage} />
            ) : (
              <View style={styles.homeAvatarFallback}>
                <Text style={styles.avatarText}>{displayName?.charAt(0) || 'G'}</Text>
              </View>
            )}
          </View>

          <Text style={styles.userName}>{displayName}</Text>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{formatAverageScore()}</Text>
            </View>
            <Text style={styles.statLabel}>AVG SCORE</Text>
          </View>

          <View style={styles.statItem}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{totalRounds}</Text>
            </View>
            <Text style={styles.statLabel}>ROUNDS</Text>
          </View>

          <TouchableOpacity style={styles.statItem} onPress={handleHandicapPress}>
            <View style={[styles.statBox, styles.statBoxInteractive]}>
              <Text style={styles.statValue}>{userHandicapValue.toFixed(1)}</Text>
              <View style={styles.statEditBadge}>
                <Info size={14} color={colors.text} />
              </View>
            </View>
            <Text style={styles.statLabel}>SCANDICAP</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.roundsSection}>
          <Text style={styles.sectionTitle}>My rounds</Text>



          {isRoundsLoading ? (
            <HomeSkeleton />
          ) : recentRounds.length > 0 ? (
            <FlatList
              data={recentRounds}
              renderItem={({ item }) => <RoundListItem item={item} />}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.roundsList}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={() => (
                <View style={styles.scanCardHeader}>
                  {activeSession && !hasActiveScanCard && (
                    <View style={{ marginBottom: 12 }}>
                      <SessionBanner
                        sessionId={activeSession._id}
                        courseName={activeSession.course?.name || 'Unknown Course'}
                        gameType={activeSession.gameType}
                        playerCount={activeSession.participants?.length || 0}
                        status={activeSession.status}
                        onResume={() => router.push(`/active-session?sessionId=${activeSession._id}`)}
                        onDismiss={async () => {
                          try {
                            await cancelSession({ sessionId: activeSession._id });
                          } catch (error) {
                            console.error('Failed to cancel session:', error);
                          }
                        }}
                      />
                    </View>
                  )}
                  {hasActiveScanCard && renderActiveScanCard()}
                </View>
              )}
              ListHeaderComponentStyle={null}
            />
          ) : (
            <View style={styles.emptyWrapper}>
              <View style={styles.scanCardHeader}>
                {activeSession && !hasActiveScanCard && (
                  <View style={{ marginBottom: 12 }}>
                    <SessionBanner
                      sessionId={activeSession._id}
                      courseName={activeSession.course?.name || 'Unknown Course'}
                      gameType={activeSession.gameType}
                      playerCount={activeSession.participants?.length || 0}
                      status={activeSession.status}
                      onResume={() => router.push(`/active-session?sessionId=${activeSession._id}`)}
                      onDismiss={async () => {
                        try {
                          await cancelSession({ sessionId: activeSession._id });
                        } catch (error) {
                          console.error('Failed to cancel session:', error);
                        }
                      }}
                    />
                  </View>
                )}
                {hasActiveScanCard && renderActiveScanCard()}
              </View>

              {(!hasActiveScanCard && !activeSession) && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No rounds yet</Text>
                  <Text style={styles.emptyMessage}>
                    Scan your scorecard with AI to add your scores and get your round summary
                  </Text>
                  <CurvedArrow />
                </View>
              )}
            </View>
          )}
        </View>

        {/* Onboarding processing overlay - blocks interaction during scanning */}
        <Modal
          visible={isOnboardingMode && hasActiveScanCard && scanJob?.status === 'processing'}
          transparent
          animationType="fade"
        >
          <View style={styles.onboardingOverlay}>
            <SafeAreaView style={styles.onboardingOverlayContent}>
              <Text style={styles.onboardingOverlayTitle}>Processing your scorecard...</Text>
              <Text style={styles.onboardingOverlaySubtitle}>
                Our AI is reading handwritten scores and identifying players
              </Text>

              {/* Render the scan card inside the modal */}
              <View style={styles.onboardingCardContainer}>
                {renderActiveScanCard()}
              </View>

              <View style={styles.onboardingExplanationBox}>
                <Text style={styles.onboardingExplanationTitle}>💡 How it works</Text>
                <Text style={styles.onboardingExplanationText}>
                  ScanCaddie uses AI to read handwritten scorecards, identify players,
                  and automatically calculate your stats - all in seconds!
                </Text>
              </View>
            </SafeAreaView>
          </View>
        </Modal>

        <Modal
          visible={showProfileSetup}
          transparent
          animationType="fade"
          onRequestClose={() => setShowProfileSetup(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Set up your profile</Text>
              <TouchableOpacity
                style={[styles.avatarContainer, styles.profileSetupAvatar]}
                onPress={handlePickProfilePhoto}
              >
                {profilePhotoUri ? (
                  <Image
                    source={{ uri: profilePhotoUri }}
                    style={{ width: 76, height: 76, borderRadius: 38 }}
                  />
                ) : (
                  <Camera size={28} color={colors.text} />
                )}
                <View style={styles.profileSetupEditBadge}>
                  <Edit3 size={14} color={colors.card} />
                </View>
              </TouchableOpacity>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={profileNameInput}
                onChangeText={setProfileNameInput}
                placeholder="Enter your name"
              />
              <View style={[styles.modalButtons, { justifyContent: 'center' }]}>
                <TouchableOpacity
                  disabled={!canSaveProfileName}
                  style={[
                    styles.modalButton,
                    styles.saveButton,
                    !canSaveProfileName && styles.saveButtonDisabled,
                  ]}
                  onPress={async () => {
                    const trimmed = profileNameInput.trim();
                    if (!user || !isUserLoaded) {
                      Alert.alert('Sign in required', 'Please sign in again to save your profile.');
                      return;
                    }
                    try {
                      // 1) Update Convex profile (app's own profile)
                      await updateProfile({
                        name: trimmed,
                        avatarUrl: profilePhotoUri ?? undefined,
                        profileSetupComplete: true,
                        gender: profileGender ?? undefined,
                      });

                      // 2) Keep Clerk profile in sync so the dashboard
                      //    and future sessions see the same name.
                      const parts = trimmed.split(/\s+/).filter(Boolean);
                      const firstName = parts[0] ?? trimmed;
                      const lastName = parts.slice(1).join(' ');
                      const updatePayload: any = { firstName };
                      if (lastName) updatePayload.lastName = lastName;
                      await user.update(updatePayload);

                      setShowProfileSetup(false);
                      setProfileSetupSeen(true);
                    } catch {
                      Alert.alert('Error', 'Could not save your profile. Please try again.');
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.saveButtonText,
                      !canSaveProfileName && styles.saveButtonTextDisabled,
                    ]}
                  >
                    Save
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showHandicapModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowHandicapModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Set Your Handicap</Text>

              <Text style={styles.inputLabel}>Handicap Index</Text>
              <TextInput
                style={styles.input}
                value={handicapInput}
                onChangeText={setHandicapInput}
                placeholder="Enter your current index"
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad'}
              />
              <Text style={styles.ghinNote}>
                This seeds your Scandicap so future rounds can adjust it over time.
              </Text>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setShowHandicapModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={async () => {
                    const parsed = parseFloat(handicapInput);
                    if (isNaN(parsed)) {
                      Alert.alert('Error', 'Please enter a valid handicap');
                      return;
                    }
                    try {
                      await seedHandicap({ initialHandicap: parsed });
                      setShowHandicapModal(false);
                      Alert.alert('Success', 'Your Scandicap has been seeded.');
                    } catch (e: any) {
                      Alert.alert(
                        'Error',
                        e?.message || 'Could not seed handicap. Please try again.'
                      );
                    }
                  }}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Course selection modal for scan flow */}
        <CourseSearchModal
          visible={shouldShowScanCourseModal}
          testID="home-scan-course-modal"
          onClose={() => {
            setShouldShowScanCourseModal(false);
          }}
          onSelectCourse={(course, meta) => {
            console.log('[HOME] onSelectCourse callback, course:', course?.name, 'meta:', meta);
            console.log('[HOME] selectedTee from meta:', meta?.selectedTee);
            // Store course id and tee name for navigation
            setSelectedScanCourse({
              id: course.id,
              teeName: meta?.selectedTee || '',
            });
            setShouldShowScanCourseModal(false);
          }}
          showMyCoursesTab={!useOnboardingStore.getState().hasCompletedOnboarding ? false : true}
          isGuest={!useOnboardingStore.getState().hasCompletedOnboarding}
        />

        {/* Game setup modal (triggered from camera screen's "Setup Game Instead") */}
        {pendingGameSetupIntent && (
          <PreRoundFlowModal
            visible={true}
            onClose={() => setPendingGameSetupIntent(null)}
            initialIntent={pendingGameSetupIntent}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 74,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarContainer: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  homeAvatarContainer: {
    width: 84,
    height: 84,
    borderRadius: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  homeAvatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  homeAvatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.card,
  },
  profileSetupAvatar: {
    alignSelf: 'center',
    marginBottom: 16,
    backgroundColor: '#E6EAE9',
    borderWidth: 1,
    borderColor: '#D5DBD9',
    position: 'relative',
  },
  profileSetupEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 36,
  },
  statItem: {
    alignItems: 'center',
  },
  statBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 14,
    marginBottom: 8,
    minWidth: 72,
    minHeight: 64,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 2,
  },
  statBoxInteractive: {
    position: 'relative',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
    letterSpacing: 1.0,
    includeFontPadding: false,
  },
  handicapContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editIcon: {
    marginLeft: 4,
  },
  statEditBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E6EAE9',
    zIndex: 2,
    pointerEvents: 'none',
  },
  roundsSection: {
    flex: 1,
    paddingHorizontal: 16,
    marginTop: 18,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 20,
  },
  roundsList: {
    paddingBottom: 140,
  },
  scanCardHeader: {
    marginBottom: 16,
  },
  scanCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    minHeight: 112,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    position: 'relative',
  },
  scanCardDismiss: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanCardDisabled: {
    opacity: 0.85,
  },
  scanCardSession: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: 'rgba(0, 122, 102, 0.05)',
  },
  scanCardImageWrapper: {
    width: 80,
    height: 80,
    borderRadius: 16,
    overflow: 'hidden',
    marginRight: 16,
    backgroundColor: '#e0e0e0',
  },
  scanCardImage: {
    width: '100%',
    height: '100%',
    opacity: 0.35,
  },
  scanCardImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanCardDimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  scanCardProgressOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  scanCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  scanCardMessage: {
    fontSize: 14,
    color: colors.text,
    opacity: 0.8,
    marginBottom: 6,
  },
  scanCardSubtext: {
    fontSize: 12,
    color: colors.inactive,
    marginBottom: 12,
  },
  scanCardSubtextAction: {
    fontSize: 12,
    color: colors.primary,
    marginBottom: 12,
    fontWeight: '600',
  },
  scanCardDevRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 8,
    gap: 10,
  },
  scanCardDevButton: {
    alignSelf: 'flex-start',
    backgroundColor: `${colors.primary}15`,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginTop: 8,
    marginBottom: 10,
  },
  scanCardDevButtonText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  scanCardDevIcon: {
    padding: 6,
  },
  scanCardSkeletonRow: {
    flexDirection: 'row',
  },
  scanCardSkeletonBlock: {
    height: 8,
    flex: 1,
    backgroundColor: '#E6E6E6',
    borderRadius: 4,
    marginRight: 8,
  },
  scanCardSkeletonBlockShort: {
    width: 60,
    height: 8,
    backgroundColor: '#E6E6E6',
    borderRadius: 4,
  },
  scanCardProgressWrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanCardProgressLabel: {
    position: 'absolute',
    fontSize: 13,
    fontWeight: '600',
    color: colors.card,
  },
  scanCardProgressLabelError: {
    color: colors.error,
  },
  roundCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E6EAE9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  roundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  roundTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    includeFontPadding: false,
    lineHeight: 20,
    marginLeft: 4,
  },
  roundArrow: {
    fontSize: 20,
    color: colors.text,
  },
  roundImageContainer: {
    position: 'relative',
    height: 180,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 0,
  },
  roundImage: {
    width: '100%',
    height: '100%',
  },
  crownContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 6,
  },
  roundBottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  scoreOverlay: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    minWidth: 50,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  scoreText: {
    fontSize: 10,
    color: colors.text,
    fontWeight: '500',
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  roundInfoOverlay: {
    position: 'absolute',
    left: 12,
    bottom: 18,
    right: 100,
  },
  roundCourseOnImage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 0,
  },
  roundLocationOnImage: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.95,
  },
  emptyWrapper: {
    flex: 1,
    position: 'relative',
    paddingBottom: 260,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  curvedArrowContainer: {
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    transform: [{ translateX: -40 }],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
    backgroundColor: colors.background,
  },
  ghinNote: {
    fontSize: 12,
    color: colors.text,
    marginBottom: 24,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  genderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
  },
  genderOption: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 8,
  },
  genderOptionActive: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}12`,
  },
  genderOptionText: {
    color: colors.text,
    fontWeight: '600',
  },
  genderOptionTextActive: {
    color: colors.primary,
  },
  saveButton: {
    backgroundColor: colors.primary,
    marginLeft: 8,
    marginRight: 8,
  },
  cancelButton: {
    backgroundColor: colors.background,
    marginLeft: 8,
    marginRight: 8,
  },
  saveButtonDisabled: {
    backgroundColor: colors.primary,
    opacity: 0.5,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.card,
  },
  saveButtonTextDisabled: {
    color: '#FFFFFF',
    opacity: 0.8,
  },
  // Onboarding processing overlay styles
  onboardingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  onboardingOverlayContent: {
    width: '100%',
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  onboardingOverlayTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  onboardingOverlaySubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    marginBottom: 24,
  },
  onboardingCardContainer: {
    width: '100%',
    marginBottom: 24,
  },
  onboardingExplanationBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  onboardingExplanationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  onboardingExplanationText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 20,
  },
});
