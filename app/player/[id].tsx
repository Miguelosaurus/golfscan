import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  Image
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useGolfStore } from '@/store/useGolfStore';
import { Button } from '@/components/Button';
import { RoundCard } from '@/components/RoundCard';
import { Round, Course } from '@/types';
import { getWinner, calculateAverageScoreWithHoleAdjustment, getEighteenHoleEquivalentScore, getRoundHoleCount } from '@/utils/helpers';
import { User, Award, TrendingUp, Calendar, Flag } from 'lucide-react-native';

interface CourseCount {
  id: string;
  name: string;
  count: number;
}

interface PlayerStats {
  roundsPlayed: number;
  averageScore: string;
  averageVsPar: string;
  handicap: string;
  birdies: number;
  eagles: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  worseThanDouble: number;
  favoriteCourse: CourseCount | null;
}

interface CoursePlayCount {
  [courseId: string]: {
    count: number;
    name: string;
  };
}

export default function PlayerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { rounds, courses, players, deletePlayer } = useGolfStore();
  
  // Find all rounds this player participated in
  const playerRounds = rounds.filter(round => 
    round.players.some(player => player.playerId === id)
  );
  
  // Get player name from the first round or from players list
  const playerFromRounds = playerRounds.length > 0 
    ? playerRounds[0].players.find(player => player.playerId === id)
    : undefined;
  
  const playerFromList = players.find(player => player.id === id);
  
  const playerName = playerFromList?.name || playerFromRounds?.playerName || "Unknown Player";
  const playerPhotoUrl = playerFromList?.photoUrl;
  const isCurrentUser = playerFromList?.isUser || false;
  
  if (playerRounds.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>No rounds found for this player</Text>
        <Button 
          title="Go Back" 
          onPress={() => router.back()} 
          style={styles.errorButton}
        />
      </SafeAreaView>
    );
  }
  
  // Calculate player statistics
  const calculatePlayerStats = (): PlayerStats => {
    let totalEighteenHoleEquivalentScore = 0;
    let totalEighteenHoleEquivalentPar = 0;
    let roundsPlayed = playerRounds.length;
    let birdies = 0;
    let eagles = 0;
    let pars = 0;
    let bogeys = 0;
    let doubleBogeys = 0;
    let worseThanDouble = 0;
    
    // Favorite courses (count occurrences)
    const courseCounts: CoursePlayCount = {};
    
    // Calculate handicap
    const handicapDifferentials: number[] = [];
    
    playerRounds.forEach(round => {
      const playerData = round.players.find(player => player.playerId === id);
      if (!playerData) return;
      
      const course = courses.find(c => c.id === round.courseId);
      const holeCount = getRoundHoleCount(round);
      
      // Get 18-hole equivalent score for averaging
      const eighteenHoleEquivalentScore = getEighteenHoleEquivalentScore(playerData, round, course);
      totalEighteenHoleEquivalentScore += eighteenHoleEquivalentScore;
      
      // Count course plays
      if (courseCounts[round.courseId]) {
        courseCounts[round.courseId].count++;
      } else {
        courseCounts[round.courseId] = {
          count: 1,
          name: round.courseName
        };
      }
      
      // Get course par for handicap calculation (adjusted for hole count)
      if (course) {
        const fullCoursePar = course.holes.reduce((sum, hole) => sum + hole.par, 0);
        let adjustedCoursePar = fullCoursePar;
        
        if (holeCount === 9) {
          // For 9-hole rounds, use 9-hole par + expected 9-hole par
          const nineHolePar = course.holes.slice(0, 9).reduce((sum, hole) => sum + hole.par, 0);
          adjustedCoursePar = nineHolePar + 36; // Add standard 9-hole par
        }
        
        totalEighteenHoleEquivalentPar += adjustedCoursePar;
        
        // Calculate handicap differential for this round (using 18-hole equivalent)
        const differential = (eighteenHoleEquivalentScore - adjustedCoursePar) * 113 / 72;
        handicapDifferentials.push(differential);
        
        // Count score types (only count actual holes played)
        playerData.scores.forEach(score => {
          const hole = course.holes.find(h => h.number === score.holeNumber);
          if (!hole) return;
          
          const relativeToPar = score.strokes - hole.par;
          
          if (relativeToPar <= -2) eagles++;
          else if (relativeToPar === -1) birdies++;
          else if (relativeToPar === 0) pars++;
          else if (relativeToPar === 1) bogeys++;
          else if (relativeToPar === 2) doubleBogeys++;
          else if (relativeToPar > 2) worseThanDouble++;
        });
      }
    });
    
    // Calculate handicap (use best 8 of last 20 rounds)
    handicapDifferentials.sort((a, b) => a - b);
    const handicapRounds = Math.min(8, Math.floor(handicapDifferentials.length * 0.4));
    const handicapSum = handicapRounds > 0 ? handicapDifferentials.slice(0, handicapRounds).reduce((sum, diff) => sum + diff, 0) : 0;
    const handicap = handicapRounds > 0 ? (handicapSum / handicapRounds).toFixed(1) : "N/A";
    
    // Find favorite course
    let favoriteCourse: CourseCount | null = null;
    Object.keys(courseCounts).forEach(courseId => {
      if (!favoriteCourse || courseCounts[courseId].count > favoriteCourse.count) {
        favoriteCourse = { 
          id: courseId, 
          name: courseCounts[courseId].name, 
          count: courseCounts[courseId].count 
        };
      }
    });
    
    return {
      roundsPlayed,
      averageScore: roundsPlayed > 0 ? (totalEighteenHoleEquivalentScore / roundsPlayed).toFixed(1) : "0",
      averageVsPar: roundsPlayed > 0 && totalEighteenHoleEquivalentPar > 0 ? 
        ((totalEighteenHoleEquivalentScore - totalEighteenHoleEquivalentPar) / roundsPlayed).toFixed(1) : "0",
      handicap,
      birdies,
      eagles,
      pars,
      bogeys,
      doubleBogeys,
      worseThanDouble,
      favoriteCourse
    };
  };
  
  const stats = calculatePlayerStats();
  
  const navigateToRoundDetails = (round: Round) => {
    router.push(`/round/${round.id}`);
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen 
        options={{ 
          title: playerName + (isCurrentUser ? " (You)" : ""),
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTitleStyle: {
            color: colors.text,
          },
          headerTintColor: colors.text,
          headerRight: () => (!isCurrentUser ? (
            <TouchableOpacity onPress={() => {
              deletePlayer(id as string);
              router.back();
            }} style={{ paddingHorizontal: 12 }}>
              <Text style={{ color: colors.error, fontWeight: '600' }}>Delete</Text>
            </TouchableOpacity>
          ) : null)
        }} 
      />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileHeader}>
          <View style={[styles.avatarContainer, isCurrentUser && styles.userAvatarContainer]}>
            {playerPhotoUrl ? (
              <Image source={{ uri: playerPhotoUrl }} style={{ width: 80, height: 80, borderRadius: 40 }} />
            ) : (
              <Text style={styles.avatarText}>{playerName.charAt(0)}</Text>
            )}
          </View>
          <Text style={styles.playerName}>
            {playerName} {isCurrentUser && <Text style={styles.userLabel}>(You)</Text>}
          </Text>
          <View style={styles.handicapContainer}>
            <Text style={styles.handicapLabel}>Handicap</Text>
            <Text style={styles.handicapValue}>{stats.handicap}</Text>
          </View>
        </View>
        
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.roundsPlayed}</Text>
            <Text style={styles.statLabel}>Rounds</Text>
          </View>
          
          <View style={styles.statDivider} />
          
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.averageScore}</Text>
            <Text style={styles.statLabel}>Avg. Score</Text>
          </View>
          
          <View style={styles.statDivider} />
          
          <View style={styles.statItem}>
            <Text 
              style={[
                styles.statValue, 
                parseFloat(stats.averageVsPar) < 0 ? styles.goodStat : 
                parseFloat(stats.averageVsPar) > 0 ? styles.badStat : {}
              ]}
            >
              {parseFloat(stats.averageVsPar) > 0 ? '+' : ''}{stats.averageVsPar}
            </Text>
            <Text style={styles.statLabel}>Avg. vs Par</Text>
          </View>
        </View>
        
        <View style={styles.scoreDistributionContainer}>
          <View style={styles.sectionHeader}>
            <TrendingUp size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Score Distribution</Text>
          </View>
          
          <View style={styles.scoreDistribution}>
            <View style={styles.scoreTypeItem}>
              <Text style={[styles.scoreTypeValue, styles.eagleText]}>{stats.eagles}</Text>
              <Text style={styles.scoreTypeLabel}>Eagles</Text>
            </View>
            
            <View style={styles.scoreTypeItem}>
              <Text style={[styles.scoreTypeValue, styles.birdieText]}>{stats.birdies}</Text>
              <Text style={styles.scoreTypeLabel}>Birdies</Text>
            </View>
            
            <View style={styles.scoreTypeItem}>
              <Text style={styles.scoreTypeValue}>{stats.pars}</Text>
              <Text style={styles.scoreTypeLabel}>Pars</Text>
            </View>
            
            <View style={styles.scoreTypeItem}>
              <Text style={[styles.scoreTypeValue, styles.bogeyText]}>{stats.bogeys}</Text>
              <Text style={styles.scoreTypeLabel}>Bogeys</Text>
            </View>
            
            <View style={styles.scoreTypeItem}>
              <Text style={[styles.scoreTypeValue, styles.doubleText]}>{stats.doubleBogeys}</Text>
              <Text style={styles.scoreTypeLabel}>Doubles</Text>
            </View>
            
            <View style={styles.scoreTypeItem}>
              <Text style={[styles.scoreTypeValue, styles.worseText]}>{stats.worseThanDouble}</Text>
              <Text style={styles.scoreTypeLabel}>Worse</Text>
            </View>
          </View>
        </View>
        
        {stats.favoriteCourse && (
          <View style={styles.favoriteContainer}>
            <View style={styles.sectionHeader}>
              <Flag size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Favorite Course</Text>
            </View>
            
            <TouchableOpacity 
              style={styles.favoriteCourseCard}
              onPress={() => router.push(`/course/${stats.favoriteCourse?.id}`)}
            >
              <Text style={styles.favoriteCourseName}>{stats.favoriteCourse?.name}</Text>
              <Text style={styles.favoriteCourseCount}>
                Played {stats.favoriteCourse?.count} {stats.favoriteCourse?.count === 1 ? 'time' : 'times'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        
        <View style={styles.roundsContainer}>
          <View style={styles.sectionHeader}>
            <Calendar size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Recent Rounds</Text>
          </View>
          
          {playerRounds.slice(0, 5).map(round => (
            <RoundCard 
              key={round.id} 
              round={round} 
              onPress={() => navigateToRoundDetails(round)} 
            />
          ))}
          
          {playerRounds.length > 5 && (
            <Button
              title="View All Rounds"
              onPress={() => router.push('/history')}
              variant="outline"
              style={styles.viewAllButton}
            />
          )}
        </View>
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
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  userAvatarContainer: {
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.background,
  },
  playerName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  userLabel: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.primary,
  },
  handicapContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.primary}15`,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  handicapLabel: {
    fontSize: 14,
    color: colors.text,
    marginRight: 4,
  },
  handicapValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.card,
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
  goodStat: {
    color: colors.success,
  },
  badStat: {
    color: colors.error,
  },
  scoreDistributionContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 8,
  },
  scoreDistribution: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  scoreTypeItem: {
    width: '30%',
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreTypeValue: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  scoreTypeLabel: {
    fontSize: 12,
    color: colors.text,
  },
  eagleText: {
    color: '#FFD700',
  },
  birdieText: {
    color: colors.success,
  },
  bogeyText: {
    color: '#FF9800',
  },
  doubleText: {
    color: '#F44336',
  },
  worseText: {
    color: '#D32F2F',
  },
  favoriteContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  favoriteCourseCard: {
    backgroundColor: `${colors.primary}10`,
    borderRadius: 8,
    padding: 12,
  },
  favoriteCourseName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  favoriteCourseCount: {
    fontSize: 14,
    color: colors.text,
  },
  roundsContainer: {
    marginBottom: 16,
  },
  viewAllButton: {
    marginTop: 8,
  },
  errorText: {
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
    marginTop: 24,
  },
  errorButton: {
    marginHorizontal: 16,
  },
});