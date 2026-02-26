import { apiFetch, REQUEST_SURFACES } from "../api/http";

export function buildMarketplaceAnalyticsEvent({
  actionType,
  targetId,
  postId,
  section,
  query,
  metadata,
  occurredAt = new Date(),
} = {}) {
  return {
    actionType,
    targetId,
    postId,
    section,
    query,
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    occurredAt: occurredAt instanceof Date ? occurredAt.toISOString() : new Date().toISOString(),
  };
}

export async function sendMarketplaceAnalyticsEvents(events, { keepalive = false } = {}) {
  if (!Array.isArray(events) || !events.length) return;

  try {
    await apiFetch("/marketplace/analytics", {
      method: "POST",
      auth: true,
      surface: REQUEST_SURFACES.MARKETPLACE,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ events }),
      keepalive,
    });
  } catch {
    // best effort analytics
  }
}

export function trackMarketplaceEvent(event, options) {
  return sendMarketplaceAnalyticsEvents([event], options);
}
