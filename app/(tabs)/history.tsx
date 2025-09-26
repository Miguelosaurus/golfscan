import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useGolfStore } from '@/store/useGolfStore';
import { RoundCard } from '@/components/RoundCard';
import { CourseCard } from '@/components/CourseCard';
import { EmptyState } from '@/components/EmptyState';
import { Round, Player, PlayerSummary, Course } from '@/types';
import { History, Camera, Search, Users, Flag, Check, X, Link, Edit, Calendar as CalendarIcon } from 'lucide-react-native';

export default function HistoryScreen() {
  const router = useRouter();
  const { rounds, players, courses, updatePlayer, mergePlayerData } = useGolfStore();
  const [roundsSearchQuery, setRoundsSearchQuery] = useState('');
  const [playersSearchQuery, setPlayersSearchQuery] = useState('');
  const [coursesSearchQuery, setCoursesSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'rounds' | 'players' | 'courses'>('rounds');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [datePreset, setDatePreset] = useState<'all' | 'week' | 'month' | 'year' | 'last30' | 'custom'>('all');
  const [customStart, setCustomStart] = useState<string | null>(null); // YYYY-MM-DD
  const [customEnd, setCustomEnd] = useState<string | null>(null);
  
  const withinRange = (dateStr: string): boolean => {
    if (datePreset === 'all') return true;
    const d = new Date(dateStr);
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const last30 = new Date(now);
    last30.setDate(now.getDate() - 30);
    switch (datePreset) {
      case 'week':
        return d >= startOfWeek && d <= now;
      case 'month':
        return d >= startOfMonth && d <= now;
      case 'year':
        return d >= startOfYear && d <= now;
      case 'last30':
        return d >= last30 && d <= now;
      case 'custom':
        if (!customStart || !customEnd) return true;
        return d >= new Date(customStart) && d <= new Date(customEnd);
      default:
        return true;
    }
  };

  const filteredRounds = rounds
    .filter(round => 
      round.courseName.toLowerCase().includes(roundsSearchQuery.toLowerCase()) ||
      round.players.some(player => 
        player.playerName.toLowerCase().includes(roundsSearchQuery.toLowerCase())
      )
    )
    .filter(round => withinRange(round.date))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredCourses = courses.filter(course => 
    course.name.toLowerCase().includes(coursesSearchQuery.toLowerCase()) ||
    course.location.toLowerCase().includes(coursesSearchQuery.toLowerCase())
  );
  
  const navigateToRoundDetails = (roundId: string) => {
    router.push(`/round/${roundId}`);
  };
  
  const navigateToPlayerDetails = (playerId: string) => {
    router.push(`/player/${playerId}`);
  };

  const navigateToCourseDetails = (course: Course) => {
    router.push(`/course/${course.id}`);
  };

  const navigateToAddCourse = () => {
    router.push('/new-course');
  };
  
  const navigateToScanScorecard = () => {
    router.push('/scan-scorecard');
  };
  
  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    setSelectedPlayerIds([]);
  };
  
  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds(prev => 
      prev.includes(playerId) 
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };
  
  const handleMergePlayers = () => {
    if (selectedPlayerIds.length !== 2) {
      Alert.alert('Error', 'Please select exactly 2 players to merge.');
      return;
    }
    
    const playerData = selectedPlayerIds.map(id => getUniquePlayers().find(p => p.id === id)).filter(Boolean);
    if (playerData.length !== 2) return;
    
    Alert.prompt(
      'Merge Players',
      `Enter the final name for merging "${playerData[0]!.name}" and "${playerData[1]!.name}":`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge',
          onPress: (finalName) => {
            if (finalName && finalName.trim()) {
              mergePlayerData(selectedPlayerIds[0], selectedPlayerIds[1], finalName.trim());
              setIsSelectMode(false);
              setSelectedPlayerIds([]);
              Alert.alert('Success', 'Players merged successfully.');
            }
          }
        }
      ],
      'plain-text',
      playerData[0]!.name
    );
  };
  
  const renderRoundItem = ({ item }: { item: Round }) => (
    <RoundCard round={item} onPress={() => navigateToRoundDetails(item.id)} />
  );

  const renderCourseItem = ({ item }: { item: Course }) => (
    <CourseCard course={item} onPress={navigateToCourseDetails} />
  );
  
  const getUniquePlayers = (): PlayerSummary[] => {
    const playerMap = new Map<string, PlayerSummary>();
    
    // Find the user player
    const userPlayer = players.find(p => p.isUser);
    const userId = userPlayer ? userPlayer.id : '';
    
    rounds.forEach(round => {
      round.players.forEach(player => {
        if (!playerMap.has(player.playerId)) {
          playerMap.set(player.playerId, {
            id: player.playerId,
            name: player.playerName,
            roundsPlayed: 1,
            totalScore: player.totalScore,
            isUser: player.playerId === userId,
            handicap: player.handicapUsed
          });
        } else {
          const existingPlayer = playerMap.get(player.playerId);
          if (existingPlayer) {
            playerMap.set(player.playerId, {
              ...existingPlayer,
              roundsPlayed: existingPlayer.roundsPlayed + 1,
              totalScore: existingPlayer.totalScore + player.totalScore,
              handicap: player.handicapUsed || existingPlayer.handicap
            });
          }
        }
      });
    });
    
    // Sort players: user first, then alphabetically
    return Array.from(playerMap.values()).sort((a, b) => {
      if (a.isUser && !b.isUser) return -1;
      if (!a.isUser && b.isUser) return 1;
      return a.name.localeCompare(b.name);
    });
  };
  
  const filteredPlayers = getUniquePlayers().filter(playerSummary =>
    playerSummary.name.toLowerCase().includes(playersSearchQuery.toLowerCase())
  );
  
  const renderPlayerItem = ({ item }: { item: PlayerSummary }) => {
    const player = players.find(p => p.id === item.id);
    const name = player?.name || item.name;
    const photoUrl = player?.photoUrl;
    const isSelected = selectedPlayerIds.includes(item.id);
    
    return (
      <TouchableOpacity 
        style={[
          styles.playerCard, 
          item.isUser && styles.userPlayerCard,
          isSelected && styles.selectedPlayerCard
        ]}
        onPress={() => {
          if (isSelectMode) {
            togglePlayerSelection(item.id);
          } else {
            navigateToPlayerDetails(item.id);
          }
        }}
      >
        {isSelectMode && (
          <View style={styles.selectionIndicator}>
            {isSelected && <Check size={20} color={colors.background} />}
          </View>
        )}
        
        <View style={[styles.playerAvatar, item.isUser && styles.userPlayerAvatar]}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={{ width: 50, height: 50, borderRadius: 25 }} />
          ) : (
            <Text style={styles.playerInitial}>{name.charAt(0)}</Text>
          )}
        </View>
        <View style={styles.playerInfo}>
          <Text style={styles.playerName}>
            {name} {item.isUser && <Text style={styles.userLabel}>(You)</Text>}
          </Text>
          <Text style={styles.playerStats}>
            {item.roundsPlayed} {item.roundsPlayed === 1 ? 'round' : 'rounds'} played
          </Text>
          {item.handicap !== undefined && (
            <Text style={styles.playerHandicap}>Handicap: {item.handicap}</Text>
          )}
        </View>
        <View style={styles.playerScoreContainer}>
          <Text style={styles.playerScoreLabel}>Avg. Score</Text>
          <Text style={styles.playerScore}>
            {Math.round(item.totalScore / item.roundsPlayed)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const getPlaceholder = () => {
    switch (activeTab) {
      case 'rounds':
        return "Search rounds...";
      case 'players':
        return "Search players...";
      case 'courses':
        return "Search courses...";
      default:
        return "Search...";
    }
  };

  const getEmptyState = () => {
    const searchActive =
      (activeTab === 'rounds' && (
        roundsSearchQuery.length > 0 ||
        datePreset !== 'all' ||
        (customStart !== null || customEnd !== null)
      )) ||
      (activeTab === 'players' && playersSearchQuery.length > 0) ||
      (activeTab === 'courses' && coursesSearchQuery.length > 0);

    switch (activeTab) {
      case 'rounds': {
        if (rounds.length === 0) {
          return (
            <EmptyState
              title="No rounds yet"
              message="Start tracking your golf rounds by scanning your scorecard."
              buttonTitle="Scan Scorecard"
              onButtonPress={navigateToScanScorecard}
              icon={<History size={40} color={colors.primary} />}
            />
          );
        }
        // Search/filter empty state
        return (
          <EmptyState
            title="No rounds found"
            icon={<History size={40} color={colors.primary} />}
          />
        );
      }
      case 'players': {
        const hasAnyPlayers = getUniquePlayers().length > 0;
        if (!hasAnyPlayers) {
          return (
            <EmptyState
              title="No players yet"
              message="Start tracking your golf rounds to see player statistics."
              buttonTitle="Scan Scorecard"
              onButtonPress={navigateToScanScorecard}
              icon={<Users size={40} color={colors.primary} />}
            />
          );
        }
        return (
          <EmptyState
            title="No players found"
            icon={<Users size={40} color={colors.primary} />}
          />
        );
      }
      case 'courses': {
        if (courses.length === 0) {
          return (
            <EmptyState
              title="No courses yet"
              message="Add your favorite golf courses to start tracking your rounds."
              buttonTitle="Add Course"
              onButtonPress={navigateToAddCourse}
              icon={<Flag size={40} color={colors.primary} />}
            />
          );
        }
        // Search-empty: keep button, hide message
        return (
          <EmptyState
            title="No courses found"
            buttonTitle="Add Course"
            onButtonPress={navigateToAddCourse}
            icon={<Flag size={40} color={colors.primary} />}
          />
        );
      }
      default:
        return null;
    }
  };

  const getData = () => {
    switch (activeTab) {
      case 'rounds':
        return filteredRounds;
      case 'players':
        return filteredPlayers;
      case 'courses':
        return filteredCourses;
      default:
        return [];
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    switch (activeTab) {
      case 'rounds':
        return renderRoundItem({ item });
      case 'players':
        return renderPlayerItem({ item });
      case 'courses':
        return renderCourseItem({ item });
      default:
        return null;
    }
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'rounds' && styles.activeTab]}
          onPress={() => setActiveTab('rounds')}
        >
          <History size={18} color={activeTab === 'rounds' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'rounds' && styles.activeTabText]}>Rounds</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'players' && styles.activeTab]}
          onPress={() => setActiveTab('players')}
        >
          <Users size={18} color={activeTab === 'players' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'players' && styles.activeTabText]}>Players</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tab, activeTab === 'courses' && styles.activeTab]}
          onPress={() => setActiveTab('courses')}
        >
          <Flag size={18} color={activeTab === 'courses' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'courses' && styles.activeTabText]}>Courses</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.searchContainer}>
        <Search size={20} color={colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder={getPlaceholder()}
          placeholderTextColor={colors.textSecondary}
          value={
            activeTab === 'rounds'
              ? roundsSearchQuery
              : activeTab === 'players'
              ? playersSearchQuery
              : coursesSearchQuery
          }
          onChangeText={(text) => {
            if (activeTab === 'rounds') setRoundsSearchQuery(text);
            else if (activeTab === 'players') setPlayersSearchQuery(text);
            else setCoursesSearchQuery(text);
          }}
        />
        {activeTab === 'rounds' && (
          <TouchableOpacity 
            style={styles.manageInlineButton}
            onPress={() => setShowDateFilter(true)}
          >
            <CalendarIcon size={16} color={colors.primary} />
            <Text style={styles.manageInlineButtonText}>
              {datePreset === 'all' ? 'Dates' :
               datePreset === 'week' ? 'This week' :
               datePreset === 'month' ? 'This month' :
               datePreset === 'year' ? 'This year' :
               datePreset === 'last30' ? 'Last 30d' : 'Custom'}
            </Text>
          </TouchableOpacity>
        )}
        {activeTab === 'players' && getUniquePlayers().length > 1 && (
          <TouchableOpacity 
            style={[styles.manageInlineButton, isSelectMode && styles.manageInlineButtonActive]}
            onPress={toggleSelectMode}
          >
            <Edit size={16} color={isSelectMode ? colors.background : colors.primary} />
            <Text style={[styles.manageInlineButtonText, isSelectMode && styles.manageInlineButtonTextActive]}>
              {isSelectMode ? 'Cancel' : 'Manage'}
            </Text>
          </TouchableOpacity>
        )}
        {activeTab === 'players' && isSelectMode && (
          <TouchableOpacity 
            style={[styles.manageInlineButton, styles.mergeInlineButton, selectedPlayerIds.length < 2 && styles.disabledButton]}
            onPress={handleMergePlayers}
            disabled={selectedPlayerIds.length < 2}
          >
            <Link size={16} color={selectedPlayerIds.length >= 2 ? colors.background : colors.textSecondary} />
            <Text style={[styles.manageInlineButtonText, styles.mergeButtonText, selectedPlayerIds.length < 2 && styles.disabledButtonText]}>
              {`Merge ${selectedPlayerIds.length > 0 ? selectedPlayerIds.length : ''}`.trim()}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      
      <FlatList
        data={getData()}
        renderItem={renderItem}
        keyExtractor={(item, index) => `${activeTab}-${item.id}-${index}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={getEmptyState()}
        ListHeaderComponent={null}
      />
      <Modal visible={showDateFilter} transparent animationType="fade" onRequestClose={() => setShowDateFilter(false)}>
        <View style={styles.dateModalBackdrop}>
          <View style={styles.dateModal}>
            <Text style={styles.dateModalTitle}>Filter by date</Text>
            <View style={styles.datePresetRow}>
              {['all','week','month','year','last30','custom'].map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.presetChip, datePreset === p && styles.presetChipActive]}
                  onPress={() => setDatePreset(p as any)}
                >
                  <Text style={[styles.presetChipText, datePreset === p && styles.presetChipTextActive]}>
                    {p === 'all' ? 'All' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p === 'year' ? 'This Year' : p === 'last30' ? 'Last 30 Days' : 'Custom'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {datePreset === 'custom' && (
              <View style={styles.customRow}>
                <TextInput
                  style={styles.dateInputBox}
                  placeholder="Start YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                  value={customStart || ''}
                  onChangeText={setCustomStart}
                />
                <TextInput
                  style={styles.dateInputBox}
                  placeholder="End YYYY-MM-DD"
                  placeholderTextColor={colors.textSecondary}
                  value={customEnd || ''}
                  onChangeText={setCustomEnd}
                />
              </View>
            )}
            <View style={styles.dateModalActions}>
              <TouchableOpacity style={[styles.manageInlineButton, styles.mergeInlineButton]} onPress={() => setShowDateFilter(false)}>
                <Text style={[styles.manageInlineButtonText, styles.mergeButtonText]}>Apply</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.manageInlineButton} onPress={() => { setDatePreset('all'); setCustomStart(null); setCustomEnd(null); }}>
                <Text style={styles.manageInlineButtonText}>Clear</Text>
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
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: colors.card,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: `${colors.primary}15`,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginLeft: 6,
  },
  activeTabText: {
    color: colors.primary,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    color: colors.text,
    fontSize: 16,
  },
  listContent: {
    padding: 16,
    paddingBottom: 140,
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  userPlayerCard: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}05`,
  },
  selectedPlayerCard: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  selectionIndicator: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: colors.primary,
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  userPlayerAvatar: {
    backgroundColor: colors.primary,
  },
  playerInitial: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.card,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  userLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },
  playerStats: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  playerHandicap: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
    marginTop: 2,
  },
  playerScoreContainer: {
    alignItems: 'center',
  },
  playerScoreLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  playerScore: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  playerManagement: {
    display: 'none',
  },
  managementButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: `${colors.primary}15`,
  },
  activeManagementButton: {
    backgroundColor: colors.primary,
  },
  managementButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
    marginLeft: 6,
  },
  activeManagementButtonText: {
    color: colors.background,
  },
  mergeButton: {
    backgroundColor: colors.primary,
  },
  mergeButtonText: {
    color: colors.background,
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledButtonText: {
    color: colors.textSecondary,
  },
  manageInlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.primary}15`,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginLeft: 8,
  },
  manageInlineButtonActive: {
    backgroundColor: colors.primary,
  },
  manageInlineButtonText: {
    marginLeft: 6,
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  manageInlineButtonTextActive: {
    color: colors.background,
  },
  mergeInlineButton: {
    backgroundColor: colors.primary,
    marginLeft: 8,
  },
  dateModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateModal: {
    width: '90%',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  datePresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  presetChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  presetChipActive: {
    backgroundColor: `${colors.primary}15`,
    borderColor: colors.primary,
  },
  presetChipText: {
    color: colors.text,
    fontSize: 12,
  },
  presetChipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  customRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dateInputBox: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: colors.text,
    marginRight: 8,
  },
  dateModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
});