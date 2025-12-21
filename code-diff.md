heres the diff from scan scorecard, dont change anything just investigate more:
here is review changes diff:
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Image,
  LayoutAnimation,
  Platform,
  UIManager,
  useWindowDimensions,
  Modal,
  Animated,
  Easing
  Modal
} from 'react-native';
import { PanGestureHandler, State, FlatList } from 'react-native-gesture-handler';
// @ts-ignore - local ambient types provided via declarations
import DraggableFlatList from 'react-native-draggable-flatlist';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConvex } from "convex/react";
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as ScreenOrientation from 'expo-screen-orientation';
import {
  Camera,
  Image as ImageIcon,
  Calendar,
  Trash2,
  Flag,
  RotateCcw,
  ChevronRight,
  Maximize2,
  Smartphone
  RotateCcw
} from 'lucide-react-native';
import { Check } from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { generateUniqueId, ensureValidDate } from '@/utils/helpers';
import { useGolfStore } from '@/store/useGolfStore';
import { mockCourses } from '@/mocks/courses';
import { CourseSearchModal } from '@/components/CourseSearchModal';
import { Button } from '@/components/Button';
import { Hole, ScorecardScanResult, ApiCourseData, Course, Player } from '@/types';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useAction, useMutation, useQuery } from '@/lib/convex';
import { useConvex } from "convex/react";
import { searchCourses } from '@/lib/golf-course-api';
import { convertApiCourseToLocal, getDeterministicCourseId } from '@/utils/course-helpers';
import { matchCourseToLocal, extractUserLocation, LocationData } from '@/utils/course-matching';
  prevName?: string;
  teeColor?: string;
  teeGender?: 'M' | 'F';
  // When scanning from session, store the scanned name if different from session player name
  detectedAsName?: string;
  // Flag to indicate this player came from a pre-round session (locked, non-editable)
  isFromSession?: boolean;
  // Track which scanned player index was assigned (for cycling)
  scannedPlayerIndex?: number;
  scores: {
    holeNumber: number;
    strokes: number;
// Maximum number of scorecard images per scan (multi-page scorecards)
const MAX_IMAGES = 3;

// Module-level set to track which scan jobs have had their course restored
// This persists across component remounts to prevent infinite loops
const restoredCourseJobIds = new Set<string>();

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // --- Loading & Permissions ---
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#000',
  },
  permissionIcon: {
    marginBottom: 24,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: '#AAA',
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    minWidth: 200,
  },
  headerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '500',
  },

  // --- Scan Camera Styles ---
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pillText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  startRoundButton: {
    backgroundColor: 'rgba(30, 96, 89, 0.9)', // Golf Green
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  startRoundText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  centerGuide: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  scanFrame: {
    width: '95%',
    aspectRatio: 1.4, // Landscape scorecard
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderColor: '#FFF',
    borderWidth: 4,
    borderRadius: 10,
  },
  topLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  topRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  bottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  bottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  guideText: {
    color: '#FFF',
    marginTop: 20,
    fontSize: 16,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bottomGradient: {
    paddingTop: 40,
    paddingBottom: 40,
  },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  sideControl: {
    alignItems: 'center',
    width: 60,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  controlLabel: {
    color: '#FFF',
    fontSize: 12,
  },
  shutterButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF',
  },
  webFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },

  // --- Preview & Gallery Styles ---
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.6,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
  },
  highlightText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  galleryContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  galleryScrollContent: {
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  photoCard: {
    width: 280,
    height: 420, // Portrait card
    backgroundColor: '#222',
    borderRadius: 20,
    marginHorizontal: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    justifyContent: 'flex-end',
    padding: 16,
  },
  photoIndexText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  deletePhotoButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewBottomBar: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  previewActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  secondaryActionButton: {
    alignItems: 'center',
    width: 60,
  },
  secondaryActionText: {
    color: '#FFF',
    fontSize: 11,
    marginTop: 4,
  },
  primaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  primaryActionText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 4,
  },

  // --- Edit Mode / Results Styles ---
  resultsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)', // Subtle dimming
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  resultsCard: {
    height: '92%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  customHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  customHeaderButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  customHeaderButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    color: '#888',
    fontSize: 14,
    marginLeft: 6,
    fontWeight: '600',
  },
  activeTabText: {
    color: colors.text,
    fontWeight: '700',
  },
  tabContent: {
    marginTop: 16,
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#000',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },

  // Sections
  sectionContainer: {
    marginBottom: 24,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionHeaderColumn: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 12,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#AAA',
    marginBottom: 8,
  },

  // Players List
  addPlayerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(29, 90, 84, 0.2)',
    borderRadius: 8,
  },
  addPlayerText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
    marginLeft: 4,
  },
  infoBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#CCC',
    marginBottom: 4,
    lineHeight: 18,
  },
  playerCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  userPlayerCard: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(29, 90, 84, 0.1)',
  },
  draggingPlayerCard: {
    borderColor: colors.primary,
    transform: [{ scale: 1.02 }],
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  playerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dragHandle: {
    padding: 8,
    marginRight: 4,
  },
  playerNameInline: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginLeft: 4,
    paddingVertical: 4,
  },
  detectedAsText: {
    fontSize: 12,
    color: '#AAA',
    fontStyle: 'italic',
    marginLeft: 4,
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  userBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  sessionBadge: {
    backgroundColor: '#444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  sessionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DDD',
  },
  linkedBadge: {
    backgroundColor: '#444',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
  },
  linkedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DDD',
  },
  playerAction: {
    padding: 6,
    marginLeft: 8,
  },
  playerDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  handicapContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  handicapLabel: {
    fontSize: 14,
    color: '#AAA',
    marginRight: 8,
  },
  handicapInput: {
    height: 32,
    minWidth: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#666',
    color: '#FFF',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  handicapInputDisabled: {
    color: '#888',
    borderBottomColor: 'transparent',
  },
  teeColorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  teeColorLabel: {
    fontSize: 14,
    color: '#AAA',
    marginRight: 8,
  },
  teeColorSelector: {
    backgroundColor: '#333',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  teeColorText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
  },

  // Scores Tab
  retakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  retakeRowText: {
    flex: 1,
    color: '#DDD',
    fontSize: 13,
    marginHorizontal: 10,
  },
  retakeButton: {
    minHeight: 32,
  },
  scoresTable: {
    backgroundColor: '#222',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  scoresTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#333',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  scoresTableHeaderCell: {
    paddingVertical: 12,
    textAlign: 'center',
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  headerLabel: {
    fontWeight: '700',
  },
  holeBandCell: {
    width: 44,
    backgroundColor: '#2A2A2A',
  },
  holeParCell: {
    width: 44,
    backgroundColor: '#222',
  },
  holeHeaderLabel: {
    color: '#AAA',
  },
  playerScoreCell: {
    flex: 1,
    minWidth: 50,
    borderLeftWidth: 1,
    borderLeftColor: '#333',
  },
  headerWhiteCell: {
    color: '#FFF',
  },
  scoresTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  scoresTableCell: {
    paddingVertical: 12,
    textAlign: 'center',
    color: '#FFF',
    fontSize: 15,
    justifyContent: 'center',
  },
  holeNumberText: {
    fontWeight: '600',
    color: '#FFF',
  },
  scoreInput: {
    flex: 1,
    padding: 0,
    textAlign: 'center',
    color: '#FFF',
    fontWeight: '600',
    fontSize: 15,
  },

  // Details Tab
  courseSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#222',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  selectedCourseText: {
    fontSize: 16,
    color: '#FFF',
    flex: 1,
  },
  placeholderText: {
    fontSize: 16,
    color: '#888',
    flex: 1,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  dateIcon: {
    marginRight: 10,
  },
  dateInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFF',
  },
  notesInput: {
    backgroundColor: '#222',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    color: '#FFF',
    fontSize: 16,
    height: 100,
    textAlignVertical: 'top',
  },

  // Bottom Actions
  bottomBar: {
    padding: 16,
    backgroundColor: '#000',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  saveButton: {
    width: '100%',
  },

  // Player Linking
  linkingTitle: {
    fontSize: 16,
    color: '#FFF',
    marginBottom: 20,
    lineHeight: 24,
  },
  playerLinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1A1A1A',
    marginBottom: 12,
    borderRadius: 12,
  },
  playerLinkItemSelected: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'rgba(29, 90, 84, 0.1)',
  },
  playerLinkAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  playerLinkInitial: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
  },
  playerLinkInfo: {
    flex: 1,
  },
  playerLinkName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  playerLinkHandicap: {
    fontSize: 13,
    color: '#AAA',
  },
  noPlayersContainer: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    marginTop: 20,
  },
  noPlayersText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
  },
  noPlayersSubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  noPlayersButton: {
    minWidth: 200,
  },

  // Tee Picker Sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
  },
  sheetTabs: {
    flexDirection: 'row',
    backgroundColor: '#333',
    borderRadius: 12,
    padding: 4,
  },
  sheetTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  sheetTabActive: {
    backgroundColor: '#555',
  },
  sheetTabText: {
    fontSize: 14,
    color: '#AAA',
    fontWeight: '600',
  },
  sheetTabTextActive: {
    color: '#FFF',
  },
  sheetList: {
    maxHeight: 400,
  },
  sheetListContent: {
    paddingBottom: 40,
  },
  teeOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  teeOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  teeOptionGender: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  radioInnerActive: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  emptyTeeText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 20,
    fontSize: 14,
  },
  dropZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 90, 84, 0.1)',
    zIndex: 10,
  },
  dropZoneText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  rotateOverlay: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  rotateText: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 10,
    textAlign: 'center',
  },
  rotateSubText: {
    color: '#AAA',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  leftControlBar: {
    width: 100,
    height: '100%',
    paddingVertical: 20,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  rightControlBar: {
    width: 120,
    height: '100%',
    paddingVertical: 20,
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
});
export default function ScanScorecardScreen() {
  console.log('[ScanScorecard] RENDER START');
  const { courseId, editRoundId, prefilled, review, sessionId } = useLocalSearchParams<{ courseId?: string, editRoundId?: string, prefilled?: string, review?: string, sessionId?: string }>();
  const { courseId, editRoundId, prefilled, review } = useLocalSearchParams<{ courseId?: string, editRoundId?: string, prefilled?: string, review?: string }>();
  const router = useRouter();
  const {
    players,
    clearPendingScanCourseSelection,
  } = useGolfStore();
  const [permission, requestPermission] = useCameraPermissions();
  // const [permission, requestPermission] = useCameraPermissions();
  // const permission = { granted: true, status: 'granted', canAskAgain: true };
  // const requestPermission = async () => ({ granted: true, status: 'granted', canAskAgain: true });
  const profile = useQuery(api.users.getProfile);
  const roundsSummary = useQuery(
    api.rounds.listWithSummary,
    profile?._id ? { hostId: profile._id as Id<"users"> } : "skip"
  ) || [];
  const userGender = (profile as any)?.gender as "M" | "F" | undefined;

  // Convex actions for course lookup (to check global cache before paid API)
  const convex = useConvex();
  const getConvexCourseByExternalId = (args: any) => convex.query(api.courses.getByExternalId, args);
  const upsertCourse = useMutation(api.courses.upsert);

  // Active game session for linking scanned rounds
  // If sessionId is passed, we're scanning for that specific session
  const activeSession = useQuery(api.gameSessions.getActive) as any;
  const linkSessionRound = useMutation(api.gameSessions.linkRound);
  const completeWithSettlement = useMutation(api.gameSessions.completeWithSettlement);
  const saveConvexRound = useMutation(api.rounds.saveRound);
  const addPlayerAlias = useMutation(api.players.addAlias);

  // When we have an active session, use its course and participants
  const sessionCourseId = activeSession?.courseId as string | undefined;
  // playerDetails is the merged structure from getActive query (includes player names)
  const sessionParticipants = (activeSession?.playerDetails || []) as Array<{
    playerId: string;
    name: string;
    handicapIndex: number;
    teeName?: string;
    teeGender?: string;
    courseHandicap: number;
    aliases?: string[];
  }>;
  // Use active session automatically if one exists (don't require sessionId URL param)
  const hasActiveSession = !!activeSession;

  // Query session course from Convex for par data
  const sessionCourseData = useQuery(
    api.courses.getById,
    sessionCourseId ? { courseId: sessionCourseId as any } : 'skip'
  ) as any;

  const [facing, setFacing] = useState<CameraType>('back');
  const photos = pendingScanPhotos;
  const scanning = storeScanningState;
  const [processingComplete, setProcessingComplete] = useState(false);
  const [detectedPlayers, setDetectedPlayers] = useState<DetectedPlayer[]>([]);
  // Store scanned players for session mode cycling
  const [sessionScannedPlayers, setSessionScannedPlayers] = useState<Array<{
    index: number;
    name: string;
    scores: { holeNumber: number; strokes: number; confidence?: number }[];
  }>>([]);
  const [showPlayerLinking, setShowPlayerLinking] = useState(false);
  const [selectedPlayerIndex, setSelectedPlayerIndex] = useState<number | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const preDragPlayersRef = useRef<DetectedPlayer[] | null>(null);
  const hasInitializedPrefill = useRef(false);
  const hasAppliedCourseSelection = useRef(false);
  const hasRestoredCourseFromJob = useRef(false);
  const currentUser = React.useMemo(
    () => players.find((p) => p.isUser) || (profile ? ({ id: profile._id, isUser: true, handicap: (profile as any)?.handicap, name: profile.name } as any) : null),
    [players, profile]
    return currentUser?.id || generateUniqueId();
  });

  useEffect(() => {
    console.log('[ScanScorecard] MOUNTED');
    return () => console.log('[ScanScorecard] UNMOUNTED');
  }, []);

  console.log('[ScanScorecard] State:', {
    permissionStatus: permission?.status,
    permissionGranted: permission?.granted,
    isEditMode,
    isReviewMode,
    processingComplete
  });

  // Convex actions/mutations
  const processScanAction = useAction(api.scorecard.processScan);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const buildDevSampleResult = (): ScorecardScanResult => {
    // When we have an active session, use its participant names for realism
    const playerNames = hasActiveSession && sessionParticipants.length > 0
      ? sessionParticipants.map((p: any) => p.name || 'Unknown')
      : ['Miguel', 'Alex'];

    return {
      courseName: hasActiveSession && activeSession?.course?.name
        ? activeSession.course.name
        : 'Dev National - Demo Course',
      courseNameConfidence: 0.9,
      date: new Date().toISOString().split('T')[0],
      dateConfidence: 0.9,
      overallConfidence: 0.9,
      players: playerNames.map((name: string, idx: number) => ({
        name,
        nameConfidence: 0.95 - idx * 0.05,
        scores: Array.from({ length: 18 }).map((_, holeIdx) => ({
          hole: holeIdx + 1,
          score: 4 + (holeIdx % 3) + (idx % 2), // Varied realistic scores
          confidence: 0.9 - idx * 0.05,
  const buildDevSampleResult = (): ScorecardScanResult => ({
    courseName: 'Dev National - Demo Course',
    courseNameConfidence: 0.9,
    date: new Date().toISOString().split('T')[0],
    dateConfidence: 0.9,
    overallConfidence: 0.9,
    players: [
      {
        name: 'Miguel',
        nameConfidence: 0.95,
        scores: Array.from({ length: 18 }).map((_, idx) => ({
          hole: idx + 1,
          score: idx % 3 === 0 ? 5 : 4,
          confidence: 0.9,
        })),
      })),
    };
  };
      },
      {
        name: 'Alex',
        nameConfidence: 0.9,
        scores: Array.from({ length: 18 }).map((_, idx) => ({
          hole: idx + 1,
          score: idx % 4 === 0 ? 6 : 5,
          confidence: 0.85,
        })),
      },
    ],
  });

  // Helper function to get current user ID
  function getCurrentUserId(): string { return userId; }
    }
  }, [isEditMode, prefilled]);

  useEffect(() => {
    if (!selectedCourse) return;
    const isLocal = courses.some(c => c.id === selectedCourse);
    setIsLocalCourseSelected((prev) => (prev === isLocal ? prev : isLocal));
  }, [selectedCourse, courses]);
  // Note: isLocalCourseSelected is set explicitly in handleSelectCourse and other handlers
  // Removed the sync effect here to prevent infinite re-renders

  // Helper: to base64 (full quality)
  const convertImageToBase64 = async (uri: string): Promise<string> => {
    }
  }, []);

  const { width, height } = useWindowDimensions();
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Note: Landscape orientation commented out - requires dev build to work in Expo Go
  // const isLandscape = width > height;

  // Update remaining scans from query
  // TODO: reinstate remaining scans fetch if needed; removed legacy tRPC hook usage.

    }

    // If there's a course already selected in the active scan job, apply it
    if (activeScanJob?.selectedCourseId && !selectedCourse) {
    // Use module-level Set to prevent repeated restores (same guard as in processAIResults)
    if (activeScanJob?.selectedCourseId && activeScanJob.id && !restoredCourseJobIds.has(activeScanJob.id)) {
      restoredCourseJobIds.add(activeScanJob.id);
      console.log('[SCAN] Restoring course selection from activeScanJob:', activeScanJob.selectedCourseId);
      setSelectedCourse(activeScanJob.selectedCourseId);
      if (activeScanJob.selectedTeeName) {
      return;
    }

    // When we have an active session, use its course automatically
    if (hasActiveSession && sessionCourseId && !selectedCourse) {
      setSelectedCourse(sessionCourseId);
      setIsLocalCourseSelected(true);
      hasAppliedCourseSelection.current = true;
      return;
    }

    // Only auto-open course selector if no course selected, modal not already shown, AND no active session
    if (!selectedCourse && !selectedApiCourse && !showCourseSearchModal && !isLocalCourseSelected && !hasActiveSession) {
    // Only auto-open course selector if no course selected and modal not already shown
    if (!selectedCourse && !selectedApiCourse && !showCourseSearchModal && !isLocalCourseSelected) {
      // Small timeout to ensure transition/mount is done
      const timer = setTimeout(() => {
        setShowCourseSearchModal(true);
        setCoursePickerSource('review');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isReviewMode, processingComplete, selectedCourse, selectedApiCourse, showCourseSearchModal, isLocalCourseSelected, pendingScanCourseSelection, activeScanJob, hasActiveSession, sessionCourseId]);
  }, [isReviewMode, processingComplete, selectedCourse, selectedApiCourse, showCourseSearchModal, isLocalCourseSelected, pendingScanCourseSelection, activeScanJob]);

  // Helper function for confidence-based styling
  const getConfidenceStyle = (confidence?: number) => {
    }
  };

  // Take photo using system camera (for when CameraView isn't mounted, e.g., in preview mode)
  const takePhotoWithSystemCamera = async () => {
    if (photos.length >= MAX_IMAGES) {
      Alert.alert(
        'Maximum Images Reached',
        `You can upload up to ${MAX_IMAGES} scorecard images per scan. Remove an image to add a new one.`
      );
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const newPhoto = asset.base64
          ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`
          : asset.uri;
        setPendingScanPhotos([...photos, newPhoto]);
      }
    } catch (error) {
      console.error('Error taking photo with system camera:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const pickImage = async () => {
    // Check if we've reached the maximum number of images
    if (photos.length >= MAX_IMAGES) {
        setSelectedApiCourse(null);
        setIsLocalCourseSelected(false);
        setIsScanning(false);
        // Only open course picker if NO active session - otherwise use session's course
        if (!hasActiveSession) {
          setShowCourseSearchModal(true);
          setCoursePickerSource('scan');
        } else if (sessionCourseId) {
          // Auto-select the session's course
          setSelectedCourse(sessionCourseId);
          setIsLocalCourseSelected(true);
        }
        // Open course/tee picker while "analysis" runs in dev.
        setShowCourseSearchModal(true);
        setCoursePickerSource('scan');
        return;
      }

          });
        });

      // Navigate to home immediately and show course selection modal there
      // Show course selection modal while processing happens in background
      setProcessingComplete(false);
      setDetectedPlayers([]);
      setSelectedApiCourse(null);
      setIsLocalCourseSelected(false);
      setIsScanning(false);

      // Navigate first, then trigger modal with a slight delay to avoid race condition
      console.log('[SCAN] Navigating to home...');
      router.replace('/');
      // Open course selector locally instead of navigating to home
      console.log('[SCAN] Opening local course selector...');
      setShowCourseSearchModal(true);
      setCoursePickerSource('scan');

      // Small delay to ensure navigation completes before showing modal
      // BUT never show course search if we have an active session
      setTimeout(() => {
        if (!hasActiveSession) {
          console.log('[SCAN] Setting shouldShowScanCourseModal to TRUE after delay');
          setShouldShowScanCourseModal(true);
        } else {
          console.log('[SCAN] Skipping course modal - has active session');
        }
      }, 100);
      return;

    } catch (error) {
  };

  const processAIResults = (scanResult: ScorecardScanResult) => {
    // Guard: Don't reprocess if we already have detected players from a previous call
    if (detectedPlayers.length > 0 && processingComplete) {
      return;
    }

    const currentUser = players.find(p => p.isUser);
    const teeFromResult = (scanResult as any).teeName as string | undefined;
    const teeOverride = teeFromResult || activeScanJob?.selectedTeeName || selectedTeeName;

    // Restore course selection from activeScanJob if present (e.g., after app reload)
    if (activeScanJob?.selectedCourseId) {
    // Use module-level Set to prevent repeated restores across component remounts
    if (activeScanJob?.selectedCourseId && activeScanJob.id && !restoredCourseJobIds.has(activeScanJob.id)) {
      restoredCourseJobIds.add(activeScanJob.id);
      console.log('[SCAN] processAIResults: Restoring course from activeScanJob:', activeScanJob.selectedCourseId);
      setSelectedCourse(activeScanJob.selectedCourseId as string);
      setIsLocalCourseSelected(true);  // Prevent modal from reopening
      if (activeScanJob.selectedTeeName) {
        setSelectedTeeName(activeScanJob.selectedTeeName);
      }
    }

    // If we have an active session, use session participants as the source of truth
    // Only extract SCORES from the scan and match them to session players
    if (hasActiveSession && sessionParticipants.length > 0) {
      console.log('[SCAN] Session mode: using session participants as players');

      // Build a mapping of scanned players with their scores and index
      const scannedPlayers = scanResult.players.map((p, idx) => ({
        index: idx,
        name: p.name,
        nameLower: p.name.toLowerCase().trim(),
        scores: p.scores
          .filter(s => s.score !== null)
          .map(s => ({
            holeNumber: s.hole,
            strokes: s.score!,
            confidence: s.confidence
          }))
      }));

      // Track which scanned player indices have been assigned
      const usedIndices = new Set<number>();

      // STEP 1: Compute distance matrix for all session participants to all scanned players
      // This allows optimal global assignment instead of greedy per-participant
      const distanceMatrix: { pIdx: number; sIdx: number; distance: number; scanned: typeof scannedPlayers[0] }[] = [];

      for (let pIdx = 0; pIdx < sessionParticipants.length; pIdx++) {
        const participant = sessionParticipants[pIdx];
        const participantNameLower = (participant.name || '').toLowerCase().trim();
        const participantNamesToMatch = [
          participantNameLower,
          ...(participant.aliases || []).map(a => a.toLowerCase().trim())
        ];

        for (const scanned of scannedPlayers) {
          // Find best match against primary name or any alias
          let bestDistance = Infinity;
          for (const nameToMatch of participantNamesToMatch) {
            const distance = levenshteinDistance(nameToMatch, scanned.nameLower);
            if (distance < bestDistance) {
              bestDistance = distance;
            }
          }
          distanceMatrix.push({ pIdx, sIdx: scanned.index, distance: bestDistance, scanned });
        }
      }

      // STEP 2: Sort by distance (best matches first) and assign greedily from global best
      distanceMatrix.sort((a, b) => a.distance - b.distance);

      const assignmentByParticipant: Map<number, { scanned: typeof scannedPlayers[0]; distance: number }> = new Map();

      for (const entry of distanceMatrix) {
        // Skip if this participant already has an assignment
        if (assignmentByParticipant.has(entry.pIdx)) continue;
        // Skip if this scanned player already used
        if (usedIndices.has(entry.sIdx)) continue;

        // Assign this scanned player to this participant
        assignmentByParticipant.set(entry.pIdx, { scanned: entry.scanned, distance: entry.distance });
        usedIndices.add(entry.sIdx);
      }

      // STEP 3: Create DetectedPlayers from session participants using optimal assignments
      const sessionModePlayers: DetectedPlayer[] = sessionParticipants.map((participant, pIdx) => {
        console.log('[SCAN] Session participant:', JSON.stringify(participant, null, 2));
        const participantNameLower = (participant.name || '').toLowerCase().trim();

        const assignment = assignmentByParticipant.get(pIdx);
        const assigned = assignment ? { ...assignment.scanned, index: assignment.scanned.index, distance: assignment.distance } : null;


        // Use assigned scores, or empty if no match
        const matchedScores = assigned ? assigned.scores : [];
        // Show detected name if it differs from participant name
        const detectedName = assigned && assigned.name.toLowerCase().trim() !== participantNameLower
          ? assigned.name
          : undefined;

        console.log('[SCAN] Name matching:', {
          participantName: participant.name,
          scannedName: assigned?.name,
          assignedIndex: assigned?.index,
          distance: assigned?.distance,
          detectedAsName: detectedName,
          teeName: participant.teeName,
        });

        return {
          id: generateUniqueId(),
          name: participant.name,
          linkedPlayerId: participant.playerId,
          isUser: false,
          handicap: participant.handicapIndex,
          teeColor: participant.teeName || 'Blue',
          teeGender: (participant.teeGender as 'M' | 'F') || 'M',
          detectedAsName: detectedName,
          isFromSession: true,
          scannedPlayerIndex: assigned?.index, // Track which scanned player was assigned
          scores: matchedScores,
        };
      });

      // Mark current user if found
      if (currentUser) {
        const userIdx = sessionModePlayers.findIndex((p: DetectedPlayer) => p.linkedPlayerId === currentUser.id);
        if (userIdx !== -1) {
          sessionModePlayers[userIdx].isUser = true;
        }
      }

      // Auto-select session course (always use session course for session mode)
      console.log('[SCAN] Session course selection:', { sessionCourseId, currentSelectedCourse: selectedCourse });
      if (sessionCourseId) {
        setSelectedCourse(sessionCourseId);
        setIsLocalCourseSelected(true);
        console.log('[SCAN] Set course from session:', sessionCourseId);
      }

      // Set date
      setDate(ensureValidDate(scanResult.date));
      // Save scanned players for cycling feature
      setSessionScannedPlayers(scannedPlayers.map(p => ({
        index: p.index,
        name: p.name,
        scores: p.scores,
      })));
      setDetectedPlayers(sessionModePlayers);
      setProcessingComplete(true);
      return;
    }

    // Regular (non-session) mode: Convert AI results to DetectedPlayer format
    // Convert AI results to DetectedPlayer format
    const aiDetectedPlayers: DetectedPlayer[] = scanResult.players.map(player => ({
      id: generateUniqueId(),
      name: player.name,
  };

  // Auto-link players with exact name matches after scanning
  // When there's an active session, prioritize matching to session participants
  const autoLinkPlayers = (detectedPlayers: DetectedPlayer[]): DetectedPlayer[] => {
    return detectedPlayers.map(player => {
      // Skip if already linked
      if (player.linkedPlayerId) return player;

      const scannedNameLower = player.name.toLowerCase().trim();

      // When we have an active session, prioritize matching to session participants
      if (hasActiveSession && sessionParticipants.length > 0) {
        // First try exact match with session participants
        const exactSessionMatch = sessionParticipants.find(
          p => p.name && p.name.toLowerCase().trim() === scannedNameLower
        );
        if (exactSessionMatch) {
          return {
            ...player,
            linkedPlayerId: exactSessionMatch.playerId,
            handicap: exactSessionMatch.handicapIndex,
            isUser: false, // Will be determined by checking against currentUserId
          };
        }

        // Fuzzy match with session participants (allow up to 2 character differences)
        let bestMatch: { playerId: string; name: string; handicapIndex: number; distance: number } | null = null;
        for (const participant of sessionParticipants) {
          if (!participant.name) continue;
          const distance = levenshteinDistance(scannedNameLower, participant.name.toLowerCase().trim());
          // Accept fuzzy match if within 2 characters difference (nicknames, typos)
          if (distance <= 2 && (!bestMatch || distance < bestMatch.distance)) {
            bestMatch = { ...participant, distance };
          }
        }

        if (bestMatch) {
          return {
            ...player,
            linkedPlayerId: bestMatch.playerId,
            handicap: bestMatch.handicapIndex,
            isUser: false,
          };
        }
      }

      // Fall back to matching against all players (non-session flow)
      // Look for exact match first
      const exactMatch = players.find(p => p.name.toLowerCase() === player.name.toLowerCase());
      if (exactMatch) {
    });
  };


  const handleEditPlayerName = (index: number, newName: string) => {
    // legacy index-based handler retained for safety; forwards to id-based when possible
    const player = detectedPlayers[index];
    });
  };

  // Cycle through scanned player assignments for session mode
  const handleCycleDetectedPlayer = (playerId: string) => {
    if (sessionScannedPlayers.length === 0) return;

    setDetectedPlayers(prev => {
      const updated = prev.map(p => ({ ...p }));
      const playerIdx = updated.findIndex(p => p.id === playerId);
      if (playerIdx < 0) return prev;

      const currentPlayer = updated[playerIdx];
      const currentScannedIdx = currentPlayer.scannedPlayerIndex ?? 0;

      // Find the next scanned player index (cycle through)
      const nextScannedIdx = (currentScannedIdx + 1) % sessionScannedPlayers.length;
      const nextScanned = sessionScannedPlayers[nextScannedIdx];

      // Find if another player has this scanned index assigned
      const otherPlayerIdx = updated.findIndex(
        (p, i) => i !== playerIdx && p.scannedPlayerIndex === nextScannedIdx
      );

      if (otherPlayerIdx >= 0) {
        // Swap: give the other player our current assignment
        const otherPlayer = updated[otherPlayerIdx];
        const currentScanned = sessionScannedPlayers[currentScannedIdx];

        otherPlayer.scannedPlayerIndex = currentScannedIdx;
        otherPlayer.scores = currentScanned ? [...currentScanned.scores] : [];
        otherPlayer.detectedAsName = currentScanned &&
          currentScanned.name.toLowerCase().trim() !== (otherPlayer.name || '').toLowerCase().trim()
          ? currentScanned.name
          : undefined;
      }

      // Assign new scanned player to current player
      currentPlayer.scannedPlayerIndex = nextScannedIdx;
      currentPlayer.scores = [...nextScanned.scores];
      currentPlayer.detectedAsName = nextScanned.name.toLowerCase().trim() !== (currentPlayer.name || '').toLowerCase().trim()
        ? nextScanned.name
        : undefined;

      return updated;
    });
  };

  const handleEditPlayerHandicap = (index: number, handicap: string) => {
    const handicapValue = handicap.trim() === '' ? undefined : Number(handicap);


  // Helper function to get the display name of the selected course
  const getSelectedCourseName = (): string => {
    // For session mode, use the Convex course data
    if (hasActiveSession && sessionCourseData?.name) {
      return sessionCourseData.name;
    }

    if (selectedApiCourse?.apiCourse) {
      const { apiCourse } = selectedApiCourse;
      return `${apiCourse.club_name} - ${apiCourse.course_name}`;
    setSelectedCourse(course.id);
    setSelectedApiCourse(meta?.apiCourse ? { apiCourse: meta.apiCourse, selectedTee: meta.selectedTee } : null);
    const teePicked = meta?.selectedTee;
    // Always update selectedTeeName - clear it if none picked to prevent persistence from previous selections
    setSelectedTeeName(teePicked || undefined);

    if (teePicked) {
      setSelectedTeeName(teePicked);
      // When course changes and a tee was picked, overwrite all players with the new tee.
      setDetectedPlayers(prev =>
        prev.map(p => ({
        // This allows reusing course data that other users have already fetched
        let convexCourse: any = null;
        try {
          console.log(`🔍 SAVE: Checking Convex cache for externalId: ${deterministicId}`);
          convexCourse = await getConvexCourseByExternalId({ externalId: deterministicId });
          console.log(`🔍 SAVE: Checking Convex global cache for externalId: ${deterministicId}`);
          if (deterministicId) {
            // Check Convex for existing course
            convexCourse = await convex.query(api.courses.getByExternalId, { externalId: deterministicId });
          }
          if (convexCourse) {
            console.log(`✅ SAVE: Found course in Convex cache: ${convexCourse.name}`);
          }
      // Return to the existing Round Details screen without pushing a duplicate
      router.back();
    } else {
      // For session mode, save to Convex only (not Zustand) since Convex is source of truth
      let savedRoundId: string | null = null;

      // Complete active game session if one exists
      if (activeSession && !isEditMode && hasActiveSession) {
        try {
          console.log('[SCAN] Completing game session:', activeSession._id);

          // Get course par data for hole data
          const courseHoles = sessionCourseData?.holes || [];

          // Build players array for Convex saveRound
          // First player in session participants list is typically the current user
          const convexPlayers = detectedPlayers.map((p, idx) => ({
            name: p.name,
            playerId: p.linkedPlayerId as any,
            teeName: p.teeColor || undefined,
            teeGender: p.teeGender || undefined,
            handicap: p.handicap,
            holeData: p.scores.map(s => {
              const hole = courseHoles.find((h: any) => h.number === s.holeNumber);
              return {
                hole: s.holeNumber,
                score: s.strokes,
                par: hole?.par || 4,
              };
            }),
            // First participant in session is typically the host/self
            isSelf: idx === 0 && p.isFromSession,
          }));

          // Save round to Convex to get round ID
          const convexCourseId = activeSession.courseId;
          // Determine hole count from session data or player scores
          const maxHole = Math.max(...detectedPlayers.flatMap(p => p.scores.map(s => s.holeNumber)));
          const holeCount = maxHole <= 9 ? 9 : 18;

          const { roundId: convexRoundId } = await saveConvexRound({
            courseId: convexCourseId,
            date: date || new Date().toISOString().split('T')[0],
            holeCount: holeCount as 9 | 18,
            players: convexPlayers,
          });

          console.log('[SCAN] Convex round saved:', convexRoundId);
          savedRoundId = convexRoundId;

          // Save detected-as names as aliases for session mode players
          for (const player of detectedPlayers) {
            if (player.detectedAsName && player.linkedPlayerId) {
              try {
                console.log('[SCAN] Saving alias for player:', player.name, '->', player.detectedAsName);
                await addPlayerAlias({
                  playerId: player.linkedPlayerId as any,
                  alias: player.detectedAsName,
                });
              } catch (e) {
                console.warn('Failed to save alias:', e);
              }
            }
          }

          // Link round to session
          await linkSessionRound({
            sessionId: activeSession._id,
            roundId: convexRoundId,
          });
          console.log('[SCAN] Round linked to session');

          // Complete session with settlement calculation
          const result = await completeWithSettlement({
            sessionId: activeSession._id,
          });
          console.log('[SCAN] Session completed with settlement:', result);

          // Also save to Zustand for offline viewing (with remoteId linked)
          const roundWithRemoteId = {
            ...newRound,
            remoteId: convexRoundId,
            syncStatus: 'synced',
          };
          addRound(roundWithRemoteId as any);
          console.log('[SCAN] Round also saved to Zustand for offline');

        } catch (error) {
          console.error('[SCAN] Failed to complete session:', error);
          // Fall back to Zustand save if Convex fails
          addRound(newRound as any);
          savedRoundId = roundId;
        }
      } else {
        // Non-session mode: save to Zustand as before
        addRound(newRound as any);
        savedRoundId = roundId;
      }

      router.push(`/round/${savedRoundId || roundId}`);
      // Add the round to the store and go straight to Round Details
      addRound(newRound as any);
      router.replace(`/round/${roundId}`);
    }

    markActiveScanReviewed();
    }
  };

  if (!permission && !isEditMode) {
  if (!permission && !isEditMode && !processingComplete && !isReviewMode && !activeScanJob?.requiresReview) {
    // Camera permissions are still loading
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!isEditMode && permission && !permission.granted) {
  if (!isEditMode && !processingComplete && !isReviewMode && !activeScanJob?.requiresReview && permission && !permission.granted) {
    // Camera permissions are not granted yet
    return (
      <SafeAreaView style={styles.container}>
    );
  }

  if ((isEditMode || isReviewMode) && processingComplete) {


  // Loading state for processing scan
  if (activeScanJob && !processingComplete && !isEditMode) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <Modal
          visible={true}
          transparent
          animationType="slide"
          onRequestClose={() => isReviewMode ? resetPhotos() : router.back()}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{
              height: '92%',
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Analyzing Scorecard...</Text>
        <Text style={styles.loadingSubtext}>{activeScanJob.message || 'Processing...'}</Text>
      </View>
    );
  }

  // Show review UI if in edit mode OR if processing is complete (review mode)
  if (isEditMode || processingComplete) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen
          options={{
            presentation: 'formSheet',
            title: isEditMode ? "Edit Round" : "Scorecard Results",
            headerStyle: {
              backgroundColor: colors.background,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.3,
              shadowRadius: 10,
              elevation: 20
            }}>
              <Stack.Screen
                options={{
                  title: isEditMode ? "Edit Round" : "Scorecard Results",
                  headerShown: true,
                  headerStyle: {
                    backgroundColor: colors.background,
                  },
                  headerTitleStyle: {
                    color: colors.text,
                    fontWeight: '600',
                  },
                  headerTintColor: colors.text,
                  headerShadowVisible: false,
                  gestureEnabled: activeTab !== 'players',
                  headerLeft: isEditMode ? () => (
                    <TouchableOpacity
                      onPress={() => router.replace('/')}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.headerButton}
                    >
                      <Text style={styles.headerButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  ) : undefined,
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
            },
            headerTitleStyle: {
              color: colors.text,
            },
            headerTintColor: colors.text,
            // Always disable modal swipe-to-dismiss while on Players tab (no-scroll zone behavior)
            gestureEnabled: activeTab !== 'players',
            headerLeft: () =>
              isEditMode ? null : (
                <TouchableOpacity
                  onPress={() => {
                    clearActiveScanJob();
                    router.replace('/');
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.headerButton}
                >
                  <Text style={styles.headerButtonText}>Cancel</Text>
                </TouchableOpacity>
              ),
            headerRight: () => (
              <TouchableOpacity
                onPress={handleSaveRound}
                style={styles.headerButtonPrimary}
              >
                <Text style={styles.headerButtonPrimaryText}>Save</Text>
              </TouchableOpacity>
            )
          }}
        />

              <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
                <View style={styles.tabContainer}>
                  <TouchableOpacity
                    style={[styles.tab, activeTab === 'players' && styles.activeTab]}
                    onPress={() => setActiveTab('players')}
                  >
                    <User size={18} color={colors.text} />
                    <Text style={[styles.tabText, activeTab === 'players' && styles.activeTabText]}>Players</Text>
                  </TouchableOpacity>
        {/* Tab bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'players' && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab('players')}
          >
            <Users
              size={18}
              color={activeTab === 'players' ? colors.primary : colors.text}
            />
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'players' && styles.tabButtonTextActive,
              ]}
            >
              Players
            </Text>
          </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.tab, activeTab === 'scores' && styles.activeTab]}
                    onPress={() => setActiveTab('scores')}
                  >
                    <Users size={18} color={colors.text} />
                    <Text style={[styles.tabText, activeTab === 'scores' && styles.activeTabText]}>Scores</Text>
                  </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'scores' && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab('scores')}
          >
            <Flag
              size={18}
              color={activeTab === 'scores' ? colors.primary : colors.text}
            />
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'scores' && styles.tabButtonTextActive,
              ]}
            >
              Scores
            </Text>
          </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.tab, activeTab === 'details' && styles.activeTab]}
                    onPress={() => setActiveTab('details')}
                  >
                    <MapPin size={18} color={colors.text} />
                    <Text style={[styles.tabText, activeTab === 'details' && styles.activeTabText]}>Details</Text>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'details' && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab('details')}
          >
            <Calendar
              size={18}
              color={activeTab === 'details' ? colors.primary : colors.text}
            />
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'details' && styles.tabButtonTextActive,
              ]}
            >
              Details
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'players' ? (
          <View pointerEvents="box-none">
            <DraggableFlatList
              data={detectedPlayers}
              extraData={listVersion}
              keyExtractor={(item: DetectedPlayer) => item.id}
              activationDistance={6}
              contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
              autoscrollThreshold={40}
              autoscrollSpeed={280}
              bounces={false}
              scrollEnabled={true}
              keyboardShouldPersistTaps="handled"
              simultaneousHandlers={[]}
              dragItemOverflow
              onDragBegin={() => {
                preDragPlayersRef.current = detectedPlayers.map(p => ({ ...p }));
                setIsDragging(true);
              }}
              onDragEnd={({ data }: { data: DetectedPlayer[] }) => {
                const anchored = data.map((player, index) => {
                  const original = preDragPlayersRef.current ? preDragPlayersRef.current[index] : detectedPlayers[index];
                  return {
                    ...player,
                    scores: original ? original.scores : player.scores,
                  };
                });
                setDetectedPlayers(anchored);
                setIsDragging(false);
              }}
              ListHeaderComponent={
                <View style={[styles.sectionHeader, isDragging && { pointerEvents: 'none' }]}>
                  <Text style={styles.sectionTitle}>Detected Players</Text>
                  <TouchableOpacity style={styles.addPlayerButton} onPress={handleAddPlayer} disabled={isDragging}>
                    <Plus size={16} color={colors.primary} />
                    <Text style={styles.addPlayerText}>Add Player</Text>
                  </TouchableOpacity>
                </View>

                {activeTab === 'players' ? (
                  <View pointerEvents="box-none">
                    <DraggableFlatList
                      data={detectedPlayers}
                      extraData={listVersion}
                      keyExtractor={(item: DetectedPlayer) => item.id}
                      activationDistance={6}
                      contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                      autoscrollThreshold={40}
                      autoscrollSpeed={280}
                      bounces={false}
                      scrollEnabled={true}
                      keyboardShouldPersistTaps="handled"
                      simultaneousHandlers={[]}
                      dragItemOverflow
                      onDragBegin={() => {
                        preDragPlayersRef.current = detectedPlayers.map(p => ({ ...p }));
                        setIsDragging(true);
                      }}
                      onDragEnd={({ data }: { data: DetectedPlayer[] }) => {
                        const anchored = data.map((player, index) => {
                          const original = preDragPlayersRef.current ? preDragPlayersRef.current[index] : detectedPlayers[index];
                          return {
                            ...player,
                            scores: original ? original.scores : player.scores,
                          };
                        });
                        setDetectedPlayers(anchored);
                        setIsDragging(false);
                      }}
                      ListHeaderComponent={
                        <View style={[styles.sectionHeader, isDragging && { pointerEvents: 'none' }]}>
                          <Text style={styles.sectionTitle}>{hasActiveSession ? 'Session Players' : 'Detected Players'}</Text>
                          {!hasActiveSession && (
                            <TouchableOpacity style={styles.addPlayerButton} onPress={handleAddPlayer} disabled={isDragging}>
                              <Plus size={16} color={colors.primary} />
                              <Text style={styles.addPlayerText}>Add Player</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      }
                      ListFooterComponent={
                        hasActiveSession ? (
                          <View style={[styles.infoBox, isDragging && { pointerEvents: 'none' }]}>
                            <Text style={styles.infoTitle}>Score Assignment</Text>
                            <Text style={styles.infoText}>• Players are from your pre-round setup</Text>
                            <Text style={styles.infoText}>• Scores are automatically matched to players</Text>
                            <Text style={styles.infoText}>• Tap "Detected as" to cycle through options</Text>
                          </View>
                        ) : (
                          <View style={[styles.infoBox, isDragging && { pointerEvents: 'none' }]}>
                            <Text style={styles.infoTitle}>Player Management</Text>
                            <Text style={styles.infoText}>• Drag to reorder players if they were detected incorrectly</Text>
                            <Text style={styles.infoText}>• Edit names by clicking on them and changing the text</Text>
                            <Text style={styles.infoText}>• Link players to existing profiles using the link icon</Text>
                            <Text style={styles.infoText}>• Mark yourself using the user icon</Text>
                            <Text style={styles.infoText}>• Set Scandicaps and tee colors for accurate scoring</Text>
                            <Text style={styles.infoText}>• Tap tee color to cycle through available options</Text>
                          </View>
                        )
                      }
                      renderItem={({ item: player, index, drag, isActive, getIndex }: any) => (
                        <TouchableOpacity
                          key={player.id}
                          activeOpacity={1}
                          onLongPress={player.isFromSession ? undefined : drag}
                          delayLongPress={120}
                          style={[
                            styles.playerCard,
                            player.isUser && styles.userPlayerCard,
                            isActive && styles.draggingPlayerCard,
                          ]}
                        >
                          <View style={styles.playerHeaderRow}>
                            {!player.isFromSession && (
                              <TouchableOpacity style={styles.dragHandle} onLongPress={drag} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
                                <GripVertical size={18} color={isActive ? colors.primary : colors.text} />
                              </TouchableOpacity>
                            )}
                            <View style={{ flex: 1 }}>
                              <TextInput
                                style={[
                                  styles.playerNameInline,
                                  getConfidenceStyle(player.nameConfidence),
                                  player.isFromSession && { marginLeft: 4 }
                                ]}
                                value={player.name}
                                onChangeText={(text) => handleEditPlayerNameById(player.id, text)}
                                editable={!player.linkedPlayerId && !player.isFromSession}
                                placeholder="Player Name"
                              />
                              {player.detectedAsName && (
                                <TouchableOpacity onPress={() => handleCycleDetectedPlayer(player.id)} style={{ flexDirection: 'row' }}>
                                  <Text style={styles.detectedAsText}>Detected as </Text>
                                  <Text style={[styles.detectedAsText, { color: colors.primary, textDecorationLine: 'underline' }]}>
                                    "{player.detectedAsName}"
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                            <View style={styles.headerRightRow}>
                              {player.isUser && (
                                <View style={styles.userBadge}><Text style={styles.userBadgeText}>You</Text></View>
                              )}
                              {player.isFromSession && (
                                <View style={styles.sessionBadge}><Text style={styles.sessionBadgeText}>Pre-Round</Text></View>
                              )}
                              {player.linkedPlayerId && !player.isUser && !player.isFromSession && (
                                <View style={styles.linkedBadge}><Text style={styles.linkedBadgeText}>Linked</Text></View>
                              )}
                              {!player.isFromSession && (
                                <>
                                  <TouchableOpacity style={styles.playerAction} onPress={() => handleLinkPlayerById(player.id)}>
                                    <LinkIcon
                                      size={18}
                                      color={
                                        player.isUser
                                          ? colors.primary // keep orange for "You"
                                          : player.linkedPlayerId
                                            ? colors.text
                                            : colors.primary
                                      }
                                    />
                                  </TouchableOpacity>
                                  <TouchableOpacity style={styles.playerAction} onPress={() => handleMarkAsUserById(player.id)}>
                                    <User size={18} color={player.isUser ? colors.text : colors.primary} />
                                  </TouchableOpacity>
                                  <TouchableOpacity style={styles.playerAction} onPress={() => handleRemovePlayerById(player.id)}>
                                    <X size={18} color={colors.error} />
                                  </TouchableOpacity>
                                </>
                              )}
                            </View>
                          </View>
                          <View style={styles.playerDetailsRow}>
                            <View style={styles.handicapContainer}>
                              <Text style={styles.handicapLabel}>Scandicap:</Text>
                              <TextInput
                                style={[styles.handicapInput, player.isUser && styles.handicapInputDisabled]}
                                value={player.handicap !== undefined ? String(player.handicap) : ''}
                                onChangeText={(text) => handleEditPlayerHandicapById(player.id, text)}
                                placeholder="Not set"
                                placeholderTextColor={colors.text}
                                keyboardType="numeric"
                                editable={!player.isUser}
                              />
                            </View>
                            <View style={styles.teeColorContainer}>
                              <Text style={styles.teeColorLabel}>Tee:</Text>
                              {player.isFromSession ? (
                                <View style={styles.teeColorSelector}>
                                  <Text style={styles.teeColorText}>{player.teeColor || 'Blue'}</Text>
                                </View>
                              ) : (
                                <TouchableOpacity
                                  style={styles.teeColorSelector}
                                  onPress={() => openTeePicker(player.id, getIndex ? getIndex() : index)}
                                  activeOpacity={0.9}
                                >
                                  <Text
                                    style={styles.teeColorText}
                                  >
                                    {player.teeColor || 'Select'}
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        </TouchableOpacity>
              }
              ListFooterComponent={
                <View style={[styles.infoBox, isDragging && { pointerEvents: 'none' }]}>
                  <Text style={styles.infoTitle}>Player Management</Text>
                  <Text style={styles.infoText}>• Drag to reorder players if they were detected incorrectly</Text>
                  <Text style={styles.infoText}>• Edit names by clicking on them and changing the text</Text>
                  <Text style={styles.infoText}>• Link players to existing profiles using the link icon</Text>
                  <Text style={styles.infoText}>• Mark yourself using the user icon</Text>
                  <Text style={styles.infoText}>• Set Scandicaps and tee colors for accurate scoring</Text>
                  <Text style={styles.infoText}>• Tap tee color to cycle through available options</Text>
                </View>
              }
              renderItem={({ item: player, index, drag, isActive, getIndex }: any) => (
                <TouchableOpacity
                  key={player.id}
                  activeOpacity={1}
                  onLongPress={drag}
                  delayLongPress={120}
                  style={[
                    styles.playerCard,
                    player.isUser && styles.userPlayerCard,
                    isActive && styles.draggingPlayerCard,
                  ]}
                >
                  <View style={styles.playerHeaderRow}>
                    <TouchableOpacity style={styles.dragHandle} onLongPress={drag} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
                      <GripVertical size={18} color={isActive ? colors.primary : colors.text} />
                    </TouchableOpacity>
                    <TextInput
                      style={[styles.playerNameInline, getConfidenceStyle(player.nameConfidence)]}
                      value={player.name}
                      onChangeText={(text) => handleEditPlayerNameById(player.id, text)}
                      editable={!player.linkedPlayerId}
                      placeholder="Player Name"
                    />
                    <View style={styles.headerRightRow}>
                      {player.isUser && (
                        <View style={styles.userBadge}><Text style={styles.userBadgeText}>You</Text></View>
                      )}
                      {player.linkedPlayerId && !player.isUser && (
                        <View style={styles.linkedBadge}><Text style={styles.linkedBadgeText}>Linked</Text></View>
                      )}
                      <TouchableOpacity style={styles.playerAction} onPress={() => handleLinkPlayerById(player.id)}>
                        <LinkIcon
                          size={18}
                          color={
                            player.isUser
                              ? colors.primary // keep orange for "You"
                              : player.linkedPlayerId
                                ? colors.text
                                : colors.primary
                          }
                        />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.playerAction} onPress={() => handleMarkAsUserById(player.id)}>
                        <User size={18} color={player.isUser ? colors.text : colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.playerAction} onPress={() => handleRemovePlayerById(player.id)}>
                        <X size={18} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.playerDetailsRow}>
                    <View style={styles.handicapContainer}>
                      <Text style={styles.handicapLabel}>Scandicap:</Text>
                      <TextInput
                        style={[styles.handicapInput, player.isUser && styles.handicapInputDisabled]}
                        value={player.handicap !== undefined ? String(player.handicap) : ''}
                        onChangeText={(text) => handleEditPlayerHandicapById(player.id, text)}
                        placeholder="Not set"
                        placeholderTextColor={colors.text}
                        keyboardType="numeric"
                        editable={!player.isUser}
                      />
                    </View>
                    <View style={styles.teeColorContainer}>
                      <Text style={styles.teeColorLabel}>Tee:</Text>
                      <TouchableOpacity
                        style={styles.teeColorSelector}
                        onPress={() => openTeePicker(player.id, getIndex ? getIndex() : index)}
                        activeOpacity={0.9}
                      >
                        <Text
                          style={styles.teeColorText}
                        >
                          {player.teeColor || 'Select'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
            />
          </View>
        ) : (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
            {activeTab === 'scores' && (
              <View style={styles.tabContent}>
                <View style={styles.sectionHeaderColumn}>
                  <Text style={styles.sectionTitle}>Scores</Text>
                  <Text style={styles.sectionSubtitle}>Review and edit scores for each hole</Text>
                  <View style={styles.retakeRow}>
                    <RotateCcw size={18} color={colors.text} style={{ marginRight: 10 }} />
                    <Text style={styles.retakeRowText}>Scores look off? Retake a clearer photo.</Text>
                    <Button
                      title="Retake"
                      variant="outline"
                      size="small"
                      onPress={() => {
                        resetPhotos();
                        setActiveTab('players');
                      }}
                      style={styles.retakeButton}
                    />
                  </View>
                ) : (
                  <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
                    {activeTab === 'scores' && (
                      <View style={styles.tabContent}>
                        <View style={styles.sectionHeaderColumn}>
                          <Text style={styles.sectionTitle}>Scores</Text>
                          <Text style={styles.sectionSubtitle}>Review and edit scores for each hole</Text>
                          <View style={styles.retakeRow}>
                            <RotateCcw size={18} color={colors.text} style={{ marginRight: 10 }} />
                            <Text style={styles.retakeRowText}>Scores look off? Retake a clearer photo.</Text>
                            <Button
                              title="Retake"
                              variant="outline"
                              size="small"
                              onPress={() => {
                                resetPhotos();
                                setActiveTab('players');
                              }}
                              style={styles.retakeButton}
                            />
                          </View>
                        </View>
                </View>

                        <View style={styles.scoresTable}>
                          <View style={styles.scoresTableHeader}>
                            <Text numberOfLines={1} ellipsizeMode="clip" style={[styles.scoresTableHeaderCell, styles.holeBandCell, styles.holeHeaderLabel]}>HOLE</Text>
                            <Text numberOfLines={1} ellipsizeMode="clip" style={[styles.scoresTableHeaderCell, styles.holeParCell, styles.headerLabel]}>PAR</Text>
                            {detectedPlayers.map(player => (
                              <Text
                                key={player.id}
                                numberOfLines={1}
                                ellipsizeMode="clip"
                                style={[styles.scoresTableHeaderCell, styles.playerScoreCell, styles.headerWhiteCell, styles.headerLabel]}
                              >
                                {player.name}
                                {player.isUser ? " (You)" : ""}
                              </Text>
                            ))}
                          </View>
                <View style={styles.scoresTable}>
                  <View style={styles.scoresTableHeader}>
                    <Text numberOfLines={1} ellipsizeMode="clip" style={[styles.scoresTableHeaderCell, styles.holeBandCell, styles.holeHeaderLabel]}>HOLE</Text>
                    <Text numberOfLines={1} ellipsizeMode="clip" style={[styles.scoresTableHeaderCell, styles.holeParCell, styles.headerLabel]}>PAR</Text>
                    {detectedPlayers.map(player => (
                      <Text
                        key={player.id}
                        numberOfLines={1}
                        ellipsizeMode="clip"
                        style={[styles.scoresTableHeaderCell, styles.playerScoreCell, styles.headerWhiteCell, styles.headerLabel]}
                      >
                        {player.name}
                        {player.isUser ? " (You)" : ""}
                      </Text>
                    ))}
                  </View>

                          {detectedPlayers.length > 0 && detectedPlayers[0].scores.map(score => {
                            // Find the course to get par for this hole
                            // For session mode, use Convex course data; otherwise use local Zustand courses
                            let par = 4; // Default
                            if (hasActiveSession && sessionCourseData?.holes) {
                              const sessionHole = sessionCourseData.holes.find((h: any) => h.number === score.holeNumber);
                              par = sessionHole?.par ?? 4;
                            } else {
                              const localCourse = selectedCourse ? courses.find(c => c.id === selectedCourse) : null;
                              const localHole = localCourse ? localCourse.holes.find(h => h.number === score.holeNumber) : null;
                              par = localHole?.par ?? 4;
                            }
                  {detectedPlayers.length > 0 && detectedPlayers[0].scores.map(score => {
                    // Find the course to get par for this hole
                    const course = selectedCourse ? courses.find(c => c.id === selectedCourse) : null;
                    const hole = course ? course.holes.find(h => h.number === score.holeNumber) : null;
                    const par = hole ? hole.par : 4; // Default to par 4 if not found

                            return (
                              <View key={score.holeNumber} style={styles.scoresTableRow}>
                                <Text style={[styles.scoresTableCell, styles.holeBandCell, styles.holeNumberText]}>
                                  {score.holeNumber}
                                </Text>
                    return (
                      <View key={score.holeNumber} style={styles.scoresTableRow}>
                        <Text style={[styles.scoresTableCell, styles.holeBandCell, styles.holeNumberText]}>
                          {score.holeNumber}
                        </Text>

                                <Text style={[styles.scoresTableCell, styles.holeParCell]}>
                                  {par}
                                </Text>
                        <Text style={[styles.scoresTableCell, styles.holeParCell]}>
                          {par}
                        </Text>

                                {detectedPlayers.map((player, playerIndex) => {
                                  const playerScore = player.scores.find(s => s.holeNumber === score.holeNumber);
                                  const strokes = playerScore ? playerScore.strokes : 0;
                        {detectedPlayers.map((player, playerIndex) => {
                          const playerScore = player.scores.find(s => s.holeNumber === score.holeNumber);
                          const strokes = playerScore ? playerScore.strokes : 0;

                                  // Determine score color based on relation to par
                                  let scoreColor = colors.text;
                                  if (strokes > 0) {
                                    if (strokes < par) scoreColor = colors.success;
                                    else if (strokes > par) scoreColor = colors.error;
                                  }
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

                          {/* Totals row */}
                          {/* Totals row intentionally removed by design */}
                        </View>
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
                    )}
                    );
                  })}

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
                                ? getSelectedCourseName()
                                : "Search for a course"}
                            </Text>
                            <ChevronDown size={20} color={colors.text} />
                          </TouchableOpacity>
                        </View>
                  {/* Totals row */}
                  {/* Totals row intentionally removed by design */}
                </View>
              </View>
            )}

                        <View style={styles.sectionContainer}>
                          <Text style={styles.sectionTitle}>Date</Text>
                          <View style={styles.dateContainer}>
                            <Calendar size={20} color={colors.text} style={styles.dateIcon} />
                            <TextInput
                              style={styles.dateInput}
                              value={date || new Date().toISOString().split('T')[0]}
                              onChangeText={(value) => setDate(value || new Date().toISOString().split('T')[0])}
                              placeholder="YYYY-MM-DD"
                            />
                          </View>
                        </View>
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
                        ? getSelectedCourseName()
                        : "Search for a course"}
                    </Text>
                    <ChevronDown size={20} color={colors.text} />
                  </TouchableOpacity>
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
                )}
                <View style={styles.sectionContainer}>
                  <Text style={styles.sectionTitle}>Date</Text>
                  <View style={styles.dateContainer}>
                    <Calendar size={20} color={colors.text} style={styles.dateIcon} />
                    <TextInput
                      style={styles.dateInput}
                      value={date || new Date().toISOString().split('T')[0]}
                      onChangeText={(value) => setDate(value || new Date().toISOString().split('T')[0])}
                      placeholder="YYYY-MM-DD"
                    />
                  </View>
                </View>

                <View style={styles.bottomBar}>
                  <Button
                    title="Save Round"
                    onPress={handleSaveRound}
                    style={styles.saveButton}
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
        )}

                <Modal
                  visible={showTeePicker}
                  animationType="slide"
                  transparent
                  onRequestClose={() => setShowTeePicker(false)}
                >
        <View style={styles.bottomBar}>
          <Button
            title="Save Round"
            onPress={handleSaveRound}
            style={styles.saveButton}
          />
        </View>

        <Modal
          visible={showTeePicker}
          animationType="slide"
          transparent
          onRequestClose={() => setShowTeePicker(false)}
        >
          <TouchableOpacity
            style={styles.sheetOverlay}
            activeOpacity={1}
            onPress={() => setShowTeePicker(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={styles.sheetContainer}
              onPress={() => { }}
            >
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Select a Tee</Text>
                <View style={styles.sheetTabs}>
                  <TouchableOpacity
                    style={styles.sheetOverlay}
                    activeOpacity={1}
                    onPress={() => setShowTeePicker(false)}
                    style={[styles.sheetTab, teePickerGenderTab === 'M' && styles.sheetTabActive]}
                    onPress={() => setTeePickerGenderTab('M')}
                  >
                    <Text style={[styles.sheetTabText, teePickerGenderTab === 'M' && styles.sheetTabTextActive]}>Men</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sheetTab, teePickerGenderTab === 'F' && styles.sheetTabActive]}
                    onPress={() => setTeePickerGenderTab('F')}
                  >
                    <Text style={[styles.sheetTabText, teePickerGenderTab === 'F' && styles.sheetTabTextActive]}>Women</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
                {getAvailableTeeSets()
                  .filter((t: any) => !t.gender || t.gender === teePickerGenderTab)
                  .map((tee: any) => (
                    <TouchableOpacity
                      activeOpacity={1}
                      style={styles.sheetContainer}
                      onPress={() => { }}
                      key={`${tee.gender ?? 'U'}-${tee.name}`}
                      style={styles.teeOptionRow}
                      onPress={() => handleSelectTee(tee.name, (tee.gender as 'M' | 'F') || teePickerGenderTab)}
                    >
                      <View style={styles.sheetHeader}>
                        <Text style={styles.sheetTitle}>Select a Tee</Text>
                        <View style={styles.sheetTabs}>
                          <TouchableOpacity
                            style={[styles.sheetTab, teePickerGenderTab === 'M' && styles.sheetTabActive]}
                            onPress={() => setTeePickerGenderTab('M')}
                          >
                            <Text style={[styles.sheetTabText, teePickerGenderTab === 'M' && styles.sheetTabTextActive]}>Men</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.sheetTab, teePickerGenderTab === 'F' && styles.sheetTabActive]}
                            onPress={() => setTeePickerGenderTab('F')}
                          >
                            <Text style={[styles.sheetTabText, teePickerGenderTab === 'F' && styles.sheetTabTextActive]}>Women</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
                        {getAvailableTeeSets()
                          .filter((t: any) => !t.gender || t.gender === teePickerGenderTab)
                          .map((tee: any) => (
                            <TouchableOpacity
                              key={`${tee.gender ?? 'U'}-${tee.name}`}
                              style={styles.teeOptionRow}
                              onPress={() => handleSelectTee(tee.name, (tee.gender as 'M' | 'F') || teePickerGenderTab)}
                            >
                              <View>
                                <Text style={styles.teeOptionName}>{tee.name}</Text>
                                {tee.rating || tee.slope ? (
                                  <Text style={styles.teeOptionGender}>
                                    {tee.rating ? `${tee.rating}` : '--'}/{tee.slope ? `${tee.slope}` : '--'}
                                  </Text>
                                ) : (
                                  <Text style={styles.teeOptionGender}>
                                    {tee.gender === 'F' ? 'Women' : 'Men'}
                                  </Text>
                                )}
                              </View>
                              <View style={styles.radioOuter}>
                                <View
                                  style={
                                    (() => {
                                      const p = detectedPlayers[teePickerPlayerIndex ?? 0];
                                      const matchesName =
                                        p?.teeColor &&
                                        p.teeColor.toString().toLowerCase() === tee.name.toString().toLowerCase();
                                      const matchesGender =
                                        (p?.teeGender ?? teePickerGenderTab) === (tee.gender || teePickerGenderTab);
                                      return matchesName && matchesGender ? styles.radioInnerActive : styles.radioInner;
                                    })()
                                  }
                                />
                              </View>
                            </TouchableOpacity>
                          ))}
                        {getAvailableTeeSets().length === 0 && (
                          <Text style={styles.emptyTeeText}>No tee data available for this course.</Text>
                      <View>
                        <Text style={styles.teeOptionName}>{tee.name}</Text>
                        {tee.rating || tee.slope ? (
                          <Text style={styles.teeOptionGender}>
                            {tee.rating ? `${tee.rating}` : '--'}/{tee.slope ? `${tee.slope}` : '--'}
                          </Text>
                        ) : (
                          <Text style={styles.teeOptionGender}>
                            {tee.gender === 'F' ? 'Women' : 'Men'}
                          </Text>
                        )}
                      </ScrollView>
                      </View>
                      <View style={styles.radioOuter}>
                        <View
                          style={
                            (() => {
                              const p = detectedPlayers[teePickerPlayerIndex ?? 0];
                              const matchesName =
                                p?.teeColor &&
                                p.teeColor.toString().toLowerCase() === tee.name.toString().toLowerCase();
                              const matchesGender =
                                (p?.teeGender ?? teePickerGenderTab) === (tee.gender || teePickerGenderTab);
                              return matchesName && matchesGender ? styles.radioInnerActive : styles.radioInner;
                            })()
                          }
                        />
                      </View>
                    </TouchableOpacity>
                  </TouchableOpacity>
                </Modal>

                {showCourseSearchModal && (
                  <CourseSearchModal
                    visible={showCourseSearchModal}
                    testID="scan-review-course-modal"
                    onClose={() => setShowCourseSearchModal(false)}
                    onSelectCourse={handleSelectCourse}
                    onAddManualCourse={handleAddCourseManually}
                    showMyCoursesTab={true}
                  />
                  ))}
                {getAvailableTeeSets().length === 0 && (
                  <Text style={styles.emptyTeeText}>No tee data available for this course.</Text>
                )}
              </SafeAreaView>
            </View>
          </View>
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>

        {showCourseSearchModal && (
          <CourseSearchModal
            visible={showCourseSearchModal}
            testID="scan-review-course-modal"
            onClose={() => setShowCourseSearchModal(false)}
            onSelectCourse={handleSelectCourse}
            onAddManualCourse={handleAddCourseManually}
            showMyCoursesTab={true}
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* <Stack.Screen options={{ headerShown: false }} /> */}
      <StatusBar style="light" />
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
          {/* Background Image (Blurred first photo) */}
          <Image
            source={{ uri: photos[0] }}
            style={styles.backgroundImage}
            blurRadius={20}
          />
          <View style={styles.backgroundOverlay} />
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

          {/* Header */}
          <SafeAreaView style={styles.previewHeader} edges={['top']}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={resetPhotos}
            >
              <X size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Review Scans</Text>
            <View style={{ width: 40 }} />
          </SafeAreaView>

          {/* Main Gallery */}
          <View style={styles.galleryContainer}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryScrollContent}
            >
              {photos.map((photo, index) => (
                <View key={index} style={styles.photoCard}>
                  <Image
                    source={{ uri: photo }}
                    style={styles.photoImage}
                    resizeMode="cover"
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.7)']}
                    style={styles.photoGradient}
                  >
                    <Text style={styles.photoIndexText}>{index + 1} of {photos.length}</Text>
                  </LinearGradient>

                  <TouchableOpacity
                    style={styles.deletePhotoButton}
                    onPress={() => removePhoto(index)}
                  >
                    <Trash2 size={20} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          <View style={styles.photoIndicator}>
            <Text style={styles.photoIndicatorText}>
              {photos.length} photo{photos.length > 1 ? 's' : ''} selected
            </Text>
          </View>

          {/* Bottom Actions */}
          <SafeAreaView style={styles.previewBottomBar} edges={['bottom']}>
            <View style={styles.previewActionRow}>
              <TouchableOpacity
                style={styles.secondaryActionButton}
                onPress={() => {
                  Alert.alert(
                    'Add Picture',
                    'Choose an option',
                    [
                      { text: 'Take Photo', onPress: takePhotoWithSystemCamera },
                      { text: 'Choose from Library', onPress: pickImage },
                      { text: 'Cancel', style: 'cancel' },
                    ]
                  );
                }}
              >
                <ImageIcon size={20} color="#FFF" />
                <Text style={styles.secondaryActionText}>Add Pic</Text>
              </TouchableOpacity>
          <View style={styles.previewActions}>
            <Button
              title="Add More"
              onPress={pickImage}
              variant="outline"
              style={styles.previewButton}
            />

              <TouchableOpacity
                style={styles.primaryActionButton}
                onPress={processScorecard}
                disabled={scanning}
              >
                <Text style={styles.primaryActionText}>
                  {scanning ? "Processing..." : "Analyze Scorecard"}
                </Text>
                {!scanning && <ChevronRight size={20} color="#FFF" />}
              </TouchableOpacity>
            <Button
              title="Take Another"
              onPress={takePicture}
              variant="outline"
              style={styles.previewButton}
              disabled={Platform.OS === 'web'}
            />

              <TouchableOpacity
                style={styles.secondaryActionButton}
                onPress={() => {
                  // Go back to camera mode by clearing photos
                  resetPhotos();
                }}
              >
                <Camera size={20} color="#FFF" />
                <Text style={styles.secondaryActionText}>Retake</Text>
              </TouchableOpacity>
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
          </SafeAreaView>
          )}
        </View>
      ) : (
        <View style={styles.container}>
        <>
          {!showCourseSearchModal || coursePickerSource !== 'scan' ? (
            <View style={styles.cameraContainer}>
              {Platform.OS !== 'web' ? (
                <CameraView
                  style={styles.camera}
                  facing={facing}
                  ref={cameraRef}
                >
                  {/* Camera UI Overlay */}
                  <SafeAreaView style={styles.cameraOverlay} edges={['top', 'bottom']}>
                    {/* Top Bar */}
                    <View style={styles.topBar}>
                      <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
                        <X size={24} color="#FFF" />
                      </TouchableOpacity>

                      <View style={styles.pillContainer}>
                        <Text style={styles.pillText}>Scan Scorecard</Text>
                      </View>

                      <TouchableOpacity
                        style={styles.startRoundButton}
                        onPress={() => router.replace('/new-round')}
                      >
                        <Text style={styles.startRoundText}>Setup Game Instead</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Center Guide */}
                    <View style={styles.centerGuide}>
                      <View style={styles.scanFrame}>
                        <View style={[styles.corner, styles.topLeft]} />
                        <View style={[styles.corner, styles.topRight]} />
                        <View style={[styles.corner, styles.bottomLeft]} />
                        <View style={[styles.corner, styles.bottomRight]} />
                      </View>
                      <Text style={styles.guideText}>Align scorecard within frame</Text>
                    </View>

                    {/* Bottom Controls */}
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.8)']}
                      style={styles.bottomGradient}
                    >
                      <View style={styles.bottomControls}>
                        <TouchableOpacity style={styles.sideControl} onPress={pickImage}>
                          <View style={styles.iconCircle}>
                            <ImageIcon size={22} color="#FFF" />
                          </View>
                          <Text style={styles.controlLabel}>Add Pic</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.shutterButton} onPress={takePicture}>
                          <View style={styles.shutterInner} />
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.sideControl} onPress={toggleCameraFacing}>
                          <View style={styles.iconCircle}>
                            <RotateCcw size={22} color="#FFF" />
                          </View>
                          <Text style={styles.controlLabel}>Flip</Text>
                        </TouchableOpacity>
                      </View>
                    </LinearGradient>
                  </SafeAreaView>
                  <View style={styles.overlay}>
                    <View style={styles.scanFrame} />
                  </View>
                </CameraView>
              ) : (
                <View style={styles.webFallback}>
                  <Text style={{ color: 'white' }}>Web Camera Not Supported</Text>
                  <Camera size={60} color={colors.primary} />
                  <Text style={styles.webFallbackText}>
                    Camera is not available on web. Please use the upload button below.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.cameraContainer, { backgroundColor: '#000' }]} />
            <View style={[styles.cameraContainer, { backgroundColor: colors.background }]} />
          )}
        </View>
      )
      }

      {
        showCourseSearchModal && (
          <CourseSearchModal
            visible={showCourseSearchModal}
            testID="scan-course-modal"
            onClose={() => setShowCourseSearchModal(false)}
            onSelectCourse={handleSelectCourse}
            onAddManualCourse={handleAddCourseManually}
            showMyCoursesTab={true}
          />
        )
      }
    </View >
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
      {showCourseSearchModal && (
        <CourseSearchModal
          visible={showCourseSearchModal}
          testID="scan-camera-course-modal"
          onClose={() => setShowCourseSearchModal(false)}
          onSelectCourse={handleSelectCourse}
          onAddManualCourse={handleAddCourseManually}
          showMyCoursesTab={true}
        />
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
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
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
    borderRadius: 22,
    backgroundColor: 'rgba(29, 90, 84, 0.10)',
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(29, 90, 84, 0.12)',
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'transparent',
  },
  activeTab: {
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginLeft: 6,
  },
  activeTabText: {
    color: colors.text,
    fontWeight: '700',
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
  sectionHeaderColumn: {
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
  userPlayerCard: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}01`,
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
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginRight: 6,
  },
  playerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  playerNameInline: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginLeft: 8,
    marginRight: 8,
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  handicapInputDisabled: {
    backgroundColor: '#f5f5f5',
    color: colors.textSecondary,
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
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  teeColorText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
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
    backgroundColor: colors.text,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginLeft: 8,
  },
  linkedBadgeText: {
    fontSize: 12,
    color: colors.card,
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
    backgroundColor: `${colors.text}10`,
    borderRadius: 10,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E6EAE9',
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
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  scoresTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scoresTableHeaderCell: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    fontWeight: '700',
    fontSize: 13,
    color: colors.text,
    textAlign: 'center',
    includeFontPadding: false,
  },
  scoresTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scoresTableCell: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    textAlign: 'center',
    color: colors.text,
  },
  holeBandCell: {
    width: 56,
    backgroundColor: colors.text,
    color: '#FFFFFF',
  },
  holeHeaderLabel: {
    color: '#FFFFFF',
    letterSpacing: 1.1,
    fontSize: 12,
  },
  holeNumberText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  holeParCell: {
    width: 64,
    backgroundColor: '#F2F4F3',
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  playerScoreCell: {
    flex: 1,
    minWidth: 60,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  scoreInput: {
    textAlign: 'center',
    fontSize: 15,
  },
  headerLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  headerWhiteCell: {
    backgroundColor: '#FFFFFF',
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
  retakeBox: {
    backgroundColor: `${colors.primary}08`,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
  },
  retakeText: {
    fontSize: 12,
    color: colors.text,
  },
  retakeActions: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  // New compact retake row design
  retakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#EEF2EF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 10,
  },
  retakeRowText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },
  retakeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
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
  headerButtonPrimary: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.primary,
    borderRadius: 8,
    marginRight: 8,
  },
  headerButtonPrimaryText: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  tabButtonActive: {
    backgroundColor: `${colors.primary}15`,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  tabButtonTextActive: {
    color: colors.primary,
    fontWeight: '600',
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
  playerLinkItemSelected: {
    backgroundColor: `${colors.primary}10`,
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
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: '70%',
    height: '54%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  sheetTabs: {
    flexDirection: 'row',
    backgroundColor: `${colors.text}10`,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: `${colors.text}15`,
  },
  sheetTab: {
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  sheetTabActive: {
    backgroundColor: colors.card,
  },
  sheetTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  sheetTabTextActive: {
    color: colors.text,
  },
  sheetList: {
    flexGrow: 0,
  },
  sheetListContent: {
    paddingBottom: 16,
  },
  teeOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  teeOptionName: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '600',
  },
  teeOptionGender: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyTeeText: {
    textAlign: 'center',
    color: colors.textSecondary,
    paddingVertical: 12,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  radioInnerActive: {
    backgroundColor: colors.primary,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});

at some point keeping everything in that file was getting buggy so we split it into 2, im not sure what the second file was maybe you know. theres scan-review.tsx but the only code in here is this:
export { default } from "./scan-scorecard";

and then theres the code from the diff  of review-scan.tsx which is for some reason no longer in the codebase it says file not found but heres the code:
import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ScrollView,
    ActivityIndicator,
    TextInput,
    Modal,
} from 'react-native';
// @ts-ignore - local ambient types provided via declarations
import DraggableFlatList from 'react-native-draggable-flatlist';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import {
    X,
    Users,
    User,
    GripVertical,
    Plus,
    Link as LinkIcon,
    MapPin,
    ChevronDown,
    Calendar,
    RotateCcw,
} from 'lucide-react-native';
import { colors } from '@/constants/colors';
import { generateUniqueId, ensureValidDate } from '@/utils/helpers';
import { useGolfStore } from '@/store/useGolfStore';
import { CourseSearchModal } from '@/components/CourseSearchModal';
import { Button } from '@/components/Button';
import { Hole, ScorecardScanResult, ApiCourseData, Course, Player } from '@/types';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { useMutation, useQuery } from '@/lib/convex';
import { useConvex } from "convex/react";
import { convertApiCourseToLocal, getDeterministicCourseId } from '@/utils/course-helpers';
import { matchCourseToLocal, LocationData } from '@/utils/course-matching';
import { DEFAULT_COURSE_IMAGE } from '@/constants/images';

interface DetectedPlayer {
    id: string;
    name: string;
    nameConfidence?: number;
    linkedPlayerId?: string;
    isUser?: boolean;
    handicap?: number;
    prevLinkedPlayerId?: string;
    prevHandicap?: number;
    prevName?: string;
    teeColor?: string;
    teeGender?: 'M' | 'F';
    detectedAsName?: string;
    isFromSession?: boolean;
    scannedPlayerIndex?: number;
    scores: {
        holeNumber: number;
        strokes: number;
        confidence?: number;
    }[];
}

export default function ReviewScanScreen() {
    const router = useRouter();
    const {
        players,
        courses,
        addRound,
        addPlayer,
        addCourse,
        updateCourse,
        activeScanJob,
        clearActiveScanJob,
        pendingScanCourseSelection,
        clearPendingScanCourseSelection,
    } = useGolfStore();

    const profile = useQuery(api.users.getProfile);
    const userGender = (profile as any)?.gender as "M" | "F" | undefined;

    // Convex actions for course lookup
    const convex = useConvex();
    const getConvexCourseByExternalId = (args: any) => convex.query(api.courses.getByExternalId, args);
    const upsertCourse = useMutation(api.courses.upsert);
    const saveRoundMutation = useMutation(api.rounds.saveRound);

    // State
    const [activeTab, setActiveTab] = useState<'players' | 'scores' | 'details'>('players');
    const [detectedPlayers, setDetectedPlayers] = useState<DetectedPlayer[]>([]);
    const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
    const [selectedApiCourse, setSelectedApiCourse] = useState<{ apiCourse: ApiCourseData; selectedTee: any } | null>(null);
    const [isLocalCourseSelected, setIsLocalCourseSelected] = useState(false);
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState<string>('');
    const [showCourseSearchModal, setShowCourseSearchModal] = useState(false);
    const [showTeePicker, setShowTeePicker] = useState(false);
    const [teePickerPlayerIndex, setTeePickerPlayerIndex] = useState<number | null>(null);
    const [teePickerGenderTab, setTeePickerGenderTab] = useState<'M' | 'F'>('M');
    const [isDragging, setIsDragging] = useState(false);
    const [listVersion, setListVersion] = useState(0);
    const [userLocation, setUserLocation] = useState<LocationData | null>(null);
    const [processingComplete, setProcessingComplete] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const preDragPlayersRef = useRef<DetectedPlayer[] | null>(null);
    const isMountedRef = useRef(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Initialize from activeScanJob on mount
    useEffect(() => {
        if (!activeScanJob?.result || processingComplete) return;

        const scanResult = activeScanJob.result as ScorecardScanResult;

        // Apply pending course selection if available
        if (pendingScanCourseSelection) {
            setSelectedCourse(pendingScanCourseSelection.courseId);
            setIsLocalCourseSelected(true);
            clearPendingScanCourseSelection();
        } else if (activeScanJob.selectedCourseId) {
            setSelectedCourse(activeScanJob.selectedCourseId as string);
            setIsLocalCourseSelected(true);
        }

        // Convert scan results to DetectedPlayer format
        const currentUser = players.find(p => p.isUser);
        const aiDetectedPlayers: DetectedPlayer[] = scanResult.players.map(player => ({
            id: generateUniqueId(),
            name: player.name,
            nameConfidence: player.nameConfidence,
            teeColor: 'Blue',
            teeGender: userGender ?? 'M',
            scores: player.scores
                .filter(score => score.score !== null)
                .map(score => ({
                    holeNumber: score.hole,
                    strokes: score.score!,
                    confidence: score.confidence
                }))
        }));

        // Auto-link to existing players
        const linkedPlayers = aiDetectedPlayers.map(dp => {
            const match = players.find(
                p => p.name.toLowerCase().trim() === dp.name.toLowerCase().trim()
            );
            if (match) {
                return {
                    ...dp,
                    linkedPlayerId: match.id,
                    isUser: match.isUser,
                    handicap: match.handicap,
                };
            }
            return dp;
        });

        setDetectedPlayers(linkedPlayers);
        setDate(ensureValidDate(scanResult.date));
        setProcessingComplete(true);
    }, [activeScanJob, processingComplete]);

    const handleClose = () => {
        clearActiveScanJob();
        router.replace('/');
    };

    const handleSelectCourse = async (course: Course | ApiCourseData, selectedTee?: any) => {
        if ('holes' in course && !('tees' in course)) {
            // Local course
            setSelectedCourse(course.id);
            setSelectedApiCourse(null);
            setIsLocalCourseSelected(true);
        } else {
            // API course
            setSelectedApiCourse({ apiCourse: course as ApiCourseData, selectedTee });
            setSelectedCourse(getDeterministicCourseId(course as ApiCourseData, selectedTee));
            setIsLocalCourseSelected(false);
        }
        setShowCourseSearchModal(false);
    };

    const handleAddCourseManually = () => {
        setShowCourseSearchModal(false);
        // For now, just prompt to search
        Alert.alert('Add Course', 'Please search for your course or enter it manually in the course field.');
    };

    const getSelectedCourseName = () => {
        if (selectedApiCourse) {
            return `${selectedApiCourse.apiCourse.club_name} - ${selectedApiCourse.apiCourse.course_name}`;
        }
        const course = courses.find(c => c.id === selectedCourse);
        return course?.name || 'Select a course';
    };

    const getAvailableTeeSets = () => {
        if (selectedApiCourse) {
            return selectedApiCourse.apiCourse.tees || [];
        }
        const course = courses.find(c => c.id === selectedCourse);
        return (course as any)?.teeSets || [];
    };

    const openTeePicker = (playerId: string, index: number) => {
        const player = detectedPlayers.find(p => p.id === playerId);
        setTeePickerPlayerIndex(index);
        setTeePickerGenderTab(player?.teeGender || userGender || 'M');
        setShowTeePicker(true);
    };

    const handleSelectTee = (teeName: string, gender: 'M' | 'F') => {
        if (teePickerPlayerIndex !== null) {
            setDetectedPlayers(prev => {
                const updated = [...prev];
                updated[teePickerPlayerIndex] = {
                    ...updated[teePickerPlayerIndex],
                    teeColor: teeName,
                    teeGender: gender,
                };
                return updated;
            });
        }
        setShowTeePicker(false);
        setTeePickerPlayerIndex(null);
    };

    const handleAddPlayer = () => {
        const newPlayer: DetectedPlayer = {
            id: generateUniqueId(),
            name: `Player ${detectedPlayers.length + 1}`,
            teeColor: 'Blue',
            teeGender: userGender ?? 'M',
            scores: detectedPlayers[0]?.scores.map(s => ({
                holeNumber: s.holeNumber,
                strokes: 0,
            })) || [],
        };
        setDetectedPlayers([...detectedPlayers, newPlayer]);
        setListVersion(v => v + 1);
    };

    const handleRemovePlayerById = (playerId: string) => {
        setDetectedPlayers(prev => prev.filter(p => p.id !== playerId));
        setListVersion(v => v + 1);
    };

    const handleEditPlayerNameById = (playerId: string, name: string) => {
        setDetectedPlayers(prev =>
            prev.map(p => (p.id === playerId ? { ...p, name } : p))
        );
    };

    const handleEditPlayerHandicapById = (playerId: string, handicapStr: string) => {
        const handicap = parseFloat(handicapStr);
        setDetectedPlayers(prev =>
            prev.map(p =>
                p.id === playerId
                    ? { ...p, handicap: isNaN(handicap) ? undefined : handicap }
                    : p
            )
        );
    };

    const handleMarkAsUserById = (playerId: string) => {
        setDetectedPlayers(prev =>
            prev.map(p => ({
                ...p,
                isUser: p.id === playerId ? !p.isUser : false,
            }))
        );
        setListVersion(v => v + 1);
    };

    const handleLinkPlayerById = (playerId: string) => {
        // For simplicity, just toggle linking off if already linked
        const player = detectedPlayers.find(p => p.id === playerId);
        if (player?.linkedPlayerId) {
            setDetectedPlayers(prev =>
                prev.map(p =>
                    p.id === playerId ? { ...p, linkedPlayerId: undefined } : p
                )
            );
        } else {
            Alert.alert('Link Player', 'Player linking requires the full linking UI. For now, players are auto-linked by name match.');
        }
    };

    const handleEditScore = (playerIndex: number, holeNumber: number, strokes: number) => {
        setDetectedPlayers(prev => {
            const updated = [...prev];
            updated[playerIndex] = {
                ...updated[playerIndex],
                scores: updated[playerIndex].scores.map(s =>
                    s.holeNumber === holeNumber ? { ...s, strokes } : s
                ),
            };
            return updated;
        });
    };

    const getConfidenceStyle = (confidence?: number) => {
        if (confidence === undefined || confidence >= 0.8) return {};
        if (confidence >= 0.5) return { backgroundColor: 'rgba(255, 193, 7, 0.1)' };
        return { backgroundColor: 'rgba(244, 67, 54, 0.1)' };
    };

    const validateForm = () => {
        if (detectedPlayers.length === 0) {
            Alert.alert('Error', 'Please add at least one player.');
            return false;
        }
        if (!selectedCourse && !selectedApiCourse) {
            Alert.alert('Error', 'Please select a course.');
            return false;
        }
        return true;
    };

    const handleSaveRound = async () => {
        if (!validateForm() || isSaving) return;

        setIsSaving(true);

        try {
            // Get or create course
            let finalCourseId = selectedCourse as string;
            let finalCourseName = 'Unknown Course';

            if (selectedApiCourse) {
                const { apiCourse, selectedTee } = selectedApiCourse;
                const deterministicId = getDeterministicCourseId(apiCourse, selectedTee);

                // Check if course exists locally
                let matchedCourse = courses.find(c => c.id === deterministicId);

                if (matchedCourse) {
                    finalCourseId = matchedCourse.id;
                    finalCourseName = matchedCourse.name;
                } else {
                    // Create new local course from API
                    const newLocalCourse = await convertApiCourseToLocal(apiCourse, { selectedTee, fetchImage: true });
                    addCourse(newLocalCourse);
                    finalCourseId = newLocalCourse.id;
                    finalCourseName = newLocalCourse.name;
                }
            } else {
                const course = courses.find(c => c.id === selectedCourse);
                if (course) {
                    finalCourseName = course.name;
                }
            }

            // Create player entries
            const roundId = generateUniqueId();
            const playerData = detectedPlayers.map(dp => {
                let playerId = dp.linkedPlayerId;

                if (!playerId) {
                    // Create new player
                    const newPlayer: Player = {
                        id: generateUniqueId(),
                        name: dp.name,
                        isUser: dp.isUser || false,
                        handicap: dp.handicap,
                    };
                    addPlayer(newPlayer);
                    playerId = newPlayer.id;
                }

                return {
                    playerId,
                    name: dp.name,
                    handicap: dp.handicap,
                    teeColor: dp.teeColor,
                    teeGender: dp.teeGender,
                    isUser: dp.isUser || false,
                    scores: dp.scores,
                };
            });

            // Get course par
            const course = courses.find(c => c.id === finalCourseId);
            const coursePar = course?.holes.reduce((sum, h) => sum + h.par, 0) || 72;
            const holeCount = detectedPlayers[0]?.scores.length || 18;

            // Calculate totals
            const playersWithTotals = playerData.map(p => {
                const totalScore = p.scores.reduce((sum, s) => sum + s.strokes, 0);
                return { ...p, totalScore };
            });

            // Add round to local store
            addRound({
                id: roundId,
                date,
                courseId: finalCourseId,
                courseName: finalCourseName,
                holeCount,
                players: playersWithTotals.map(p => ({
                    playerId: p.playerId,
                    playerName: p.name,
                    totalScore: p.totalScore,
                    handicapUsed: p.handicap,
                    teeColor: p.teeColor,
                    teeGender: p.teeGender,
                    isUser: p.isUser,
                    scores: p.scores.map(s => ({
                        holeNumber: s.holeNumber,
                        strokes: s.strokes,
                    })),
                })),
                notes,
            });

            // Sync to Convex
            if (profile?._id) {
                try {
                    await saveRoundMutation({
                        date,
                        courseId: finalCourseId as Id<"courses">,
                        holeCount: holeCount as 9 | 18,
                        players: playersWithTotals.map(p => ({
                            name: p.name,
                            isSelf: p.isUser,
                            handicap: p.handicap,
                            teeName: p.teeColor,
                            teeGender: p.teeGender,
                            holeData: p.scores.map(s => ({
                                hole: s.holeNumber,
                                par: course?.holes.find(h => h.number === s.holeNumber)?.par || 4,
                                score: s.strokes,
                            })),
                        })),
                    });
                } catch (convexError) {
                    console.warn('Failed to sync round to Convex:', convexError);
                }
            }

            Alert.alert('Success', 'Round saved successfully!', [
                { text: 'OK', onPress: () => handleClose() },
            ]);
        } catch (error) {
            console.error('Failed to save round:', error);
            Alert.alert('Error', 'Failed to save round. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    // Loading state
    if (!processingComplete) {
        return (
            <View style={styles.container}>
                <Stack.Screen
                    options={{
                        title: "Loading...",
                        headerShown: true,
                        headerStyle: { backgroundColor: colors.background },
                        headerTitleStyle: { color: colors.text },
                        headerTintColor: colors.text,
                        headerLeft: () => (
                            <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
                                <X size={24} color={colors.text} />
                            </TouchableOpacity>
                        ),
                    }}
                />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>Loading scan results...</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: "Scorecard Results",
                    headerShown: true,
                    headerStyle: { backgroundColor: colors.background },
                    headerTitleStyle: { color: colors.text, fontWeight: '600' },
                    headerTintColor: colors.text,
                    headerShadowVisible: false,
                    headerLeft: () => (
                        <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
                            <X size={24} color={colors.text} />
                        </TouchableOpacity>
                    ),
                    headerRight: () => (
                        <TouchableOpacity onPress={handleSaveRound} style={styles.headerButton} disabled={isSaving}>
                            <Text style={[styles.headerButtonText, isSaving && { opacity: 0.5 }]}>
                                {isSaving ? 'Saving...' : 'Save'}
                            </Text>
                        </TouchableOpacity>
                    ),
                }}
            />

            {/* Tabs */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'players' && styles.tabActive]}
                    onPress={() => setActiveTab('players')}
                >
                    <User size={18} color={activeTab === 'players' ? colors.text : '#888'} />
                    <Text style={[styles.tabText, activeTab === 'players' && styles.tabTextActive]}>Players</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.tab, activeTab === 'scores' && styles.tabActive]}
                    onPress={() => setActiveTab('scores')}
                >
                    <Users size={18} color={activeTab === 'scores' ? colors.text : '#888'} />
                    <Text style={[styles.tabText, activeTab === 'scores' && styles.tabTextActive]}>Scores</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.tab, activeTab === 'details' && styles.tabActive]}
                    onPress={() => setActiveTab('details')}
                >
                    <MapPin size={18} color={activeTab === 'details' ? colors.text : '#888'} />
                    <Text style={[styles.tabText, activeTab === 'details' && styles.tabTextActive]}>Details</Text>
                </TouchableOpacity>
            </View>

            {/* Players Tab */}
            {activeTab === 'players' && (
                <View style={{ flex: 1 }}>
                    <DraggableFlatList
                        data={detectedPlayers}
                        extraData={listVersion}
                        keyExtractor={(item: DetectedPlayer) => item.id}
                        activationDistance={6}
                        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
                        bounces={false}
                        scrollEnabled={true}
                        keyboardShouldPersistTaps="handled"
                        onDragBegin={() => {
                            preDragPlayersRef.current = detectedPlayers.map(p => ({ ...p }));
                            setIsDragging(true);
                        }}
                        onDragEnd={({ data }: { data: DetectedPlayer[] }) => {
                            setDetectedPlayers(data);
                            setIsDragging(false);
                        }}
                        ListHeaderComponent={
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>Detected Players</Text>
                                <TouchableOpacity style={styles.addPlayerButton} onPress={handleAddPlayer}>
                                    <Plus size={16} color={colors.primary} />
                                    <Text style={styles.addPlayerText}>Add Player</Text>
                                </TouchableOpacity>
                            </View>
                        }
                        renderItem={({ item: player, index, drag, isActive }: any) => (
                            <TouchableOpacity
                                activeOpacity={1}
                                onLongPress={drag}
                                delayLongPress={120}
                                style={[
                                    styles.playerCard,
                                    player.isUser && styles.userPlayerCard,
                                    isActive && styles.draggingPlayerCard,
                                ]}
                            >
                                <View style={styles.playerHeaderRow}>
                                    <TouchableOpacity style={styles.dragHandle} onLongPress={drag}>
                                        <GripVertical size={18} color={isActive ? colors.primary : colors.text} />
                                    </TouchableOpacity>
                                    <TextInput
                                        style={[styles.playerNameInput, getConfidenceStyle(player.nameConfidence)]}
                                        value={player.name}
                                        onChangeText={(text) => handleEditPlayerNameById(player.id, text)}
                                        editable={!player.linkedPlayerId}
                                        placeholder="Player Name"
                                        placeholderTextColor="#999"
                                    />
                                    <View style={styles.headerRightRow}>
                                        {player.isUser && (
                                            <View style={styles.userBadge}><Text style={styles.userBadgeText}>You</Text></View>
                                        )}
                                        <TouchableOpacity style={styles.playerAction} onPress={() => handleLinkPlayerById(player.id)}>
                                            <LinkIcon size={18} color={player.linkedPlayerId ? colors.text : colors.primary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.playerAction} onPress={() => handleMarkAsUserById(player.id)}>
                                            <User size={18} color={player.isUser ? colors.text : colors.primary} />
                                        </TouchableOpacity>
                                        <TouchableOpacity style={styles.playerAction} onPress={() => handleRemovePlayerById(player.id)}>
                                            <X size={18} color={colors.error} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <View style={styles.playerDetailsRow}>
                                    <View style={styles.handicapContainer}>
                                        <Text style={styles.handicapLabel}>Scandicap:</Text>
                                        <TextInput
                                            style={[styles.handicapInput, player.isUser && styles.handicapInputDisabled]}
                                            value={player.handicap !== undefined ? String(player.handicap) : ''}
                                            onChangeText={(text) => handleEditPlayerHandicapById(player.id, text)}
                                            placeholder="N/A"
                                            placeholderTextColor="#999"
                                            keyboardType="numeric"
                                            editable={!player.isUser}
                                        />
                                    </View>
                                    <View style={styles.teeColorContainer}>
                                        <Text style={styles.teeColorLabel}>Tee:</Text>
                                        <TouchableOpacity
                                            style={styles.teeColorSelector}
                                            onPress={() => openTeePicker(player.id, index)}
                                        >
                                            <Text style={styles.teeColorText}>{player.teeColor || 'Select'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        )}
                    />
                </View>
            )}

            {/* Scores Tab */}
            {activeTab === 'scores' && (
                <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
                    <View style={styles.sectionHeaderColumn}>
                        <Text style={styles.sectionTitle}>Scores</Text>
                        <Text style={styles.sectionSubtitle}>Review and edit scores for each hole</Text>
                    </View>

                    <View style={styles.scoresTable}>
                        <View style={styles.scoresTableHeader}>
                            <Text style={[styles.scoresTableHeaderCell, styles.holeBandCell, styles.holeHeaderLabel]}>HOLE</Text>
                            <Text style={[styles.scoresTableHeaderCell, styles.holeParCell, styles.headerLabel]}>PAR</Text>
                            {detectedPlayers.map(player => (
                                <Text
                                    key={player.id}
                                    numberOfLines={1}
                                    ellipsizeMode="clip"
                                    style={[styles.scoresTableHeaderCell, styles.playerScoreCell, styles.headerLabel]}
                                >
                                    {player.name}{player.isUser ? " (You)" : ""}
                                </Text>
                            ))}
                        </View>

                        {detectedPlayers.length > 0 && detectedPlayers[0].scores.map(score => {
                            const course = courses.find(c => c.id === selectedCourse);
                            const hole = course?.holes.find(h => h.number === score.holeNumber);
                            const par = hole?.par ?? 4;

                            return (
                                <View key={score.holeNumber} style={styles.scoresTableRow}>
                                    <Text style={[styles.scoresTableCell, styles.holeBandCell, styles.holeNumberText]}>
                                        {score.holeNumber}
                                    </Text>
                                    <Text style={[styles.scoresTableCell, styles.holeParCell]}>{par}</Text>
                                    {detectedPlayers.map((player, playerIndex) => {
                                        const playerScore = player.scores.find(s => s.holeNumber === score.holeNumber);
                                        const strokes = playerScore?.strokes || 0;
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
                </ScrollView>
            )}

            {/* Details Tab */}
            {activeTab === 'details' && (
                <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
                    <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>Course</Text>
                        <TouchableOpacity
                            style={styles.courseSelector}
                            onPress={() => setShowCourseSearchModal(true)}
                        >
                            <Text style={selectedCourse ? styles.selectedCourseText : styles.placeholderText}>
                                {getSelectedCourseName()}
                            </Text>
                            <ChevronDown size={20} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>Date</Text>
                        <View style={styles.dateContainer}>
                            <Calendar size={20} color={colors.text} style={styles.dateIcon} />
                            <TextInput
                                style={styles.dateInput}
                                value={date}
                                onChangeText={setDate}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor="#999"
                            />
                        </View>
                    </View>

                    <View style={styles.detailSection}>
                        <Text style={styles.detailLabel}>Notes</Text>
                        <TextInput
                            style={styles.notesInput}
                            value={notes}
                            onChangeText={setNotes}
                            placeholder="Add notes about this round..."
                            placeholderTextColor="#999"
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                        />
                    </View>
                </ScrollView>
            )}

            {/* Bottom Save Button */}
            <View style={styles.bottomBar}>
                <Button
                    title={isSaving ? "Saving..." : "Save Round"}
                    onPress={handleSaveRound}
                    style={styles.saveButton}
                    disabled={isSaving}
                />
            </View>

            {/* Tee Picker Modal */}
            <Modal
                visible={showTeePicker}
                animationType="slide"
                transparent
                onRequestClose={() => setShowTeePicker(false)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowTeePicker(false)}
                >
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select a Tee</Text>
                        </View>
                        <ScrollView style={styles.modalList}>
                            {getAvailableTeeSets()
                                .filter((t: any) => !t.gender || t.gender === teePickerGenderTab)
                                .map((tee: any) => (
                                    <TouchableOpacity
                                        key={`${tee.gender ?? 'U'}-${tee.name}`}
                                        style={styles.teeOption}
                                        onPress={() => handleSelectTee(tee.name, tee.gender || teePickerGenderTab)}
                                    >
                                        <Text style={styles.teeOptionName}>{tee.name}</Text>
                                        {tee.rating && <Text style={styles.teeOptionInfo}>{tee.rating}/{tee.slope}</Text>}
                                    </TouchableOpacity>
                                ))}
                            {getAvailableTeeSets().length === 0 && (
                                <Text style={styles.emptyTeeText}>No tee data available.</Text>
                            )}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Course Search Modal */}
            {showCourseSearchModal && (
                <CourseSearchModal
                    visible={showCourseSearchModal}
                    testID="review-course-modal"
                    onClose={() => setShowCourseSearchModal(false)}
                    onSelectCourse={handleSelectCourse}
                    onAddManualCourse={handleAddCourseManually}
                    showMyCoursesTab={true}
                />
            )}
        </View>
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
    loadingText: {
        marginTop: 16,
        color: colors.text,
        fontSize: 16,
    },
    headerButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    headerButtonText: {
        fontSize: 16,
        color: colors.primary,
        fontWeight: '600',
    },
    tabContainer: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginBottom: 16,
        marginTop: 8,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.05)',
        padding: 4,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 8,
        gap: 6,
    },
    tabActive: {
        backgroundColor: '#FFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    tabText: {
        fontSize: 14,
        color: '#888',
        marginLeft: 6,
        fontWeight: '600',
    },
    tabTextActive: {
        color: colors.text,
        fontWeight: '700',
    },
    scrollView: {
        flex: 1,
    },
    contentContainer: {
        padding: 16,
        paddingBottom: 100,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionHeaderColumn: {
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 8,
    },
    sectionSubtitle: {
        fontSize: 14,
        color: '#888',
    },
    addPlayerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(29, 90, 84, 0.1)',
        borderRadius: 8,
    },
    addPlayerText: {
        fontSize: 14,
        color: colors.primary,
        fontWeight: '600',
        marginLeft: 4,
    },
    playerCard: {
        backgroundColor: '#FFF',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.06)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
        elevation: 1,
    },
    userPlayerCard: {
        borderColor: colors.primary,
        borderWidth: 1.5,
        backgroundColor: `${colors.primary}08`,
    },
    draggingPlayerCard: {
        opacity: 0.95,
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
    },
    playerHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    dragHandle: {
        padding: 4,
        marginRight: 8,
    },
    playerNameInput: {
        flex: 1,
        fontSize: 16,
        fontWeight: '500',
        color: colors.text,
        marginRight: 8,
    },
    headerRightRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    userBadge: {
        backgroundColor: `${colors.primary}15`,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        marginRight: 8,
    },
    userBadgeText: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.primary,
    },
    playerAction: {
        padding: 8,
    },
    playerDetailsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    handicapContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    handicapLabel: {
        fontSize: 13,
        color: '#888',
        marginRight: 4,
    },
    handicapInput: {
        fontSize: 14,
        color: colors.text,
        fontWeight: '500',
        minWidth: 40,
        backgroundColor: 'rgba(0,0,0,0.03)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        textAlign: 'center',
    },
    handicapInputDisabled: {
        backgroundColor: 'transparent',
        color: '#888',
    },
    teeColorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    teeColorLabel: {
        fontSize: 13,
        color: '#888',
        marginRight: 4,
    },
    teeColorSelector: {
        backgroundColor: 'rgba(0,0,0,0.03)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
    },
    teeColorText: {
        fontSize: 14,
        color: colors.text,
        fontWeight: '500',
    },
    scoresTable: {
        backgroundColor: '#FFF',
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.06)',
    },
    scoresTableHeader: {
        flexDirection: 'row',
        backgroundColor: 'rgba(0,0,0,0.03)',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.06)',
    },
    scoresTableHeaderCell: {
        paddingVertical: 10,
        paddingHorizontal: 8,
        textAlign: 'center',
        fontSize: 12,
        fontWeight: '600',
        color: colors.text,
    },
    holeBandCell: {
        width: 50,
        backgroundColor: 'rgba(0,0,0,0.02)',
    },
    holeParCell: {
        width: 45,
        backgroundColor: 'rgba(0,0,0,0.01)',
    },
    playerScoreCell: {
        flex: 1,
        minWidth: 50,
    },
    holeHeaderLabel: {
        color: colors.text,
        fontWeight: '700',
        fontSize: 11,
        textTransform: 'uppercase',
    },
    headerLabel: {
        color: '#666',
        fontWeight: '600',
        fontSize: 11,
    },
    scoresTableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.04)',
    },
    scoresTableCell: {
        paddingVertical: 10,
        paddingHorizontal: 8,
        textAlign: 'center',
        fontSize: 14,
        color: colors.text,
    },
    holeNumberText: {
        fontWeight: '600',
        color: colors.text,
    },
    scoreInput: {
        textAlign: 'center',
        fontSize: 14,
        fontWeight: '500',
    },
    detailSection: {
        marginBottom: 20,
    },
    detailLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text,
        marginBottom: 8,
    },
    courseSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFF',
        padding: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.08)',
    },
    selectedCourseText: {
        fontSize: 15,
        color: colors.text,
        fontWeight: '500',
    },
    placeholderText: {
        fontSize: 15,
        color: '#999',
    },
    dateContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.08)',
    },
    dateIcon: {
        marginRight: 10,
    },
    dateInput: {
        flex: 1,
        fontSize: 15,
        color: colors.text,
    },
    notesInput: {
        backgroundColor: '#FFF',
        padding: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.08)',
        fontSize: 15,
        color: colors.text,
        minHeight: 100,
    },
    bottomBar: {
        padding: 16,
        paddingBottom: 24,
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.06)',
    },
    saveButton: {
        width: '100%',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: '#FFF',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '60%',
    },
    modalHeader: {
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.1)',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: colors.text,
    },
    modalList: {
        padding: 16,
    },
    teeOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.05)',
    },
    teeOptionName: {
        fontSize: 16,
        color: colors.text,
        fontWeight: '500',
    },
    teeOptionInfo: {
        fontSize: 14,
        color: '#888',
    },
    emptyTeeText: {
        textAlign: 'center',
        color: '#888',
        marginTop: 20,
        fontSize: 14,
    },
});

heres the rest of the diffs from other files:

index.tsx:
  // Check if we have a pending course selection and results are ready
    if (activeScanJob?.requiresReview && activeScanJob.result && selectedScanCourse) {
      // Store the course selection for the review screen
      setPendingScanCourseSelection({
        courseId: selectedScanCourse.id,
        teeName: selectedScanCourse.teeName,
      });
      // Navigate to review
      // Navigate to the scan-scorecard review screen (use push to show overlay)
      router.push('/scan-scorecard?review=1');
      // Clear local selection

courseSearchModal.tsx:
import React, { useState, useEffect } from 'react';
import {
  View,
    const isFromConvexCache = apiCourse._fromConvexCache === true;
    const convexCourse = apiCourse._convexCourse;

    const teeOptions = getTeeBoxOptions(apiCourse);
    const hasMultipleTees = teeOptions.length > 0;
    // Check for tees in both API format and Convex cache format
    const apiTeeOptions = getTeeBoxOptions(apiCourse);
    const convexTeeSets = convexCourse?.teeSets || [];

    // Use API tee options if available, otherwise use Convex teeSets
    const hasMultipleTees = apiTeeOptions.length > 0 || convexTeeSets.length > 1;

    if (hasMultipleTees) {
      setSelectedCourse(apiCourse);
      // If from Convex cache, add the teeSets to the course for tee picker
      if (isFromConvexCache && convexTeeSets.length > 0 && apiTeeOptions.length === 0) {
        // Convert Convex teeSets to a format the tee picker understands
        setSelectedCourse({
          ...apiCourse,
          tees: convexTeeSets.map((t: any) => ({
            name: t.name,
            gender: t.gender,
            rating: t.rating,
            slope: t.slope,
          })),
          _isLocalCourse: true,
          _localCourse: {
            id: convexCourse.externalId || convexCourse._id,
            name: convexCourse.name,
            location: convexCourse.location,
            holes: convexCourse.holes?.map((h: any) => ({
              number: h.number,
              par: h.par,
              distance: h.yardage || 0,
              handicap: h.hcp,
            })) || [],
            imageUrl: convexCourse.imageUrl,
            slope: convexCourse.slope,
            rating: convexCourse.rating,
            teeSets: convexTeeSets,
          },
        });
      } else {
        setSelectedCourse(apiCourse);
      }
      setShowTeeSelection(true);
      return;
    }

    const teeName = teeOptions[0]?.name;
    const teeName = apiTeeOptions[0]?.name;
    const deterministicId = isFromConvexCache && convexCourse
      ? convexCourse.externalId || convexCourse._id
      : getDeterministicCourseId(apiCourse, teeName);
  },
});