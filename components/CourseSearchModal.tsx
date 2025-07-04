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
  Alert
} from 'react-native';
import { colors } from '@/constants/colors';
import { trpc } from '@/lib/trpc';
import { convertApiCourseToLocal, getCourseDisplayName, formatCourseLocation, getTeeBoxOptions } from '@/utils/course-helpers';
import { Course } from '@/types';
import { useGolfStore } from '@/store/useGolfStore';
import { Search, X, MapPin, ChevronDown, Clock, Star } from 'lucide-react-native';

interface CourseSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectCourse: (course: Course) => void;
}

export const CourseSearchModal: React.FC<CourseSearchModalProps> = ({
  visible,
  onClose,
  onSelectCourse
}) => {
  const { getFrequentCourses, getCourseById, addCourse } = useGolfStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]); // Changed from ApiCourse[] to any[]
  const [loading, setLoading] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null); // Changed from ApiCourse to any
  const [showTeeSelection, setShowTeeSelection] = useState(false);
  const [showFrequent, setShowFrequent] = useState(true);

  const frequentCourses = getFrequentCourses();

  useEffect(() => {
    if (searchQuery.length >= 3) {
      setShowFrequent(false);
      const timeoutId = setTimeout(() => {
        handleSearch();
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setSearchResults([]);
      setShowFrequent(true);
    }
  }, [searchQuery]);

  const handleSearch = async () => {
    if (searchQuery.length < 3) return;
    setLoading(true);
    try {
      const results = await trpc.golfCourse.searchCourses.query({ query: searchQuery });
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      Alert.alert('Error', 'Failed to search courses. Please check your internet connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectApiCourse = (apiCourse: any) => { // Changed from ApiCourse to any
    const teeOptions = getTeeBoxOptions(apiCourse);
    
    if (teeOptions.length > 1) {
      setSelectedCourse(apiCourse);
      setShowTeeSelection(true);
    } else {
      // Only one tee option, select it automatically
      const course = convertApiCourseToLocal(apiCourse, teeOptions[0]?.name);
      // Persist the course the first time we encounter it
      if (!getCourseById(course.id)) {
        addCourse(course);
      }
      onSelectCourse(course);
      handleClose();
    }
  };

  const handleSelectFrequentCourse = (courseId: string) => {
    const course = getCourseById(courseId);
    if (course) {
      onSelectCourse(course);
      handleClose();
    }
  };

  const handleSelectTee = (teeName: string) => {
    if (!selectedCourse) return;
    
    const course = convertApiCourseToLocal(selectedCourse, teeName);
    if (!getCourseById(course.id)) {
      addCourse(course);
    }
    onSelectCourse(course);
    handleClose();
  };

  const handleClose = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSelectedCourse(null);
    setShowTeeSelection(false);
    setShowFrequent(true);
    onClose();
  };

  const renderCourseItem = ({ item }: { item: any }) => ( // Changed from ApiCourse to any
    <TouchableOpacity
      style={styles.courseItem}
      onPress={() => handleSelectApiCourse(item)}
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
            <View style={styles.searchContainer}>
              <Search size={20} color={colors.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search for golf courses..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
            </View>

            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Searching courses...</Text>
              </View>
            )}

            {showFrequent && frequentCourses.length > 0 && (
              <View style={styles.frequentSection}>
                <Text style={styles.sectionTitle}>Frequent Courses</Text>
                <FlatList
                  data={frequentCourses}
                  renderItem={renderFrequentCourse}
                  keyExtractor={(item) => item.courseId}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            )}

            {!showFrequent && (
              <FlatList
                data={searchResults}
                renderItem={renderCourseItem}
                keyExtractor={(item) => item.id.toString()}
                style={styles.resultsList}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  searchQuery.length >= 3 && !loading ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>No courses found</Text>
                      <Text style={styles.emptySubtext}>Try a different search term</Text>
                    </View>
                  ) : searchQuery.length > 0 && searchQuery.length < 3 ? (
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptySubtext}>Type at least 3 characters to search</Text>
                    </View>
                  ) : null
                }
              />
            )}

            {showFrequent && frequentCourses.length === 0 && searchQuery.length === 0 && (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No frequent courses yet</Text>
                <Text style={styles.emptySubtext}>
                  Start typing to search for golf courses
                </Text>
              </View>
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
});