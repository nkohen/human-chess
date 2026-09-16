// The single client for lichess.org (and explorer.lichess.ovh) APIs: throttling, an app-wide
// 429 cooldown, and localStorage caching. See fetch.ts for the policy this exists to honor.
export {
  LichessRateLimited,
  configureLichessFetch,
  lichessFetch,
  lichessQueueLength,
  setLichessTokenProvider,
  type LichessFetchImpl,
} from './fetch';
export { cachedLichessJson, cachedLichessText, clearLichessCache } from './cache';
export { createVerifier, challengeFor } from './pkce';
export {
  completeLichessLogin,
  currentLichessSession,
  forgetLichessSession,
  installLichessAuth,
  lastLichessLoginError,
  logoutLichess,
  startLichessLogin,
  subscribeLichessAuth,
  type LichessSession,
} from './auth';
export {
  EXPLORER_RATING_BUCKETS,
  explorerMoves,
  LichessLoginRequired,
  ratingBucketsBetween,
  type ExplorerMove,
  type ExplorerResult,
} from './explorer';
