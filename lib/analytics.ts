import { PostHog } from 'posthog-react-native';

// PostHog singleton instance
let posthog: PostHog | null = null;

/**
 * Initialize PostHog analytics.
 * Call this once on app startup.
 */
export function initPostHog(): PostHog | null {
    const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;

    if (!apiKey) {
        console.warn('[Analytics] PostHog API key not configured');
        return null;
    }

    posthog = new PostHog(apiKey, {
        host: 'https://us.i.posthog.com', // US cloud; change for EU
        captureAppLifecycleEvents: true,
    });

    return posthog;
}

/**
 * Get the PostHog instance.
 */
export function getPostHog(): PostHog | null {
    return posthog;
}

// ============================================================================
// Typed Event Tracking Functions
// ============================================================================

/**
 * Track when a round is saved (core value event)
 */
export function trackRoundSaved(props: {
    playerCount: number;
    holeCount: number;
    source: 'scan' | 'manual' | 'game_session';
}) {
    posthog?.capture('round_saved', props);
}

/**
 * Track when a scan is started
 */
export function trackScanStarted(props: { imageCount: number }) {
    posthog?.capture('scan_started', props);
}

/**
 * Track when a scan completes successfully
 */
export function trackScanCompleted(props: {
    durationMs: number;
    confidence: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
}) {
    posthog?.capture('scan_completed', props);
}

/**
 * Track when a scan fails
 */
export function trackScanFailed(props: { error: string }) {
    posthog?.capture('scan_failed', props);
}

/**
 * Track when a rate limit is reached
 */
export function trackLimitReached(props: {
    service: 'scan' | 'courseApi' | 'googlePlaces';
    limitType: 'daily' | 'monthly';
    resetsInHours: number;
}) {
    posthog?.capture('limit_reached', props);
}

/**
 * Identify user (call after authentication)
 */
export function identifyUser(userId: string, props?: {
    name?: string;
    email?: string;
    handicap?: number;
    roundsPlayed?: number;
    isPro?: boolean;
    appVersion?: string;
}) {
    if (!posthog) return;

    posthog.identify(userId, props);
}

/**
 * Reset user identity (call on logout)
 */
export function resetAnalytics() {
    posthog?.reset();
}
