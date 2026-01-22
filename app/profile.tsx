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
import { LinearGradient } from 'expo-linear-gradient';
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
import { useMutation, useQuery } from '@/lib/convex';
import { api } from '@/convex/_generated/api';
import { useUser } from '@clerk/clerk-expo';

export default function ProfileScreen() {
    const router = useRouter();
    const { players, updatePlayer } = useGolfStore();
    const profile = useQuery(api.users.getProfile);
    const updateProfile = useMutation(api.users.updateProfile);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showHandicapModal, setShowHandicapModal] = useState(false);
    const [showGhinModal, setShowGhinModal] = useState(false);
    const [editName, setEditName] = useState('');
    const [editHandicap, setEditHandicap] = useState('');
    const [ghinNumber, setGhinNumber] = useState('');
    const { user, isLoaded: isUserLoaded } = useUser();

    const currentUser = players.find(p => p.isUser);
    const displayName = profile?.name ?? currentUser?.name ?? 'Golf Player';

    const handleEditProfile = () => {
        setEditName(displayName || '');
        setShowEditModal(true);
    };

    const handleSaveProfile = async () => {
        if (!editName.trim()) {
            Alert.alert('Error', 'Please enter a valid name');
            return;
        }
        const trimmed = editName.trim();
        try {
            await updateProfile({ name: trimmed, profileSetupComplete: true });
            if (currentUser) {
                updatePlayer({
                    ...currentUser,
                    name: trimmed,
                });
            }

            // Keep Clerk profile in sync so the dashboard and future
            // sessions reflect the same name.
            if (user && isUserLoaded) {
                const parts = trimmed.split(/\s+/).filter(Boolean);
                const firstName = parts[0] ?? trimmed;
                const lastName = parts.slice(1).join(' ');
                const updatePayload: any = { firstName };
                if (lastName) updatePayload.lastName = lastName;
                await user.update(updatePayload);
            }
        } catch {
            Alert.alert('Error', 'Could not update your profile. Please try again.');
            return;
        }

        setShowEditModal(false);
        Alert.alert('Success', 'Profile updated successfully');
    };

    const handleEditHandicap = () => {
        setEditHandicap(currentUser?.handicap?.toString() || '');
        setShowHandicapModal(true);
    };

    const updateHandicapMutation = useMutation(api.users.updateHandicap);

    const handleSaveHandicap = async () => {
        if (!currentUser && !profile) return;

        const newHandicap = parseFloat(editHandicap);
        if (isNaN(newHandicap)) {
            Alert.alert('Error', 'Please enter a valid handicap');
            return;
        }

        try {
            await updateHandicapMutation({ handicap: newHandicap });
            if (currentUser) {
                updatePlayer({
                    ...currentUser,
                    handicap: newHandicap
                });
            }
            setShowHandicapModal(false);
            Alert.alert('Success', 'Handicap updated successfully');
        } catch (e) {
            Alert.alert('Error', 'Could not update handicap. Please try again.');
        }
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
        <View style={styles.container}>
            <LinearGradient
                colors={['#F5F3EF', '#E8F5E9', '#F5F3EF']}
                locations={[0.3, 0.8, 1]}
                style={StyleSheet.absoluteFill}
            />
            <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
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
                                <Text style={styles.avatarText}>{displayName?.charAt(0) || 'G'}</Text>
                            )}
                            <View style={styles.cameraOverlay}>
                                <Camera size={16} color={colors.card} />
                            </View>
                        </TouchableOpacity>
                        <Text style={styles.userName}>{displayName}</Text>
                        <Text style={styles.userInfo}>Member since June 2025</Text>
                    </View>

                    <ActivityCalendar />

                    {/* Wager Stats Card Removed */}

                    <View style={styles.menuSection}>
                        <Text style={styles.menuSectionTitle}>Profile Information</Text>

                        <TouchableOpacity style={styles.menuItem} onPress={handleEditProfile}>
                            <User size={20} color={colors.text} />
                            <View style={styles.menuItemContent}>
                                <Text style={styles.menuItemText}>Name</Text>
                                <Text style={styles.menuItemValue}>{displayName || 'Not set'}</Text>
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
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
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
