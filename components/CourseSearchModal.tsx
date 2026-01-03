import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Image
} from 'react-native';
import { colors } from '@/constants/colors';
import { DEFAULT_COURSE_IMAGE } from '@/constants/images';
import { convertApiCourseToLocal, getCourseDisplayName, formatCourseLocation, getTeeBoxOptions, getDeterministicCourseId } from '@/utils/course-helpers';
import { Course, ApiCourseData } from '@/types';
import { useGolfStore } from '@/store/useGolfStore';
import { CourseCard } from '@/components/CourseCard';
import { Search, X, MapPin, ChevronDown, Clock, Star, PlusCircle, Flag } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { getDistanceInKm } from '@/utils/helpers';
import { useAction, useMutation, useQuery } from '@/lib/convex';
import { api } from '@/convex/_generated/api';

interface CourseSelectionMeta {
  apiCourse?: ApiCourseData;
  selectedTee?: string;
}

interface CourseSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectCourse: (course: Course, meta?: CourseSelectionMeta) => void;
  testID?: string;
}

export const CourseSearchModal: React.FC<CourseSearchModalProps & { onAddManualCourse?: () => void, showMyCoursesTab?: boolean }> = ({
  visible,
  onClose,
  onSelectCourse,
  onAddManualCourse,
  showMyCoursesTab = true,
  testID,
}) => {
  const { getFrequentCourses, getCourseById, addCourse, updateCourse, courses, rounds } = useGolfStore();
  const router = useRouter();


  // Use Convex rounds data (same as history tab) for My Courses
  const profile = useQuery(api.users.getProfile);
  const roundsData = useQuery(
    api.rounds.listWithSummary,
    profile?._id ? { hostId: profile._id as any } : "skip"
  ) || [];

  const searchAction = useAction(api.golfCourse.search);
  const searchConvexCourses = useAction(api.courses.searchByNameAction);
  const getConvexCourseByExternalId = useAction(api.courses.getByExternalIdAction);
  const upsertCourse = useMutation(api.courses.upsert);
  const setImageUrl = useMutation(api.courses.setImageUrl);
  const getOrCreateCourseImage = useAction(api.courseImages.getOrCreate);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]); // Changed from ApiCourse[] to any[]
  const [loading, setLoading] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null); // Changed from ApiCourse to any
  const [showTeeSelection, setShowTeeSelection] = useState(false);
  const [selectingCourse, setSelectingCourse] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'my-courses'>('search');

  // User location & nearby courses
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [nearbyCourses, setNearbyCourses] = useState<any[]>([]);

  const frequentCourses = getFrequentCourses();

  // Ground truth for "My Courses": only courses referenced by rounds (from Convex, matching history tab)
  const getLocalCoursesByFrequency = () => {
    const usage: Record<string, number> = {};
    const map = new Map<string, Course>();

    // Use roundsData from Convex (same as history tab) instead of local Zustand rounds
    roundsData.forEach((round: any) => {
      const externalId = round.courseExternalId as string | undefined;
      const key = externalId ?? (round.courseId as string);
      usage[key] = (usage[key] || 0) + 1;
      if (!map.has(key)) {
        const storeCourse =
          (externalId && courses.find((c) => c.id === externalId)) ||
          courses.find((c) => c.id === (round.courseId as string));

        const id = storeCourse?.id ?? externalId ?? (round.courseId as string);

        map.set(key, {
          id,
          name: round.courseName,
          location: storeCourse?.location ?? 'Unknown location',
          holes: storeCourse?.holes ?? [],
          imageUrl: storeCourse?.imageUrl ?? (round.courseImageUrl as string | undefined),
          slope: storeCourse?.slope,
          rating: storeCourse?.rating,
          teeSets: storeCourse?.teeSets,
        });
      }
    });

    const derived = Array.from(map.values());
    // Return only courses that have been played - no fallback to all courses
    return derived.sort((a, b) => {
      const aCount = usage[a.id as any] || 0;
      const bCount = usage[b.id as any] || 0;
      if (bCount !== aCount) return bCount - aCount;
      return a.name.localeCompare(b.name);
    });
  };

  const localCoursesByFrequency = getLocalCoursesByFrequency();

  // Acquire user location when modal becomes visible
  useEffect(() => {
    if (!visible) return;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserLocation(coords);

        // Reverse-geocode to get the user's city so we can query nearby courses
        const geo = await Location.reverseGeocodeAsync(coords);
        let queries: string[] = [];
        if (geo && geo.length) {
          const g = geo[0];
          if (g.city) queries.push(g.city);
          if (g.region) queries.push(g.region);
          if (g.district) queries.push(g.district);
        }
        // Always add a generic fallback to broaden results
        queries.push('golf');

        for (const q of queries) {
          try {
            const results = await searchAction({ query: q });
            if (results && results.length) {
              // Sort by distance if we have coordinates
              const sorted = results.sort((a: any, b: any) => {
                const d1 = getDistanceInKm(coords.latitude, coords.longitude, a.location.latitude, a.location.longitude);
                const d2 = getDistanceInKm(coords.latitude, coords.longitude, b.location.latitude, b.location.longitude);
                return d1 - d2;
              });
              setNearbyCourses(sorted as any[]);
              break;
            }
          } catch (e) {
            console.log('Nearby course search error', e);
          }
        }
      } catch (e) {
        console.log('Location error', e);
      }
    })();
  }, [visible]);

  useEffect(() => {
    if (activeTab === 'search' && searchQuery.length >= 3) {
      const timeoutId = setTimeout(() => {
        handleSearch();
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, activeTab]);

  const handleSearch = async () => {
    if (searchQuery.length < 3) return;
    setLoading(true);
    try {
      // 1) First check Convex global cache (free, fast)
      let convexResults: any[] = [];
      try {
        convexResults = await searchConvexCourses({ term: searchQuery, limit: 20 });
        console.log('[CourseSearch] Convex cache results:', convexResults.length);
      } catch (err) {
        console.warn('[CourseSearch] Convex search failed, falling back to API:', err);
      }

      // 2) If we have enough Convex results, skip the paid API
      //    Otherwise, call the paid API and merge results
      let apiResults: any[] = [];
      if (convexResults.length < 5) {
        // Not enough cached results, query the paid API
        console.log('[CourseSearch] Querying paid API...');
        apiResults = await searchAction({ query: searchQuery });
      }

      // 3) Merge results: Convex first (converted to API format), then API results
      //    Dedupe by externalId to avoid showing the same course twice
      const seenIds = new Set<string>();
      const mergedResults: any[] = [];

      // Add Convex results first (convert to display format)
      for (const course of convexResults) {
        const id = course.externalId || course._id;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          // Mark as from Convex cache so we know not to re-upsert
          mergedResults.push({
            ...course,
            id: course.externalId ? Number(course.externalId) : course._id,
            club_name: course.name.split(' - ')[0] || course.name,
            course_name: course.name.split(' - ')[1] || '',
            location: {
              address: course.location,
              city: course.location?.split(',')[0] || '',
              state: course.location?.split(',')[1]?.trim() || '',
              country: 'USA',
              latitude: 0,
              longitude: 0,
            },
            _fromConvexCache: true,
            _convexCourse: course,
          });
        }
      }

      // Add API results (skip if already in Convex cache)
      for (const course of apiResults) {
        const id = String(course.id);
        if (!seenIds.has(id)) {
          seenIds.add(id);
          mergedResults.push(course);
        }
      }

      // If we have user location, sort by distance so closest appear first
      let sorted = mergedResults;
      if (userLocation) {
        sorted = [...mergedResults].sort((a: any, b: any) => {
          const loc1 = a.location || {};
          const loc2 = b.location || {};
          if (!loc1.latitude || !loc2.latitude) return 0;
          const d1 = getDistanceInKm(userLocation.latitude, userLocation.longitude, loc1.latitude, loc1.longitude);
          const d2 = getDistanceInKm(userLocation.latitude, userLocation.longitude, loc2.latitude, loc2.longitude);
          return d1 - d2;
        });
      }

      setSearchResults(sorted);
    } catch (error) {
      console.error('Search error:', error);
      Alert.alert('Error', 'Failed to search courses. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectApiCourse = async (apiCourse: any) => { // Changed from ApiCourse to any

    if (selectingCourse) return;

    // Check if this course came from Convex cache
    const isFromConvexCache = apiCourse._fromConvexCache === true;
    const convexCourse = apiCourse._convexCourse;


    // For Convex cached courses, check teeSets array
    // For API courses, use getTeeBoxOptions
    let teeOptions: any[] = [];
    let hasMultipleTees = false;

    if (isFromConvexCache && convexCourse?.teeSets) {
      // Convex cache format: teeSets is an array
      teeOptions = convexCourse.teeSets.map((t: any) => ({ name: t.name, teeBox: t }));
      hasMultipleTees = convexCourse.teeSets.length > 1;

    } else {
      // API format: use getTeeBoxOptions
      teeOptions = getTeeBoxOptions(apiCourse);
      hasMultipleTees = teeOptions.length > 0;

    }


    if (hasMultipleTees) {

      // For Convex cache, add the teeSets to the apiCourse for the picker
      if (isFromConvexCache && convexCourse?.teeSets) {
        setSelectedCourse({
          ...apiCourse,
          tees: convexCourse.teeSets.map((t: any) => ({
            name: t.name,
            gender: t.gender,
            rating: t.rating,
            slope: t.slope,
          })),
          _isLocalCourse: true,
          _localCourse: {
            id: convexCourse.externalId || convexCourse._id,
            name: convexCourse.name,
            teeSets: convexCourse.teeSets,
          },
        });
      } else {
        setSelectedCourse(apiCourse);
      }
      setShowTeeSelection(true);
      return;
    }

    const teeName = teeOptions[0]?.name;
    const deterministicId = isFromConvexCache && convexCourse
      ? convexCourse.externalId || convexCourse._id
      : getDeterministicCourseId(apiCourse, teeName);
    const existingCourse = getCourseById(deterministicId);

    setSelectingCourse(true);
    try {
      let courseToUse: Course;

      // If from Convex cache, convert the cached course directly
      if (isFromConvexCache && convexCourse) {
        courseToUse = {
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
        };
        // Ensure it's in local Zustand cache
        if (!getCourseById(courseToUse.id)) {
          addCourse(courseToUse);
        }
        // Use first/only tee if available
        onSelectCourse(courseToUse, { selectedTee: teeName });
      } else if (existingCourse) {
        courseToUse = existingCourse;
        // Use first/only tee if available
        onSelectCourse(existingCourse, { selectedTee: teeName });
      } else {
        const course = await convertApiCourseToLocal(apiCourse, { selectedTee: teeName });
        courseToUse = course;
        if (!getCourseById(course.id)) {
          addCourse(course);
        }
        onSelectCourse(course, { apiCourse, selectedTee: teeName });
      }

      // NOTE: Course is NOT upserted to Convex here. It will be upserted in RoundSyncer
      // when the round is actually saved. This prevents courses from being created
      // in Convex before a round is completed.

      setSearchQuery('');
      setSearchResults([]);
      setSelectedCourse(null);
      setShowTeeSelection(false);
      onClose();
    } catch (error) {
      console.error('Failed to convert course:', error);
      Alert.alert('Course Error', 'We could not prepare this course right now. Please try again.');
    } finally {
      setSelectingCourse(false);
    }
  };

  const handleSelectFrequentCourse = (courseId: string) => {

    const course = getCourseById(courseId);

    if (course) {
      // Check if course has multiple tees - show tee picker same as renderLocalCourse
      const teeSets = (course as any).teeSets ?? [];

      if (teeSets.length > 1) {
        // Convert to format expected by tee selection
        setSelectedCourse({
          ...course,
          id: course.id,
          name: course.name,
          tees: teeSets.map((t: any) => ({
            name: t.name,
            gender: t.gender,
            rating: t.rating,
            slope: t.slope,
          })),
          _isLocalCourse: true,
          _localCourse: course,
        });

        setShowTeeSelection(true);
      } else {
        // Only one tee or no tees - use it directly
        const firstTeeName = teeSets[0]?.name;

        onSelectCourse(course, { selectedTee: firstTeeName });
        handleClose();
      }
    }
  };

  const handleSelectTee = async (teeName: string) => {
    if (!selectedCourse) return;

    // Handle local course from My Courses tab
    if (selectedCourse._isLocalCourse && selectedCourse._localCourse) {
      const localCourse = selectedCourse._localCourse;
      // Ensure course is in local Zustand store for later lookups
      if (!getCourseById(localCourse.id)) {
        addCourse(localCourse);
      }
      onSelectCourse(localCourse, { selectedTee: teeName });
      setSearchQuery('');
      setSearchResults([]);
      setSelectedCourse(null);
      setShowTeeSelection(false);
      onClose();
      return;
    }

    setSelectingCourse(true);
    try {
      const deterministicId = getDeterministicCourseId(selectedCourse, teeName);
      const existingCourse = getCourseById(deterministicId);

      let courseToUse: Course;
      if (existingCourse) {
        // Hydrate legacy courses that are missing teeSets/holes using the latest API data
        const needsHydrate =
          !(existingCourse as any).teeSets ||
          (existingCourse as any).teeSets.length === 0 ||
          (existingCourse as any).teeSets.every(
            (t: any) => !Array.isArray(t.holes) || t.holes.length === 0
          );

        if (needsHydrate) {
          const refreshed = await convertApiCourseToLocal(selectedCourse, { selectedTee: teeName });
          courseToUse = {
            ...(existingCourse as any),
            // Keep the deterministic id stable, but refresh teeSets/holes + core metadata
            id: existingCourse.id,
            holes: refreshed.holes,
            slope: refreshed.slope,
            rating: refreshed.rating,
            teeSets: refreshed.teeSets,
            imageUrl: refreshed.imageUrl ?? existingCourse.imageUrl,
          };
          updateCourse(courseToUse);
        } else {
          courseToUse = existingCourse;
        }
      } else {
        const course = await convertApiCourseToLocal(selectedCourse, { selectedTee: teeName });
        courseToUse = course;
        if (!getCourseById(course.id)) {
          addCourse(course);
        }
      }

      onSelectCourse(courseToUse, { apiCourse: selectedCourse, selectedTee: teeName });

      // NOTE: Course is NOT upserted to Convex here. It will be upserted in RoundSyncer
      // when the round is actually saved.

      setSearchQuery('');
      setSearchResults([]);
      setSelectedCourse(null);
      setShowTeeSelection(false);
      onClose();
    } catch (error) {
      console.error('Failed to convert course with tee selection:', error);
      Alert.alert('Course Error', 'We could not prepare this course right now. Please try again.');
    } finally {
      setSelectingCourse(false);
    }
  };

  const handleClose = () => {
    if (selectingCourse) return;
    setSearchQuery('');
    setSearchResults([]);
    setSelectedCourse(null);
    setShowTeeSelection(false);
    onClose();
  };

  const renderCourseItem = ({ item }: { item: any }) => ( // Changed from ApiCourse to any
    <TouchableOpacity
      style={styles.courseItem}
      onPress={() => handleSelectApiCourse(item)}
      disabled={selectingCourse}
    >
      <View style={styles.courseInfo}>
        <Text style={styles.courseName}>{getCourseDisplayName(item)}</Text>
        <View style={styles.locationContainer}>
          <MapPin size={14} color={colors.textSecondary} />
          <Text style={styles.courseLocation}>{formatCourseLocation(item.location)}</Text>
        </View>
      </View>
      <ChevronDown size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  const renderFrequentCourse = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.frequentCourseItem}
      onPress={() => handleSelectFrequentCourse(item.courseId)}
    >
      <View style={styles.frequentCourseIcon}>
        <Star size={16} color={colors.primary} />
      </View>
      <View style={styles.frequentCourseInfo}>
        <Text style={styles.frequentCourseName}>{item.courseName}</Text>
        <View style={styles.frequentCourseStats}>
          <Clock size={12} color={colors.textSecondary} />
          <Text style={styles.frequentCourseCount}>
            {item.count} round{item.count > 1 ? 's' : ''}
          </Text>
        </View>
      </View>
      <ChevronDown size={16} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  const renderLocalCourse = ({ item }: { item: Course }) => {
    const handleLocalCoursePress = async (course: Course) => {
      // Check if course needs full data (holes missing or empty)
      let courseToUse = course;
      const needsFullData = !course.holes || course.holes.length === 0;

      if (needsFullData && course.id) {
        // Fetch full course data from Convex
        try {
          const convexCourse = await getConvexCourseByExternalId({ externalId: course.id });
          if (convexCourse) {
            courseToUse = {
              ...course,
              holes: convexCourse.holes?.map((h: any) => ({
                number: h.number,
                par: h.par,
                distance: h.yardage || 0,
                handicap: h.hcp,
              })) || [],
              teeSets: convexCourse.teeSets,
              slope: convexCourse.slope,
              rating: convexCourse.rating,
              location: convexCourse.location || course.location,
            };
          }
        } catch (e) {
          console.warn('Failed to fetch full course data from Convex:', e);
        }
      }

      // Ensure course is in local Zustand store for later lookups
      if (!getCourseById(courseToUse.id)) {
        addCourse(courseToUse);
      } else if (needsFullData && courseToUse.holes?.length) {
        // Update existing course with full data
        updateCourse(courseToUse);
      }

      // Check if course has multiple tees - show tee picker same as API search flow
      const teeSets = courseToUse.teeSets ?? [];

      if (teeSets.length > 1) {
        // Convert local course to API-like format for tee selection
        setSelectedCourse({
          ...courseToUse,
          id: courseToUse.id,
          name: courseToUse.name,
          tees: teeSets.map((t: any) => ({
            name: t.name,
            gender: t.gender,
            rating: t.rating,
            slope: t.slope,
          })),
          _isLocalCourse: true,
          _localCourse: courseToUse,
        });
        setShowTeeSelection(true);
      } else {
        // Only one tee or no tees - use it directly
        const firstTeeName = teeSets[0]?.name;
        onSelectCourse(courseToUse, { selectedTee: firstTeeName });
        handleClose();
      }
    };

    return (
      <View style={styles.courseCardContainer}>
        <CourseCard
          course={item}
          onPress={handleLocalCoursePress}
        />
      </View>
    );
  };

  const renderNearbySection = () => (
    nearbyCourses.length > 0 && (
      <View style={styles.frequentSection}>
        <Text style={styles.sectionTitle}>Nearby Courses</Text>
        <FlatList
          data={nearbyCourses}
          renderItem={renderCourseItem}
          keyExtractor={(item) => item.id.toString()}
          showsVerticalScrollIndicator={false}
        />
      </View>
    )
  );

  const renderTeeOption = (teeName: string, index: number) => (
    <TouchableOpacity
      key={index}
      style={styles.teeOption}
      onPress={() => handleSelectTee(teeName)}
    >
      <Text style={styles.teeOptionText}>{teeName}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {showTeeSelection ? 'Select Tee Box' : 'Search Golf Courses'}
          </Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <X size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {!showTeeSelection ? (
          <>
            {/* Tab Header (only when My Courses tab is enabled) */}
            {showMyCoursesTab && (
              <View style={styles.tabContainer}>
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'search' && styles.activeTab]}
                  onPress={() => setActiveTab('search')}
                >
                  <Search size={18} color={colors.text} />
                  <Text style={[styles.tabText, activeTab === 'search' && styles.activeTabText]}>
                    Search
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'my-courses' && styles.activeTab]}
                  onPress={() => setActiveTab('my-courses')}
                >
                  <Flag size={18} color={colors.text} />
                  <Text style={[styles.tabText, activeTab === 'my-courses' && styles.activeTabText]}>
                    My Courses
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Search Tab Content */}
            {activeTab === 'search' && (
              <View style={styles.searchContainer}>
                <Search size={20} color={colors.textSecondary} style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search for golf courses..."
                  placeholderTextColor={colors.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus={activeTab === 'search'}
                />
              </View>
            )}

            {/* Search Tab Content */}
            {activeTab === 'search' && (
              <>
                {loading && (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>Searching courses...</Text>
                  </View>
                )}

                {/* Show nearby courses when not searching */}
                {searchQuery.length === 0 && renderNearbySection()}

                {/* Search results */}
                {searchQuery.length >= 3 && (
                  <FlatList
                    data={searchResults}
                    renderItem={renderCourseItem}
                    keyExtractor={(item) => item.id.toString()}
                    style={styles.resultsList}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                      !loading ? (
                        <View style={styles.emptyContainer}>
                          <Text style={styles.emptyText}>Can't find your course?</Text>
                          <Text style={styles.emptySubtext}>Add it manually below.</Text>

                          <TouchableOpacity
                            style={styles.manualEntryButton}
                            onPress={() => {
                              handleClose();
                              if (onAddManualCourse) onAddManualCourse();
                              else router.push('/manual-course-entry');
                            }}
                          >
                            <PlusCircle size={20} color={colors.primary} style={{ marginRight: 6 }} />
                            <Text style={styles.manualEntryText}>Add Course Manually</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null
                    }
                  />
                )}

              </>
            )}

            {/* My Courses Tab Content */}
            {showMyCoursesTab && activeTab === 'my-courses' && (
              <FlatList
                data={localCoursesByFrequency}
                renderItem={renderLocalCourse}
                keyExtractor={(item, index) => `${item.id}-${index}`}
                style={styles.resultsList}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No courses saved yet</Text>
                    <Text style={styles.emptySubtext}>Save courses by playing rounds to see them here</Text>
                  </View>
                }
              />
            )}
          </>
        ) : (
          <View style={styles.teeSelectionContainer}>
            <Text style={styles.selectedCourseName}>
              {selectedCourse?._isLocalCourse
                ? selectedCourse.name
                : (selectedCourse ? getCourseDisplayName(selectedCourse) : '')}
            </Text>
            <Text style={styles.teeSelectionSubtitle}>Choose your tee box:</Text>

            <View style={styles.teeOptionsContainer}>
              {selectedCourse && (selectedCourse._isLocalCourse
                ? // Local course: use teeSets from tees array we set
                (selectedCourse.tees || []).map((tee: any, index: number) =>
                  renderTeeOption(tee.name, index)
                )
                : // API course: use getTeeBoxOptions
                getTeeBoxOptions(selectedCourse).map((option, index) =>
                  renderTeeOption(option.name, index)
                )
              )}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 16,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    color: colors.text,
    fontSize: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 12,
  },
  frequentSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  frequentCourseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: `${colors.primary}20`,
  },
  frequentCourseIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  frequentCourseInfo: {
    flex: 1,
  },
  frequentCourseName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 2,
  },
  frequentCourseStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  frequentCourseCount: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  resultsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  courseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  courseInfo: {
    flex: 1,
  },
  courseName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  courseLocation: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  manualEntryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.primary}10`,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: `${colors.primary}20`,
  },
  manualEntryText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.primary,
  },
  teeSelectionContainer: {
    padding: 16,
  },
  selectedCourseName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  teeSelectionSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  teeOptionsContainer: {
    gap: 12,
  },
  teeOption: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  teeOptionText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    textAlign: 'center',
  },

  // Tab styles
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
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

  // Course card container style
  courseCardContainer: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
});
