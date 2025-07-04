import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity,
  TextInput,
  Image
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useGolfStore } from '@/store/useGolfStore';
import { RoundCard } from '@/components/RoundCard';
import { CourseCard } from '@/components/CourseCard';
import { EmptyState } from '@/components/EmptyState';
import { Round, Player, PlayerSummary, Course } from '@/types';
import { History, Camera, Search, Users, Flag } from 'lucide-react-native';

export default function HistoryScreen() {
  const router = useRouter();
  const { rounds, players, courses } = useGolfStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'rounds' | 'players' | 'courses'>('rounds');
  
  const filteredRounds = rounds
    .filter(round => 
      round.courseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      round.players.some(player => 
        player.playerName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filteredCourses = courses.filter(course => 
    course.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    course.location.toLowerCase().includes(searchQuery.toLowerCase())
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
  
  const renderPlayerItem = ({ item }: { item: PlayerSummary }) => {
    const player = players.find(p => p.id === item.id);
    const name = player?.name || item.name;
    const photoUrl = player?.photoUrl;
    return (
      <TouchableOpacity 
        style={[styles.playerCard, item.isUser && styles.userPlayerCard]}
        onPress={() => navigateToPlayerDetails(item.id)}
      >
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
    switch (activeTab) {
      case 'rounds':
        return (
          <EmptyState
            title="No rounds yet"
            message="Start tracking your golf rounds by scanning your scorecard."
            buttonTitle="Scan Scorecard"
            onButtonPress={navigateToScanScorecard}
            icon={<History size={40} color={colors.primary} />}
          />
        );
      case 'players':
        return (
          <EmptyState
            title="No players yet"
            message="Start tracking your golf rounds to see player statistics."
            buttonTitle="Scan Scorecard"
            onButtonPress={navigateToScanScorecard}
            icon={<Users size={40} color={colors.primary} />}
          />
        );
      case 'courses':
        return (
          <EmptyState
            title="No courses yet"
            message="Add your favorite golf courses to start tracking your rounds."
            buttonTitle="Add Course"
            onButtonPress={navigateToAddCourse}
            icon={<Flag size={40} color={colors.primary} />}
          />
        );
      default:
        return null;
    }
  };

  const getData = () => {
    switch (activeTab) {
      case 'rounds':
        return filteredRounds;
      case 'players':
        return getUniquePlayers();
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
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
      
      <FlatList
        data={getData()}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={getEmptyState()}
      />
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
});