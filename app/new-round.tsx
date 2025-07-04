import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  TextInput,
  Alert,
  FlatList
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import { useGolfStore } from '@/store/useGolfStore';
import { Button } from '@/components/Button';
import { CourseSearchModal } from '@/components/CourseSearchModal';
import { Course, Player, Score, PlayerRound } from '@/types';
import { generateUniqueId, calculateTotalScore, formatDate } from '@/utils/helpers';
import { Calendar, ChevronDown, ChevronUp } from 'lucide-react-native';

interface PrefilledPlayer {
  id: string;
  name: string;
  scores: Score[];
}

interface PrefilledData {
  courseId: string | null;
  players: PrefilledPlayer[];
  date: string;
  notes: string;
}

export default function NewRoundScreen() {
  const { courseId, prefilled } = useLocalSearchParams<{ courseId?: string, prefilled?: string }>();
  const router = useRouter();
  const { courses, players, addPlayer, addRound } = useGolfStore();
  
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(
    courseId ? courses.find(c => c.id === courseId) || null : null
  );
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [showCourseSelector, setShowCourseSelector] = useState(!courseId);
  const [showCourseSearchModal, setShowCourseSearchModal] = useState(false);
  const [date, setDate] = useState(formatDate(new Date()));
  const [notes, setNotes] = useState('');
  const [playerScores, setPlayerScores] = useState<{[playerId: string]: Score[]}>({});
  
  // Parse prefilled data if available
  useEffect(() => {
    if (prefilled) {
      try {
        const data: PrefilledData = JSON.parse(prefilled);
        
        // Set date and notes
        if (data.date) setDate(data.date);
        if (data.notes) setNotes(data.notes);
        
        // Set course if provided
        if (data.courseId) {
          const course = courses.find(c => c.id === data.courseId);
          if (course) setSelectedCourse(course);
        }
        
        // Handle prefilled players and scores
        if (data.players && data.players.length > 0) {
          const newPlayerScores: {[playerId: string]: Score[]} = {};
          const newSelectedPlayers: Player[] = [];
          
          data.players.forEach(prefilledPlayer => {
            // Check if player already exists
            let player = players.find(p => p.id === prefilledPlayer.id) || 
                         players.find(p => p.name === prefilledPlayer.name);
            
            // If not, create a new player
            if (!player) {
              player = {
                id: prefilledPlayer.id || generateUniqueId(),
                name: prefilledPlayer.name
              };
              addPlayer(player);
            }
            
            // Add to selected players
            newSelectedPlayers.push(player);
            
            // Add scores
            if (prefilledPlayer.scores && prefilledPlayer.scores.length > 0) {
              newPlayerScores[player.id] = prefilledPlayer.scores;
            }
          });
          
          setSelectedPlayers(newSelectedPlayers);
          setPlayerScores(newPlayerScores);
        }
      } catch (error) {
        console.error('Error parsing prefilled data:', error);
      }
    }
  }, [prefilled]);
  
  // Initialize empty scores for each player when course or players change
  useEffect(() => {
    if (selectedCourse && selectedPlayers.length > 0) {
      const initialScores: {[playerId: string]: Score[]} = { ...playerScores };
      
      selectedPlayers.forEach(player => {
        // Only initialize if player doesn't have scores yet
        if (!initialScores[player.id] || initialScores[player.id].length === 0) {
          initialScores[player.id] = selectedCourse.holes.map(hole => ({
            holeNumber: hole.number,
            strokes: 0
          }));
        }
      });
      
      setPlayerScores(initialScores);
    }
  }, [selectedCourse, selectedPlayers]);
  
  const handleSelectCourse = (course: Course) => {
    setSelectedCourse(course);
    setShowCourseSelector(false);
    setShowCourseSearchModal(false);
  };
  
  const handleScoreChange = (playerId: string, holeNumber: number, strokes: number) => {
    setPlayerScores(prev => {
      const playerScoresCopy = { ...prev };
      
      if (!playerScoresCopy[playerId]) {
        playerScoresCopy[playerId] = [];
      }
      
      const holeIndex = playerScoresCopy[playerId].findIndex(
        score => score.holeNumber === holeNumber
      );
      
      if (holeIndex >= 0) {
        playerScoresCopy[playerId][holeIndex] = {
          ...playerScoresCopy[playerId][holeIndex],
          strokes
        };
      } else {
        playerScoresCopy[playerId].push({
          holeNumber,
          strokes
        });
      }
      
      return playerScoresCopy;
    });
  };
  
  const validateForm = () => {
    if (!selectedCourse) {
      Alert.alert("Error", "Please select a course");
      return false;
    }
    
    if (selectedPlayers.length === 0) {
      Alert.alert("Error", "Please select at least one player");
      return false;
    }
    
    // Check if all scores are entered
    for (const playerId of selectedPlayers.map(p => p.id)) {
      const scores = playerScores[playerId] || [];
      
      if (scores.length !== selectedCourse.holes.length) {
        Alert.alert("Error", "Please enter scores for all holes");
        return false;
      }
      
      for (const score of scores) {
        if (score.strokes === 0) {
          Alert.alert("Error", "Please enter valid scores for all holes");
          return false;
        }
      }
    }
    
    return true;
  };
  
  const handleSaveRound = () => {
    if (!validateForm()) return;
    
    const playerRounds: PlayerRound[] = selectedPlayers.map(player => {
      const scores = playerScores[player.id] || [];
      const totalScore = calculateTotalScore(scores);
      
      return {
        playerId: player.id,
        playerName: player.name,
        scores,
        totalScore,
        handicapUsed: player.handicap
      };
    });
    
    const newRound = {
      id: generateUniqueId(),
      date,
      courseId: selectedCourse!.id,
      courseName: selectedCourse!.name,
      players: playerRounds,
      notes: notes.trim()
    };
    
    addRound(newRound);
    router.replace(`/round/${newRound.id}`);
  };
  
  const renderCourseItem = ({ item }: { item: Course }) => (
    <TouchableOpacity
      style={styles.dropdownItem}
      onPress={() => handleSelectCourse(item)}
    >
      <Text style={styles.dropdownItemText}>{item.name}</Text>
    </TouchableOpacity>
  );
  
  const renderHoleScores = () => {
    if (!selectedCourse || selectedPlayers.length === 0) return null;
    
    return (
      <View style={styles.formSection}>
        <Text style={styles.sectionTitle}>Scores</Text>
        
        <View style={styles.scoresTable}>
          <View style={styles.scoresTableHeader}>
            <Text style={[styles.scoresTableHeaderCell, styles.holeNumberCell]}>Hole</Text>
            <Text style={[styles.scoresTableHeaderCell, styles.holeParCell]}>Par</Text>
            {selectedPlayers.map(player => (
              <Text 
                key={player.id} 
                style={[styles.scoresTableHeaderCell, styles.playerScoreCell]}
                numberOfLines={1}
              >
                {player.name}
              </Text>
            ))}
          </View>
          
          {selectedCourse.holes.map(hole => (
            <View key={hole.number} style={styles.scoresTableRow}>
              <Text style={[styles.scoresTableCell, styles.holeNumberCell]}>
                {hole.number}
              </Text>
              <Text style={[styles.scoresTableCell, styles.holeParCell]}>
                {hole.par}
              </Text>
              
              {selectedPlayers.map(player => {
                const playerScore = playerScores[player.id]?.find(s => s.holeNumber === hole.number);
                return (
                  <TextInput
                    key={player.id}
                    style={[styles.scoresTableCell, styles.playerScoreCell, styles.scoreInput]}
                    value={playerScore && playerScore.strokes > 0 ? playerScore.strokes.toString() : ""}
                    onChangeText={(text) => {
                      if (text === '' || /^\d+$/.test(text)) {
                        handleScoreChange(
                          player.id, 
                          hole.number, 
                          text ? parseInt(text, 10) : 0
                        );
                      }
                    }}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="-"
                    placeholderTextColor={colors.inactive}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </View>
    );
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ 
        title: prefilled ? "Scanned Round" : "New Round",
        headerRight: () => (
          <Button
            title="Save"
            onPress={handleSaveRound}
            variant="primary"
            size="small"
          />
        )
      }} />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Course</Text>
          
          <TouchableOpacity 
            style={styles.selector}
            onPress={() => setShowCourseSearchModal(true)}
          >
            <Text style={selectedCourse ? styles.selectedText : styles.placeholderText}>
              {selectedCourse ? selectedCourse.name : "Search for a course"}
            </Text>
            <ChevronDown size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Date</Text>
          
          <View style={styles.dateContainer}>
            <Calendar size={20} color={colors.textSecondary} style={styles.dateIcon} />
            <TextInput
              style={styles.dateInput}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
            />
          </View>
        </View>
        
        {prefilled && selectedPlayers.length > 0 && (
          <View style={styles.prefilledPlayersContainer}>
            <Text style={styles.sectionTitle}>Players</Text>
            <View style={styles.prefilledPlayersInfo}>
              <Text style={styles.prefilledPlayersText}>
                {selectedPlayers.length} player{selectedPlayers.length > 1 ? 's' : ''} detected from scorecard
              </Text>
            </View>
            <View style={styles.selectedPlayersContainer}>
              {selectedPlayers.map(player => (
                <View key={player.id} style={styles.selectedPlayerChip}>
                  <Text style={styles.selectedPlayerName}>{player.name}</Text>
                  {player.handicap !== undefined && (
                    <Text style={styles.handicapText}>HCP: {player.handicap}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}
        
        {renderHoleScores()}
        
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add notes about this round..."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>
        
        <Button
          title="Save Round"
          onPress={handleSaveRound}
          style={styles.saveButton}
        />
      </ScrollView>
      
      <CourseSearchModal
        visible={showCourseSearchModal}
        onClose={() => setShowCourseSearchModal(false)}
        onSelectCourse={handleSelectCourse}
      />
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
  formSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  selector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  selectedText: {
    fontSize: 16,
    color: colors.text,
  },
  placeholderText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  dropdownContainer: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    maxHeight: 200,
  },
  dropdown: {
    maxHeight: 200,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownItemText: {
    fontSize: 16,
    color: colors.text,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  dateIcon: {
    marginRight: 8,
  },
  dateInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  prefilledPlayersContainer: {
    marginBottom: 24,
  },
  prefilledPlayersInfo: {
    backgroundColor: `${colors.primary}15`,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  prefilledPlayersText: {
    fontSize: 14,
    color: colors.text,
  },
  selectedPlayersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  selectedPlayerChip: {
    backgroundColor: `${colors.primary}20`,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  selectedPlayerName: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  handicapText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  scoresTable: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  scoresTableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scoresTableHeaderCell: {
    padding: 12,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  scoresTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scoresTableCell: {
    padding: 12,
    textAlign: 'center',
    color: colors.text,
  },
  holeNumberCell: {
    width: 50,
    backgroundColor: colors.card,
    fontWeight: '500',
  },
  holeParCell: {
    width: 50,
    backgroundColor: `${colors.card}80`,
  },
  playerScoreCell: {
    flex: 1,
    minWidth: 60,
  },
  scoreInput: {
    textAlign: 'center',
    fontSize: 16,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    height: 100,
  },
  saveButton: {
    marginTop: 8,
  },
});