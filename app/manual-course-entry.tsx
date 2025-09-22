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
import { Button } from '@/components/Button';
import { Course, Hole } from '@/types';
import { generateUniqueId } from '@/utils/helpers';
import { Plus, Minus } from 'lucide-react-native';

export default function ManualCourseEntryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { addCourse } = useGolfStore();
  
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
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
    const distance = parseInt(value, 10);
    if (isNaN(distance)) return;
    
    setHoles(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], distance };
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
      Alert.alert("Error", "Please enter a course name");
      return false;
    }
    
    if (!location.trim()) {
      Alert.alert("Error", "Please enter a location");
      return false;
    }
    
    return true;
  };
  
  const handleSaveCourse = () => {
    if (!validateForm()) return;
    
    const newCourse: Course = {
      id: generateUniqueId(),
      name: name.trim(),
      location: location.trim(),
      holes,
      imageUrl: "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80"
    };
    
    addCourse(newCourse);
    router.replace(`/course/${newCourse.id}`);
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: "Manual Course Entry" }} />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Course Information</Text>
          
          <Text style={styles.inputLabel}>Course Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter course name"
            placeholderTextColor={colors.textSecondary}
          />
          
          <Text style={styles.inputLabel}>Location</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="City, State"
            placeholderTextColor={colors.textSecondary}
          />
        </View>
        
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Hole Details</Text>
          
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.holeNumberHeader]}>Hole</Text>
            <Text style={[styles.tableHeaderText, styles.parHeader]}>Par</Text>
            <Text style={[styles.tableHeaderText, styles.distanceHeader]}>Distance (yards)</Text>
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
              
              <TextInput
                style={styles.distanceInput}
                value={hole.distance > 0 ? hole.distance.toString() : ''}
                onChangeText={(value) => handleDistanceChange(index, value)}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
              />
            </View>
          ))}
        </View>
        
        <Button
          title="Save Course"
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