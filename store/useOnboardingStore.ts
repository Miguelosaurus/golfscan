import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    AgeGroup,
    AppLanguage,
    DistanceUnit,
    HandwritingStyle,
    OnboardingStep,
    PROGRESS_STEPS
} from "@/types/onboarding";

const getDeviceLanguageCode = (): string | null => {
    // expo-localization is a native module. If the app binary doesn't include it
    // yet (e.g. dev client not rebuilt), importing it at module scope crashes.
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Localization = require("expo-localization");
        const locale = Localization.getLocales?.()?.[0];
        return (locale?.languageCode || "").toLowerCase() || null;
    } catch {
        // Fallback to Intl if available
        try {
            const resolved = Intl.DateTimeFormat().resolvedOptions?.().locale;
            if (typeof resolved === "string" && resolved.length) {
                return resolved.split(/[-_]/)[0]?.toLowerCase() || null;
            }
        } catch {
            // no-op
        }
        return null;
    }
};

const getDefaultLanguage = (): AppLanguage => {
    const code = getDeviceLanguageCode() ?? "";
    return code === "es" ? "es" : "en";
};

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
    language: AppLanguage;

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
    setLanguage: (language: AppLanguage) => void;
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
            language: getDefaultLanguage(),
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

            setLanguage: (language) => set({ language }),

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
                language: getDefaultLanguage(),
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
                language: state.language,
            }),
            onRehydrateStorage: () => (state) => {
                if (state) {
                    state._hasHydrated = true;
                }
            },
        }
    )
);
