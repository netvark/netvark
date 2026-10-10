/**
 * hono-ban: ban-kit for Hono. Everything `ban-kit` exports, plus a
 * `createBan` whose instances carry `onError` for `app.onError()` and adopt
 * Hono's `HTTPException`.
 * @packageDocumentation
 */
export * from 'ban-kit';

export type {
  Ban,
  BanInstance,
  HandlerOptions,
  HonoMembers,
  NoReserved,
  ReservedKey,
} from './create-ban';

export { createBan } from './create-ban';
export { fromHttpException } from './http-exception';
