import { inferAsyncReturnType } from '@trpc/server';
import { HonoRequest } from 'hono';

export function createContext({ req }: { req: HonoRequest }) {
  // You can add authentication or database connections here
  return {};
}

export type Context = inferAsyncReturnType<typeof createContext>; 