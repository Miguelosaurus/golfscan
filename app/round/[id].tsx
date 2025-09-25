import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  Alert,
  Image,
  Modal
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useGolfStore } from '@/store/useGolfStore';
import { Button } from '@/components/Button';
import { getScoreDifferential, getScoreLabel, calculateNetScore } from '@/utils/helpers';
import { Calendar, MapPin, Award, Trash2, Target, Zap, TrendingDown, User, Pencil } from 'lucide-react-native';

export default function RoundDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { rounds, courses, deleteRound, players } = useGolfStore();
  
  const round = rounds.find(r => r.id === id);
  
  if (!round) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Round not found</Text>
        <Button 
          title="Go Back" 
          onPress={() => router.back()} 
          style={styles.errorButton}
        />
      </SafeAreaView>
    );
  }
  
  let course = courses.find(c => c.id === round.courseId);
  if (!course) {
    course = {
      id: round.courseId,
      name: round.courseName,
      location: "Unknown location",
      holes: Array.from({ length: 18 }, (_, i) => ({
        number: i + 1,
        par: 4,
        distance: 0,
      })),
    } as any; // satisfies Course type
  }
  
  const totalPar = course ? course.holes.reduce((sum, hole) => sum + hole.par, 0) : 0;
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };
  
  const getWinner = () => {
    if (round.players.length <= 1) return null;
    
    // First try to find winner based on net score (if handicaps are available)
    const playersWithHandicap = round.players.filter(p => p.handicapUsed !== undefined);
    
    if (playersWithHandicap.length > 0) {
      // Calculate net scores and find the lowest
      const playersWithNetScores = playersWithHandicap.map(player => ({
        ...player,
        netScore: calculateNetScore(player.totalScore, player.handicapUsed)
      }));
      
      return playersWithNetScores.reduce((best, current) => 
        (current.netScore < best.netScore) ? current : best
      );
    }
    
    // If no handicaps, use gross scores
    return round.players.reduce((best, current) => 
      best.totalScore < current.totalScore ? best : current
    );
  };
  
  const calculateStats = () => {
    if (!course) return null;
    
    const stats = round.players.map(player => {
      const scores = player.scores;
      
      // Count birdies, pars, bogeys, etc.
      let birdies = 0;
      let eagles = 0;
      let pars = 0;
      let bogeys = 0;
      let doubleBogeys = 0;
      let worseThanDouble = 0;
      
      // Front 9 and back 9 scores
      let front9Score = 0;
      let back9Score = 0;
      
      // Best and worst holes
      let bestHole = { holeNumber: 0, relativeToPar: 0 };
      let worstHole = { holeNumber: 0, relativeToPar: 0 };
      
      // GIR and fairways hit (if available)
      let greenInRegulation = 0;
      let fairwaysHit = 0;
      let fairwaysTotal = 0;
      
      // Putts (if available)
      let totalPutts = 0;
      let puttsTracked = false;
      
      scores.forEach(score => {
        const hole = course.holes.find(h => h.number === score.holeNumber);
        if (!hole) return;
        
        const relativeToPar = score.strokes - hole.par;
        
        // Update best/worst holes
        if (bestHole.holeNumber === 0 || relativeToPar < bestHole.relativeToPar) {
          bestHole = { holeNumber: score.holeNumber, relativeToPar };
        }
        
        if (worstHole.holeNumber === 0 || relativeToPar > worstHole.relativeToPar) {
          worstHole = { holeNumber: score.holeNumber, relativeToPar };
        }
        
        // Count score types
        if (relativeToPar <= -2) eagles++;
        else if (relativeToPar === -1) birdies++;
        else if (relativeToPar === 0) pars++;
        else if (relativeToPar === 1) bogeys++;
        else if (relativeToPar === 2) doubleBogeys++;
        else if (relativeToPar > 2) worseThanDouble++;
        
        // Add to front 9 or back 9
        if (score.holeNumber <= 9) {
          front9Score += score.strokes;
        } else {
          back9Score += score.strokes;
        }
        
        // Track GIR and fairways if available
        if (score.greenInRegulation) greenInRegulation++;
        
        if (score.fairwayHit !== undefined) {
          if (hole.par > 3) { // Only count fairways on par 4s and 5s
            fairwaysTotal++;
            if (score.fairwayHit) fairwaysHit++;
          }
        }
        
        // Track putts if available
        if (score.putts !== undefined) {
          puttsTracked = true;
          totalPutts += score.putts;
        }
      });
      
      // Calculate net score if handicap is available
      const netScore = player.handicapUsed !== undefined 
        ? calculateNetScore(player.totalScore, player.handicapUsed)
        : undefined;
      
      return {
        playerId: player.playerId,
        playerName: player.playerName,
        totalScore: player.totalScore,
        handicap: player.handicapUsed,
        netScore,
        birdies,
        eagles,
        pars,
        bogeys,
        doubleBogeys,
        worseThanDouble,
        front9Score,
        back9Score,
        bestHole,
        worstHole,
        greenInRegulation,
        fairwaysHit,
        fairwaysTotal,
        totalPutts,
        puttsTracked
      };
    });
    
    return stats;
  };
  
  const winner = getWinner();
  const playerStats = calculateStats();
  
  const handleDeleteRound = () => {
    Alert.alert(
      "Delete Round",
      "Are you sure you want to delete this round? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteRound(round.id);
            router.replace('/history');
          }
        }
      ]
    );
  };
  
  const displayName = course ? course.name : round.courseName;
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  const handleEditRound = () => {
    // Navigate to scan-scorecard in edit mode with prefilled data
    const prefilled = {
      courseId: round.courseId,
      players: round.players.map(p => ({
        id: p.playerId,
        name: p.playerName,
        scores: p.scores
      })),
      date: round.date,
      notes: round.notes || ''
    };
    // Replace current details screen with edit summary to avoid stacking multiple details screens after save
    router.replace({ pathname: '/scan-scorecard', params: { editRoundId: round.id, prefilled: JSON.stringify(prefilled) } });
  };
  
  // Helper to get player name and photo
  const getPlayerInfo = (playerId: string, fallbackName: string) => {
    const player = players.find(p => p.id === playerId);
    return {
      name: player?.name || fallbackName,
      photoUrl: player?.photoUrl,
    };
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen 
        options={{ 
          title: "Round Details",
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTitleStyle: {
            color: colors.text,
          },
          headerTintColor: colors.text,
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity 
                onPress={handleEditRound}
                style={styles.iconButton}
              >
                <Pencil size={20} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleDeleteRound}
                style={styles.iconButton}
              >
                <Trash2 size={20} color={colors.error} />
              </TouchableOpacity>
            </View>
          )
        }} 
      />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.courseName}>{displayName}</Text>
          
          <View style={styles.dateContainer}>
            <Calendar size={16} color={colors.text} />
            <Text style={styles.date}>{formatDate(round.date)}</Text>
          </View>
          
          {course && (
            <View style={styles.locationContainer}>
              <MapPin size={16} color={colors.text} />
              <Text style={styles.location}>{course.location}</Text>
            </View>
          )}
        </View>
        
        {winner && (
          <View style={styles.winnerContainer}>
            <View style={styles.winnerHeader}>
              <Award size={20} color="#FFD700" />
              <Text style={styles.winnerTitle}>Winner</Text>
            </View>
            {(() => {
              const { name } = getPlayerInfo(winner.playerId, winner.playerName);
              return <Text style={styles.winnerName}>{name}</Text>;
            })()}
            
            {winner.netScore !== undefined && winner.handicapUsed !== undefined ? (
              <View>
                <Text style={styles.winnerScore}>
                  Gross Score: {winner.totalScore} 
                  {totalPar > 0 && ` (${getScoreLabel(getScoreDifferential(winner.totalScore, totalPar))})`}
                </Text>
                <Text style={styles.winnerNetScore}>
                  Net Score: {winner.netScore} (Handicap: {winner.handicapUsed})
                </Text>
              </View>
            ) : (
              <Text style={styles.winnerScore}>
                Score: {winner.totalScore} 
                {totalPar > 0 && ` (${getScoreLabel(getScoreDifferential(winner.totalScore, totalPar))})`}
              </Text>
            )}
          </View>
        )}
        
        {playerStats && playerStats.map((stats, index) => {
          const { name, photoUrl } = getPlayerInfo(stats.playerId, stats.playerName);
          return (
            <View key={stats.playerId} style={styles.playerStatsCard}>
              <TouchableOpacity 
                style={styles.playerNameContainer}
                onPress={() => router.push(`/player/${stats.playerId}`)}
              >
                {photoUrl ? (
                  <Image source={{ uri: photoUrl }} style={styles.playerIcon} />
                ) : (
                  <Text style={styles.playerIcon}>{name.charAt(0)}</Text>
                )}
                <Text style={styles.playerStatsName}>{name}</Text>
              </TouchableOpacity>
              
              <View style={styles.scoreOverview}>
                <View style={styles.scoreItem}>
                  <Text style={styles.scoreLabel}>Gross</Text>
                  <Text style={styles.scoreValue}>{stats.totalScore}</Text>
                </View>
                
                {stats.netScore !== undefined && stats.handicap !== undefined && (
                  <View style={styles.scoreItem}>
                    <Text style={styles.scoreLabel}>Net</Text>
                    <Text style={styles.scoreValue}>{stats.netScore}</Text>
                  </View>
                )}
                
                {stats.handicap !== undefined && (
                  <View style={styles.scoreItem}>
                    <Text style={styles.scoreLabel}>Handicap</Text>
                    <Text style={styles.scoreValue}>{stats.handicap}</Text>
                  </View>
                )}
                
                {totalPar > 0 && (
                  <View style={styles.scoreItem}>
                    <Text style={styles.scoreLabel}>vs Par</Text>
                    <Text 
                      style={[
                        styles.scoreDiff,
                        stats.totalScore < totalPar ? styles.underPar : 
                        stats.totalScore > totalPar ? styles.overPar : null
                      ]}
                    >
                      {stats.totalScore === totalPar 
                        ? 'Even' 
                        : stats.totalScore < totalPar 
                          ? `-${totalPar - stats.totalScore}` 
                          : `+${stats.totalScore - totalPar}`}
                    </Text>
                  </View>
                )}
                
                <View style={styles.scoreItem}>
                  <Text style={styles.scoreLabel}>Front 9</Text>
                  <Text style={styles.scoreValue}>{stats.front9Score}</Text>
                </View>
                
                <View style={styles.scoreItem}>
                  <Text style={styles.scoreLabel}>Back 9</Text>
                  <Text style={styles.scoreValue}>{stats.back9Score}</Text>
                </View>
              </View>
              
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <View style={styles.statIconContainer}>
                    <Zap size={16} color="#FFD700" />
                  </View>
                  <Text style={styles.statValue}>{stats.eagles}</Text>
                  <Text style={styles.statLabel}>Eagles</Text>
                </View>
                
                <View style={styles.statBox}>
                  <View style={styles.statIconContainer}>
                    <Target size={16} color={colors.success} />
                  </View>
                  <Text style={styles.statValue}>{stats.birdies}</Text>
                  <Text style={styles.statLabel}>Birdies</Text>
                </View>
                
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{stats.pars}</Text>
                  <Text style={styles.statLabel}>Pars</Text>
                </View>
                
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{stats.bogeys}</Text>
                  <Text style={styles.statLabel}>Bogeys</Text>
                </View>
                
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{stats.doubleBogeys}</Text>
                  <Text style={styles.statLabel}>Doubles</Text>
                </View>
                
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{stats.worseThanDouble}</Text>
                  <Text style={styles.statLabel}>Worse</Text>
                </View>
              </View>
              
              {stats.puttsTracked && (
                <View style={styles.additionalStatsContainer}>
                  <Text style={styles.additionalStatsTitle}>Additional Stats</Text>
                  <View style={styles.additionalStatsRow}>
                    <View style={styles.additionalStatItem}>
                      <Text style={styles.additionalStatValue}>{stats.totalPutts}</Text>
                      <Text style={styles.additionalStatLabel}>Total Putts</Text>
                    </View>
                    
                    <View style={styles.additionalStatItem}>
                      <Text style={styles.additionalStatValue}>{(stats.totalPutts / 18).toFixed(1)}</Text>
                      <Text style={styles.additionalStatLabel}>Putts/Hole</Text>
                    </View>
                  </View>
                </View>
              )}
              
              {stats.fairwaysTotal > 0 && (
                <View style={styles.additionalStatsContainer}>
                  <View style={styles.additionalStatsRow}>
                    <View style={styles.additionalStatItem}>
                      <Text style={styles.additionalStatValue}>{stats.fairwaysHit}/{stats.fairwaysTotal}</Text>
                      <Text style={styles.additionalStatLabel}>Fairways Hit</Text>
                    </View>
                    
                    <View style={styles.additionalStatItem}>
                      <Text style={styles.additionalStatValue}>
                        {Math.round((stats.fairwaysHit / stats.fairwaysTotal) * 100)}%
                      </Text>
                      <Text style={styles.additionalStatLabel}>Fairway %</Text>
                    </View>
                    
                    <View style={styles.additionalStatItem}>
                      <Text style={styles.additionalStatValue}>{stats.greenInRegulation}/18</Text>
                      <Text style={styles.additionalStatLabel}>GIR</Text>
                    </View>
                  </View>
                </View>
              )}
              
              <View style={styles.bestWorstContainer}>
                <View style={styles.bestHoleContainer}>
                  <View style={styles.bestHoleHeader}>
                    <TrendingDown size={16} color={colors.success} />
                    <Text style={styles.bestHoleTitle}>Best Hole</Text>
                  </View>
                  <Text style={styles.bestHoleText}>
                    Hole {stats.bestHole.holeNumber}: {stats.bestHole.relativeToPar < 0 ? stats.bestHole.relativeToPar : 'Even'}
                  </Text>
                </View>
                
                <View style={styles.worstHoleContainer}>
                  <View style={styles.worstHoleHeader}>
                    <TrendingDown size={16} color={colors.error} style={{ transform: [{ rotate: '180deg' }] }} />
                    <Text style={styles.worstHoleTitle}>Worst Hole</Text>
                  </View>
                  <Text style={styles.worstHoleText}>
                    Hole {stats.worstHole.holeNumber}: +{stats.worstHole.relativeToPar}
                  </Text>
                </View>
              </View>
              
              <View style={styles.scoreDetailsHeader}>
                <Text style={styles.scoreDetailsTitle}>Hole by Hole</Text>
              </View>
              
              <View style={styles.holeScores}>
                {stats.playerId === round.players[index].playerId && 
                  round.players[index].scores.map(score => {
                    const hole = course?.holes.find(h => h.number === score.holeNumber);
                    const relativeToPar = hole ? score.strokes - hole.par : 0;
                    
                    return (
                      <View key={score.holeNumber} style={styles.holeScore}>
                        <Text style={styles.holeNumber}>Hole {score.holeNumber}</Text>
                        <Text 
                          style={[
                            styles.holeScoreValue,
                            relativeToPar < 0 ? styles.underPar : 
                            relativeToPar > 0 ? styles.overPar : null
                          ]}
                        >
                          {score.strokes}
                        </Text>
                      </View>
                    );
                  })
                }
              </View>
            </View>
          );
        })}
        
        {round.notes && (
          <View style={styles.notesContainer}>
            <Text style={styles.notesTitle}>Notes</Text>
            <Text style={styles.notesText}>{round.notes}</Text>
          </View>
        )}

        {Array.isArray((round as any).scorecardPhotos) && (round as any).scorecardPhotos.length > 0 && (
          <View style={[styles.notesContainer, { marginTop: 16 }]}> 
            <Text style={styles.notesTitle}>Scorecard Photos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {(round as any).scorecardPhotos.map((uri: string, idx: number) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.photoThumb}
                  onPress={() => { setActivePhoto(uri); setPhotoModalVisible(true); }}
                >
                  <Image source={{ uri }} style={styles.photoThumbImage} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      <Modal visible={photoModalVisible} transparent animationType="fade" onRequestClose={() => setPhotoModalVisible(false)}>
        <View style={styles.photoModalBackdrop}>
          {activePhoto && (
            <Image source={{ uri: activePhoto }} style={styles.photoModalImage} resizeMode="contain" />
          )}
          <TouchableOpacity style={styles.photoCloseButton} onPress={() => setPhotoModalVisible(false)}>
            <Text style={styles.photoCloseText}>Close</Text>
          </TouchableOpacity>
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
    padding: 16,
    paddingBottom: 24,
  },
  header: {
    marginBottom: 24,
  },
  courseName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  date: {
    fontSize: 16,
    color: colors.text,
    marginLeft: 6,
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
  winnerContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  winnerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  winnerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 8,
  },
  winnerName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  winnerScore: {
    fontSize: 16,
    color: colors.text,
  },
  winnerNetScore: {
    fontSize: 16,
    color: colors.text,
    marginTop: 4,
  },
  playerStatsCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  playerNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  playerIcon: {
    marginRight: 8,
  },
  playerStatsName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  scoreOverview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 16,
  },
  scoreItem: {
    marginRight: 24,
    marginBottom: 8,
  },
  scoreLabel: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  scoreDiff: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  underPar: {
    color: colors.success,
  },
  overPar: {
    color: colors.error,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 16,
  },
  statBox: {
    width: '33%',
    alignItems: 'center',
    marginBottom: 16,
  },
  statIconContainer: {
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text,
  },
  additionalStatsContainer: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 16,
  },
  additionalStatsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  additionalStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  additionalStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  additionalStatValue: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  additionalStatLabel: {
    fontSize: 12,
    color: colors.text,
  },
  bestWorstContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 16,
  },
  bestHoleContainer: {
    flex: 1,
    marginRight: 8,
  },
  bestHoleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  bestHoleTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginLeft: 4,
  },
  bestHoleText: {
    fontSize: 14,
    color: colors.success,
  },
  worstHoleContainer: {
    flex: 1,
    marginLeft: 8,
  },
  worstHoleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  worstHoleTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginLeft: 4,
  },
  worstHoleText: {
    fontSize: 14,
    color: colors.error,
  },
  scoreDetailsHeader: {
    marginBottom: 8,
  },
  scoreDetailsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  holeScores: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  holeScore: {
    width: '33%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingRight: 16,
  },
  holeNumber: {
    fontSize: 14,
    color: colors.text,
  },
  holeScoreValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  notesContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
  },
  notesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  notesText: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 22,
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
  iconButton: {
    padding: 8,
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoThumbImage: {
    width: '100%',
    height: '100%',
  },
  photoModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoModalImage: {
    width: '90%',
    height: '80%',
  },
  photoCloseButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)'
  },
  photoCloseText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});