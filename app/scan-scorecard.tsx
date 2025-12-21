import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Camera, ChevronRight, Image as ImageIcon, RotateCcw, Trash2, X } from "lucide-react-native";

import { colors } from "@/constants/colors";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAction, useMutation } from "@/lib/convex";
import { useGolfStore } from "@/store/useGolfStore";
import { generateUniqueId } from "@/utils/helpers";

const MAX_IMAGES = 3;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function ScanScorecardScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>("back");

  const processScanAction = useAction(api.scorecard.processScan);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const {
    pendingScanPhotos: photos,
    setPendingScanPhotos,
    clearPendingScanPhotos,
    isScanning: scanning,
    setIsScanning,
    setActiveScanJob,
    updateActiveScanJob,
    setRemainingScans,
    setScannedData,
    markActiveScanReviewPending,
    clearScanData,
    clearActiveScanJob,
    devMode,
    setShouldShowScanCourseModal,
  } = useGolfStore();

  const toggleCameraFacing = () => setFacing((current) => (current === "back" ? "front" : "back"));

  const takePicture = async () => {
    if (!cameraRef.current) return;

    if (photos.length >= MAX_IMAGES) {
      Alert.alert(
        "Maximum Images Reached",
        `You can upload up to ${MAX_IMAGES} scorecard images per scan. Remove an image to add a new one.`
      );
      return;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1, base64: true });
      if (photo?.base64) {
        setPendingScanPhotos([...photos, `data:image/jpeg;base64,${photo.base64}`]);
      } else if (photo?.uri) {
        setPendingScanPhotos([...photos, photo.uri]);
      }
    } catch (error) {
      console.error("Error taking picture:", error);
      Alert.alert("Error", "Failed to take picture. Please try again.");
    }
  };

  const pickImage = async () => {
    if (photos.length >= MAX_IMAGES) {
      Alert.alert(
        "Maximum Images Reached",
        `You can upload up to ${MAX_IMAGES} scorecard images per scan. Remove an image to add a new one.`
      );
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1,
        allowsMultipleSelection: true,
        base64: true,
        selectionLimit: MAX_IMAGES - photos.length,
      });

      if (!result.canceled && result.assets?.length) {
        const slotsRemaining = MAX_IMAGES - photos.length;
        const assetsToAdd = result.assets.slice(0, slotsRemaining);
        const newPhotos = assetsToAdd.map((asset) =>
          asset.base64
            ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
            : asset.uri
        );
        setPendingScanPhotos([...photos, ...newPhotos]);

        if (result.assets.length > slotsRemaining) {
          Alert.alert(
            "Some Images Skipped",
            `Only ${slotsRemaining} image(s) could be added. Maximum is ${MAX_IMAGES} per scan.`
          );
        }
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to pick image. Please try again.");
    }
  };

  const takePhotoWithSystemCamera = async () => {
    if (photos.length >= MAX_IMAGES) {
      Alert.alert(
        "Maximum Images Reached",
        `You can upload up to ${MAX_IMAGES} scorecard images per scan. Remove an image to add a new one.`
      );
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        const uri = asset.base64
          ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
          : asset.uri;
        setPendingScanPhotos([...photos, uri]);
      }
    } catch (error) {
      console.error("Error launching system camera:", error);
      Alert.alert("Error", "Failed to take photo. Please try again.");
    }
  };

  const removePhoto = (index: number) => setPendingScanPhotos(photos.filter((_, i) => i !== index));
  const resetPhotos = () => clearPendingScanPhotos();

  const processScorecard = async () => {
    if (!photos.length) {
      Alert.alert("Error", "Please take or select at least one photo first.");
      return;
    }

    setIsScanning(true);
    clearScanData();
    clearActiveScanJob();

    const scanId = generateUniqueId();
    const createdAt = new Date().toISOString();
    setActiveScanJob({
      id: scanId,
      status: "processing",
      stage: "preparing",
      progress: 0,
      message: "Preparing to scan…",
      createdAt,
      updatedAt: createdAt,
      thumbnailUri: photos[0] || null,
      requiresReview: false,
      result: null,
      autoReviewLaunched: false,
    });

    try {
      if (devMode) {
        updateActiveScanJob({
          stage: "processing",
          progress: 30,
          message: "Dev mode: processing in background…",
        });
        setIsScanning(false);
        router.back();
        return;
      }

      updateActiveScanJob({ stage: "uploading", progress: 10, message: "Uploading images…" });

      const storageIds: Id<"_storage">[] = [];
      for (let i = 0; i < photos.length; i++) {
        updateActiveScanJob({
          stage: "uploading",
          progress: 10 + Math.round((10 * (i + 1)) / photos.length),
          message: `Uploading image ${i + 1} of ${photos.length}…`,
        });

        const uploadUrl = await generateUploadUrl();

        const photoUri = photos[i];
        let blob: Blob;
        if (photoUri.startsWith("data:")) {
          const response = await fetch(photoUri);
          blob = await response.blob();
        } else {
          const base64 = await FileSystem.readAsStringAsync(photoUri, { encoding: "base64" as any } as any);
          const byteCharacters = atob(base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let j = 0; j < byteCharacters.length; j++) byteNumbers[j] = byteCharacters.charCodeAt(j);
          blob = new Blob([new Uint8Array(byteNumbers)], { type: "image/jpeg" });
        }

        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": blob.type || "image/jpeg" },
          body: blob,
        });
        if (!uploadResponse.ok) throw new Error(`Failed to upload image ${i + 1}`);

        const { storageId } = await uploadResponse.json();
        storageIds.push(storageId as Id<"_storage">);
      }

      updateActiveScanJob({
        stage: "analyzing",
        progress: 25,
        message: "AI is reading your scorecard…",
      });

      // Run AI processing in background.
      processScanAction({ storageIds })
        .then((result) => {
          setRemainingScans((result as any)?.scansRemaining ?? 50);
          if ((result as any)?.result) {
            updateActiveScanJob({
              status: "complete",
              stage: "complete",
              progress: 100,
              message: "Ready for review",
              result: (result as any).result,
              requiresReview: true,
              updatedAt: new Date().toISOString(),
            });
            setScannedData((result as any).result);
            markActiveScanReviewPending();
          }
        })
        .catch((error) => {
          console.error("[SCAN] processScan error:", error);
          updateActiveScanJob({
            status: "error",
            stage: "error",
            message: "Failed to analyze scorecard. Please try again.",
            progress: 0,
            updatedAt: new Date().toISOString(),
          });
        });

      setIsScanning(false);
      router.back();
      // Trigger course selection modal on home screen after a short delay
      setTimeout(() => {
        setShouldShowScanCourseModal(true);
      }, 300);
    } catch (error) {
      console.error("Scan error:", error);
      updateActiveScanJob({
        status: "error",
        stage: "error",
        message: error instanceof Error ? error.message : "Failed to scan scorecard. Please try again.",
        progress: 0,
        updatedAt: new Date().toISOString(),
      });
      setIsScanning(false);
      Alert.alert("Scan Failed", error instanceof Error ? error.message : "Failed to scan scorecard. Please try again.");
    }
  };

  if (!permission) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#FF6A00" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.permissionContainer]}>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>
          We need camera access to scan your scorecard. Please grant permission to continue.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      {/* --- PHASE 1: CAMERA SCANNING --- */}
      {!photos.length ? (
        <View style={styles.cameraContainer}>
          {Platform.OS !== "web" ? (
            <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
              <SafeAreaView style={styles.cameraOverlay} edges={["top", "bottom"]}>
                <View style={styles.topBar}>
                  <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
                    <X size={24} color="#FFF" />
                  </TouchableOpacity>

                  <View style={styles.pillContainer}>
                    <Text style={styles.pillText}>Scan Scorecard</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.startRoundButton}
                    onPress={() => router.replace("/new-round")}
                  >
                    <Text style={styles.startRoundText}>Setup Game Instead</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.centerGuide}>
                  <View style={styles.scanFrame}>
                    <View style={[styles.corner, styles.topLeft]} />
                    <View style={[styles.corner, styles.topRight]} />
                    <View style={[styles.corner, styles.bottomLeft]} />
                    <View style={[styles.corner, styles.bottomRight]} />
                  </View>
                  <Text style={styles.guideText}>Align scorecard within frame</Text>
                </View>

                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.8)"]}
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
            </CameraView>
          ) : (
            <View style={[styles.container, styles.permissionContainer]}>
              <Text style={styles.permissionTitle}>Camera not available on web</Text>
              <TouchableOpacity style={styles.permissionButton} onPress={pickImage}>
                <Text style={styles.permissionButtonText}>Add Pic</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        /* --- PHASE 2: REVIEW & GALLERY (After photos are taken) --- */
        <View style={styles.previewContainer}>
          <Image source={{ uri: photos[0] }} style={styles.backgroundImage} blurRadius={20} />
          <View style={styles.backgroundOverlay} />

          <SafeAreaView style={styles.previewHeader} edges={["top"]}>
            <TouchableOpacity style={styles.iconButton} onPress={resetPhotos}>
              <X size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Review Scans</Text>
            <View style={{ width: 40 }} />
          </SafeAreaView>

          <View style={styles.galleryContainer}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryScrollContent}
            >
              {photos.map((photo, index) => (
                <View key={index} style={styles.photoCard}>
                  <Image source={{ uri: photo }} style={styles.photoImage} resizeMode="cover" />
                  <LinearGradient
                    colors={["transparent", "rgba(0,0,0,0.7)"]}
                    style={styles.photoGradient}
                  >
                    <Text style={styles.photoIndexText}>
                      {index + 1} of {photos.length}
                    </Text>
                  </LinearGradient>
                  <TouchableOpacity style={styles.deletePhotoButton} onPress={() => removePhoto(index)}>
                    <Trash2 size={20} color="#FFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* PHASE 3: FINAL ACTIONS (Add Pic, Retake, or Analyze Pill) */}
          <SafeAreaView style={styles.previewBottomBar} edges={["bottom"]}>
            <View style={styles.previewActionRow}>
              <TouchableOpacity
                style={styles.secondaryActionButton}
                onPress={() => {
                  Alert.alert("Add Picture", "Choose from Library or Take Photo", [
                    { text: "Library", onPress: pickImage },
                    { text: "Camera", onPress: takePhotoWithSystemCamera },
                    { text: "Cancel", style: "cancel" },
                  ]);
                }}
              >
                <View style={styles.iconCircle}>
                  <ImageIcon size={20} color="#FFF" />
                </View>
                <Text style={styles.secondaryActionText}>Add Pic</Text>
              </TouchableOpacity>

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

              <TouchableOpacity style={styles.secondaryActionButton} onPress={resetPhotos}>
                <View style={styles.iconCircle}>
                  <Camera size={20} color="#FFF" />
                </View>
                <Text style={styles.secondaryActionText}>Retake</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#000",
  },
  permissionTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
    textAlign: "center",
  },
  permissionText: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 18,
  },
  permissionButton: {
    backgroundColor: "#FF6A00",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  permissionButtonText: {
    color: "#FFF",
    fontWeight: "700",
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: "space-between",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  pillContainer: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  pillText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  startRoundButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(30, 96, 89, 0.9)",
  },
  startRoundText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "700",
  },
  centerGuide: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  scanFrame: {
    width: "95%",
    aspectRatio: 1.4,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 50,
    height: 50,
    borderColor: "#FFF",
    borderWidth: 4,
    borderRadius: 10,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  guideText: {
    marginTop: 20,
    color: "#FFF",
    fontSize: 16,
    fontWeight: "500",
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bottomGradient: {
    paddingTop: 40,
    paddingBottom: 50,
  },
  bottomControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 40,
  },
  sideControl: {
    alignItems: "center",
    width: 60,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 4,
  },
  controlLabel: {
    marginTop: 4,
    color: "#FFF",
    fontSize: 12,
  },
  shutterButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFF",
  },
  previewContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  headerTitle: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "700",
  },
  galleryContainer: {
    flex: 1,
    justifyContent: "center",
  },
  galleryScrollContent: {
    alignItems: "center",
  },
  photoCard: {
    width: SCREEN_WIDTH,
    paddingHorizontal: 20,
    height: "100%",
    justifyContent: "center",
  },
  photoImage: {
    width: "100%",
    height: SCREEN_WIDTH * 1.25,
    maxHeight: "78%",
    borderRadius: 22,
  },
  photoGradient: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: "11%",
    height: 90,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  photoIndexText: {
    color: "rgba(255,255,255,0.9)",
    fontWeight: "600",
  },
  deletePhotoButton: {
    position: "absolute",
    top: 24,
    right: 32,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  previewBottomBar: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  previewActionRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  secondaryActionButton: {
    alignItems: "center",
    width: 60,
  },
  secondaryActionText: {
    color: "#FFF",
    fontSize: 11,
    marginTop: 4,
  },
  primaryActionButton: {
    flex: 1,
    height: 54,
    borderRadius: 999,
    backgroundColor: "#FF6A00",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
    marginHorizontal: 16,
    marginBottom: 20,
  },
  primaryActionText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "800",
  },
});

