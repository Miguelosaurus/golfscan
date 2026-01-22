import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    AgeGroup,
    DistanceUnit,
    HandwritingStyle,
    OnboardingStep,
    PROGRESS_STEPS
} from "@/types/onboarding";

interface OnboardingState {
    // Flow state
    hasCompletedOnboarding: boolean;
    currentStep: OnboardingStep;

    // Pre-login personalization
    displayName?: string;

    // User preferences
    ageGroup?: AgeGroup;
    hasExistingHandicap: boolean;
    existingHandicap?: number;
    handwritingStyle?: HandwritingStyle;
    distanceUnit: DistanceUnit;

    // Hydration tracking
    _hasHydrated: boolean;

    // Actions
    setCurrentStep: (step: OnboardingStep) => void;
    setDisplayName: (name: string) => void;
    setAgeGroup: (age: AgeGroup) => void;
    setHasExistingHandicap: (has: boolean) => void;
    setExistingHandicap: (handicap: number) => void;
    setHandwritingStyle: (style: HandwritingStyle) => void;
    setDistanceUnit: (unit: DistanceUnit) => void;
    completeOnboarding: () => void;
    resetOnboarding: () => void;

    // Helpers
    getProgressIndex: () => number;
    getProgressTotal: () => number;
}

export const useOnboardingStore = create<OnboardingState>()(
    persist(
        (set, get) => ({
            // Initial state
            hasCompletedOnboarding: false,
            currentStep: 'welcome',
            displayName: undefined,
            ageGroup: undefined,
            hasExistingHandicap: false,
            existingHandicap: undefined,
            handwritingStyle: undefined,
            distanceUnit: 'yards',
            _hasHydrated: false,

            // Actions
            setCurrentStep: (step) => set({ currentStep: step }),

            setDisplayName: (name) => set({ displayName: name }),

            setAgeGroup: (age) => set({ ageGroup: age }),

            setHasExistingHandicap: (has) => set({
                hasExistingHandicap: has,
                existingHandicap: has ? get().existingHandicap : undefined
            }),

            setExistingHandicap: (handicap) => set({ existingHandicap: handicap }),

            setHandwritingStyle: (style) => set({ handwritingStyle: style }),

            setDistanceUnit: (unit) => set({ distanceUnit: unit }),

            completeOnboarding: () => set({
                hasCompletedOnboarding: true,
                currentStep: 'login'
            }),

            resetOnboarding: () => set({
                hasCompletedOnboarding: false,
                currentStep: 'welcome',
                displayName: undefined,
                ageGroup: undefined,
                hasExistingHandicap: false,
                existingHandicap: undefined,
                handwritingStyle: undefined,
                distanceUnit: 'yards',
            }),

            // Helpers
            getProgressIndex: () => {
                const step = get().currentStep;
                const index = PROGRESS_STEPS.indexOf(step);
                return index >= 0 ? index : 0;
            },

            getProgressTotal: () => PROGRESS_STEPS.length,
        }),
        {
            name: "scancaddie-onboarding",
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                hasCompletedOnboarding: state.hasCompletedOnboarding,
                displayName: state.displayName,
                ageGroup: state.ageGroup,
                hasExistingHandicap: state.hasExistingHandicap,
                existingHandicap: state.existingHandicap,
                handwritingStyle: state.handwritingStyle,
                distanceUnit: state.distanceUnit,
            }),
            onRehydrateStorage: () => (state) => {
                if (state) {
                    state._hasHydrated = true;
                }
            },
        }
    )
);
