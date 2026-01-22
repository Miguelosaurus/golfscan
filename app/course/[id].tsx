import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ScrollView,
  Image,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useGolfStore } from '@/store/useGolfStore';
import { Button } from '@/components/Button';
import { RoundCard } from '@/components/RoundCard';
import { getEighteenHoleEquivalentScore, getRoundHoleCount } from '@/utils/helpers';
import { calculatePerformanceByPar, calculatePerHoleAverages } from '@/utils/stats';
import { MapPin, Camera, X, TrendingUp, TrendingDown, ChevronRight, ChevronLeft, Info, Trash2, ChevronDown } from 'lucide-react-native';
import { useQuery } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';

export default function CourseDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { courses, rounds, players, deleteCourse, updateCourse } = useGolfStore();
  const [showRoundsModal, setShowRoundsModal] = useState(false);
  const [showCourseMapInfo, setShowCourseMapInfo] = useState(false);
  const [selectedTeeName, setSelectedTeeName] = useState<string | "All">("All");
  const [selectedTeeGender, setSelectedTeeGender] = useState<"M" | "F" | undefined>(undefined);
  const [showTeeSelector, setShowTeeSelector] = useState(false);
  const [teePickerGenderTab, setTeePickerGenderTab] = useState<'M' | 'F'>('M');
  const profile = useQuery(api.users.getProfile);
  const isConvexId = (value: string | undefined | null) =>
    !!value && /^[a-z0-9]{15,}$/i.test(value);

  const convexCourseById = useQuery(
    api.courses.getById,
    id && isConvexId(id) ? ({ courseId: id as Id<'courses'> } as any) : 'skip'
  );
  const convexCourseByExternal = useQuery(
    api.courses.getByExternalId,
    id && !isConvexId(id) ? ({ externalId: id } as any) : 'skip'
  );
  const convexCourse = (convexCourseById || convexCourseByExternal) as any;
  const hostRounds =
    useQuery(
      api.rounds.listWithSummary,
      profile?._id ? { hostId: profile._id as Id<'users'> } : "skip"
    ) || [];

  // Get course from local store first (needed for courseRounds dependency)
  const courseFromStore =
    courses.find(c => c.id === id) ||
    (courses.find(c => c.name === (hostRounds as any[])[0]?.courseName));

  const courseRounds: any[] = useMemo(() => {
    const convexCourseId = (convexCourse as any)?._id as string | undefined;
    if (hostRounds.length) {
      const fromHost = (hostRounds as any[]).filter((r) => {
        if (convexCourseId && r.courseId === convexCourseId) return true;
        if (id && r.courseId === id) return true; // legacy/external id match
        if (courseFromStore && r.courseName === courseFromStore.name) return true;
        return false;
      });
      return fromHost;
    }

    const localId = (courseFromStore?.id as string) ?? (id as string);
    const fromLocal = rounds.filter((round) => round.courseId === localId);
    return fromLocal;
  }, [hostRounds, rounds, id, convexCourse, courseFromStore]);

  // If we still don't have a course but rounds exist, infer a minimal course shell
  const inferredCourse =
    courseRounds.length
      ? {
        id: id as string,
        name: courseRounds[0]?.courseName ?? 'Unknown Course',
        location: 'Unknown location',
        holes: [],
        imageUrl: undefined,
      }
      : null;

  const mappedConvexCourse = convexCourse
    ? ({
      id: convexCourse.externalId ?? id as string,
      name: convexCourse.name,
      location: convexCourse.location,
      holes: (convexCourse.holes ?? []).map((h: any) => ({
        number: h.number,
        par: h.par,
        distance: h.yardage ?? 0,
        handicap: h.hcp,
      })),
      teeSets: (convexCourse.teeSets ?? []).map((t: any) => ({
        name: t.name,
        rating: t.rating,
        slope: t.slope,
        gender: t.gender,
        holes: Array.isArray(t.holes)
          ? t.holes.map((h: any, index: number) => ({
            number: h.number ?? index + 1,
            par: h.par,
            distance: h.yardage ?? 0,
            handicap: h.hcp,
          }))
          : undefined,
      })),
      imageUrl: convexCourse.imageUrl,
    } as any)
    : undefined;

  // If the local course is missing teeSets/holes, hydrate them from Convex so
  // tee-based yardages and handicaps work correctly in the course map.
  const hydratedCourseFromStore =
    courseFromStore &&
      mappedConvexCourse &&
      (!Array.isArray((courseFromStore as any).teeSets) ||
        (courseFromStore as any).teeSets.length === 0 ||
        (courseFromStore as any).teeSets.every(
          (t: any) => !Array.isArray(t.holes) || t.holes.length === 0
        ))
      ? ({
        ...(courseFromStore as any),
        teeSets: mappedConvexCourse.teeSets,
      } as any)
      : (courseFromStore as any);

  // Prefer hydrated local Course (with imageUrl) when available; fall back to Convex or inferred.
  const course = hydratedCourseFromStore ?? mappedConvexCourse ?? inferredCourse;
  const currentUser = players.find(player => player.isUser);

  // Determine if we're still loading from Convex
  // convexCourseById/ByExternal return undefined while loading, null when not found
  const isConvexLoading = id && (
    (isConvexId(id) && convexCourseById === undefined) ||
    (!isConvexId(id) && convexCourseByExternal === undefined)
  );

  // Only show "Unknown Course" fallback if we're not loading and truly have no course
  const isLoading = isConvexLoading && !course;

  const courseData =
    course ??
    ({
      id,
      name: isLoading ? "Loading..." : "Unknown Course",
      location: isLoading ? "" : "Unknown location",
      holes: [],
      imageUrl: undefined,
    } as any);
  const notFound = !course && !isLoading;

  const totalPar = (courseData.holes ?? []).reduce((sum: number, hole: any) => sum + (hole.par ?? 4), 0);

  // Calculate stats from user's rounds only, optionally filtered by tee selection
  const userRounds = useMemo(() => {
    if (!currentUser) return [];
    const filtered = courseRounds.filter((round: any) => {
      const mine = (round.players || []).filter(
        (p: any) =>
          p.playerId === currentUser.id ||
          (p as any).isSelf ||
          (p as any).isUser
      );
      if (!mine.length) return false;
      if (!selectedTeeName || selectedTeeName === "All") return true;
      return mine.some((p: any) => {
        const nameMatch =
          (p.teeColor ?? p.teeName ?? "").toString().toLowerCase() ===
          selectedTeeName.toString().toLowerCase();
        const genderMatch =
          !selectedTeeGender ||
          (p.teeGender && p.teeGender === selectedTeeGender);
        return nameMatch && genderMatch;
      });
    });
    return filtered;
  }, [courseRounds, currentUser, selectedTeeName, selectedTeeGender]);

  const availableTeeNames = useMemo(() => {
    const fromCourse = ((courseData as any).teeSets ?? [])
      .map((t: any) => t?.name)
      .filter((n: any) => typeof n === "string" && n.trim().length > 0);
    const fromRounds = courseRounds.flatMap((round: any) =>
      (round.players || [])
        .filter((p: any) => p.playerId === currentUser?.id && p.teeColor)
        .map((p: any) => p.teeColor as string)
    );
    const all = new Set<string>();
    [...fromCourse, ...fromRounds].forEach((n) => {
      if (typeof n === "string" && n.trim().length > 0) all.add(n);
    });
    return Array.from(all);
  }, [courseData, courseRounds, currentUser]);

  const mostPlayedTee = useMemo(() => {
    if (!currentUser) return "All";
    const counts = new Map<string, number>();
    courseRounds.forEach((round: any) => {
      (round.players || [])
        .filter((p: any) => p.playerId === currentUser.id && p.teeColor)
        .forEach((p: any) => {
          const key = (p.teeColor as string).toLowerCase();
          counts.set(key, (counts.get(key) ?? 0) + 1);
        });
    });
    let best: string | null = null;
    let max = 0;
    counts.forEach((count, tee) => {
      if (count > max) {
        max = count;
        best = tee;
      }
    });
    if (!best) return "All";
    const fromAvailable =
      availableTeeNames.find((n) => n.toLowerCase() === best) ?? best;
    return fromAvailable;
  }, [courseRounds, currentUser, availableTeeNames]);

  const getTeeDisplayLabel = (name: string | "All") => {
    if (name === "All") return "All tees";
    const teeSets = ((courseData as any).teeSets ?? []) as any[];
    const meta = teeSets.find(
      (t) =>
        t?.name === name &&
        (!selectedTeeGender || !t.gender || t.gender === selectedTeeGender)
    ) ??
      teeSets.find((t) => t?.name === name);
    const gender =
      selectedTeeGender ??
      (meta?.gender === "M" || meta?.gender === "F" ? meta.gender : undefined);
    const genderSuffix = gender === "M" ? " (Men)" : gender === "F" ? " (Women)" : "";
    return `${name}${genderSuffix}`;
  };

  const getHoleMetaForSelectedTee = (holeNumber: number) => {
    const teeSets = ((courseData as any).teeSets ?? []) as any[];
    const baseHole = (courseData.holes ?? []).find((h: any) => h.number === holeNumber);

    if (!teeSets.length || !baseHole) {
      return {
        par: baseHole?.par ?? 4,
        yardage: (baseHole as any)?.distance ?? 0,
        handicap: (baseHole as any)?.handicap,
      };
    }

    if (!selectedTeeName || selectedTeeName === "All") {
      // Average across all tees for this hole
      const yardages: number[] = [];
      const hcps: number[] = [];
      teeSets.forEach((t: any) => {
        const holes = (t.holes ?? []) as any[];
        const h = holes.find((hh) => hh.number === holeNumber);
        if (h) {
          if (typeof h.distance === "number") yardages.push(h.distance);
          if (typeof h.handicap === "number") hcps.push(h.handicap);
        }
      });
      const avgYardage =
        yardages.length > 0
          ? yardages.reduce((s, v) => s + v, 0) / yardages.length
          : (baseHole as any).distance ?? 0;
      const avgHcp =
        hcps.length > 0
          ? Math.round(
            hcps.reduce((s, v) => s + v, 0) / hcps.length
          )
          : (baseHole as any).handicap;



      return {
        par: baseHole.par,
        yardage: avgYardage,
        handicap: avgHcp,
      };
    }

    const tee = teeSets.find((t: any) => {
      const nameMatch =
        t?.name?.toString().toLowerCase() === selectedTeeName.toString().toLowerCase();
      const genderMatch =
        !selectedTeeGender || (t?.gender ?? selectedTeeGender) === selectedTeeGender;
      return nameMatch && genderMatch;
    }) ??
      teeSets.find(
        (t: any) => t?.name?.toString().toLowerCase() === selectedTeeName.toString().toLowerCase()
      );
    const teeHole = tee?.holes?.find((h: any) => h.number === holeNumber);

    return {
      par: baseHole.par,
      yardage:
        (teeHole as any)?.distance ??
        (baseHole as any)?.distance ??
        0,
      handicap:
        (teeHole as any)?.handicap ??
        (baseHole as any)?.handicap,
    };
  };

  useEffect(() => {
    if (availableTeeNames.length === 0) {
      setSelectedTeeName("All");
      setSelectedTeeGender(undefined);
      return;
    }
    if (
      selectedTeeName !== "All" &&
      !availableTeeNames.some(
        (n) => n.toLowerCase() === selectedTeeName.toString().toLowerCase()
      )
    ) {
      setSelectedTeeName(mostPlayedTee);
      setSelectedTeeGender(undefined);
      return;
    }
    if (selectedTeeName === "All" && mostPlayedTee !== "All") {
      setSelectedTeeName(mostPlayedTee);
      setSelectedTeeGender(undefined);
    }
  }, [availableTeeNames, mostPlayedTee, selectedTeeName]);

  const getAvailableTeeSetsForCourse = () => {
    const teeSets = (courseData as any)?.teeSets;
    if (Array.isArray(teeSets) && teeSets.length > 0) {
      return teeSets;
    }
    return [];
  };

  const openCourseTeePicker = () => {
    const tees = getAvailableTeeSetsForCourse();
    const defaultGender =
      (selectedTeeGender as 'M' | 'F' | undefined) ??
      (tees.find((t: any) => t.gender === 'M')
        ? 'M'
        : tees.find((t: any) => t.gender === 'F')
          ? 'F'
          : 'M');
    setTeePickerGenderTab(defaultGender as 'M' | 'F');
    setShowTeeSelector(true);
  };

  const calculateCourseStats = () => {
    if (userRounds.length === 0) return null;

    let totalEighteenHoleEquivalentScore = 0;
    let roundCount = 0;
    let bestEighteenHoleScore = Infinity;
    let worstEighteenHoleScore = 0;
    let parOrBetter = 0;

    userRounds.forEach((round: any) => {
      round.players.forEach((player: any) => {
        if (player.totalScore) {
          // Get 18-hole equivalent score for proper comparison
          const eighteenHoleScore = getEighteenHoleEquivalentScore(player, round, courseData as any);
          const holeCount = getRoundHoleCount(round);

          // Calculate 18-hole equivalent par
          let eighteenHolePar = totalPar;
          if (holeCount === 9) {
            const nineHolePar = (courseData.holes ?? []).slice(0, 9).reduce((sum: number, hole: any) => sum + (hole.par ?? 4), 0);
            eighteenHolePar = nineHolePar + 36; // Add standard 9-hole par
          }

          totalEighteenHoleEquivalentScore += eighteenHoleScore;
          roundCount++;
          bestEighteenHoleScore = Math.min(bestEighteenHoleScore, eighteenHoleScore);
          worstEighteenHoleScore = Math.max(worstEighteenHoleScore, eighteenHoleScore);
          if (eighteenHoleScore <= eighteenHolePar) parOrBetter++;
        }
      });
    });

    return {
      averageScore: roundCount > 0 ? totalEighteenHoleEquivalentScore / roundCount : 0,
      bestScore: bestEighteenHoleScore === Infinity ? 0 : bestEighteenHoleScore,
      worstScore: worstEighteenHoleScore,
      parOrBetterPercentage: roundCount > 0 ? (parOrBetter / roundCount) * 100 : 0,
      totalRounds: roundCount
    };
  };

  const stats = calculateCourseStats();
  const performanceByPar = currentUser
    ? calculatePerformanceByPar({
      playerId: currentUser.id,
      rounds: userRounds,
      course: courseData as any,
    })
    : null;
  const holeAverages: Record<number, { average: number; attempts: number }> = currentUser
    ? calculatePerHoleAverages({
      playerId: currentUser.id,
      rounds: userRounds,
      course: courseData as any,
    })
    : {};



  const formatRelativeToPar = (value: number | null) => {
    if (value === null || value === undefined) return '--';
    const rounded = value.toFixed(1);
    return value > 0 ? `+${rounded}` : rounded;
  };

  const worstParType = performanceByPar
    ? (() => {
      const entries = [
        { label: 'Par 3s', value: performanceByPar.par3 },
        { label: 'Par 4s', value: performanceByPar.par4 },
        { label: 'Par 5s', value: performanceByPar.par5 },
      ].filter(entry => entry.value !== null) as { label: string; value: number }[];
      if (!entries.length) return null;
      return entries.reduce((worst, current) =>
        current.value > worst.value ? current : worst
      );
    })()
    : null;

  const navigateToScanScorecard = () => {
    router.push({
      pathname: '/scan-scorecard',
      params: { courseId: course.id }
    });
  };

  const handleDeleteCourse = () => {
    if (!courseData?.id) return;
    console.log('[CourseDetails] Delete requested:', {
      routeId: id,
      courseDataId: courseData.id,
      courseDataName: courseData.name,
    });
    Alert.alert(
      'Delete Course',
      `This will remove "${courseData.name}" from this device, but any rounds you have already saved will remain. Do you want to continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            console.log('[CourseDetails] Deleting course:', courseData.id);
            deleteCourse(courseData.id as string);
            router.back();
          },
        },
      ]
    );
  };

  const scrollY = useRef(new Animated.Value(0)).current;
  const IMAGE_HEIGHT = 280;
  const HEADER_STRETCH = 200;

  const headerBg = scrollY.interpolate({
    inputRange: [0, IMAGE_HEIGHT - 100, IMAGE_HEIGHT - 40],
    outputRange: ['rgba(245,243,239,0)', 'rgba(245,243,239,0.6)', 'rgba(245,243,239,1)'],
    extrapolate: 'clamp',
  });

  const extraHeaderSpace = scrollY.interpolate({
    inputRange: [-HEADER_STRETCH, 0, HEADER_STRETCH],
    outputRange: [HEADER_STRETCH, 0, 0],
    extrapolate: 'clamp',
  });

  const imageHeight = scrollY.interpolate({
    inputRange: [-HEADER_STRETCH, 0, HEADER_STRETCH],
    outputRange: [IMAGE_HEIGHT + HEADER_STRETCH, IMAGE_HEIGHT, IMAGE_HEIGHT],
    extrapolate: 'clamp',
  });

  // If Convex has a better image than our local store, mirror it back into the
  // local Course so list views can render it too.
  useEffect(() => {
    if (convexCourse?.imageUrl && courseFromStore && courseFromStore.imageUrl !== convexCourse.imageUrl) {
      updateCourse({ ...courseFromStore, imageUrl: convexCourse.imageUrl } as any);
    }
  }, [convexCourse?.imageUrl, courseFromStore, updateCourse]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#F5F3EF', '#E8F5E9', '#F5F3EF']}
        locations={[0.3, 0.8, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: false }} />

        {/* Fixed background image */}
        {courseData.imageUrl ? (
          <Animated.Image
            source={{ uri: courseData.imageUrl }}
            style={[styles.fixedImage, { height: imageHeight }]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.placeholderImage, styles.fixedImage, { height: IMAGE_HEIGHT }]}>
            <Text style={styles.placeholderText}>{courseData.name.charAt(0)}</Text>
          </View>
        )}

        {/* Overlay toolbar with animated background */}
        <Animated.View style={[styles.overlayHeader, { backgroundColor: headerBg }]} pointerEvents="box-none">
          <View style={styles.overlayHeaderRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft size={24} color={colors.text} />
            </TouchableOpacity>
            {!!course && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleDeleteCourse}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Delete course"
              >
                <Trash2 size={20} color={colors.error} />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.contentContainer, { paddingTop: IMAGE_HEIGHT }]}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
        >
          <Animated.View style={{ height: extraHeaderSpace }} />
          <View style={styles.sheet}>
            <View style={styles.headerContainer}>
              <Text style={styles.courseName}>{courseData.name}</Text>
              {/* Only show location if it's valid (not undefined/Unknown) */}
              {courseData.location &&
                !courseData.location.includes('undefined') &&
                !courseData.location.includes('Unknown') && (
                  <View style={styles.locationContainer}>
                    <MapPin size={16} color={colors.text} />
                    <Text style={styles.location}>{courseData.location}</Text>
                  </View>
                )}
              {availableTeeNames.length > 0 && (
                <>
                  <TouchableOpacity
                    style={styles.teeDropdown}
                    onPress={openCourseTeePicker}
                    activeOpacity={0.8}
                  >
                    <View>
                      <Text style={styles.teeDropdownLabel}>Tees</Text>
                      <Text style={styles.teeDropdownValue}>
                        {getTeeDisplayLabel(selectedTeeName)}
                      </Text>
                    </View>
                    <ChevronDown size={18} color={colors.text} />
                  </TouchableOpacity>
                </>
              )}
            </View>

            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{(courseData.holes ?? []).length}</Text>
                <Text style={styles.statLabel}>Holes</Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.statItem}>
                <Text style={styles.statValue}>{totalPar}</Text>
                <Text style={styles.statLabel}>Par</Text>
              </View>

              <View style={styles.statDivider} />

              <TouchableOpacity style={styles.statItem} onPress={() => setShowRoundsModal(true)}>
                <Text style={styles.statValue}>{courseRounds.length}</Text>
                <Text style={styles.statLabel}>{courseRounds.length === 1 ? 'Round' : 'Rounds'}</Text>
                <ChevronRight size={16} strokeWidth={2.2} color={colors.text} style={styles.statChevron} />
              </TouchableOpacity>
            </View>

            {stats && (
              <View style={styles.statsSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Your Performance Stats</Text>
                </View>

                <View style={styles.performanceGrid}>
                  <View style={styles.performanceCard}>
                    <Text style={styles.performanceValue}>{stats.totalRounds}</Text>
                    <Text style={styles.performanceLabel}>Rounds Played</Text>
                  </View>

                  <View style={styles.performanceCard}>
                    <Text style={styles.performanceValue}>{stats.averageScore.toFixed(1)}</Text>
                    <Text style={styles.performanceLabel}>Avg Score</Text>
                    <View style={styles.performanceIndicator}>
                      {stats.averageScore < totalPar ? (
                        <TrendingDown size={16} color={colors.success} />
                      ) : (
                        <TrendingUp size={16} color={colors.error} />
                      )}
                      <Text style={[
                        styles.performanceChange,
                        { color: stats.averageScore < totalPar ? colors.success : colors.error }
                      ]}>
                        {stats.averageScore < totalPar ? 'Under Par' : 'Over Par'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.performanceCard}>
                    <Text style={styles.performanceValue}>{stats.bestScore}</Text>
                    <Text style={styles.performanceLabel}>Best Score</Text>
                    <Text style={[
                      styles.performanceSubtext,
                      stats.bestScore - totalPar < 0 && { color: colors.success },
                      stats.bestScore - totalPar > 0 && { color: colors.error },
                    ]}>
                      {stats.bestScore - totalPar > 0 ? '+' : ''}{stats.bestScore - totalPar}
                    </Text>
                  </View>

                  <View style={styles.performanceCard}>
                    <Text style={[
                      styles.performanceValue,
                      worstParType && worstParType.value > 0 && { color: colors.error },
                    ]}>
                      {worstParType ? formatRelativeToPar(worstParType.value) : '--'}
                    </Text>
                    <Text style={styles.performanceLabel}>
                      {worstParType ? `Worst: ${worstParType.label}` : 'Worst Par Type'}
                    </Text>
                    <Text style={styles.performanceSubtext}>
                      {worstParType ? 'Avg vs Par' : 'No data'}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>My Course Map</Text>
                <TouchableOpacity
                  onPress={() => setShowCourseMapInfo(true)}
                  style={styles.infoButton}
                  accessibilityRole="button"
                  accessibilityLabel="Course map info"
                >
                  <Info size={18} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.holesContainer}>
              {(courseData.holes ?? []).map((hole: any) => {
                const averageEntry = currentUser ? holeAverages[hole.number] : undefined;
                const averageValue = averageEntry ? Number(averageEntry.average.toFixed(1)) : null;
                const diffFromPar = averageValue !== null ? averageValue - hole.par : null;
                const avgText = averageValue !== null ? averageValue.toFixed(1) : '--';

                const meta = getHoleMetaForSelectedTee(hole.number);
                const metaParts = [`Par ${meta.par}`, meta.yardage ? `${Math.round(meta.yardage)} yds` : null]
                  .filter(Boolean);
                if (meta.handicap) {
                  metaParts.push(`HCP ${meta.handicap}`);
                }

                let badgeStyle = styles.holeAverageNeutral;
                if (diffFromPar !== null) {
                  if (diffFromPar <= 0.1) {
                    badgeStyle = styles.holeAverageGood;
                  } else if (diffFromPar < 1.5) {
                    badgeStyle = styles.holeAverageCaution;
                  } else {
                    badgeStyle = styles.holeAverageDanger;
                  }
                }

                return (
                  <View key={hole.number} style={styles.holeItem}>
                    <View style={styles.holeInfo}>
                      <View style={styles.holeNumberContainer}>
                        <Text style={styles.holeNumber}>{hole.number}</Text>
                      </View>
                      <Text style={styles.holeMetaText}>
                        {metaParts.join(' • ')}
                      </Text>
                    </View>

                    <View style={[styles.holeAverageBadge, badgeStyle]}>
                      <Text style={styles.holeAverageBadgeText}>AVG: {avgText}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <Button
              title="Scan Scorecard"
              onPress={navigateToScanScorecard}
              style={styles.startButton}
              icon={<Camera size={18} color={colors.background} style={{ marginRight: 8 }} />}
            />

            {/* Removed explicit View Rounds button; hint added on the stat tile */}
          </View>
        </Animated.ScrollView>

        {/* Tee selection modal */}
        <Modal
          visible={showTeeSelector}
          animationType="slide"
          transparent
          onRequestClose={() => setShowTeeSelector(false)}
        >
          <TouchableOpacity
            style={styles.sheetOverlay}
            activeOpacity={1}
            onPress={() => setShowTeeSelector(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={styles.sheetContainer}
              onPress={() => { }}
            >
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Select tees</Text>
                <View style={styles.sheetTabs}>
                  <TouchableOpacity
                    style={[
                      styles.sheetTab,
                      teePickerGenderTab === 'M' && styles.sheetTabActive,
                    ]}
                    onPress={() => setTeePickerGenderTab('M')}
                  >
                    <Text
                      style={[
                        styles.sheetTabText,
                        teePickerGenderTab === 'M' && styles.sheetTabTextActive,
                      ]}
                    >
                      Men
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.sheetTab,
                      teePickerGenderTab === 'F' && styles.sheetTabActive,
                    ]}
                    onPress={() => setTeePickerGenderTab('F')}
                  >
                    <Text
                      style={[
                        styles.sheetTabText,
                        teePickerGenderTab === 'F' && styles.sheetTabTextActive,
                      ]}
                    >
                      Women
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView
                style={styles.sheetList}
                contentContainerStyle={styles.sheetListContent}
              >
                <TouchableOpacity
                  style={styles.teeOptionRow}
                  onPress={() => {
                    setSelectedTeeName("All");
                    setSelectedTeeGender(undefined);
                    setShowTeeSelector(false);
                  }}
                >
                  <View>
                    <Text style={styles.teeOptionName}>All tees</Text>
                    <Text style={styles.teeOptionGender}>Combined averages</Text>
                  </View>
                  <View style={styles.radioOuter}>
                    <View
                      style={
                        selectedTeeName === "All"
                          ? styles.radioInnerActive
                          : styles.radioInner
                      }
                    />
                  </View>
                </TouchableOpacity>

                {getAvailableTeeSetsForCourse()
                  .filter(
                    (t: any) => !t.gender || t.gender === teePickerGenderTab
                  )
                  .map((tee: any) => (
                    <TouchableOpacity
                      key={`${tee.gender ?? 'U'}-${tee.name}`}
                      style={styles.teeOptionRow}
                      onPress={() => {
                        setSelectedTeeName(tee.name);
                        setSelectedTeeGender((tee.gender as 'M' | 'F') || teePickerGenderTab);
                        setShowTeeSelector(false);
                      }}
                    >
                      <View>
                        <Text style={styles.teeOptionName}>{tee.name}</Text>
                        {tee.rating || tee.slope ? (
                          <Text style={styles.teeOptionGender}>
                            {tee.rating ? `${tee.rating}` : '--'}/
                            {tee.slope ? `${tee.slope}` : '--'}
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
                            selectedTeeName.toString().toLowerCase() ===
                              tee.name.toString().toLowerCase() &&
                              (selectedTeeGender ?? teePickerGenderTab) === (tee.gender || teePickerGenderTab)
                              ? styles.radioInnerActive
                              : styles.radioInner
                          }
                        />
                      </View>
                    </TouchableOpacity>
                  ))}

                {getAvailableTeeSetsForCourse().length === 0 && (
                  <Text style={styles.emptyTeeText}>
                    No tee data available for this course.
                  </Text>
                )}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        <Modal
          visible={showRoundsModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowRoundsModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Rounds Played at {courseData.name}</Text>
              <ScrollView showsVerticalScrollIndicator={false}>
                {courseRounds.map((round, index) => (
                  <RoundCard
                    key={index}
                    round={round}
                    onPress={() => {
                      setShowRoundsModal(false);
                      router.push(`/round/${round.id}`);
                    }}
                    highlightPlayerId={currentUser?.id}
                  />
                ))}
              </ScrollView>
              <Button
                title="Close"
                onPress={() => setShowRoundsModal(false)}
                style={styles.modalCloseButton}
              />
            </View>
          </View>
        </Modal>

        <Modal
          visible={showCourseMapInfo}
          animationType="fade"
          transparent
          onRequestClose={() => setShowCourseMapInfo(false)}
        >
          <View style={styles.infoModalOverlay}>
            <View style={styles.infoModalContent}>
              <Text style={styles.infoModalTitle}>Course Map Insight</Text>
              <Text style={styles.infoModalText}>
                Each AVG badge shows your all-time scoring average for that hole. Colors highlight how far the average is from par.
              </Text>
              <View style={styles.infoLegend}>
                <View style={styles.infoLegendItem}>
                  <View style={[styles.infoLegendBadge, styles.holeAverageGood]}>
                    <Text style={styles.infoLegendBadgeText}>AVG ±0</Text>
                  </View>
                  <Text style={styles.infoLegendLabel}>At or near par (≤ +0.1)</Text>
                </View>
                <View style={styles.infoLegendItem}>
                  <View style={[styles.infoLegendBadge, styles.holeAverageCaution]}>
                    <Text style={styles.infoLegendBadgeText}>AVG +1</Text>
                  </View>
                  <Text style={styles.infoLegendLabel}>Bogey range (+0.1 to +1.5)</Text>
                </View>
                <View style={styles.infoLegendItem}>
                  <View style={[styles.infoLegendBadge, styles.holeAverageDanger]}>
                    <Text style={styles.infoLegendBadgeText}>AVG +2</Text>
                  </View>
                  <Text style={styles.infoLegendLabel}>Double bogey or worse (≥ +1.5)</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowCourseMapInfo(false)}
                style={styles.infoModalCloseButton}
              >
                <Text style={styles.infoModalCloseText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 24,
  },
  imageContainer: {
    height: 200,
    width: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 60,
    fontWeight: 'bold',
    color: colors.background,
  },
  headerContainer: {
    padding: 16,
  },
  courseName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  location: {
    fontSize: 16,
    color: colors.text,
    marginLeft: 6,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statChevron: {
    position: 'absolute',
    right: 8,
    bottom: 14,
    opacity: 0.85,
  },
  contentCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    marginBottom: 16,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: colors.text,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overlayHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 94,
    zIndex: 10,
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 42,
  },
  overlayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // Lift the sheet slightly into the hero so rounded corners reveal image behind
    marginTop: -16,
    paddingTop: 16,
    zIndex: 2,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  fixedImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '115%',
    marginLeft: '-7.5%',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  infoButton: {
    padding: 6,
  },
  holesContainer: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  holeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  holeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  holeNumberContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  holeNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
  },
  holeMetaText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    color: colors.text,
  },
  holeAverageBadge: {
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  holeAverageBadgeText: {
    color: colors.card,
    fontWeight: '600',
  },
  holeAverageGood: {
    backgroundColor: colors.success,
  },
  holeAverageCaution: {
    backgroundColor: colors.warning,
  },
  holeAverageDanger: {
    backgroundColor: colors.error,
  },
  holeAverageNeutral: {
    backgroundColor: colors.inactive,
  },
  infoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  infoModalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    width: '100%',
  },
  infoModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  infoModalText: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 16,
  },
  infoLegend: {
    marginBottom: 16,
  },
  infoLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoLegendBadge: {
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginRight: 10,
  },
  infoLegendBadgeText: {
    color: colors.card,
    fontWeight: '600',
  },
  infoLegendLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  infoModalCloseButton: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  infoModalCloseText: {
    color: colors.card,
    fontWeight: '600',
  },
  startButton: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  errorButton: {
    marginHorizontal: 16,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 15,
  },
  modalCloseButton: {
    marginTop: 15,
  },
  statsSection: {
    marginHorizontal: 16,
    marginBottom: 24,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
  },
  performanceGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
  },
  performanceCard: {
    width: '45%', // Adjust as needed for 2 columns
    alignItems: 'center',
    marginVertical: 10,
  },
  performanceValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  performanceLabel: {
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
  },
  performanceIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  performanceChange: {
    fontSize: 12,
    marginLeft: 4,
  },
  performanceSubtext: {
    fontSize: 12,
    color: colors.text,
    marginTop: 4,
  },
  teeDropdown: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teeDropdownLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  teeDropdownValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
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
