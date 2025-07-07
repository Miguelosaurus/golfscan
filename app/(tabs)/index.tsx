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
import { Settings, User, Edit3, Crown, ArrowDown } from 'lucide-react-native';
import { Round } from '@/types';
import Svg, { Path } from 'react-native-svg';

export default function HomeScreen() {
  const router = useRouter();
  const { rounds, courses, addCourse, players, updatePlayer } = useGolfStore();
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
  const averageScore = totalRounds > 0 
    ? Math.round(userRounds.reduce((sum, round) => {
        const userPlayer = round.players.find(p => p.playerId === currentUser?.id);
        return sum + (userPlayer?.totalScore || 0);
      }, 0) / totalRounds)
    : 0;
  
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
  
  const recentRounds = userRounds.slice(0, 3).map(getRoundWithWinStatus);
  
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
          {item.userWon && (
            <View style={styles.crownContainer}>
              <Crown size={20} color="#FFD700" fill="#FFD700" />
            </View>
          )}
          <View style={styles.scoreOverlay}>
            <Text style={styles.scoreText}>Total</Text>
            <Text style={styles.scoreValue}>{userPlayer?.totalScore || 0}</Text>
          </View>
        </View>
        
        <View style={styles.roundInfo}>
          <Text style={styles.roundCourse}>{item.courseName}</Text>
          <Text style={styles.roundLocation}>{course?.location || 'Unknown Location'}</Text>
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
          <User size={24} color={colors.text} />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>GolfScan AI</Text>
        
        <TouchableOpacity 
          style={styles.headerButton}
          onPress={navigateToSettings}
        >
          <Settings size={24} color={colors.text} />
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
            <Text style={styles.statValue}>{averageScore || 0}</Text>
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
          <View style={styles.statBox}>
            <View style={styles.handicapContainer}>
              <Text style={styles.statValue}>{userHandicap.toFixed(1)}</Text>
              <Edit3 size={16} color={colors.text} style={styles.editIcon} />
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
          />
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No rounds yet</Text>
            <Text style={styles.emptyMessage}>
              Scan your scorecard with AI to add your scores and get your round summary
            </Text>
            <CurvedArrow />
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
    paddingTop: 60,
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
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
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
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  statItem: {
    alignItems: 'center',
  },
  statBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 8,
    minWidth: 80,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
    letterSpacing: 0.5,
  },
  handicapContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editIcon: {
    marginLeft: 4,
  },
  roundsSection: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  roundsList: {
    paddingBottom: 140,
  },
  roundCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    padding: 16,
  },
  roundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  roundTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  roundArrow: {
    fontSize: 20,
    color: colors.text,
  },
  roundImageContainer: {
    position: 'relative',
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  roundImage: {
    width: '100%',
    height: '100%',
  },
  crownContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 6,
  },
  scoreOverlay: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    minWidth: 50,
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
  roundInfo: {
    alignItems: 'flex-start',
  },
  roundCourse: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  roundLocation: {
    fontSize: 14,
    color: colors.text,
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