import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Image,
  TouchableOpacity
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useGolfStore } from '@/store/useGolfStore';
import { Button } from '@/components/Button';
import { MapPin, Camera } from 'lucide-react-native';

export default function CourseDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { courses, rounds } = useGolfStore();
  
  const course = courses.find(c => c.id === id);
  
  if (!course) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Course not found</Text>
        <Button 
          title="Go Back" 
          onPress={() => router.back()} 
          style={styles.errorButton}
        />
      </SafeAreaView>
    );
  }
  
  const courseRounds = rounds.filter(round => round.courseId === id);
  const totalPar = course.holes.reduce((sum, hole) => sum + hole.par, 0);
  
  const navigateToScanScorecard = () => {
    router.push({
      pathname: '/scan-scorecard',
      params: { courseId: course.id }
    });
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen 
        options={{ 
          title: course.name,
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTitleStyle: {
            color: colors.text,
          },
          headerTintColor: colors.text,
        }} 
      />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.imageContainer}>
          {course.imageUrl ? (
            <Image 
              source={{ uri: course.imageUrl }} 
              style={styles.image}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.placeholderImage}>
              <Text style={styles.placeholderText}>{course.name.charAt(0)}</Text>
            </View>
          )}
        </View>
        
        <View style={styles.headerContainer}>
          <Text style={styles.courseName}>{course.name}</Text>
          
          <View style={styles.locationContainer}>
            <MapPin size={16} color={colors.text} />
            <Text style={styles.location}>{course.location}</Text>
          </View>
        </View>
        
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{course.holes.length}</Text>
            <Text style={styles.statLabel}>Holes</Text>
          </View>
          
          <View style={styles.statDivider} />
          
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalPar}</Text>
            <Text style={styles.statLabel}>Par</Text>
          </View>
          
          <View style={styles.statDivider} />
          
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{courseRounds.length}</Text>
            <Text style={styles.statLabel}>Rounds Played</Text>
          </View>
        </View>
        
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Course Details</Text>
        </View>
        
        <View style={styles.holesContainer}>
          {course.holes.map((hole, index) => (
            <View key={hole.number} style={styles.holeItem}>
              <View style={styles.holeNumberContainer}>
                <Text style={styles.holeNumber}>{hole.number}</Text>
              </View>
              
              <View style={styles.holeDetails}>
                <Text style={styles.holePar}>Par {hole.par}</Text>
                <Text style={styles.holeDistance}>{hole.distance} yards</Text>
              </View>
              
              {hole.handicap && (
                <View style={styles.holeHandicap}>
                  <Text style={styles.handicapValue}>HCP {hole.handicap}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
        
        <Button
          title="Scan Scorecard"
          onPress={navigateToScanScorecard}
          style={styles.startButton}
          icon={<Camera size={18} color={colors.background} style={{ marginRight: 8 }} />}
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  holesContainer: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  holeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  holeDetails: {
    flex: 1,
  },
  holePar: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  holeDistance: {
    fontSize: 14,
    color: colors.text,
  },
  holeHandicap: {
    backgroundColor: colors.card,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  handicapValue: {
    fontSize: 14,
    color: colors.text,
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
});