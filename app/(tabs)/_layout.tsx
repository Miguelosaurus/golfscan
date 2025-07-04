import React from "react";
import { Tabs, useRouter } from "expo-router";
import { View, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Home, History, Camera } from "lucide-react-native";
import { colors } from "@/constants/colors";

function ScanButton() {
  const router = useRouter();
  
  return (
    <TouchableOpacity 
      style={styles.scanButton}
      onPress={() => router.push('/scan-scorecard')}
      activeOpacity={0.8}
    >
      <View style={styles.scanButtonInner}>
        <Camera size={36} color="#FFFFFF" />
      </View>
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inactive,
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
          tabBarIcon: ({ color }) => <Home size={28} color={color} />,
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
          tabBarIcon: ({ color }) => <History size={28} color={color} />,
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
    shadowOpacity: 0.1,
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