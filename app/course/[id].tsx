import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Image,
  TouchableOpacity,
  Modal
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useGolfStore } from '@/store/useGolfStore';
import { Button } from '@/components/Button';
import { RoundCard } from '@/components/RoundCard';
import { getEighteenHoleEquivalentScore, getRoundHoleCount } from '@/utils/helpers';
import { MapPin, Camera, X, TrendingUp, TrendingDown } from 'lucide-react-native';

export default function CourseDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { courses, rounds } = useGolfStore();
  const [showRoundsModal, setShowRoundsModal] = useState(false);
  
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
  
  // Calculate stats from user's rounds only
  const userRounds = courseRounds.filter(round => 
    round.players.some(player => player.playerId && player.playerId.length > 0)
  );
  
  const calculateCourseStats = () => {
    if (userRounds.length === 0) return null;
    
    let totalEighteenHoleEquivalentScore = 0;
    let roundCount = 0;
    let bestEighteenHoleScore = Infinity;
    let worstEighteenHoleScore = 0;
    let parOrBetter = 0;
    
    userRounds.forEach(round => {
      round.players.forEach(player => {
        if (player.totalScore) {
          // Get 18-hole equivalent score for proper comparison
          const eighteenHoleScore = getEighteenHoleEquivalentScore(player, round, course);
          const holeCount = getRoundHoleCount(round);
          
          // Calculate 18-hole equivalent par
          let eighteenHolePar = totalPar;
          if (holeCount === 9) {
            const nineHolePar = course.holes.slice(0, 9).reduce((sum, hole) => sum + hole.par, 0);
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
          
          <TouchableOpacity style={styles.statItem} onPress={() => setShowRoundsModal(true)}>
            <Text style={styles.statValue}>{courseRounds.length}</Text>
            <Text style={styles.statLabel}>Rounds Played</Text>
          </TouchableOpacity>
        </View>
        
        {stats && (
          <View style={styles.statsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your Performance Stats</Text>
            </View>
            
            <View style={styles.performanceGrid}>
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
                <Text style={styles.performanceSubtext}>
                  {stats.bestScore - totalPar > 0 ? '+' : ''}{stats.bestScore - totalPar}
                </Text>
              </View>
              
              <View style={styles.performanceCard}>
                <Text style={styles.performanceValue}>{stats.parOrBetterPercentage.toFixed(0)}%</Text>
                <Text style={styles.performanceLabel}>Par or Better</Text>
                <Text style={styles.performanceSubtext}>
                  {Math.round(stats.parOrBetterPercentage / 100 * stats.totalRounds)} rounds
                </Text>
              </View>
              
              <View style={styles.performanceCard}>
                <Text style={styles.performanceValue}>{stats.worstScore}</Text>
                <Text style={styles.performanceLabel}>Worst Score</Text>
                <Text style={styles.performanceSubtext}>
                  +{stats.worstScore - totalPar}
                </Text>
              </View>
            </View>
          </View>
        )}
        
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

        <Button
          title="View Rounds"
          onPress={() => setShowRoundsModal(true)}
          style={styles.startButton}
          icon={<TrendingUp size={18} color={colors.background} style={{ marginRight: 8 }} />}
        />
      </ScrollView>

      <Modal
        visible={showRoundsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRoundsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rounds Played at {course.name}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {courseRounds.map((round, index) => (
                <RoundCard 
                  key={index} 
                  round={round} 
                  onPress={() => {
                    setShowRoundsModal(false);
                    router.push(`/round/${round.id}`);
                  }}
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
});