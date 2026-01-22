import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '@/constants/colors';

export default function OnboardingLayout() {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
                animation: 'slide_from_right',
                gestureEnabled: false,
            }}
        >
            <Stack.Screen name="welcome" />
            <Stack.Screen name="name" />
            <Stack.Screen name="age" />
            <Stack.Screen name="handicap" />
            <Stack.Screen name="value-handicap" />
            <Stack.Screen name="calibration" />
            <Stack.Screen name="configuring" />
            <Stack.Screen name="value-games" />
            <Stack.Screen name="scan-demo" />
            <Stack.Screen name="demo-scan" />
            <Stack.Screen name="paywall" />
            <Stack.Screen name="complete" />
        </Stack>
    );
}
