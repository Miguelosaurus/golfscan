/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as backfillDifferentials from "../backfillDifferentials.js";
import type * as courseImages from "../courseImages.js";
import type * as courses from "../courses.js";
import type * as files from "../files.js";
import type * as golfCourse from "../golfCourse.js";
import type * as handicap from "../handicap.js";
import type * as http from "../http.js";
import type * as lib_authUtils from "../lib/authUtils.js";
import type * as lib_handicapUtils from "../lib/handicapUtils.js";
import type * as lib_playerUtils from "../lib/playerUtils.js";
import type * as players from "../players.js";
import type * as rounds from "../rounds.js";
import type * as scorecard from "../scorecard.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  backfillDifferentials: typeof backfillDifferentials;
  courseImages: typeof courseImages;
  courses: typeof courses;
  files: typeof files;
  golfCourse: typeof golfCourse;
  handicap: typeof handicap;
  http: typeof http;
  "lib/authUtils": typeof lib_authUtils;
  "lib/handicapUtils": typeof lib_handicapUtils;
  "lib/playerUtils": typeof lib_playerUtils;
  players: typeof players;
  rounds: typeof rounds;
  scorecard: typeof scorecard;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
