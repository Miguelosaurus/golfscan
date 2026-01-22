// Onboarding flow types

export type HandwritingStyle = 'neat' | 'average' | 'rushed';
export type DistanceUnit = 'yards' | 'meters';
export type AgeGroup = '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+';

export interface OnboardingPreferences {
    ageGroup?: AgeGroup;
    hasExistingHandicap: boolean;
    existingHandicap?: number;
    handwritingStyle?: HandwritingStyle;
    distanceUnit: DistanceUnit;
}

export type OnboardingStep =
    | 'welcome'
    | 'name'
    | 'age'
    | 'handicap'
    | 'calibration'
    | 'units'
    | 'configuring'
    | 'scan-demo'
    | 'paywall'
    | 'login';

export const ONBOARDING_STEPS: OnboardingStep[] = [
    'welcome',
    'name',
    'age',
    'handicap',
    'calibration',
    'units',
    'configuring',
    'scan-demo',
    'paywall',
    'login'
];

// Steps that show in the progress bar (excluding welcome, configuring, paywall, login)
export const PROGRESS_STEPS: OnboardingStep[] = [
    'name',
    'age',
    'handicap',
    'calibration',
    'units',
    'scan-demo'
];
