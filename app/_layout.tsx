import 'react-native-reanimated';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, trpcClient } from "@/lib/trpc";
import { useGolfStore } from "@/store/useGolfStore";

// Create a client
const queryClient = new QueryClient();

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const hasHydrated = useGolfStore((state) => state._hasHydrated);

  const [loaded, error] = useFonts({
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) {
      console.error(error);
      throw error;
    }
  }, [error]);

  useEffect(() => {
    if (loaded && hasHydrated) {
      SplashScreen.hideAsync();
    }
  }, [loaded, hasHydrated]);

  if (!loaded || !hasHydrated) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <RootLayoutNav />
        </QueryClientProvider>
      </trpc.Provider>
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerBackTitle: "Back",
          headerStyle: {
            backgroundColor: "#FFFFFF",
          },
          headerShadowVisible: false,
          headerTitleStyle: {
            fontWeight: "600",
          },
          contentStyle: {
            backgroundColor: "#FFFFFF",
          },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen 
          name="course/[id]" 
          options={{ 
            title: "Course Details",
            animation: "slide_from_right",
          }} 
        />
        <Stack.Screen 
          name="round/[id]" 
          options={{ 
            title: "Round Details",
            animation: "slide_from_right",
          }} 
        />
        <Stack.Screen 
          name="player/[id]" 
          options={{ 
            title: "Player Profile",
            animation: "slide_from_right",
          }} 
        />
        <Stack.Screen 
          name="new-round" 
          options={{ 
            title: "New Round",
            presentation: "modal",
          }} 
        />
        <Stack.Screen 
          name="new-course" 
          options={{ 
            title: "Add Course",
            presentation: "modal",
          }} 
        />
        <Stack.Screen 
          name="scan-scorecard" 
          options={{ 
            title: "Scan Scorecard",
            presentation: "modal",
          }} 
        />
      </Stack>
    </>
  );
}