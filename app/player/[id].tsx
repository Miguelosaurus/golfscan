import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useGolfStore } from '@/store/useGolfStore';
import { Button } from '@/components/Button';
import { ScoreTrendCard } from '@/components/ScoreTrendCard';
import { RoundCard } from '@/components/RoundCard';
import { Round } from '@/types';
import { getWinner, calculateAverageScoreWithHoleAdjustment, getEighteenHoleEquivalentScore, getRoundHoleCount } from '@/utils/helpers';
import { calculateBlowUpRate, calculatePerformanceByPar, calculatePerformanceByDifficulty, buildScoreTrendData } from '@/utils/stats';
import { User, Award, TrendingUp, Calendar, Info } from 'lucide-react-native';
import { PieChart } from 'react-native-gifted-charts';

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
}

interface HeadToHeadStats {
  record: string;
  userAverage: string;
  playerAverage: string;
  rounds: number;
}

const calculateHeadToHeadStats = (
  allRounds: Round[],
  profilePlayerId: string,
  userPlayerId: string
): HeadToHeadStats | null => {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let userTotal = 0;
  let playerTotal = 0;
  let roundsPlayed = 0;

  allRounds.forEach(round => {
    const profilePlayer = round.players.find(player => player.playerId === profilePlayerId);
    const userPlayer = round.players.find(player => player.playerId === userPlayerId);

    if (profilePlayer && userPlayer) {
      roundsPlayed++;
      playerTotal += profilePlayer.totalScore;
      userTotal += userPlayer.totalScore;

      if (profilePlayer.totalScore < userPlayer.totalScore) {
        wins++;
      } else if (profilePlayer.totalScore > userPlayer.totalScore) {
        losses++;
      } else {
        ties++;
      }
    }
  });

  if (roundsPlayed === 0) return null;

  const record = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;

  return {
    record,
    userAverage: (userTotal / roundsPlayed).toFixed(1),
    playerAverage: (playerTotal / roundsPlayed).toFixed(1),
    rounds: roundsPlayed,
  };
};

export default function PlayerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { rounds, courses, players, deletePlayer } = useGolfStore();
  const { width: windowWidth } = useWindowDimensions();
  
  // Find all rounds this player participated in
  const playerRounds = rounds.filter(round => 
    round.players.some(player => player.playerId === id)
  );
  
  // Get player name from the first round or from players list
  const playerFromRounds = playerRounds.length > 0 
    ? playerRounds[0].players.find(player => player.playerId === id)
    : undefined;
  
  const playerFromList = players.find(player => player.id === id);
  const currentUserPlayer = players.find(player => player.isUser);
  
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
      worseThanDouble
    };
  };
  
  const stats = calculatePlayerStats();

  const blowUpStats = calculateBlowUpRate({
    playerId: id,
    rounds: playerRounds,
    courses,
  });
  const performanceByPar = calculatePerformanceByPar({
    playerId: id,
    rounds: playerRounds,
    courses,
  });
  const performanceByDifficulty = calculatePerformanceByDifficulty({
    playerId: id,
    rounds: playerRounds,
    courses,
  });
  const scoreTrendData = buildScoreTrendData({
    playerId: id,
    rounds: playerRounds,
    courses,
    maxRounds: playerRounds.length || 10,
    movingAverageWindow: Math.min(5, Math.max(2, playerRounds.length || 2)),
  });
  const scoreDistributionEntries = [
    { label: 'Eagles', value: stats.eagles, color: '#F7B32B' },
    { label: 'Birdies', value: stats.birdies, color: '#4CAF50' },
    { label: 'Pars', value: stats.pars, color: '#1E6059' },
    { label: 'Bogeys', value: stats.bogeys, color: '#FFB347' },
    { label: 'Doubles', value: stats.doubleBogeys, color: '#F44336' },
    { label: 'Worse', value: stats.worseThanDouble, color: '#B71C1C' },
  ];
  const hasScoreDistribution = scoreDistributionEntries.some(item => item.value > 0);
  const pieRadius = Math.max(Math.min((windowWidth - 96) / 2.2, 130), 90);
  const totalScores = scoreDistributionEntries.reduce((sum, item) => sum + item.value, 0);
  const pieChartData = scoreDistributionEntries
    .filter(item => item.value > 0)
    .map(item => ({
      value: item.value,
      color: item.color,
      text: totalScores ? `${Math.round((item.value / totalScores) * 100)}%` : '0%',
      textColor: '#fff',
      textSize: 12,
      shiftX: -6,
      shiftY: 0,
    }));

  const headToHeadStats = !isCurrentUser && currentUserPlayer
    ? calculateHeadToHeadStats(rounds, id, currentUserPlayer.id)
    : null;

  const [activeTooltip, setActiveTooltip] = useState<'blowup' | 'avgVsPar' | 'performanceByPar' | 'difficulty' | null>(null);
  const formatParPerformance = (value: number | null) => {
    if (value === null) return '--';
    const rounded = value.toFixed(1);
    return value > 0 ? `+${rounded}` : rounded;
  };

  const tooltipContent = {
    blowup: {
      title: 'Blow-Up Holes/Rd',
      body: 'Average number of holes per round where you scored triple bogey or worse.',
    },
    avgVsPar: {
      title: 'Avg vs Par',
      body: 'How many strokes over/under par you typically shoot each round.',
    },
    performanceByPar: {
      title: 'Performance by Par',
      body: 'Average score relative to par for Par 3s, 4s, and 5s.',
    },
    difficulty: {
      title: 'Performance vs Difficulty',
      body: 'Average score relative to par grouped by hole handicap (hard, medium, easy).',
    },
  } as const;

  const renderTooltip = () => {
    if (!activeTooltip) return null;
    const { title, body } = tooltipContent[activeTooltip];
    return (
      <Modal transparent animationType="fade" visible onRequestClose={() => setActiveTooltip(null)}>
        <TouchableWithoutFeedback onPress={() => setActiveTooltip(null)}>
          <View style={styles.tooltipOverlay}>
            <View style={styles.tooltipBox}>
              <Text style={styles.tooltipTitle}>{title}</Text>
              <Text style={styles.tooltipText}>{body}</Text>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  };
  
  const navigateToRoundDetails = (round: Round) => {
    router.push(`/round/${round.id}`);
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {renderTooltip()}
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

          <View style={[styles.statItem, styles.statItemWithIcon]}>
            <Text style={styles.statValue}>{blowUpStats.averagePerRound.toFixed(1)}</Text>
            <Text style={styles.statLabel}>Blow-Up Holes/Rd</Text>
            <TouchableOpacity
              onPress={() => setActiveTooltip('blowup')}
              style={styles.statInfoButton}
              hitSlop={8}
            >
              <Info size={14} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
        
        {headToHeadStats && (
          <View style={styles.headToHeadCard}>
            <View style={styles.sectionHeader}>
              <TrendingUp size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Head-to-Head (vs. You)</Text>
            </View>
            <View style={styles.headToHeadRow}>
              <View style={styles.headToHeadItem}>
                <Text style={styles.headToHeadLabel}>Record</Text>
                <Text style={styles.headToHeadValue}>{headToHeadStats.record}</Text>
              </View>
              <View style={styles.headToHeadItem}>
                <Text style={styles.headToHeadLabel}>Their Avg (H2H)</Text>
                <Text style={styles.headToHeadValue}>{headToHeadStats.playerAverage}</Text>
              </View>
              <View style={styles.headToHeadItem}>
                <Text style={styles.headToHeadLabel}>Your Avg (H2H)</Text>
                <Text style={styles.headToHeadValue}>{headToHeadStats.userAverage}</Text>
              </View>
            </View>
          </View>
        )}

        <ScoreTrendCard data={scoreTrendData} />

        <View style={styles.keyInsightsCard}>
          <View style={styles.sectionHeaderLeft}>
            <TrendingUp size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Key Insights</Text>
          </View>

          <View style={styles.avgVsParRow}>
            <View style={styles.sectionLabelRow}>
              <Text style={styles.avgVsParLabel}>Avg vs Par</Text>
              <TouchableOpacity onPress={() => setActiveTooltip('avgVsPar')} style={styles.infoButtonSmall} hitSlop={8}>
                <Info size={16} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text
              style={[
                styles.avgVsParValue,
                parseFloat(stats.averageVsPar) < 0
                  ? styles.goodStat
                  : parseFloat(stats.averageVsPar) > 0
                    ? styles.badStat
                    : null
              ]}
            >
              {parseFloat(stats.averageVsPar) > 0 ? '+' : ''}{stats.averageVsPar}
            </Text>
          </View>

          <View style={styles.sectionDivider} />

          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionSubtitle}>Performance by Par</Text>
            <TouchableOpacity onPress={() => setActiveTooltip('performanceByPar')} style={styles.infoButtonSmall} hitSlop={8}>
              <Info size={16} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.performanceByParRow}>
            <View style={styles.performanceByParItem}>
              <Text style={styles.performanceByParLabel}>Par 3s</Text>
              <Text style={styles.performanceByParValue}>
                {formatParPerformance(performanceByPar.par3)}
              </Text>
            </View>
            <View style={styles.performanceByParItem}>
              <Text style={styles.performanceByParLabel}>Par 4s</Text>
              <Text style={styles.performanceByParValue}>
                {formatParPerformance(performanceByPar.par4)}
              </Text>
            </View>
            <View style={styles.performanceByParItem}>
              <Text style={styles.performanceByParLabel}>Par 5s</Text>
              <Text style={styles.performanceByParValue}>
                {formatParPerformance(performanceByPar.par5)}
              </Text>
            </View>
          </View>

          <View style={styles.sectionDivider} />

          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionSubtitle}>Performance vs Difficulty</Text>
            <TouchableOpacity onPress={() => setActiveTooltip('difficulty')} style={styles.infoButtonSmall} hitSlop={8}>
              <Info size={16} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.performanceDifficultyRow}>
            <View style={styles.performanceDifficultyItem}>
              <Text style={styles.performanceDifficultyLabel}>Hard (HCP 1-6)</Text>
              <Text style={styles.performanceDifficultyValue}>
                {formatParPerformance(performanceByDifficulty.hard)}
              </Text>
            </View>
            <View style={styles.performanceDifficultyItem}>
              <Text style={styles.performanceDifficultyLabel}>Medium (7-12)</Text>
              <Text style={styles.performanceDifficultyValue}>
                {formatParPerformance(performanceByDifficulty.medium)}
              </Text>
            </View>
            <View style={styles.performanceDifficultyItem}>
              <Text style={styles.performanceDifficultyLabel}>Easy (13-18)</Text>
              <Text style={styles.performanceDifficultyValue}>
                {formatParPerformance(performanceByDifficulty.easy)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.scoreDistributionContainer}>
          <View style={styles.sectionHeader}>
            <TrendingUp size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Score Distribution</Text>
          </View>

          <Text style={styles.sectionSubtitle}>Score Distribution (All-Time)</Text>

          {hasScoreDistribution ? (
            <>
              <View style={styles.pieChartWrapper}>
                <PieChart
                  data={pieChartData}
                  radius={pieRadius}
                  showText
                  textColor="#fff"
                  textSize={12}
                  centerLabelComponent={() => null}
                  innerRadius={0}
                  strokeColor="#FFFFFF"
                  strokeWidth={2}
                />
              </View>
              <View style={styles.pieLegend}>
                {scoreDistributionEntries.map(entry => (
                  <View key={entry.label} style={styles.pieLegendItem}>
                    <View style={[styles.pieLegendDot, { backgroundColor: entry.color }]} />
                    <Text style={styles.pieLegendLabel}>{entry.label}</Text>
                    <Text style={styles.pieLegendCount}>{entry.value}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.pieChartPlaceholder}>Play a few more rounds to see your scoring mix.</Text>
          )}
        </View>
        
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
    backgroundColor: `${colors.text}10`,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6EAE9',
  },
  handicapLabel: {
    fontSize: 14,
    color: colors.text,
    marginRight: 4,
  },
  handicapValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  statItemWithIcon: {
    paddingTop: 4,
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
    textAlign: 'center',
  },
  goodStat: {
    color: colors.success,
  },
  badStat: {
    color: colors.error,
  },
  statInfoButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    padding: 4,
  },
  headToHeadCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  headToHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headToHeadItem: {
    flex: 1,
    alignItems: 'center',
  },
  headToHeadLabel: {
    fontSize: 12,
    color: colors.text,
    marginBottom: 4,
  },
  headToHeadValue: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  keyInsightsCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  avgVsParRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  avgVsParLabel: {
    fontSize: 14,
    color: colors.text,
  },
  avgVsParValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  scoreDistributionContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 12,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  pieChartWrapper: {
    alignItems: 'center',
    marginBottom: 16,
  },
  pieChartPlaceholder: {
    color: colors.text,
    opacity: 0.6,
    textAlign: 'center',
    paddingVertical: 16,
  },
  pieLegend: {
    paddingLeft: 0,
    marginTop: 8,
    width: '100%',
  },
  pieLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  pieLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  pieLegendLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  pieLegendCount: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  statLabelWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoButtonSmall: {
    padding: 2,
    marginLeft: 4,
  },
  infoButton: {
    padding: 4,
  },
  tooltipOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  tooltipBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    width: '90%',
  },
  tooltipTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  tooltipText: {
    fontSize: 14,
    color: colors.text,
  },
  performanceByParRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  performanceByParItem: {
    flex: 1,
    alignItems: 'center',
  },
  performanceByParLabel: {
    fontSize: 12,
    color: colors.text,
    marginBottom: 4,
  },
  performanceByParValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  performanceDifficultyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  performanceDifficultyItem: {
    flex: 1,
    alignItems: 'center',
  },
  performanceDifficultyLabel: {
    fontSize: 12,
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  performanceDifficultyValue: {
    fontSize: 18,
    fontWeight: '600',
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
