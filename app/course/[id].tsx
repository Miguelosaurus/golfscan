import React, { useRef, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Animated,
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
import { calculatePerformanceByPar, calculatePerHoleAverages } from '@/utils/stats';
import { MapPin, Camera, X, TrendingUp, TrendingDown, ChevronRight, ChevronLeft, Info } from 'lucide-react-native';

export default function CourseDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { courses, rounds, players } = useGolfStore();
  const [showRoundsModal, setShowRoundsModal] = useState(false);
  const [showCourseMapInfo, setShowCourseMapInfo] = useState(false);
  
  const course = courses.find(c => c.id === id);
  const currentUser = players.find(player => player.isUser);
  
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
  const userRounds = currentUser 
    ? courseRounds.filter(round => 
        round.players.some(player => player.playerId === currentUser.id)
      )
    : [];
  
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
  const performanceByPar = currentUser
    ? calculatePerformanceByPar({
        playerId: currentUser.id,
        rounds: courseRounds,
        courses,
        courseId: course.id,
      })
    : null;
  const holeAverages: Record<number, { average: number; attempts: number }> = currentUser
    ? calculatePerHoleAverages({
        playerId: currentUser.id,
        rounds: courseRounds,
        course,
      })
    : {};

  const formatRelativeToPar = (value: number | null) => {
    if (value === null || value === undefined) return '--';
    const rounded = value.toFixed(1);
    return value > 0 ? `+${rounded}` : rounded;
  };

  const worstParType = performanceByPar
    ? (() => {
        const entries = [
          { label: 'Par 3s', value: performanceByPar.par3 },
          { label: 'Par 4s', value: performanceByPar.par4 },
          { label: 'Par 5s', value: performanceByPar.par5 },
        ].filter(entry => entry.value !== null) as { label: string; value: number }[];
        if (!entries.length) return null;
        return entries.reduce((worst, current) =>
          current.value > worst.value ? current : worst
        );
      })()
    : null;
  
  const navigateToScanScorecard = () => {
    router.push({
      pathname: '/scan-scorecard',
      params: { courseId: course.id }
    });
  };
  
  const scrollY = useRef(new Animated.Value(0)).current;
  const IMAGE_HEIGHT = 280;
  const HEADER_STRETCH = 200;

  const headerBg = scrollY.interpolate({
    inputRange: [0, IMAGE_HEIGHT - 100, IMAGE_HEIGHT - 40],
    outputRange: ['rgba(245,243,239,0)', 'rgba(245,243,239,0.6)', 'rgba(245,243,239,1)'],
    extrapolate: 'clamp',
  });

  const extraHeaderSpace = scrollY.interpolate({
    inputRange: [-HEADER_STRETCH, 0, HEADER_STRETCH],
    outputRange: [HEADER_STRETCH, 0, 0],
    extrapolate: 'clamp',
  });

  const imageHeight = scrollY.interpolate({
    inputRange: [-HEADER_STRETCH, 0, HEADER_STRETCH],
    outputRange: [IMAGE_HEIGHT + HEADER_STRETCH, IMAGE_HEIGHT, IMAGE_HEIGHT],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Fixed background image */}
      {course.imageUrl ? (
        <Animated.Image 
          source={{ uri: course.imageUrl }} 
          style={[styles.fixedImage, { height: imageHeight }]}
          resizeMode="cover" 
        />
      ) : (
        <View style={[styles.placeholderImage, styles.fixedImage, { height: IMAGE_HEIGHT }]}>
          <Text style={styles.placeholderText}>{course.name.charAt(0)}</Text>
        </View>
      )}

      {/* Overlay toolbar with animated background */}
      <Animated.View style={[styles.overlayHeader, { backgroundColor: headerBg }]} pointerEvents="box-none"> 
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()} 
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
      </Animated.View>

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.contentContainer, { paddingTop: IMAGE_HEIGHT }]}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
      >
        <Animated.View style={{ height: extraHeaderSpace }} />
        <View style={styles.sheet}>
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
              <Text style={styles.statLabel}>{courseRounds.length === 1 ? 'Round' : 'Rounds'}</Text>
              <ChevronRight size={16} strokeWidth={2.2} color={colors.text} style={styles.statChevron} />
            </TouchableOpacity>
          </View>
        
        {stats && (
          <View style={styles.statsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your Performance Stats</Text>
            </View>
            
            <View style={styles.performanceGrid}>
              <View style={styles.performanceCard}>
                <Text style={styles.performanceValue}>{stats.totalRounds}</Text>
                <Text style={styles.performanceLabel}>Rounds Played</Text>
              </View>
              
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
                <Text style={styles.performanceValue}>
                  {worstParType ? formatRelativeToPar(worstParType.value) : '--'}
                </Text>
                <Text style={styles.performanceLabel}>
                  {worstParType ? `Worst: ${worstParType.label}` : 'Worst Par Type'}
                </Text>
                <Text style={styles.performanceSubtext}>
                  {worstParType ? 'Avg vs Par' : 'No data'}
                </Text>
              </View>
            </View>
          </View>
        )}
        
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>My Course Map</Text>
            <TouchableOpacity
              onPress={() => setShowCourseMapInfo(true)}
              style={styles.infoButton}
              accessibilityRole="button"
              accessibilityLabel="Course map info"
            >
              <Info size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.holesContainer}>
          {course.holes.map(hole => {
            const averageEntry = currentUser ? holeAverages[hole.number] : undefined;
            const averageValue = averageEntry ? Number(averageEntry.average.toFixed(1)) : null;
            const diffFromPar = averageValue !== null ? averageValue - hole.par : null;
            const avgText = averageValue !== null ? averageValue.toFixed(1) : '--';
            const metaParts = [`Par ${hole.par}`, `${hole.distance} yds`];
            if (hole.handicap) {
              metaParts.push(`HCP ${hole.handicap}`);
            }

            let badgeStyle = styles.holeAverageNeutral;
            if (diffFromPar !== null) {
              if (diffFromPar <= 0.1) {
                badgeStyle = styles.holeAverageGood;
              } else if (diffFromPar < 1.5) {
                badgeStyle = styles.holeAverageCaution;
              } else {
                badgeStyle = styles.holeAverageDanger;
              }
            }
            
            return (
              <View key={hole.number} style={styles.holeItem}>
                <View style={styles.holeInfo}>
                  <View style={styles.holeNumberContainer}>
                    <Text style={styles.holeNumber}>{hole.number}</Text>
                  </View>
                  <Text style={styles.holeMetaText}>
                    {metaParts.join(' • ')}
                  </Text>
                </View>
                
                <View style={[styles.holeAverageBadge, badgeStyle]}>
                  <Text style={styles.holeAverageBadgeText}>AVG: {avgText}</Text>
                </View>
              </View>
            );
          })}
        </View>
        
        <Button
          title="Scan Scorecard"
          onPress={navigateToScanScorecard}
          style={styles.startButton}
          icon={<Camera size={18} color={colors.background} style={{ marginRight: 8 }} />}
        />

        {/* Removed explicit View Rounds button; hint added on the stat tile */}
        </View>
      </Animated.ScrollView>

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

      <Modal
        visible={showCourseMapInfo}
        animationType="fade"
        transparent
        onRequestClose={() => setShowCourseMapInfo(false)}
      >
        <View style={styles.infoModalOverlay}>
          <View style={styles.infoModalContent}>
            <Text style={styles.infoModalTitle}>Course Map Insight</Text>
            <Text style={styles.infoModalText}>
              Each AVG badge shows your all-time scoring average for that hole. Colors highlight how far the average is from par.
            </Text>
            <View style={styles.infoLegend}>
              <View style={styles.infoLegendItem}>
                <View style={[styles.infoLegendBadge, styles.holeAverageGood]}>
                  <Text style={styles.infoLegendBadgeText}>AVG ±0</Text>
                </View>
                <Text style={styles.infoLegendLabel}>At or near par (≤ +0.1)</Text>
              </View>
              <View style={styles.infoLegendItem}>
                <View style={[styles.infoLegendBadge, styles.holeAverageCaution]}>
                  <Text style={styles.infoLegendBadgeText}>AVG +1</Text>
                </View>
                <Text style={styles.infoLegendLabel}>Bogey range (+0.1 to +1.5)</Text>
              </View>
              <View style={styles.infoLegendItem}>
                <View style={[styles.infoLegendBadge, styles.holeAverageDanger]}>
                  <Text style={styles.infoLegendBadgeText}>AVG +2</Text>
                </View>
                <Text style={styles.infoLegendLabel}>Double bogey or worse (≥ +1.5)</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setShowCourseMapInfo(false)}
              style={styles.infoModalCloseButton}
            >
              <Text style={styles.infoModalCloseText}>Got it</Text>
            </TouchableOpacity>
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
    position: 'relative',
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statChevron: {
    position: 'absolute',
    right: 8,
    bottom: 14,
    opacity: 0.85,
  },
  contentCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    marginBottom: 16,
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
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overlayHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 94,
    zIndex: 10,
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 42,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    // Lift the sheet slightly into the hero so rounded corners reveal image behind
    marginTop: -16,
    paddingTop: 16,
    zIndex: 2,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  fixedImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '115%',
    marginLeft: '-7.5%',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  infoButton: {
    padding: 6,
  },
  holesContainer: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  holeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  holeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
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
  holeMetaText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    color: colors.text,
  },
  holeAverageBadge: {
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  holeAverageBadgeText: {
    color: colors.card,
    fontWeight: '600',
  },
  holeAverageGood: {
    backgroundColor: colors.success,
  },
  holeAverageCaution: {
    backgroundColor: colors.warning,
  },
  holeAverageDanger: {
    backgroundColor: colors.error,
  },
  holeAverageNeutral: {
    backgroundColor: colors.inactive,
  },
  infoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  infoModalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    width: '100%',
  },
  infoModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  infoModalText: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 16,
  },
  infoLegend: {
    marginBottom: 16,
  },
  infoLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoLegendBadge: {
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginRight: 10,
  },
  infoLegendBadgeText: {
    color: colors.card,
    fontWeight: '600',
  },
  infoLegendLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  infoModalCloseButton: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  infoModalCloseText: {
    color: colors.card,
    fontWeight: '600',
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
