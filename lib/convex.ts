import { ConvexReactClient } from "convex/react";

// 1. Re-export the standard hooks directly.
//    (Type safety is now automatic when you pass the 'api' object!)
export { useQuery, useMutation, useAction } from "convex/react";

// 2. Create and export the client instance
export const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});
