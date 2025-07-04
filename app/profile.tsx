import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/constants/colors';
import { useGolfStore } from '@/store/useGolfStore';
import { Button } from '@/components/Button';
import { ActivityCalendar } from '@/components/ActivityCalendar';
import { 
  User, 
  Edit3, 
  Camera,
  Link as LinkIcon,
  ChevronRight
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

export default function ProfileScreen() {
  const router = useRouter();
  const { players, updatePlayer } = useGolfStore();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showHandicapModal, setShowHandicapModal] = useState(false);
  const [showGhinModal, setShowGhinModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editHandicap, setEditHandicap] = useState('');
  const [ghinNumber, setGhinNumber] = useState('');
  
  const currentUser = players.find(p => p.isUser);
  
  const handleEditProfile = () => {
    setEditName(currentUser?.name || '');
    setShowEditModal(true);
  };
  
  const handleSaveProfile = () => {
    if (!currentUser || !editName.trim()) {
      Alert.alert('Error', 'Please enter a valid name');
      return;
    }
    
    updatePlayer({
      ...currentUser,
      name: editName.trim()
    });
    
    setShowEditModal(false);
    Alert.alert('Success', 'Profile updated successfully');
  };
  
  const handleEditHandicap = () => {
    setEditHandicap(currentUser?.handicap?.toString() || '');
    setShowHandicapModal(true);
  };
  
  const handleSaveHandicap = () => {
    if (!currentUser) return;
    
    const newHandicap = parseFloat(editHandicap);
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
  
  const handleGhinLink = () => {
    setGhinNumber('');
    setShowGhinModal(true);
  };
  
  const handleSaveGhin = () => {
    if (!ghinNumber.trim()) {
      Alert.alert('Error', 'Please enter a valid GHIN number');
      return;
    }
    
    // Simulate GHIN linking
    Alert.alert(
      'GHIN Linked',
      `Your GHIN account ${ghinNumber} has been linked successfully. Your official handicap will be synced automatically.`,
      [
        {
          text: 'OK',
          onPress: () => setShowGhinModal(false)
        }
      ]
    );
  };
  
  const handleChangePhoto = async () => {
    Alert.alert(
      'Change Profile Photo',
      'Choose an option',
      [
        {
          text: 'Camera',
          onPress: async () => {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (!permission.granted) {
              Alert.alert('Permission required', 'Camera permission is required to take a photo.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.7,
            });
            if (!result.canceled && result.assets && result.assets.length > 0 && currentUser) {
              updatePlayer({ ...currentUser, photoUrl: result.assets[0].uri });
            }
          },
        },
        {
          text: 'Photo Library',
          onPress: async () => {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
              Alert.alert('Permission required', 'Media library permission is required to select a photo.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.7,
            });
            if (!result.canceled && result.assets && result.assets.length > 0 && currentUser) {
              updatePlayer({ ...currentUser, photoUrl: result.assets[0].uri });
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen 
        options={{ 
          title: "Profile",
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTitleStyle: {
            color: colors.text,
          },
          headerTintColor: colors.text,
        }} 
      />
      
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileHeader}>
          <TouchableOpacity style={styles.avatarContainer} onPress={handleChangePhoto}>
            {currentUser?.photoUrl ? (
              <Image source={{ uri: currentUser.photoUrl }} style={{ width: 100, height: 100, borderRadius: 50 }} />
            ) : (
              <Text style={styles.avatarText}>{currentUser?.name?.charAt(0) || 'G'}</Text>
            )}
            <View style={styles.cameraOverlay}>
              <Camera size={16} color={colors.card} />
            </View>
          </TouchableOpacity>
          <Text style={styles.userName}>{currentUser?.name || 'Golf Player'}</Text>
          <Text style={styles.userInfo}>Member since June 2025</Text>
        </View>
        
        <ActivityCalendar />
        
        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Profile Information</Text>
          
          <TouchableOpacity style={styles.menuItem} onPress={handleEditProfile}>
            <User size={20} color={colors.text} />
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemText}>Name</Text>
              <Text style={styles.menuItemValue}>{currentUser?.name || 'Not set'}</Text>
            </View>
            <ChevronRight size={20} color={colors.text} />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.menuItem} onPress={handleEditHandicap}>
            <Edit3 size={20} color={colors.text} />
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemText}>Handicap</Text>
              <Text style={styles.menuItemValue}>
                {currentUser?.handicap !== undefined ? currentUser.handicap.toFixed(1) : 'Not set'}
              </Text>
            </View>
            <ChevronRight size={20} color={colors.text} />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.menuItem} onPress={handleGhinLink}>
            <LinkIcon size={20} color={colors.text} />
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemText}>GHIN Account</Text>
              <Text style={styles.menuItemValue}>Not linked</Text>
            </View>
            <ChevronRight size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </ScrollView>
      
      {/* Edit Profile Modal */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            
            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="Enter your name"
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowEditModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveProfile}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Edit Handicap Modal */}
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
              value={editHandicap}
              onChangeText={setEditHandicap}
              placeholder="Enter handicap"
              keyboardType="decimal-pad"
            />
            
            <Text style={styles.note}>
              Enter your current handicap index. This will be used for net score calculations.
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
      
      {/* GHIN Link Modal */}
      <Modal
        visible={showGhinModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGhinModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Link GHIN Account</Text>
            
            <Text style={styles.inputLabel}>GHIN Number</Text>
            <TextInput
              style={styles.input}
              value={ghinNumber}
              onChangeText={setGhinNumber}
              placeholder="Enter your GHIN number"
              keyboardType="number-pad"
            />
            
            <Text style={styles.note}>
              Link your GHIN account to automatically sync your official handicap index. Your GHIN number can be found on your membership card or in the GHIN app.
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowGhinModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveGhin}
              >
                <Text style={styles.saveButtonText}>Link Account</Text>
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
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 42,
    fontWeight: 'bold',
    color: colors.card,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.card,
  },
  userName: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  userInfo: {
    fontSize: 14,
    color: colors.text,
  },
  menuSection: {
    marginBottom: 24,
  },
  menuSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 2,
  },
  menuItemValue: {
    fontSize: 14,
    color: colors.text,
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
  note: {
    fontSize: 12,
    color: colors.text,
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 16,
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