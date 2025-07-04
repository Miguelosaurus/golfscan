import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  TextInput,
  FlatList
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '@/constants/colors';
import { Button } from '@/components/Button';
import { CourseSearchModal } from '@/components/CourseSearchModal';
import { useGolfStore } from '@/store/useGolfStore';
import { generateUniqueId } from '@/utils/helpers';
import { 
  Camera, 
  Image as ImageIcon, 
  RotateCcw, 
  User, 
  Link as LinkIcon, 
  Edit, 
  X, 
  Check, 
  Flag, 
  ChevronDown,
  Plus,
  Calendar,
  GripVertical,
  Trash2
} from 'lucide-react-native';

interface DetectedPlayer {
  id: string;
  name: string;
  linkedPlayerId?: string;
  isUser?: boolean;
  handicap?: number;
  teeColor?: string;
  scores: {
    holeNumber: number;
    strokes: number;
  }[];
}

const TEE_COLORS = [
  { name: 'Black', color: '#000000' },
  { name: 'Gold', color: '#FFD700' },
  { name: 'Blue', color: '#0066CC' },
  { name: 'White', color: '#FFFFFF' },
  { name: 'Red', color: '#FF0000' },
  { name: 'Green', color: '#00AA00' },
];

export default function ScanScorecardScreen() {
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const router = useRouter();
  const { players, courses, addRound } = useGolfStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [photos, setPhotos] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [processingComplete, setProcessingComplete] = useState(false);
  const [detectedPlayers, setDetectedPlayers] = useState<DetectedPlayer[]>([]);
  const [showPlayerLinking, setShowPlayerLinking] = useState(false);
  const [selectedPlayerIndex, setSelectedPlayerIndex] = useState<number | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(courseId || null);
  const [showCourseSelector, setShowCourseSelector] = useState(false);
  const [showCourseSearchModal, setShowCourseSearchModal] = useState(false);
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<'players' | 'scores' | 'details'>('players');
  const [draggingPlayerIndex, setDraggingPlayerIndex] = useState<number | null>(null);
  const cameraRef = useRef(null);
  
  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };
  
  const takePicture = async () => {
    if (!cameraRef.current) return;
    
    try {
      setScanning(true);
      
      // Simulate taking a picture
      setTimeout(() => {
        const newPhoto = 'https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80';
        setPhotos(prev => [...prev, newPhoto]);
        setScanning(false);
      }, 1500);
    } catch (error) {
      console.error('Error taking picture:', error);
      setScanning(false);
      Alert.alert('Error', 'Failed to take picture. Please try again.');
    }
  };
  
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1,
        allowsMultipleSelection: true,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newPhotos = result.assets.map(asset => asset.uri);
        setPhotos(prev => [...prev, ...newPhotos]);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };
  
  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    
    // If no photos left, reset processing state
    if (photos.length === 1) {
      setProcessingComplete(false);
      setDetectedPlayers([]);
    }
  };
  
  const resetPhotos = () => {
    setPhotos([]);
    setProcessingComplete(false);
    setDetectedPlayers([]);
  };
  
  const processScorecard = () => {
    if (photos.length === 0) {
      Alert.alert('Error', 'Please take or select at least one photo first.');
      return;
    }
    
    setScanning(true);
    
    // Generate example data with detected players
    const currentUser = players.find(p => p.isUser);
    
    // Create detected players with example data
    const exampleDetectedPlayers: DetectedPlayer[] = [
      {
        id: generateUniqueId(),
        name: currentUser ? currentUser.name : "John Smith",
        linkedPlayerId: currentUser ? currentUser.id : undefined,
        isUser: !!currentUser,
        handicap: currentUser?.handicap,
        teeColor: 'Blue',
        scores: [
          { holeNumber: 1, strokes: 4 },
          { holeNumber: 2, strokes: 5 },
          { holeNumber: 3, strokes: 3 },
          { holeNumber: 4, strokes: 4 },
          { holeNumber: 5, strokes: 5 },
          { holeNumber: 6, strokes: 4 },
          { holeNumber: 7, strokes: 3 },
          { holeNumber: 8, strokes: 4 },
          { holeNumber: 9, strokes: 5 },
          { holeNumber: 10, strokes: 4 },
          { holeNumber: 11, strokes: 5 },
          { holeNumber: 12, strokes: 3 },
          { holeNumber: 13, strokes: 4 },
          { holeNumber: 14, strokes: 4 },
          { holeNumber: 15, strokes: 5 },
          { holeNumber: 16, strokes: 3 },
          { holeNumber: 17, strokes: 4 },
          { holeNumber: 18, strokes: 4 }
        ]
      },
      {
        id: generateUniqueId(),
        name: "Jane Doe",
        handicap: 12,
        teeColor: 'Red',
        scores: [
          { holeNumber: 1, strokes: 5 },
          { holeNumber: 2, strokes: 4 },
          { holeNumber: 3, strokes: 4 },
          { holeNumber: 4, strokes: 3 },
          { holeNumber: 5, strokes: 5 },
          { holeNumber: 6, strokes: 4 },
          { holeNumber: 7, strokes: 4 },
          { holeNumber: 8, strokes: 5 },
          { holeNumber: 9, strokes: 4 },
          { holeNumber: 10, strokes: 5 },
          { holeNumber: 11, strokes: 4 },
          { holeNumber: 12, strokes: 4 },
          { holeNumber: 13, strokes: 3 },
          { holeNumber: 14, strokes: 5 },
          { holeNumber: 15, strokes: 4 },
          { holeNumber: 16, strokes: 4 },
          { holeNumber: 17, strokes: 5 },
          { holeNumber: 18, strokes: 3 }
        ]
      }
    ];
    
    // Auto-detect user by finding closest name match
    if (currentUser && !exampleDetectedPlayers.some(p => p.isUser)) {
      const closestMatch = exampleDetectedPlayers.reduce((closest, player) => {
        const currentDistance = levenshteinDistance(player.name.toLowerCase(), currentUser.name.toLowerCase());
        const closestDistance = levenshteinDistance(closest.name.toLowerCase(), currentUser.name.toLowerCase());
        return currentDistance < closestDistance ? player : closest;
      });
      
      // Mark closest match as user if similarity is reasonable
      if (levenshteinDistance(closestMatch.name.toLowerCase(), currentUser.name.toLowerCase()) < 3) {
        closestMatch.isUser = true;
        closestMatch.linkedPlayerId = currentUser.id;
        closestMatch.handicap = currentUser.handicap;
      }
    }
    
    // Simulate processing delay
    setTimeout(() => {
      setDetectedPlayers(exampleDetectedPlayers);
      setProcessingComplete(true);
      setScanning(false);
    }, 2000);
  };
  
  // Simple Levenshtein distance function for name matching
  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  };
  
  const handleEditPlayerName = (index: number, newName: string) => {
    setDetectedPlayers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], name: newName };
      return updated;
    });
  };
  
  const handleEditPlayerHandicap = (index: number, handicap: string) => {
    const handicapValue = handicap.trim() === '' ? undefined : Number(handicap);
    
    setDetectedPlayers(prev => {
      const updated = [...prev];
      updated[index] = { 
        ...updated[index], 
        handicap: isNaN(Number(handicap)) ? undefined : handicapValue 
      };
      return updated;
    });
  };
  
  const handleEditTeeColor = (index: number, teeColor: string) => {
    setDetectedPlayers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], teeColor };
      return updated;
    });
  };
  
  const handleEditScore = (playerIndex: number, holeNumber: number, strokes: number) => {
    setDetectedPlayers(prev => {
      const updated = [...prev];
      const scoreIndex = updated[playerIndex].scores.findIndex(s => s.holeNumber === holeNumber);
      
      if (scoreIndex >= 0) {
        updated[playerIndex].scores[scoreIndex].strokes = strokes;
      }
      
      return updated;
    });
  };
  
  const handleRemovePlayer = (index: number) => {
    Alert.alert(
      "Remove Player",
      "Are you sure you want to remove this player?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Remove", 
          style: "destructive",
          onPress: () => {
            setDetectedPlayers(prev => prev.filter((_, i) => i !== index));
          }
        }
      ]
    );
  };
  
  const handleAddPlayer = () => {
    if (!detectedPlayers.length) return;
    
    // Copy scores structure from first player but set all scores to 0
    const scoreTemplate = detectedPlayers[0].scores.map(s => ({
      holeNumber: s.holeNumber,
      strokes: 0
    }));
    
    setDetectedPlayers(prev => [
      ...prev,
      {
        id: generateUniqueId(),
        name: "New Player",
        teeColor: 'White',
        scores: scoreTemplate
      }
    ]);
  };
  
  const handleLinkPlayer = (index: number) => {
    setSelectedPlayerIndex(index);
    setShowPlayerLinking(true);
  };
  
  const handleSelectExistingPlayer = (existingPlayerId: string, playerName: string, handicap?: number) => {
    if (selectedPlayerIndex === null) return;
    
    setDetectedPlayers(prev => {
      const updated = [...prev];
      updated[selectedPlayerIndex] = {
        ...updated[selectedPlayerIndex],
        linkedPlayerId: existingPlayerId,
        name: playerName,
        handicap
      };
      return updated;
    });
    
    setShowPlayerLinking(false);
    setSelectedPlayerIndex(null);
  };
  
  const handleMarkAsUser = (index: number) => {
    setDetectedPlayers(prev => {
      // First, remove isUser flag from all players
      const updated = prev.map(p => ({ ...p, isUser: false }));
      // Then set it for the selected player
      updated[index].isUser = true;
      return updated;
    });
  };
  
  const handleReorderPlayers = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    
    setDetectedPlayers(prev => {
      const updated = [...prev];
      const [movedPlayer] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, movedPlayer);
      return updated;
    });
  };
  
  const startDragging = (index: number) => {
    setDraggingPlayerIndex(index);
  };
  
  const endDragging = (toIndex: number) => {
    if (draggingPlayerIndex !== null) {
      handleReorderPlayers(draggingPlayerIndex, toIndex);
      setDraggingPlayerIndex(null);
    }
  };
  
  const handleSelectCourse = (course: any) => {
    setSelectedCourse(course.id);
    setShowCourseSearchModal(false);
  };
  
  const validateForm = () => {
    if (!selectedCourse) {
      Alert.alert("Error", "Please select a course before continuing");
      return false;
    }
    
    if (detectedPlayers.length === 0) {
      Alert.alert("Error", "No players detected. Please try scanning again or add players manually");
      return false;
    }
    
    // Check if all players have names
    const emptyNamePlayer = detectedPlayers.find(p => !p.name.trim());
    if (emptyNamePlayer) {
      Alert.alert("Error", "All players must have names");
      return false;
    }
    
    // Check if all scores are entered
    for (const player of detectedPlayers) {
      if (player.scores.some(s => s.strokes === 0)) {
        Alert.alert("Error", "Please enter scores for all holes");
        return false;
      }
    }
    
    return true;
  };
  
  const handleSaveRound = () => {
    if (!validateForm()) {
      return;
    }
    
    // Calculate total scores for each player
    const playersWithTotalScores = detectedPlayers.map(player => {
      const totalScore = player.scores.reduce((sum, score) => sum + score.strokes, 0);
      return {
        ...player,
        totalScore
      };
    });
    
    // Create the round object
    const roundId = generateUniqueId();
    const newRound = {
      id: roundId,
      date,
      courseId: selectedCourse as string,
      courseName: courses.find(c => c.id === selectedCourse)?.name || "Unknown Course",
      players: playersWithTotalScores.map(player => ({
        playerId: player.linkedPlayerId || player.id,
        playerName: player.name,
        scores: player.scores,
        totalScore: player.scores.reduce((sum, score) => sum + score.strokes, 0),
        handicapUsed: player.handicap
      })),
      notes
    };
    
    // Add the round to the store and navigate to the round details
    addRound(newRound);
    router.replace(`/round/${roundId}`);
  };
  
  if (!permission) {
    // Camera permissions are still loading
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }
  
  if (!permission.granted) {
    // Camera permissions are not granted yet
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen 
          options={{ 
            title: "Scan Scorecard",
            headerStyle: {
              backgroundColor: colors.background,
            },
            headerTitleStyle: {
              color: colors.text,
            },
            headerTintColor: colors.text,
          }} 
        />
        
        <View style={styles.permissionContainer}>
          <Camera size={60} color={colors.primary} style={styles.permissionIcon} />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            We need camera access to scan your scorecard. Please grant permission to continue.
          </Text>
          <Button 
            title="Grant Permission" 
            onPress={requestPermission} 
            style={styles.permissionButton}
          />
        </View>
      </SafeAreaView>
    );
  }
  
  if (showPlayerLinking) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen 
          options={{ 
            title: "Link to Existing Player",
            headerStyle: {
              backgroundColor: colors.background,
            },
            headerTitleStyle: {
              color: colors.text,
            },
            headerTintColor: colors.text,
            headerLeft: () => (
              <TouchableOpacity 
                onPress={() => {
                  setShowPlayerLinking(false);
                  setSelectedPlayerIndex(null);
                }}
                style={styles.headerButton}
              >
                <Text style={styles.headerButtonText}>Cancel</Text>
              </TouchableOpacity>
            )
          }} 
        />
        
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
        >
          <Text style={styles.linkingTitle}>
            Select an existing player to link with{" "}
            <Text style={styles.highlightText}>
              {selectedPlayerIndex !== null ? detectedPlayers[selectedPlayerIndex].name : ""}
            </Text>
          </Text>
          
          {players.length > 0 ? (
            players.map(player => (
              <TouchableOpacity
                key={player.id}
                style={styles.playerLinkItem}
                onPress={() => handleSelectExistingPlayer(player.id, player.name, player.handicap)}
              >
                <View style={styles.playerLinkAvatar}>
                  <Text style={styles.playerLinkInitial}>{player.name.charAt(0)}</Text>
                </View>
                <View style={styles.playerLinkInfo}>
                  <Text style={styles.playerLinkName}>{player.name}</Text>
                  {player.handicap !== undefined && (
                    <Text style={styles.playerLinkHandicap}>Handicap: {player.handicap}</Text>
                  )}
                </View>
                <LinkIcon size={20} color={colors.primary} />
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.noPlayersContainer}>
              <Text style={styles.noPlayersText}>No existing players found.</Text>
              <Text style={styles.noPlayersSubtext}>
                Continue without linking to create a new player profile.
              </Text>
              <Button
                title="Continue Without Linking"
                onPress={() => {
                  setShowPlayerLinking(false);
                  setSelectedPlayerIndex(null);
                }}
                style={styles.noPlayersButton}
              />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }
  
  if (photos.length > 0 && processingComplete) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen 
          options={{ 
            title: "Scorecard Results",
            headerStyle: {
              backgroundColor: colors.background,
            },
            headerTitleStyle: {
              color: colors.text,
            },
            headerTintColor: colors.text,
            headerRight: () => (
              <TouchableOpacity 
                onPress={handleSaveRound}
                style={styles.headerButton}
              >
                <Text style={styles.headerButtonText}>Save</Text>
              </TouchableOpacity>
            )
          }} 
        />
        
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'players' && styles.activeTab]}
            onPress={() => setActiveTab('players')}
          >
            <User size={18} color={activeTab === 'players' ? colors.primary : colors.text} />
            <Text style={[styles.tabText, activeTab === 'players' && styles.activeTabText]}>Players</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'scores' && styles.activeTab]}
            onPress={() => setActiveTab('scores')}
          >
            <Flag size={18} color={activeTab === 'scores' ? colors.primary : colors.text} />
            <Text style={[styles.tabText, activeTab === 'scores' && styles.activeTabText]}>Scores</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'details' && styles.activeTab]}
            onPress={() => setActiveTab('details')}
          >
            <Calendar size={18} color={activeTab === 'details' ? colors.primary : colors.text} />
            <Text style={[styles.tabText, activeTab === 'details' && styles.activeTabText]}>Details</Text>
          </TouchableOpacity>
        </View>
        
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
        >
          {activeTab === 'players' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Detected Players</Text>
                <TouchableOpacity 
                  style={styles.addPlayerButton}
                  onPress={handleAddPlayer}
                >
                  <Plus size={16} color={colors.primary} />
                  <Text style={styles.addPlayerText}>Add Player</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.playersContainer}>
                {detectedPlayers.map((player, index) => (
                  <View 
                    key={player.id} 
                    style={[
                      styles.playerCard,
                      draggingPlayerIndex === index && styles.draggingPlayerCard
                    ]}
                  >
                    <View style={styles.playerHeader}>
                      <TouchableOpacity 
                        style={styles.dragHandle}
                        onPressIn={() => startDragging(index)}
                        onPressOut={() => endDragging(index)}
                      >
                        <GripVertical size={18} color={colors.text} />
                      </TouchableOpacity>
                      
                      <View style={styles.playerNameContainer}>
                        <TextInput
                          style={styles.playerNameInput}
                          value={player.name}
                          onChangeText={(text) => handleEditPlayerName(index, text)}
                          placeholder="Player Name"
                        />
                        {player.isUser && (
                          <View style={styles.userBadge}>
                            <Text style={styles.userBadgeText}>You</Text>
                          </View>
                        )}
                        {player.linkedPlayerId && !player.isUser && (
                          <View style={styles.linkedBadge}>
                            <Text style={styles.linkedBadgeText}>Linked</Text>
                          </View>
                        )}
                      </View>
                      
                      <View style={styles.playerActions}>
                        <TouchableOpacity 
                          style={styles.playerAction}
                          onPress={() => handleLinkPlayer(index)}
                        >
                          <LinkIcon size={18} color={player.linkedPlayerId ? colors.success : colors.primary} />
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                          style={styles.playerAction}
                          onPress={() => handleMarkAsUser(index)}
                          disabled={player.isUser}
                        >
                          <User size={18} color={player.isUser ? colors.success : colors.primary} />
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                          style={styles.playerAction}
                          onPress={() => handleRemovePlayer(index)}
                        >
                          <X size={18} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    
                    <View style={styles.playerDetailsRow}>
                      <View style={styles.handicapContainer}>
                        <Text style={styles.handicapLabel}>Handicap:</Text>
                        <TextInput
                          style={styles.handicapInput}
                          value={player.handicap !== undefined ? player.handicap.toString() : ''}
                          onChangeText={(text) => handleEditPlayerHandicap(index, text)}
                          placeholder="Not set"
                          placeholderTextColor={colors.text}
                          keyboardType="numeric"
                        />
                      </View>
                      
                      <View style={styles.teeColorContainer}>
                        <Text style={styles.teeColorLabel}>Tee:</Text>
                        <TouchableOpacity 
                          style={[
                            styles.teeColorSelector,
                            { backgroundColor: TEE_COLORS.find(t => t.name === player.teeColor)?.color || '#FFFFFF' }
                          ]}
                          onPress={() => {
                            // Cycle through tee colors
                            const currentIndex = TEE_COLORS.findIndex(t => t.name === player.teeColor);
                            const nextIndex = (currentIndex + 1) % TEE_COLORS.length;
                            handleEditTeeColor(index, TEE_COLORS[nextIndex].name);
                          }}
                        >
                          <Text style={[
                            styles.teeColorText,
                            { color: player.teeColor === 'White' ? '#000000' : '#FFFFFF' }
                          ]}>
                            {player.teeColor || 'White'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
              
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>Player Management</Text>
                <Text style={styles.infoText}>
                  • Drag to reorder players if they were detected incorrectly
                </Text>
                <Text style={styles.infoText}>
                  • Edit names by clicking on them and changing the text
                </Text>
                <Text style={styles.infoText}>
                  • Link players to existing profiles using the link icon
                </Text>
                <Text style={styles.infoText}>
                  • Mark yourself using the user icon
                </Text>
                <Text style={styles.infoText}>
                  • Set handicaps and tee colors for accurate scoring
                </Text>
                <Text style={styles.infoText}>
                  • Tap tee color to cycle through available options
                </Text>
              </View>
            </View>
          )}
          
          {activeTab === 'scores' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Scores</Text>
                <Text style={styles.sectionSubtitle}>
                  Review and edit scores for each hole
                </Text>
              </View>
              
              <View style={styles.scoresTable}>
                <View style={styles.scoresTableHeader}>
                  <Text style={[styles.scoresTableHeaderCell, styles.holeNumberCell]}>Hole</Text>
                  <Text style={[styles.scoresTableHeaderCell, styles.holeParCell]}>Par</Text>
                  {detectedPlayers.map(player => (
                    <Text 
                      key={player.id} 
                      style={[styles.scoresTableHeaderCell, styles.playerScoreCell]}
                      numberOfLines={1}
                    >
                      {player.name}
                      {player.isUser ? " (You)" : ""}
                    </Text>
                  ))}
                </View>
                
                {detectedPlayers.length > 0 && detectedPlayers[0].scores.map(score => {
                  // Find the course to get par for this hole
                  const course = selectedCourse ? courses.find(c => c.id === selectedCourse) : null;
                  const hole = course ? course.holes.find(h => h.number === score.holeNumber) : null;
                  const par = hole ? hole.par : 4; // Default to par 4 if not found
                  
                  return (
                    <View key={score.holeNumber} style={styles.scoresTableRow}>
                      <Text style={[styles.scoresTableCell, styles.holeNumberCell]}>
                        {score.holeNumber}
                      </Text>
                      
                      <Text style={[styles.scoresTableCell, styles.holeParCell]}>
                        {par}
                      </Text>
                      
                      {detectedPlayers.map((player, playerIndex) => {
                        const playerScore = player.scores.find(s => s.holeNumber === score.holeNumber);
                        const strokes = playerScore ? playerScore.strokes : 0;
                        
                        // Determine score color based on relation to par
                        let scoreColor = colors.text;
                        if (strokes > 0) {
                          if (strokes < par) scoreColor = colors.success;
                          else if (strokes > par) scoreColor = colors.error;
                        }
                        
                        return (
                          <TextInput
                            key={player.id}
                            style={[
                              styles.scoresTableCell, 
                              styles.playerScoreCell, 
                              styles.scoreInput,
                              { color: scoreColor }
                            ]}
                            value={strokes > 0 ? strokes.toString() : ""}
                            onChangeText={(text) => {
                              const newStrokes = parseInt(text, 10);
                              if (!isNaN(newStrokes)) {
                                handleEditScore(playerIndex, score.holeNumber, newStrokes);
                              } else if (text === '') {
                                handleEditScore(playerIndex, score.holeNumber, 0);
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
                  );
                })}
              </View>
            </View>
          )}
          
          {activeTab === 'details' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Course</Text>
                <TouchableOpacity 
                  style={styles.courseSelector}
                  onPress={() => setShowCourseSearchModal(true)}
                >
                  <Text style={selectedCourse ? styles.selectedCourseText : styles.placeholderText}>
                    {selectedCourse 
                      ? courses.find(c => c.id === selectedCourse)?.name || "Selected Course" 
                      : "Search for a course"}
                  </Text>
                  <ChevronDown size={20} color={colors.text} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Date</Text>
                <View style={styles.dateContainer}>
                  <Calendar size={20} color={colors.text} style={styles.dateIcon} />
                  <TextInput
                    style={styles.dateInput}
                    value={date}
                    onChangeText={setDate}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
              </View>
              
              <View style={styles.sectionContainer}>
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
            </View>
          )}
        </ScrollView>
        
        <View style={styles.bottomBar}>
          <Button
            title="Save Round"
            onPress={handleSaveRound}
            style={styles.saveButton}
          />
        </View>
        
        <CourseSearchModal
          visible={showCourseSearchModal}
          onClose={() => setShowCourseSearchModal(false)}
          onSelectCourse={handleSelectCourse}
        />
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen 
        options={{ 
          title: "Scan Scorecard",
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTitleStyle: {
            color: colors.text,
          },
          headerTintColor: colors.text,
        }} 
      />
      
      {photos.length > 0 ? (
        <View style={styles.previewContainer}>
          <ScrollView 
            horizontal 
            pagingEnabled 
            showsHorizontalScrollIndicator={false}
            style={styles.photosScrollView}
          >
            {photos.map((photo, index) => (
              <View key={index} style={styles.photoContainer}>
                <Image 
                  source={{ uri: photo }} 
                  style={styles.previewImage}
                  resizeMode="contain"
                />
                <TouchableOpacity 
                  style={styles.removePhotoButton}
                  onPress={() => removePhoto(index)}
                >
                  <Trash2 size={20} color={colors.background} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
          
          <View style={styles.photoIndicator}>
            <Text style={styles.photoIndicatorText}>
              {photos.length} photo{photos.length > 1 ? 's' : ''} selected
            </Text>
          </View>
          
          <View style={styles.previewActions}>
            <Button
              title="Add More"
              onPress={pickImage}
              variant="outline"
              style={styles.previewButton}
            />
            
            <Button
              title="Take Another"
              onPress={takePicture}
              variant="outline"
              style={styles.previewButton}
              disabled={Platform.OS === 'web'}
            />
            
            <Button
              title={scanning ? "Processing..." : "Process All"}
              onPress={processScorecard}
              disabled={scanning}
              loading={scanning}
              style={styles.previewButton}
            />
          </View>
          
          {scanning && (
            <View style={styles.scanningOverlay}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.scanningText}>Processing {photos.length} photo{photos.length > 1 ? 's' : ''}...</Text>
            </View>
          )}
        </View>
      ) : (
        <>
          <View style={styles.cameraContainer}>
            {Platform.OS !== 'web' ? (
              <CameraView
                style={styles.camera}
                facing={facing}
                ref={cameraRef}
              >
                <View style={styles.overlay}>
                  <View style={styles.scanFrame} />
                </View>
              </CameraView>
            ) : (
              <View style={styles.webFallback}>
                <Camera size={60} color={colors.primary} />
                <Text style={styles.webFallbackText}>
                  Camera is not available on web. Please use the upload button below.
                </Text>
              </View>
            )}
          </View>
          
          <View style={styles.controls}>
            <TouchableOpacity 
              style={styles.controlButton}
              onPress={pickImage}
            >
              <ImageIcon size={24} color={colors.text} />
              <Text style={styles.controlText}>Upload</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.captureButton}
              onPress={takePicture}
              disabled={Platform.OS === 'web'}
            >
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.controlButton}
              onPress={toggleCameraFacing}
              disabled={Platform.OS === 'web'}
            >
              <RotateCcw size={24} color={Platform.OS === 'web' ? colors.inactive : colors.text} />
              <Text style={[styles.controlText, Platform.OS === 'web' && styles.disabledText]}>Flip</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.instructions}>
            <Text style={styles.instructionsTitle}>How to scan:</Text>
            <Text style={styles.instructionsText}>
              1. Position your scorecard within the frame
            </Text>
            <Text style={styles.instructionsText}>
              2. Make sure the scorecard is well-lit and clearly visible
            </Text>
            <Text style={styles.instructionsText}>
              3. Take multiple photos for longer scorecards
            </Text>
            <Text style={styles.instructionsText}>
              4. Hold steady and tap the capture button
            </Text>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionIcon: {
    marginBottom: 24,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    minWidth: 200,
  },
  cameraContainer: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 12,
    margin: 16,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: '80%',
    height: '60%',
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 8,
  },
  webFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 24,
  },
  webFallbackText: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginTop: 16,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 16,
  },
  controlButton: {
    alignItems: 'center',
  },
  controlText: {
    fontSize: 14,
    color: colors.text,
    marginTop: 4,
  },
  disabledText: {
    color: colors.inactive,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  instructions: {
    padding: 16,
    marginBottom: 16,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
  },
  previewContainer: {
    flex: 1,
    margin: 16,
  },
  photosScrollView: {
    flex: 1,
    marginBottom: 16,
  },
  photoContainer: {
    width: 350,
    position: 'relative',
  },
  previewImage: {
    flex: 1,
    borderRadius: 12,
    width: '100%',
  },
  removePhotoButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoIndicator: {
    alignItems: 'center',
    marginBottom: 16,
  },
  photoIndicatorText: {
    fontSize: 14,
    color: colors.text,
  },
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  scanningOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  scanningText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
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
    color: colors.text,
    marginLeft: 6,
  },
  activeTabText: {
    color: colors.primary,
  },
  tabContent: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  sectionContainer: {
    marginBottom: 24,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 8,
  },
  courseSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
  },
  selectedCourseText: {
    fontSize: 16,
    color: colors.text,
  },
  placeholderText: {
    fontSize: 16,
    color: colors.text,
  },
  addPlayerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: `${colors.primary}15`,
    borderRadius: 16,
  },
  addPlayerText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
    marginLeft: 4,
  },
  playersContainer: {
    marginBottom: 16,
  },
  playerCard: {
    backgroundColor: colors.card,
    borderRadius: 8,
    marginBottom: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  draggingPlayerCard: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  playerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dragHandle: {
    padding: 8,
    marginRight: 4,
  },
  playerNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  playerNameInput: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
  },
  playerDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  handicapContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  handicapLabel: {
    fontSize: 14,
    color: colors.text,
    marginRight: 8,
  },
  handicapInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    color: colors.text,
  },
  teeColorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teeColorLabel: {
    fontSize: 14,
    color: colors.text,
    marginRight: 8,
  },
  teeColorSelector: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 60,
    alignItems: 'center',
  },
  teeColorText: {
    fontSize: 12,
    fontWeight: '500',
  },
  userBadge: {
    backgroundColor: colors.primary,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginLeft: 8,
  },
  userBadgeText: {
    fontSize: 12,
    color: colors.background,
    fontWeight: '500',
  },
  linkedBadge: {
    backgroundColor: colors.success,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginLeft: 8,
  },
  linkedBadgeText: {
    fontSize: 12,
    color: colors.background,
    fontWeight: '500',
  },
  playerActions: {
    flexDirection: 'row',
  },
  playerAction: {
    padding: 8,
    marginLeft: 4,
  },
  infoBox: {
    backgroundColor: `${colors.primary}10`,
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 4,
  },
  scoresTable: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  scoresTableHeader: {
    flexDirection: 'row',
    backgroundColor: `${colors.primary}15`,
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
    backgroundColor: `${colors.card}80`,
    fontWeight: '500',
  },
  holeParCell: {
    width: 50,
    backgroundColor: `${colors.card}40`,
  },
  playerScoreCell: {
    flex: 1,
    minWidth: 60,
  },
  scoreInput: {
    textAlign: 'center',
    fontSize: 16,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
  },
  dateIcon: {
    marginRight: 8,
  },
  dateInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    height: 100,
    backgroundColor: colors.background,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 16,
  },
  saveButton: {
    width: '100%',
  },
  headerButton: {
    paddingHorizontal: 16,
  },
  headerButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '500',
  },
  linkingTitle: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
  },
  highlightText: {
    fontWeight: '600',
    color: colors.primary,
  },
  playerLinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  playerLinkAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  playerLinkInitial: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.background,
  },
  playerLinkInfo: {
    flex: 1,
  },
  playerLinkName: {
    fontSize: 16,
    color: colors.text,
  },
  playerLinkHandicap: {
    fontSize: 14,
    color: colors.text,
  },
  noPlayersContainer: {
    alignItems: 'center',
    padding: 24,
  },
  noPlayersText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  noPlayersSubtext: {
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  noPlayersButton: {
    minWidth: 200,
  },
});