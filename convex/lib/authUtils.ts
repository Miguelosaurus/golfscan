/**
 * Shared Authentication Utilities
 * 
 * This file contains common auth helpers used across Convex functions.
 * ALL identity/auth utility functions should be defined here.
 */

/**
 * Extract the Clerk user ID from the identity object.
 * Handles both tokenIdentifier and subject formats.
 */
export function getClerkIdFromIdentity(identity: any): string | null {
    const raw = identity?.tokenIdentifier ?? identity?.subject ?? null;
    if (!raw) return null;
    const parts = String(raw).split("|");
    return parts[parts.length - 1] || null;
}

/**
 * Derive a readable name from an email address.
 * Used as fallback when name is not provided.
 */
export function deriveNameFromEmail(email: string | null | undefined): string | null {
    if (!email) return null;
    const localPart = email.split("@")[0];
    if (!localPart) return null;
    const cleaned = localPart.replace(/[._-]+/g, " ").trim();
    if (!cleaned) return null;
    return cleaned
        .split(" ")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}
