import { ConvexReactClient } from "convex/react";

// Re-export the standard hooks directly.
// (Type safety is automatic when you pass the generated `api` object.)
export { useQuery, useMutation, useAction, useConvex } from "convex/react";

export function createConvexClient(convexUrl: string) {
  return new ConvexReactClient(convexUrl, { unsavedChangesWarning: false });
}
