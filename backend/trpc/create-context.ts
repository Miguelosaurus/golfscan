import { inferAsyncReturnType } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';

// You can extend this to include auth, DB connections, etc.
export function createContext({ req }: FetchCreateContextFnOptions) {
  return {
    // example: add IP for rate-limiting later
    ip: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown',
  };
}

export type Context = inferAsyncReturnType<typeof createContext>; 