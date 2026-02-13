import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TextInput,
  TouchableOpacity,
  Alert
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useGolfStore } from '@/store/useGolfStore';
import { useOnboardingStore } from '@/store/useOnboardingStore';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/Button';
import { Course, Hole } from '@/types';
import { generateUniqueId } from '@/utils/helpers';
import { fromUnitDistanceValueToYards, toUnitDistanceValueFromYards } from '@/utils/units';
import { Plus, Minus } from 'lucide-react-native';
import { useMutation } from '@/lib/convex';
import { api } from '@/convex/_generated/api';

export default function ManualCourseEntryScreen() {
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams();
  const { addCourse } = useGolfStore();
  const distanceUnit = useOnboardingStore((s) => s.distanceUnit);
  const upsertCourse = useMutation(api.courses.upsert);
  
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [courseRatingInput, setCourseRatingInput] = useState('');
  const [slopeRatingInput, setSlopeRatingInput] = useState('');
  const [holes, setHoles] = useState<Hole[]>(() => {
    if (params.holes) {
      try {
        const parsed = JSON.parse(params.holes as string);
        if (Array.isArray(parsed) && parsed.length) return parsed as Hole[];
      } catch {}
    }
    return Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, distance: 0 }));
  });
  
  const handleParChange = (index: number, value: string) => {
    const par = parseInt(value, 10);
    if (isNaN(par) || par < 3 || par > 5) return;
    
    setHoles(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], par };
      return updated;
    });
  };
  
  const handleDistanceChange = (index: number, value: string) => {
    const trimmed = value.trim();
    if (!trimmed.length) {
      setHoles(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], distance: 0 };
        return updated;
      });
      return;
    }

    const raw = parseInt(trimmed, 10);
    if (isNaN(raw)) return;
    const yards =
      distanceUnit === 'yards'
        ? raw
        : Math.round(fromUnitDistanceValueToYards(raw, 'meters'));
    
    setHoles(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], distance: yards };
      return updated;
    });
  };
  
  const incrementPar = (index: number) => {
    setHoles(prev => {
      const updated = [...prev];
      if (updated[index].par < 5) {
        updated[index] = { ...updated[index], par: updated[index].par + 1 };
      }
      return updated;
    });
  };
  
  const decrementPar = (index: number) => {
    setHoles(prev => {
      const updated = [...prev];
      if (updated[index].par > 3) {
        updated[index] = { ...updated[index], par: updated[index].par - 1 };
      }
      return updated;
    });
  };
  
  const validateForm = () => {
    if (!name.trim()) {
      Alert.alert(t("Error"), t("Please enter a course name"));
      return false;
    }
    if (!location.trim()) {
      Alert.alert(t("Error"), t("Please enter a location"));
      return false;
    }
    if (courseRatingInput.trim().length && isNaN(Number(courseRatingInput.trim()))) {
      Alert.alert(t("Error"), t("Course rating must be a number"));
      return false;
    }
    if (slopeRatingInput.trim().length && (isNaN(Number(slopeRatingInput.trim())) || !Number.isFinite(Number(slopeRatingInput.trim())))) {
      Alert.alert(t("Error"), t("Slope rating must be a number"));
      return false;
    }
    return true;
  };
  
  const handleSaveCourse = async () => {
    if (!validateForm()) return;

    const externalId = `manual-${Date.now()}`;
    const nowHoles = holes.map((hole, idx) => ({
      number: hole.number,
      par: hole.par,
      hcp: idx + 1,
      yardage: hole.distance || undefined,
    }));

    const courseRating = courseRatingInput.trim().length ? Number(courseRatingInput.trim()) : undefined;
    const slopeRating = slopeRatingInput.trim().length ? Number(slopeRatingInput.trim()) : undefined;

    let convexId: string | null = null;
    try {
      convexId = await upsertCourse({
        externalId,
        name: name.trim(),
        location: location.trim(),
        slope: slopeRating,
        rating: courseRating,
        teeSets: undefined,
        holes: nowHoles,
        imageUrl: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80"
      }) as unknown as string;
    } catch (e) {
      // fall back to local-only if convex write fails
    }

    const newCourse: Course = {
      id: convexId ?? generateUniqueId(),
      name: name.trim(),
      location: location.trim(),
      holes,
      imageUrl: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80",
      rating: courseRating,
      slope: slopeRating,
    };
    
    addCourse(newCourse);
    router.replace(`/course/${newCourse.id}`);
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: t("Manual Course Entry") }} />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>{t("Course Information")}</Text>
          
          <Text style={styles.inputLabel}>{t("Course Name")}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t("Enter course name")}
            placeholderTextColor={colors.textSecondary}
          />
          
          <Text style={styles.inputLabel}>{t("Location")}</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder={t("City, State")}
            placeholderTextColor={colors.textSecondary}
          />

          <Text style={styles.inputLabel}>{t("Course Rating (optional)")}</Text>
          <TextInput
            style={styles.input}
            value={courseRatingInput}
            onChangeText={setCourseRatingInput}
            placeholder={t("e.g. 72.1")}
            placeholderTextColor={colors.textSecondary}
            keyboardType="decimal-pad"
          />

          <Text style={styles.inputLabel}>{t("Slope Rating (optional)")}</Text>
          <TextInput
            style={styles.input}
            value={slopeRatingInput}
            onChangeText={setSlopeRatingInput}
            placeholder={t("e.g. 125")}
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
          />
        </View>
        
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>{t("Hole Details")}</Text>
          
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.holeNumberHeader]}>{t("Hole")}</Text>
            <Text style={[styles.tableHeaderText, styles.parHeader]}>{t("Par")}</Text>
            <Text style={[styles.tableHeaderText, styles.distanceHeader]}>
              {t("Distance")} ({distanceUnit === 'yards' ? t('yards') : t('meters')})
            </Text>
          </View>
          
          {holes.map((hole, index) => (
            <View key={hole.number} style={styles.holeRow}>
              <Text style={styles.holeNumber}>{hole.number}</Text>
              
              <View style={styles.parContainer}>
                <TouchableOpacity 
                  style={styles.parButton}
                  onPress={() => decrementPar(index)}
                  disabled={hole.par <= 3}
                >
                  <Minus size={16} color={hole.par <= 3 ? colors.inactive : colors.text} />
                </TouchableOpacity>
                
                <TextInput
                  style={styles.parInput}
                  value={hole.par.toString()}
                  onChangeText={(value) => handleParChange(index, value)}
                  keyboardType="number-pad"
                  maxLength={1}
                />
                
                <TouchableOpacity 
                  style={styles.parButton}
                  onPress={() => incrementPar(index)}
                  disabled={hole.par >= 5}
                >
                  <Plus size={16} color={hole.par >= 5 ? colors.inactive : colors.text} />
                </TouchableOpacity>
              </View>
              
              {(() => {
                const inUnit = toUnitDistanceValueFromYards(hole.distance, distanceUnit);
                const distanceDisplay =
                  hole.distance > 0 && typeof inUnit === 'number' && Number.isFinite(inUnit)
                    ? String(Math.round(inUnit))
                    : '';

                return (
              <TextInput
                style={styles.distanceInput}
                value={distanceDisplay}
                onChangeText={(value) => handleDistanceChange(index, value)}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
              />
                );
              })()}
            </View>
          ))}
        </View>
        
        <Button
          title={t("Save Course")}
          onPress={handleSaveCourse}
          style={styles.saveButton}
        />
      </ScrollView>
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
  formSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 8,
  },
  tableHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  holeNumberHeader: {
    width: 50,
  },
  parHeader: {
    width: 120,
    textAlign: 'center',
  },
  distanceHeader: {
    flex: 1,
  },
  holeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  holeNumber: {
    width: 50,
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  parContainer: {
    width: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  parButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  parInput: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    textAlign: 'center',
    fontSize: 16,
    color: colors.text,
  },
  distanceInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 8,
    fontSize: 16,
    color: colors.text,
  },
  saveButton: {
    marginTop: 8,
  },
});
