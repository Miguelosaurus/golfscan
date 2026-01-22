import { mutation } from "./_generated/server";

/**
 * Generate a short-lived URL for uploading a file to Convex storage.
 * The client should POST the file body to this URL, which returns a storage ID.
 */
export const generateUploadUrl = mutation({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error("Not authenticated");
        }
        return await ctx.storage.generateUploadUrl();
    },
});

/**
 * Guest version for unauthenticated onboarding flow.
 * Allows file uploads without requiring authentication.
 */
export const generateUploadUrlGuest = mutation({
    args: {},
    handler: async (ctx) => {
        // No authentication required for guest uploads
        return await ctx.storage.generateUploadUrl();
    },
});
