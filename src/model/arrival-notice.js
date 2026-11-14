/** One-shot summary of the S49 repair, carried from the sea to the shipyard. */
export const ARRIVAL_NOTICE_KEY = "barcos:arrival:v1";

export function buildArrivalNotice(result) {
  const count = result.repaired.length;
  const short = result.damagedIds.length > 0;
  return count || short ? { count, gold: result.spent, short } : null;
}

function validNotice(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Number.isSafeInteger(value.count) && value.count >= 0 &&
    Number.isSafeInteger(value.gold) && value.gold >= 0 &&
    typeof value.short === "boolean" && (value.count > 0 || (value.short && value.gold === 0));
}

export function serializeArrivalNotice(notice) {
  return validNotice(notice) ? JSON.stringify(notice) : null;
}

export function parseArrivalNotice(raw) {
  try {
    const notice = JSON.parse(raw);
    return validNotice(notice) ? { count: notice.count, gold: notice.gold, short: notice.short } : null;
  } catch {
    return null;
  }
}
