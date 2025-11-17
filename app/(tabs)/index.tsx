import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  Alert
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useGolfStore } from '@/store/useGolfStore';
import { RoundCard } from '@/components/RoundCard';
import { mockCourses } from '@/mocks/courses';
import { Settings, User, Edit3, Crown, ArrowDown, Flag } from 'lucide-react-native';
import { Round } from '@/types';
import { calculateAverageScoreWithHoleAdjustment } from '@/utils/helpers';
import Svg, { Path, Circle } from 'react-native-svg';

export default function HomeScreen() {
  const router = useRouter();
  const { rounds, courses, addCourse, players, updatePlayer, activeScanJob, clearActiveScanJob, updateActiveScanJob } = useGolfStore();
  const [showHandicapModal, setShowHandicapModal] = useState(false);
  const [handicapInput, setHandicapInput] = useState('');
  const [ghinInput, setGhinInput] = useState('');
  
  // Add mock courses on first load if no courses exist
  useEffect(() => {
    if (courses.length === 0) {
      mockCourses.forEach(course => {
        addCourse(course);
      });
    }
  }, []);
  
  // Get current user
  const currentUser = players.find(p => p.isUser);
  
  // Calculate user stats
  const userRounds = rounds.filter(round => 
    round.players.some(player => player.playerId === currentUser?.id)
  );
  
    const totalRounds = userRounds.length;
  
  // Calculate average score with proper 9-hole vs 18-hole adjustment
  const averageScore = totalRounds > 0 ? 
    calculateAverageScoreWithHoleAdjustment(
      userRounds.map(round => {
        const userPlayer = round.players.find(p => p.playerId === currentUser?.id);
        const course = courses.find(c => c.id === round.courseId);
        return {
          round,
          playerData: userPlayer!,
          course
        };
      }).filter(item => item.playerData) // Filter out any rounds without user data
    ) : 0;
  
  const userHandicap = currentUser?.handicap || 0;
  
  // Check if user won each round
  const getRoundWithWinStatus = (round: Round) => {
    if (!currentUser) return { ...round, userWon: false };
    
    const userPlayer = round.players.find(p => p.playerId === currentUser.id);
    if (!userPlayer) return { ...round, userWon: false };
    
    // Check if user has the lowest score
    const lowestScore = Math.min(...round.players.map(p => p.totalScore));
    const userWon = userPlayer.totalScore === lowestScore;
    
    return { ...round, userWon };
  };
  
  const recentRounds = userRounds
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)
    .map(getRoundWithWinStatus);

  const scanJob = activeScanJob;
  const hasActiveScanCard = !!scanJob && (
    scanJob.status === 'processing' ||
    scanJob.status === 'error' ||
    scanJob.requiresReview
  );

  useEffect(() => {
    if (scanJob?.requiresReview && !scanJob.autoReviewLaunched) {
      updateActiveScanJob({ autoReviewLaunched: true });
      router.push('/scan-scorecard?review=1');
    }
  }, [scanJob?.requiresReview, scanJob?.autoReviewLaunched, updateActiveScanJob, router]);

  const ProgressRing = ({
    percentage,
    status,
  }: {
    percentage: number;
    status: 'processing' | 'complete' | 'error';
  }) => {
    const size = 64;
    const strokeWidth = 6;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.min(100, Math.max(0, Math.round(percentage)));
    const ratio = status === 'processing' ? clamped / 100 : status === 'complete' ? 1 : 0;
    const strokeDashoffset = circumference - ratio * circumference;
    const ringColor = status === 'error' ? colors.error : status === 'complete' ? colors.success : colors.primary;
    const label = status === 'error'
      ? '!'
      : status === 'complete'
        ? 'Done'
        : `${clamped}%`;

    return (
      <View style={styles.scanCardProgressWrapper}>
        <Svg width={size} height={size}>
          <Circle
            stroke="rgba(255,255,255,0.2)"
            fill="transparent"
            strokeWidth={strokeWidth}
            cx={size / 2}
            cy={size / 2}
            r={radius}
          />
          <Circle
            stroke={ringColor}
            fill="transparent"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={status === 'error' ? circumference : strokeDashoffset}
            cx={size / 2}
            cy={size / 2}
            r={radius}
          />
        </Svg>
        <Text style={[styles.scanCardProgressLabel, status === 'error' && styles.scanCardProgressLabelError]}>
          {label}
        </Text>
      </View>
    );
  };

  const renderActiveScanCard = () => {
    if (!scanJob) return null;

    const isProcessing = scanJob.status === 'processing';
    const isError = scanJob.status === 'error';
    const isReady = !isProcessing && !isError && scanJob.requiresReview;
    const status: 'processing' | 'complete' | 'error' = isError ? 'error' : isReady ? 'complete' : 'processing';
    const message = scanJob.message || (isReady ? 'Ready for review' : 'Processing your scorecard...');
    const subtext = isProcessing
      ? "We'll notify you when done."
      : isError
        ? 'Tap to try again.'
        : 'Tap to review and save your round.';

    const handlePress = () => {
      if (isProcessing) return;
      if (isError) {
        clearActiveScanJob();
        router.push('/scan-scorecard');
        return;
      }
      router.push('/scan-scorecard?review=1');
    };

    return (
      <TouchableOpacity
        style={[styles.scanCard, isProcessing && styles.scanCardDisabled]}
        activeOpacity={0.85}
        onPress={handlePress}
        disabled={isProcessing}
      >
        <View style={styles.scanCardImageWrapper}>
          {scanJob.thumbnailUri ? (
            <Image source={{ uri: scanJob.thumbnailUri }} style={styles.scanCardImage} />
          ) : (
            <View style={[styles.scanCardImage, styles.scanCardImagePlaceholder]}>
              <Flag size={24} color={colors.inactive} />
            </View>
          )}
          <View style={styles.scanCardDimmer} />
          <View style={styles.scanCardProgressOverlay}>
            <ProgressRing percentage={scanJob.progress ?? 0} status={status} />
          </View>
        </View>

        <View style={styles.scanCardInfo}>
          <Text style={styles.scanCardTitle} numberOfLines={1}>
            {isProcessing ? 'Processing scorecard…' : isError ? 'Scan failed' : 'Ready to review'}
          </Text>
          <Text style={styles.scanCardMessage} numberOfLines={2}>
            {message}
          </Text>
          <Text style={isReady ? styles.scanCardSubtextAction : styles.scanCardSubtext} numberOfLines={1}>
            {subtext}
          </Text>
          <View style={styles.scanCardSkeletonRow}>
            <View style={styles.scanCardSkeletonBlock} />
            <View style={styles.scanCardSkeletonBlockShort} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const navigateToScanScorecard = () => {
    router.push('/scan-scorecard');
  };
  
  const navigateToRoundDetails = (roundId: string) => {
    router.push(`/round/${roundId}`);
  };

  const navigateToProfile = () => {
    router.push('/profile');
  };

  const navigateToSettings = () => {
    router.push('/settings');
  };
  
  const handleEditHandicap = () => {
    setHandicapInput(userHandicap.toString());
    setGhinInput('');
    setShowHandicapModal(true);
  };
  
  const handleSaveHandicap = () => {
    if (!currentUser) return;
    
    const newHandicap = parseFloat(handicapInput);
    if (isNaN(newHandicap)) {
      Alert.alert('Error', 'Please enter a valid handicap');
      return;
    }
    
    updatePlayer({
      ...currentUser,
      handicap: newHandicap
    });
    
    setShowHandicapModal(false);
    Alert.alert('Success', 'Handicap updated successfully');
  };
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  };
  
  const renderRoundItem = ({ item }: { item: Round & { userWon: boolean } }) => {
    const course = courses.find(c => c.id === item.courseId);
    const userPlayer = item.players.find(p => p.playerId === currentUser?.id);
    
    return (
      <TouchableOpacity 
        style={styles.roundCard}
        onPress={() => navigateToRoundDetails(item.id)}
      >
        <View style={styles.roundHeader}>
          <Text style={styles.roundTitle}>Game {formatDate(item.date)}</Text>
          <Text style={styles.roundArrow}>›</Text>
        </View>
        
        <View style={styles.roundImageContainer}>
          <Image 
            source={{ uri: course?.imageUrl || 'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80' }}
            style={styles.roundImage}
          />
          <View style={styles.roundImageDimmer} />
          {item.userWon && (
            <View style={styles.crownContainer}>
              <Crown size={20} color="#FFD700" fill="#FFD700" />
            </View>
          )}
          <View style={styles.scoreOverlay}>
            <Text style={styles.scoreText}>Total</Text>
            <Text style={styles.scoreValue}>{userPlayer?.totalScore || 0}</Text>
          </View>
          {/* Overlay course info on image */}
          <View style={styles.roundInfoOverlay}>
            <Text style={styles.roundLocationOnImage} numberOfLines={1}>
              {course?.location || 'Unknown Location'}
            </Text>
            <Text style={styles.roundCourseOnImage} numberOfLines={1}>
              {item.courseName}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };
  
  // Curved arrow component for empty state
  const CurvedArrow = () => (
    <View style={styles.curvedArrowContainer}>
      <Svg width="120" height="80" viewBox="0 0 120 80">
        <Path
          d="M20 20 Q 60 60, 100 40"
          stroke={colors.primary}
          strokeWidth="2"
          strokeDasharray="5,5"
          fill="none"
        />
        <Path
          d="M95 35 L 100 40 L 95 45"
          stroke={colors.primary}
          strokeWidth="2"
          fill="none"
        />
      </Svg>
    </View>
  );
  
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerButton}
          onPress={navigateToProfile}
        >
          <User size={26} color={colors.text} />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>ScanCaddie</Text>
        
        <TouchableOpacity 
          style={styles.headerButton}
          onPress={navigateToSettings}
        >
          <Settings size={26} color={colors.text} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.profileSection}>
        <View style={styles.avatarContainer}>
          {currentUser?.photoUrl ? (
            <Image source={{ uri: currentUser.photoUrl }} style={{ width: 80, height: 80, borderRadius: 40 }} />
          ) : (
            <Text style={styles.avatarText}>{currentUser?.name?.charAt(0) || 'G'}</Text>
          )}
        </View>
        
        <Text style={styles.userName}>{currentUser?.name || 'Golf Player'}</Text>
      </View>
      
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{(averageScore || 0).toFixed(1)}</Text>
          </View>
          <Text style={styles.statLabel}>AVG SCORE</Text>
        </View>
        
        <View style={styles.statItem}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{totalRounds}</Text>
          </View>
          <Text style={styles.statLabel}>ROUNDS</Text>
        </View>
        
        <TouchableOpacity style={styles.statItem} onPress={handleEditHandicap}>
          <View style={[styles.statBox, styles.statBoxInteractive]}>
            <Text style={styles.statValue}>{userHandicap.toFixed(1)}</Text>
            <View style={styles.statEditBadge}>
              <Edit3 size={14} color={colors.text} />
            </View>
          </View>
          <Text style={styles.statLabel}>HANDICAP</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.roundsSection}>
        <Text style={styles.sectionTitle}>My rounds</Text>
        
        {recentRounds.length > 0 ? (
          <FlatList
            data={recentRounds}
            renderItem={renderRoundItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.roundsList}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={hasActiveScanCard ? renderActiveScanCard : null}
            ListHeaderComponentStyle={hasActiveScanCard ? styles.scanCardHeader : undefined}
          />
        ) : (
          <View style={styles.emptyWrapper}>
            {hasActiveScanCard && (
              <View style={styles.scanCardHeader}>{renderActiveScanCard()}</View>
            )}
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No rounds yet</Text>
              <Text style={styles.emptyMessage}>
                Scan your scorecard with AI to add your scores and get your round summary
              </Text>
              <CurvedArrow />
            </View>
          </View>
        )}
      </View>
      
      <Modal
        visible={showHandicapModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHandicapModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Handicap</Text>
            
            <Text style={styles.inputLabel}>Handicap Index</Text>
            <TextInput
              style={styles.input}
              value={handicapInput}
              onChangeText={setHandicapInput}
              placeholder="Enter handicap"
              keyboardType="decimal-pad"
            />
            
            <Text style={styles.inputLabel}>GHIN Number (Optional)</Text>
            <TextInput
              style={styles.input}
              value={ghinInput}
              onChangeText={setGhinInput}
              placeholder="Enter GHIN number"
              keyboardType="number-pad"
            />
            
            <Text style={styles.ghinNote}>
              Link your GHIN account to automatically sync your official handicap
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowHandicapModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveHandicap}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
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
    paddingTop: 74,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarContainer: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.card,
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    marginBottom: 28,
  },
  statItem: {
    alignItems: 'center',
  },
  statBox: {
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingVertical: 18,
    paddingHorizontal: 14,
    marginBottom: 8,
    minWidth: 72,
    minHeight: 64,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 2,
  },
  statBoxInteractive: {
    position: 'relative',
  },
  statValue: {
    fontSize: 23,
    fontWeight: '700',
    color: colors.text,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
    letterSpacing: 1.0,
    includeFontPadding: false,
  },
  handicapContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editIcon: {
    marginLeft: 4,
  },
  statEditBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E6EAE9',
    zIndex: 2,
    // Let taps pass through to the stat box
    pointerEvents: 'none',
  },
  roundsSection: {
    flex: 1,
    paddingHorizontal: 12,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 22,
  },
  roundsList: {
    paddingBottom: 160,
  },
  scanCardHeader: {
    marginBottom: 16,
  },
  scanCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  scanCardDisabled: {
    opacity: 0.85,
  },
  scanCardImageWrapper: {
    width: 80,
    height: 80,
    borderRadius: 16,
    overflow: 'hidden',
    marginRight: 16,
    backgroundColor: '#e0e0e0',
  },
  scanCardImage: {
    width: '100%',
    height: '100%',
    opacity: 0.35,
  },
  scanCardImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanCardDimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  scanCardProgressOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanCardInfo: {
    flex: 1,
  },
  scanCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  scanCardMessage: {
    fontSize: 14,
    color: colors.text,
    opacity: 0.8,
    marginBottom: 6,
  },
  scanCardSubtext: {
    fontSize: 12,
    color: colors.inactive,
    marginBottom: 12,
  },
  scanCardSubtextAction: {
    fontSize: 12,
    color: colors.primary,
    marginBottom: 12,
    fontWeight: '600',
  },
  scanCardSkeletonRow: {
    flexDirection: 'row',
  },
  scanCardSkeletonBlock: {
    height: 8,
    flex: 1,
    backgroundColor: '#E6E6E6',
    borderRadius: 4,
    marginRight: 8,
  },
  scanCardSkeletonBlockShort: {
    width: 60,
    height: 8,
    backgroundColor: '#E6E6E6',
    borderRadius: 4,
  },
  scanCardProgressWrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanCardProgressLabel: {
    position: 'absolute',
    fontSize: 13,
    fontWeight: '600',
    color: colors.card,
  },
  scanCardProgressLabelError: {
    color: colors.error,
  },
  roundCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    marginBottom: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E6EAE9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  roundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  roundTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    includeFontPadding: false,
    lineHeight: 20,
  },
  roundArrow: {
    fontSize: 20,
    color: colors.text,
  },
  roundImageContainer: {
    position: 'relative',
    height: 188,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 0,
  },
  roundImage: {
    width: '100%',
    height: '100%',
  },
  roundImageDimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  crownContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 6,
  },
  roundBottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  scoreOverlay: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    minWidth: 50,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  scoreText: {
    fontSize: 10,
    color: colors.text,
    fontWeight: '500',
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  roundInfoOverlay: {
    position: 'absolute',
    left: 12,
    bottom: 18,
    right: 100,
  },
  roundCourseOnImage: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ECEFEA',
    marginBottom: 0,
  },
  roundLocationOnImage: {
    fontSize: 13,
    color: '#ECEFEA',
    fontWeight: '700',
  },
  emptyWrapper: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  curvedArrowContainer: {
    marginTop: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
    backgroundColor: colors.background,
  },
  ghinNote: {
    fontSize: 12,
    color: colors.text,
    marginBottom: 24,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: colors.background,
    marginRight: 8,
  },
  saveButton: {
    backgroundColor: colors.primary,
    marginLeft: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.card,
  },
});
