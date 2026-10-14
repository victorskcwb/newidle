/** Balance and simulation constants. Content-specific numbers live in packages/content. */

export const TICK_MS = 600;
export const MAX_LEVEL = 99;
/** XP is stored in tenths; the total is capped to fit a signed 32-bit column. */
export const MAX_XP_TENTHS = 2 ** 31 - 1;
export const MASTERY_MAX_LEVEL = 50;
export const VITALITY_START_LEVEL = 10;

export const PPM = 1_000_000;
/** Speed bonuses (tools, agility…) are summed and capped at 60%. */
export const MAX_SPEED_BONUS_PPM = 600_000;

export const ACTION_INVENTORY_SLOTS = 28;
/** The action inventory is deposited into the bank every 5 minutes of play. */
export const DEPOSIT_INTERVAL_TICKS = 500;

export const QUEUE_BASE_LENGTH = 3;
export const QUEUE_TOTAL_LEVEL_STEP = 500;
export const QUEUE_SUBSCRIBER_BONUS = 2;

/** Gaps up to this many ticks are resolved tick by tick (`step`); longer ones by `resolveOffline`. */
export const STEP_RESOLVE_MAX_TICKS = 1_500;
export const OFFLINE_CAP_TICKS = (12 * 3_600_000) / TICK_MS;
export const OFFLINE_CAP_TICKS_SUBSCRIBER = (24 * 3_600_000) / TICK_MS;

export const SECONDARY_SLOT_TOTAL_LEVEL = 50;
