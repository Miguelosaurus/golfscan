import React, { useState } from "react";
import { Tabs, useRouter } from "expo-router";
import { View, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Home, History, Camera } from "lucide-react-native";
import { colors } from "@/constants/colors";
import { PreRoundFlowModal } from "@/components/PreRoundFlowModal";
import { useQuery } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

function ScanButton() {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  // Check for active game session
  const activeSession = useQuery(api.gameSessions.getActive) as any;

  const handlePress = () => {
    console.log('[ScanButton] handlePress - activeSession:', activeSession, 'status:', activeSession?.status);
    console.log('[ScanButton] handlePress - activeSession:', activeSession, 'status:', activeSession?.status);

    // Always go to scan card, passing session if active
    if (activeSession && (activeSession.status === 'active' || activeSession.status === 'pending')) {
      router.push(`/scan-scorecard?sessionId=${activeSession._id}`);
    } else {
      router.push('/scan-scorecard');
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.scanButton}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <View style={styles.scanButtonInner}>
          <Camera size={36} color="#FFFFFF" />
        </View>
      </TouchableOpacity>

      <PreRoundFlowModal
        visible={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}


export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.text,
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 34 : 24,
          left: 20,
          right: 20,
          backgroundColor: colors.card,
          borderRadius: 28,
          height: 75,
          paddingBottom: 12,
          paddingTop: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.1,
          shadowRadius: 16,
          elevation: 8,
          borderTopWidth: 0,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "500",
          marginTop: 2,
        },
        headerShown: false,
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <Home size={28} color={color} strokeWidth={focused ? 2.4 : 1.6} />
          ),
          tabBarItemStyle: {
            marginRight: 40,
            marginLeft: 15,
          },
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "",
          tabBarButton: () => <ScanButton />,
          tabBarItemStyle: {
            width: 0,
          },
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
          },
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, focused }) => (
            <History size={28} color={color} strokeWidth={focused ? 2.4 : 1.6} />
          ),
          tabBarItemStyle: {
            marginLeft: 40,
            marginRight: 15,
          },
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  scanButton: {
    position: 'absolute',
    top: -32,
    left: '50%',
    marginLeft: -40,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  scanButtonInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
