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
import { trpcClient } from '@/lib/trpc';
import { convertApiCourseToLocal, getCourseDisplayName, formatCourseLocation, getTeeBoxOptions, getDeterministicCourseId } from '@/utils/course-helpers';
import { Course, ApiCourseData } from '@/types';
import { useGolfStore } from '@/store/useGolfStore';
import { CourseCard } from '@/components/CourseCard';
import { Search, X, MapPin, ChevronDown, Clock, Star, PlusCircle, Flag } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { getDistanceInKm } from '@/utils/helpers';

interface CourseSelectionMeta {
  apiCourse?: ApiCourseData;
  selectedTee?: string;
}

interface CourseSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectCourse: (course: Course, meta?: CourseSelectionMeta) => void;
}

export const CourseSearchModal: React.FC<CourseSearchModalProps & { onAddManualCourse?: () => void, showMyCoursesTab?: boolean }> = ({
  visible,
  onClose,
  onSelectCourse,
  onAddManualCourse,
  showMyCoursesTab = true,
}) => {
  const { getFrequentCourses, getCourseById, addCourse, courses, rounds } = useGolfStore();
  const router = useRouter();
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
  
  // Get local courses sorted by frequency
  const getLocalCoursesByFrequency = () => {
    const usage = rounds.reduce((acc, round) => {
      const courseId = round.courseId;
      acc[courseId] = (acc[courseId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return courses
      .slice()
      .sort((a, b) => {
        const aCount = usage[a.id] || 0;
        const bCount = usage[b.id] || 0;
        return bCount - aCount; // Sort by frequency (descending)
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
            const results = await trpcClient.golfCourse.searchCourses.query({ query: q });
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
      // Use the vanilla tRPC client for imperative call to avoid React-hook runtime constraints
      const results = await trpcClient.golfCourse.searchCourses.query({ query: searchQuery });

      // If we have user location, sort by distance so closest appear first
      let sorted = results;
      if (userLocation) {
        sorted = [...results].sort((a: any, b: any) => {
          const d1 = getDistanceInKm(userLocation.latitude, userLocation.longitude, a.location.latitude, a.location.longitude);
          const d2 = getDistanceInKm(userLocation.latitude, userLocation.longitude, b.location.latitude, b.location.longitude);
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
    const teeOptions = getTeeBoxOptions(apiCourse);
    const hasMultipleTees = teeOptions.length > 1;

    if (hasMultipleTees) {
      setSelectedCourse(apiCourse);
      setShowTeeSelection(true);
      return;
    }

    const teeName = teeOptions[0]?.name;
    const deterministicId = getDeterministicCourseId(apiCourse, teeName);
    const existingCourse = getCourseById(deterministicId);

    setSelectingCourse(true);
    try {
      if (existingCourse) {
        onSelectCourse(existingCourse);
      } else {
        const course = await convertApiCourseToLocal(apiCourse, { selectedTee: teeName });
        if (!getCourseById(course.id)) {
          addCourse(course);
        }
        onSelectCourse(course, { apiCourse, selectedTee: teeName });
      }
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
      onSelectCourse(course);
      handleClose();
    }
  };

  const handleSelectTee = async (teeName: string) => {
    if (!selectedCourse) return;
    
    setSelectingCourse(true);
    try {
      const deterministicId = getDeterministicCourseId(selectedCourse, teeName);
      const existingCourse = getCourseById(deterministicId);

      if (existingCourse) {
        onSelectCourse(existingCourse);
      } else {
        const course = await convertApiCourseToLocal(selectedCourse, { selectedTee: teeName });
        if (!getCourseById(course.id)) {
          addCourse(course);
        }
        onSelectCourse(course, { apiCourse: selectedCourse, selectedTee: teeName });
      }
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
    return (
      <View style={styles.courseCardContainer}>
        <CourseCard 
          course={item} 
          onPress={(course) => {
            onSelectCourse(course);
            handleClose();
          }} 
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
                  <Search size={18} color={activeTab === 'search' ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.tabText, activeTab === 'search' && styles.activeTabText]}>
                    Search
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.tab, activeTab === 'my-courses' && styles.activeTab]}
                  onPress={() => setActiveTab('my-courses')}
                >
                  <Flag size={18} color={activeTab === 'my-courses' ? colors.primary : colors.textSecondary} />
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
                keyExtractor={(item) => item.id}
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
              {selectedCourse ? getCourseDisplayName(selectedCourse) : ''}
            </Text>
            <Text style={styles.teeSelectionSubtitle}>Choose your tee box:</Text>
            
            <View style={styles.teeOptionsContainer}>
              {selectedCourse && getTeeBoxOptions(selectedCourse).map((option, index) => 
                renderTeeOption(option.name, index)
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
    borderRadius: 8,
    backgroundColor: colors.card,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: `${colors.primary}15`,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginLeft: 6,
  },
  activeTabText: {
    color: colors.primary,
  },
  
  // Course card container style
  courseCardContainer: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
});
