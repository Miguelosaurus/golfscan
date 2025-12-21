import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Course } from '@/types';
import { colors } from '@/constants/colors';
import { MapPin } from 'lucide-react-native';
import { useCourseImage } from '@/hooks/useCourseImage';
import { DEFAULT_COURSE_IMAGE } from '@/constants/images';

interface CourseCardProps {
  course: Course;
  /** Optional: The image URL from Convex (base64 or regular URL) */
  convexImageUrl?: string | null;
  onPress: (course: Course) => void;
}

export const CourseCard: React.FC<CourseCardProps> = ({ course, convexImageUrl, onPress }) => {
  const totalPar = course.holes.reduce((sum, hole) => sum + hole.par, 0);
  const [hasError, setHasError] = useState(false);

  // Use the hook which handles local cache → Convex → default fallback
  const imageUri = useCourseImage({
    courseId: course.id,
    convexImageUrl: convexImageUrl,
    localImageUrl: course.imageUrl,
  });

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(course)}
      activeOpacity={0.7}
    >
      <View style={styles.imageContainer}>
        {imageUri && !hasError ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            resizeMode="cover"
            onError={() => setHasError(true)}
          />
        ) : (
          <View style={styles.placeholderImage}>
            <Text style={styles.placeholderText}>{course.name.charAt(0)}</Text>
          </View>
        )}
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.name} numberOfLines={1}>{course.name}</Text>

        <View style={styles.locationContainer}>
          <MapPin size={14} color={colors.textSecondary} />
          <Text style={styles.location} numberOfLines={1}>{course.location}</Text>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Holes</Text>
            <Text style={styles.statValue}>{course.holes.length}</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Par</Text>
            <Text style={styles.statValue}>{totalPar}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};


const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  imageContainer: {
    height: 120,
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
    fontSize: 40,
    fontWeight: 'bold',
    color: colors.background,
  },
  infoContainer: {
    padding: 16,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  location: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    minWidth: 60,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
});
