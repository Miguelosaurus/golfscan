import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Alert, 
  ScrollView, 
  Dimensions, 
  ActivityIndicator,
  TextInput,
  Image,
  PanResponder,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager
} from 'react-native';
import { PanGestureHandler, State, FlatList } from 'react-native-gesture-handler';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { 
  Camera, 
  Image as ImageIcon, 
  X, 
  Users, 
  User, 
  GripVertical, 
  Plus, 
  Link as LinkIcon, 
  MapPin,
  ChevronDown,
  Calendar,
  Trash2,
  Flag,
  RotateCcw
} from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { generateUniqueId } from '@/utils/helpers';
import { useGolfStore } from '@/store/useGolfStore';
import { mockCourses } from '@/mocks/courses';
import { CourseSearchModal } from '@/components/CourseSearchModal';
import { Button } from '@/components/Button';
import { Hole, ScorecardScanResult } from '@/types';
import { trpc } from '@/lib/trpc';

interface DetectedPlayer {
  id: string;
  name: string;
  nameConfidence?: number;
  linkedPlayerId?: string;
  isUser?: boolean;
  handicap?: number;
  teeColor?: string;
  scores: {
    holeNumber: number;
    strokes: number;
    confidence?: number;
  }[];
}

interface ScanProgress {
  stage: 'preparing' | 'uploading' | 'analyzing' | 'processing' | 'complete';
  progress: number; // 0-100
  message: string;
}

const TEE_COLORS = [
  { name: 'Black', color: '#000000' },
  { name: 'Blue', color: '#4169E1' },
  { name: 'White', color: '#FFFFFF' },
  { name: 'Yellow', color: '#FFD700' },
  { name: 'Red', color: '#FF0000' },
  { name: 'Green', color: '#008000' },
];

export default function ScanScorecardScreen() {
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const router = useRouter();
  const { 
    players, 
    courses, 
    addRound, 
    scannedData, 
    isScanning: storeScanningState,
    remainingScans,
    setScannedData,
    setIsScanning,
    setRemainingScans,
    clearScanData
  } = useGolfStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [photos, setPhotos] = useState<string[]>([]);
  const [localScanning, setLocalScanning] = useState(false);
  const scanning = localScanning || storeScanningState;
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
  const [scanProgress, setScanProgress] = useState<ScanProgress>({
    stage: 'preparing',
    progress: 0,
    message: 'Preparing to scan...'
  });
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const blockProgressAnim = useRef(new Animated.Value(0)).current;
  const cameraRef = useRef<CameraView>(null);

  // tRPC mutations
  const scanMutation = trpc.scorecard.scanScorecard.useMutation();
  const getRemainingScansQuery = trpc.scorecard.getRemainingScans.useQuery(
    { userId: getCurrentUserId() },
    { enabled: !!getCurrentUserId() }
  );

  // Helper function to get current user ID
  function getCurrentUserId(): string {
    const currentUser = players.find(p => p.isUser);
    return currentUser?.id || generateUniqueId();
  }

  // Reset progress when scanning stops
  useEffect(() => {
    if (!scanning) {
      setScanProgress({ stage: 'preparing', progress: 0, message: 'Preparing to scan...' });
      progressAnim.setValue(0);
      blockProgressAnim.setValue(0);
      stopPulseAnimation();
    }
  }, [scanning]);

  // Helper function to convert image URI to base64
  const convertImageToBase64 = async (uri: string): Promise<string> => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return `data:image/jpeg;base64,${base64}`;
    } catch (error) {
      console.error('Error converting image to base64:', error);
      throw new Error('Failed to process image');
    }
  };

  // Enable LayoutAnimation for Android
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Update remaining scans from query
  useEffect(() => {
    if (getRemainingScansQuery.data !== undefined) {
      setRemainingScans(getRemainingScansQuery.data);
    }
  }, [getRemainingScansQuery.data]);

  // Helper function for confidence-based styling
  const getConfidenceStyle = (confidence?: number) => {
    if (confidence !== undefined && confidence < 0.6) {
      return { backgroundColor: '#FFF3CD', borderColor: '#FFEAA7' }; // Light yellow for low confidence
    }
    return {};
  };
  
  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };
  
  const takePicture = async () => {
    if (!cameraRef.current) return;
    
    try {
      // Actually take a photo using the camera
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });
      
      if (photo?.uri) {
        setPhotos(prev => [...prev, photo.uri]);
      }
    } catch (error) {
      console.error('Error taking picture:', error);
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

  // Progress animation functions
  const updateProgress = (stage: ScanProgress['stage'], progress: number, message: string) => {
    setScanProgress({ stage, progress, message });
    
    // Animate progress bar
    Animated.timing(progressAnim, {
      toValue: progress / 100,
      duration: 500,
      useNativeDriver: false,
    }).start();

    // Smooth block animation - moves independently but guided by progress
    // This creates continuous movement even when percentage doesn't change
    const targetBlockProgress = progress / 100;
    Animated.timing(blockProgressAnim, {
      toValue: targetBlockProgress,
      duration: Math.random() * 3000 + 2000, // 2-5 seconds, varies for natural feel
      useNativeDriver: false,
    }).start();
  };

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopPulseAnimation = () => {
    pulseAnim.stopAnimation();
    Animated.timing(pulseAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };
  
  const processScorecard = async () => {
    if (photos.length === 0) {
      Alert.alert('Error', 'Please take or select at least one photo first.');
      return;
    }

    const startTime = Date.now();
    console.log('⏱️ TIMING: Process Scorecard started at', new Date().toLocaleTimeString());

    setIsScanning(true);
    clearScanData();
    startPulseAnimation();

    try {
      // Stage 1: Preparing images (0-15%)
      updateProgress('preparing', 5, 'Preparing images for analysis...');
      await new Promise(resolve => setTimeout(resolve, 500));

      updateProgress('uploading', 10, 'Processing image data...');
      
      // Convert images to base64 with progress updates
      const base64Images: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const progress = 10 + (5 * (i + 1) / photos.length);
        updateProgress('uploading', progress, `Processing image ${i + 1} of ${photos.length}...`);
        
        const base64Image = await convertImageToBase64(photos[i]);
        base64Images.push(base64Image);
        
        // Small delay for visual feedback
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Stage 2: Sending to AI (15-25%)
      updateProgress('analyzing', 20, 'Connecting to AI analysis...');
      await new Promise(resolve => setTimeout(resolve, 800));

      updateProgress('analyzing', 25, 'AI is reading your scorecard...');

      // Stage 3: AI Processing simulation (25-90%) - Slower progression to 90%
      const progressSteps = [
        { progress: 30, message: 'Detecting players and scores...' },
        { progress: 40, message: 'Analyzing handwriting patterns...' },
        { progress: 50, message: 'Extracting hole information...' },
        { progress: 60, message: 'Reading score values...' },
        { progress: 70, message: 'Analyzing confidence levels...' },
        { progress: 78, message: 'Cross-referencing data...' },
        { progress: 85, message: 'Validating extracted data...' },
        { progress: 90, message: 'Finalizing results...' }
      ];

      // Start the actual API call
      const apiCallPromise = scanMutation.mutateAsync({
        images: base64Images,
        userId: getCurrentUserId()
      });

      // Simulate progress while waiting for API (faster since Files API is much quicker)
      for (const step of progressSteps) {
        updateProgress('analyzing', step.progress, step.message);
        await new Promise(resolve => setTimeout(resolve, Math.random() * 3000 + 2000)); // 2-5s per step (faster)
      }

      // Stage 4: Wait at 90% for API completion
      console.log('⏱️ TIMING: Reached 90% at', new Date().toLocaleTimeString(), `(${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
      updateProgress('processing', 90, 'Waiting for AI completion...');
      
      const response = await apiCallPromise;
      
      // Fill blocks completely when we get response, then go to 100%
      updateProgress('processing', 100, 'Processing complete!');
      
      // Fill blocks to 100% immediately for visual cohesion
      Animated.timing(blockProgressAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: false,
      }).start();
      
      console.log('⏱️ TIMING: OpenAI response received at', new Date().toLocaleTimeString(), `(${Math.round((Date.now() - startTime) / 1000)}s total)`);

      updateProgress('complete', 100, 'Scan complete!');
      console.log('⏱️ TIMING: Process completed at', new Date().toLocaleTimeString(), `(${Math.round((Date.now() - startTime) / 1000)}s total)`);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Update remaining scans count
      setRemainingScans(response.remainingScans);
      
      // Store scanned data
      setScannedData(response.data);

      // Stop animations
      stopPulseAnimation();

      // Check overall confidence - if too low, offer to retake
      if (response.data.overallConfidence < 0.6) {
        Alert.alert(
          'Low Confidence Detected',
          `The scan confidence is ${Math.round(response.data.overallConfidence * 100)}%. The extracted data may not be accurate. Would you like to retake the photos or continue with manual editing?`,
          [
            {
              text: 'Retake Photos',
              onPress: () => {
                setPhotos([]);
                setProcessingComplete(false);
                setDetectedPlayers([]);
                clearScanData();
                setScanProgress({ stage: 'preparing', progress: 0, message: 'Preparing to scan...' });
                progressAnim.setValue(0);
              }
            },
            {
              text: 'Continue & Edit',
              onPress: () => processAIResults(response.data)
            }
          ]
        );
      } else {
        processAIResults(response.data);
      }

    } catch (error) {
      console.error('Scan error:', error);
      stopPulseAnimation();
      
      Alert.alert(
        'Scan Failed', 
        error instanceof Error ? error.message : 'Failed to scan scorecard. Please try again.',
        [
          {
            text: 'Retry',
            onPress: () => processScorecard()
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              setScanProgress({ stage: 'preparing', progress: 0, message: 'Preparing to scan...' });
              progressAnim.setValue(0);
            }
          }
        ]
      );
    } finally {
      setIsScanning(false);
    }
  };

  const processAIResults = (scanResult: ScorecardScanResult) => {
    const currentUser = players.find(p => p.isUser);
    
    // Convert AI results to DetectedPlayer format
    const aiDetectedPlayers: DetectedPlayer[] = scanResult.players.map(player => ({
      id: generateUniqueId(),
      name: player.name,
      nameConfidence: player.nameConfidence,
      teeColor: 'Blue', // Default tee color, user can change
      scores: player.scores
        .filter(score => score.score !== null) // Filter out null scores
        .map(score => ({
          holeNumber: score.hole,
          strokes: score.score!,
          confidence: score.confidence
        }))
    }));

    // Auto-link players with existing players and mark user
    const linkedPlayers = autoLinkPlayers(aiDetectedPlayers);

    // If course name was detected and matched, set it
    if (scanResult.courseName) {
      const matchedCourse = courses.find(c => 
        c.name.toLowerCase().includes(scanResult.courseName!.toLowerCase()) ||
        scanResult.courseName!.toLowerCase().includes(c.name.toLowerCase())
      );
      if (matchedCourse) {
        setSelectedCourse(matchedCourse.id);
      }
    }

    // If date was detected, set it
    if (scanResult.date) {
      setDate(scanResult.date);
    }

    setDetectedPlayers(linkedPlayers);
    setProcessingComplete(true);
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

  // Auto-link players with exact name matches after scanning
  const autoLinkPlayers = (detectedPlayers: DetectedPlayer[]): DetectedPlayer[] => {
    return detectedPlayers.map(player => {
      // Skip if already linked
      if (player.linkedPlayerId) return player;
      
      // Look for exact match first
      const exactMatch = players.find(p => p.name.toLowerCase() === player.name.toLowerCase());
      if (exactMatch) {
        const updatedPlayer = {
          ...player,
          linkedPlayerId: exactMatch.id,
          handicap: exactMatch.handicap
        };
        
        // If this exact match is the current user, mark as user
        if (exactMatch.isUser) {
          updatedPlayer.isUser = true;
        }
        
        return updatedPlayer;
      }
      
      return player;
    });
  };
  
  const handleEditPlayerName = (index: number, newName: string) => {
    setDetectedPlayers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], name: newName };
      
      // Auto-link if exact match found
      const exactMatch = players.find(p => p.name.toLowerCase() === newName.toLowerCase());
      if (exactMatch && !updated[index].linkedPlayerId) {
        updated[index].linkedPlayerId = exactMatch.id;
        updated[index].handicap = exactMatch.handicap;
        
        // If this exact match is the current user, mark as user
        if (exactMatch.isUser) {
          // First remove isUser from all other players
          updated.forEach(p => p.isUser = false);
          updated[index].isUser = true;
        }
      }
      
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
    
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    
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
  
  const endDragging = () => {
    setDraggingPlayerIndex(null);
  };

  const handlePlayerDrop = (dropIndex: number) => {
    if (draggingPlayerIndex !== null && draggingPlayerIndex !== dropIndex) {
      handleReorderPlayers(draggingPlayerIndex, dropIndex);
    }
    endDragging();
  };
  
  const handleSelectCourse = (course: any) => {
    setSelectedCourse(course.id);
    setShowCourseSearchModal(false);
  };

  const buildPrefillHoles = (): Hole[] => {
    // For now, since we don't have actual par data from scorecard scanning yet,
    // we'll default to par 4 for all holes. When scorecard scanning is implemented,
    // this should extract the actual par data from the scanned scorecard.
    return Array.from({ length: 18 }, (_, i) => ({ 
      number: i + 1, 
      par: 4, 
      distance: 0 
    }));
  };

  const handleAddCourseManually = () => {
    const holesPrefill = buildPrefillHoles();
    router.push({ pathname: '/manual-course-entry', params: { holes: JSON.stringify(holesPrefill) } });
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
            <Users size={18} color={activeTab === 'scores' ? colors.primary : colors.text} />
            <Text style={[styles.tabText, activeTab === 'scores' && styles.activeTabText]}>Scores</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'details' && styles.activeTab]}
            onPress={() => setActiveTab('details')}
          >
            <MapPin size={18} color={activeTab === 'details' ? colors.primary : colors.text} />
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
                  <View key={player.id}>
                    {draggingPlayerIndex !== null && draggingPlayerIndex !== index && (
                      <TouchableOpacity 
                        style={styles.dropZone}
                        onPress={() => handlePlayerDrop(index)}
                      >
                        <Text style={styles.dropZoneText}>Drop here to reorder</Text>
                      </TouchableOpacity>
                    )}
                    
                    <View 
                      style={[
                        styles.playerCard,
                        draggingPlayerIndex === index && styles.draggingPlayerCard
                      ]}
                    >
                      <View style={styles.playerHeader}>
                        <TouchableOpacity 
                          style={styles.dragHandle}
                          onLongPress={() => startDragging(index)}
                          onPressOut={() => endDragging()}
                          delayLongPress={500}
                        >
                          <GripVertical size={18} color={draggingPlayerIndex === index ? colors.primary : colors.text} />
                        </TouchableOpacity>
                      
                      <View style={styles.playerNameContainer}>
                        <TextInput
                          style={[
                            styles.playerNameInput,
                            getConfidenceStyle(player.nameConfidence)
                          ]}
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
                              { color: scoreColor },
                              getConfidenceStyle(playerScore?.confidence)
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
          onAddManualCourse={handleAddCourseManually}
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
              title={scanning ? "Processing..." : "Process Scorecard"}
              onPress={processScorecard}
              disabled={scanning}
              loading={scanning}  
              style={styles.previewButton}
            />
          </View>

          {remainingScans < 50 && (
            <View style={styles.scanLimitContainer}>
              <Text style={styles.scanLimitText}>
                {remainingScans} scans remaining today
              </Text>
            </View>
          )}
          
          {scanning && (
            <View style={styles.progressOverlay}>
              <Animated.View 
                style={[
                  styles.progressContainer,
                  { transform: [{ scale: pulseAnim }] }
                ]}
              >
                <View style={styles.progressHeader}>
                  <Text style={styles.progressTitle}>Analyzing Scorecard</Text>
                  <Text style={styles.progressSubtitle}>{scanProgress.message}</Text>
                </View>
                
                <View style={styles.progressBarContainer}>
                  <View style={styles.progressBarBackground}>
                    <Animated.View 
                      style={[
                        styles.progressBarFill,
                        { width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%']
                        })}
                      ]} 
                    />
                  </View>
                  <Text style={styles.progressText}>
                    {Math.round(scanProgress.progress)}%
                  </Text>
                </View>
                
                <View style={styles.analysisIndicator}>
                  <View style={styles.analysisGrid}>
                    {Array.from({ length: 12 }, (_, i) => {
                      return (
                        <View key={i} style={styles.analysisCell}>
                          <Animated.View
                            style={[
                              styles.analysisCellFill,
                              {
                                width: blockProgressAnim.interpolate({
                                  inputRange: [i/12, (i+1)/12],
                                  outputRange: ['0%', '100%'],
                                  extrapolate: 'clamp'
                                }),
                                opacity: blockProgressAnim.interpolate({
                                  inputRange: [i/12 - 0.05, i/12],
                                  outputRange: [0.3, 1],
                                  extrapolate: 'clamp'
                                })
                              }
                            ]}
                          />
                        </View>
                      );
                    })}
                  </View>
                  <Text style={styles.analysisText}>
                    AI is processing your scorecard data...
                  </Text>
                </View>
              </Animated.View>
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
                  


                  {/* Progress Overlay */}
                  {scanning && (
                    <View style={styles.progressOverlay}>
                      <Animated.View 
                        style={[
                          styles.progressContainer,
                          { transform: [{ scale: pulseAnim }] }
                        ]}
                      >
                        <View style={styles.progressHeader}>
                          <Text style={styles.progressTitle}>Analyzing Scorecard</Text>
                          <Text style={styles.progressSubtitle}>{scanProgress.message}</Text>
                        </View>
                        
                        <View style={styles.progressBarContainer}>
                          <View style={styles.progressBarBackground}>
                            <Animated.View 
                              style={[
                                styles.progressBarFill,
                                { width: progressAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: ['0%', '100%']
                                })}
                              ]} 
                            />
                          </View>
                          <Text style={styles.progressText}>
                            {Math.round(scanProgress.progress)}%
                          </Text>
                        </View>
                        
                        <View style={styles.analysisIndicator}>
                          <View style={styles.analysisGrid}>
                            {Array.from({ length: 12 }, (_, i) => {
                              return (
                                <View key={i} style={styles.analysisCell}>
                                  <Animated.View
                                    style={[
                                      styles.analysisCellFill,
                                      {
                                        width: blockProgressAnim.interpolate({
                                          inputRange: [i/12, (i+1)/12],
                                          outputRange: ['0%', '100%'],
                                          extrapolate: 'clamp'
                                        }),
                                        opacity: blockProgressAnim.interpolate({
                                          inputRange: [i/12 - 0.05, i/12],
                                          outputRange: [0.3, 1],
                                          extrapolate: 'clamp'
                                        })
                                      }
                                    ]}
                                  />
                                </View>
                              );
                            })}
                          </View>
                          <Text style={styles.analysisText}>
                            AI is processing your scorecard data...
                          </Text>
                        </View>
                      </Animated.View>
                    </View>
                  )}
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
  dropZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  dropZoneText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '500',
    textAlign: 'center',
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 8,
  },
  scanLimitContainer: {
    padding: 8,
    backgroundColor: `${colors.primary}15`,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  scanLimitText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  // Progress overlay styles
  progressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  progressContainer: {
    backgroundColor: colors.background,
    borderRadius: 20,
    padding: 32,
    margin: 24,
    alignItems: 'center',
    minWidth: 300,
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  progressHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  progressTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  progressSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  progressBarContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 24,
  },
  progressBarBackground: {
    width: '100%',
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  analysisIndicator: {
    alignItems: 'center',
  },
  analysisGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 180,
    height: 36,
    marginBottom: 16,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
    padding: 6,
  },
  analysisCell: {
    width: 26,
    height: 10,
    marginHorizontal: 1,
    marginVertical: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  analysisCellFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
    position: 'absolute',
    left: 0,
    top: 0,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  analysisCellActive: {
    backgroundColor: colors.primary,
  },
  analysisText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});