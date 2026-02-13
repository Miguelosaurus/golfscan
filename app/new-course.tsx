import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  Alert
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useGolfStore } from '@/store/useGolfStore';
import { Button } from '@/components/Button';
import { CourseSearchModal } from '@/components/CourseSearchModal';
import { Course } from '@/types';
import { Search, Plus } from 'lucide-react-native';
import { useMutation } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import { useT } from '@/lib/i18n';

export default function NewCourseScreen() {
  const router = useRouter();
  const t = useT();
  const { addCourse } = useGolfStore();
  const [showSearchModal, setShowSearchModal] = useState(false);
  const upsertCourse = useMutation(api.courses.upsert);
  
  const handleSelectCourse = async (course: Course) => {
    let convexId: string | null = null;
    try {
      convexId = await upsertCourse({
        externalId: course.apiId ? `api-${course.apiId}` : course.id,
        name: course.name,
        location: course.location,
        slope: course.slope,
        rating: course.rating,
        teeSets: undefined,
        holes: course.holes.map((h, idx) => ({
          number: h.number,
          par: h.par,
          hcp: h.handicap ?? idx + 1,
          yardage: h.distance || undefined,
        })),
        imageUrl: course.imageUrl,
      }) as unknown as string;
    } catch (e) {
      // If Convex write fails, fall back to local only
    }
    addCourse({ ...course, id: convexId ?? course.id });
    router.replace(`/course/${convexId ?? course.id}`);
  };
  
  const handleManualEntry = () => {
    router.push('/manual-course-entry');
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: t("Add Course") }} />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerContainer}>
          <Text style={styles.title}>{t("Add a Golf Course")}</Text>
          <Text style={styles.subtitle}>
            {t("Search our database of golf courses or add one manually")}
          </Text>
        </View>
        
        <View style={styles.optionsContainer}>
          <TouchableOpacity 
            style={styles.optionCard}
            onPress={() => setShowSearchModal(true)}
          >
            <View style={styles.optionIcon}>
              <Search size={32} color={colors.primary} />
            </View>
            <Text style={styles.optionTitle}>{t("Search Golf Courses")}</Text>
            <Text style={styles.optionDescription}>
              {t("Find courses from our comprehensive database with accurate hole information and ratings")}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.optionCard}
            onPress={handleManualEntry}
          >
            <View style={styles.optionIcon}>
              <Plus size={32} color={colors.primary} />
            </View>
            <Text style={styles.optionTitle}>{t("Add Manually")}</Text>
            <Text style={styles.optionDescription}>
              {t("Create a custom course entry with your own hole information")}
            </Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>{t("Why search our database?")}</Text>
          <Text style={styles.infoText}>
            {t("• Accurate hole-by-hole information")}
          </Text>
          <Text style={styles.infoText}>
            {t("• Official course ratings and slope")}
          </Text>
          <Text style={styles.infoText}>
            {t("• Multiple tee box options")}
          </Text>
          <Text style={styles.infoText}>
            {t("• Verified course details")}
          </Text>
        </View>
      </ScrollView>
      
      <CourseSearchModal
        visible={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelectCourse={handleSelectCourse}
        showMyCoursesTab={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 24,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  optionsContainer: {
    gap: 16,
    marginBottom: 32,
  },
  optionCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  optionDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  infoContainer: {
    backgroundColor: `${colors.primary}10`,
    borderRadius: 12,
    padding: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
});
