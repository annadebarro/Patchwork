import { apiFetch, parseApiResponse, REQUEST_SURFACES } from "../api/http";

export const UNKNOWN = "unknown";
export const MAX_STYLE_TAGS = 8;
export const MAX_COLOR_TAGS = 6;
export const POST_TYPES = Object.freeze({
  REGULAR: "regular",
  MARKET: "market",
});

const FALLBACK_PROFILES = Object.freeze({
  regular: Object.freeze({
    version: "post-metadata-v2",
    postType: POST_TYPES.REGULAR,
    fields: Object.freeze({
      brand: true,
      styleTags: true,
      colorTags: true,
    }),
    requiredFields: Object.freeze([]),
    suggestedBrands: Object.freeze([
      "Nike",
      "Adidas",
      "Levi's",
      "Zara",
      "H&M",
      "Uniqlo",
      "Madewell",
      "Aritzia",
      "Lululemon",
      "Patagonia",
      "The North Face",
      "Carhartt",
      "New Balance",
      "Converse",
      "Doc Martens",
      "Reformation",
      "Everlane",
      "Urban Outfitters",
    ]),
    suggestedStyleTags: Object.freeze([
      "casual",
      "minimalist",
      "streetwear",
      "vintage",
      "boho",
      "athleisure",
      "preppy",
      "formal",
      "grunge",
      "y2k",
    ]),
    suggestedColorTags: Object.freeze([
      "black",
      "white",
      "gray",
      "beige",
      "brown",
      "blue",
      "navy",
      "green",
      "red",
      "pink",
      "purple",
      "yellow",
      "orange",
      "multicolor",
    ]),
    categories: Object.freeze([UNKNOWN]),
    subcategoriesByCategory: Object.freeze({ [UNKNOWN]: Object.freeze([UNKNOWN]) }),
    conditions: Object.freeze([UNKNOWN]),
    sizeLabels: Object.freeze([UNKNOWN]),
    limits: Object.freeze({
      brandMaxLength: 50,
      styleTagsMaxCount: MAX_STYLE_TAGS,
      colorTagsMaxCount: MAX_COLOR_TAGS,
      tagMinLength: 2,
      tagMaxLength: 24,
    }),
  }),
  market: Object.freeze({
    version: "post-metadata-v2",
    postType: POST_TYPES.MARKET,
    fields: Object.freeze({
      category: true,
      subcategory: true,
      condition: true,
      sizeLabel: true,
      brand: true,
      styleTags: true,
      colorTags: true,
    }),
    requiredFields: Object.freeze(["category", "condition", "sizeLabel"]),
    categories: Object.freeze([
      UNKNOWN,
      "tops",
      "bottoms",
      "dresses",
      "outerwear",
      "shoes",
      "bags",
      "accessories",
      "activewear",
    ]),
    subcategoriesByCategory: Object.freeze({
      unknown: Object.freeze([UNKNOWN]),
      tops: Object.freeze([UNKNOWN, "t_shirt", "blouse", "button_down", "sweater", "hoodie", "tank"]),
      bottoms: Object.freeze([UNKNOWN, "jeans", "trousers", "shorts", "skirt", "leggings"]),
      dresses: Object.freeze([UNKNOWN, "mini_dress", "midi_dress", "maxi_dress", "slip_dress", "bodycon"]),
      outerwear: Object.freeze([UNKNOWN, "jacket", "coat", "blazer", "cardigan", "vest"]),
      shoes: Object.freeze([UNKNOWN, "sneakers", "boots", "heels", "flats", "sandals", "loafers"]),
      bags: Object.freeze([UNKNOWN, "tote", "crossbody", "backpack", "shoulder_bag", "clutch"]),
      accessories: Object.freeze([UNKNOWN, "jewelry", "belt", "hat", "scarf", "sunglasses"]),
      activewear: Object.freeze([
        UNKNOWN,
        "sports_bra",
        "athletic_top",
        "athletic_shorts",
        "athletic_leggings",
        "track_jacket",
      ]),
    }),
    conditions: Object.freeze(["unknown", "new_with_tags", "like_new", "gently_used", "used", "well_worn"]),
    sizeLabels: Object.freeze([
      UNKNOWN,
      "one_size",
      "xxs",
      "xs",
      "s",
      "m",
      "l",
      "xl",
      "xxl",
      "xxxl",
      "numeric_00",
      "numeric_0",
      "numeric_2",
      "numeric_4",
      "numeric_6",
      "numeric_8",
      "numeric_10",
      "numeric_12",
      "numeric_14",
      "numeric_16",
      "numeric_18",
      "shoe_5",
      "shoe_6",
      "shoe_7",
      "shoe_8",
      "shoe_9",
      "shoe_10",
      "shoe_11",
      "shoe_12",
      "shoe_13",
    ]),
    suggestedBrands: Object.freeze([
      "Nike",
      "Adidas",
      "Levi's",
      "Zara",
      "H&M",
      "Uniqlo",
      "Madewell",
      "Aritzia",
      "Lululemon",
      "Patagonia",
      "The North Face",
      "Carhartt",
      "New Balance",
      "Converse",
      "Doc Martens",
      "Reformation",
      "Everlane",
      "Urban Outfitters",
    ]),
    suggestedStyleTags: Object.freeze([
      "casual",
      "minimalist",
      "streetwear",
      "vintage",
      "boho",
      "athleisure",
      "preppy",
      "formal",
      "grunge",
      "y2k",
    ]),
    suggestedColorTags: Object.freeze([
      "black",
      "white",
      "gray",
      "beige",
      "brown",
      "blue",
      "navy",
      "green",
      "red",
      "pink",
      "purple",
      "yellow",
      "orange",
      "multicolor",
    ]),
    limits: Object.freeze({
      brandMaxLength: 50,
      styleTagsMaxCount: MAX_STYLE_TAGS,
      colorTagsMaxCount: MAX_COLOR_TAGS,
      tagMinLength: 2,
      tagMaxLength: 24,
    }),
  }),
});

const cachedOptionsByType = new Map();
const pendingFetchByType = new Map();

function normalizePostType(rawType) {
  if (typeof rawType !== "string") return POST_TYPES.MARKET;
  const normalized = rawType.trim().toLowerCase();
  if (normalized === POST_TYPES.REGULAR || normalized === POST_TYPES.MARKET) {
    return normalized;
  }
  return POST_TYPES.MARKET;
}

function cloneProfile(profile, postType) {
  return {
    ...profile,
    postType,
    fields: { ...(profile?.fields || {}) },
    requiredFields: Array.isArray(profile?.requiredFields) ? profile.requiredFields : [],
    categories: Array.isArray(profile?.categories) ? profile.categories : [UNKNOWN],
    subcategoriesByCategory:
      profile?.subcategoriesByCategory &&
      typeof profile.subcategoriesByCategory === "object" &&
      !Array.isArray(profile.subcategoriesByCategory)
        ? profile.subcategoriesByCategory
        : { [UNKNOWN]: [UNKNOWN] },
    conditions: Array.isArray(profile?.conditions) ? profile.conditions : [UNKNOWN],
    sizeLabels: Array.isArray(profile?.sizeLabels) ? profile.sizeLabels : [UNKNOWN],
    suggestedBrands: Array.isArray(profile?.suggestedBrands) ? profile.suggestedBrands : [],
    suggestedStyleTags: Array.isArray(profile?.suggestedStyleTags) ? profile.suggestedStyleTags : [],
    suggestedColorTags: Array.isArray(profile?.suggestedColorTags) ? profile.suggestedColorTags : [],
    limits:
      profile?.limits && typeof profile.limits === "object" && !Array.isArray(profile.limits)
        ? profile.limits
        : {},
  };
}

function extractProfile(rawOptions, postType) {
  if (!rawOptions || typeof rawOptions !== "object" || Array.isArray(rawOptions)) {
    return null;
  }

  if (
    rawOptions.profiles &&
    typeof rawOptions.profiles === "object" &&
    !Array.isArray(rawOptions.profiles) &&
    rawOptions.profiles[postType]
  ) {
    return rawOptions.profiles[postType];
  }

  if (rawOptions.postType === postType) {
    return rawOptions;
  }

  if (postType === POST_TYPES.MARKET && Array.isArray(rawOptions.categories)) {
    // Legacy shape fallback.
    return rawOptions;
  }

  if (postType === POST_TYPES.REGULAR && rawOptions.fields && typeof rawOptions.fields === "object") {
    return rawOptions;
  }

  return null;
}

function normalizeOptions(rawOptions, postType) {
  const fallback = FALLBACK_PROFILES[postType] || FALLBACK_PROFILES.market;
  const extracted = extractProfile(rawOptions, postType);
  if (!extracted) {
    return cloneProfile(fallback, postType);
  }

  return cloneProfile(
    {
      ...fallback,
      ...extracted,
    },
    postType
  );
}

export function getFallbackPostMetadataOptions({ type } = {}) {
  const postType = normalizePostType(type);
  return cloneProfile(FALLBACK_PROFILES[postType], postType);
}

export async function fetchPostMetadataOptions({ type, force = false } = {}) {
  const postType = normalizePostType(type);

  if (!force && cachedOptionsByType.has(postType)) {
    return cachedOptionsByType.get(postType);
  }

  if (!force && pendingFetchByType.has(postType)) {
    return pendingFetchByType.get(postType);
  }

  const request = (async () => {
    try {
      const params = new URLSearchParams({ type: postType });
      const res = await apiFetch(`/posts/metadata/options?${params.toString()}`, {
        method: "GET",
        surface: REQUEST_SURFACES.UNKNOWN,
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        const normalized = normalizeOptions(data, postType);
        cachedOptionsByType.set(postType, normalized);
        return normalized;
      }
    } catch {
      // Fall back to static options when API options are unavailable.
    }

    const fallback = getFallbackPostMetadataOptions({ type: postType });
    cachedOptionsByType.set(postType, fallback);
    return fallback;
  })();

  pendingFetchByType.set(postType, request);
  try {
    return await request;
  } finally {
    pendingFetchByType.delete(postType);
  }
}

export function normalizeTagToken(rawTag) {
  if (typeof rawTag !== "string") return "";

  return rawTag
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function addTagValue(existingTags, rawTag, maxCount) {
  const token = normalizeTagToken(rawTag);
  if (!token) return existingTags;

  if (existingTags.includes(token)) return existingTags;
  if (existingTags.length >= maxCount) return existingTags;

  return [...existingTags, token];
}

export function removeTagValue(existingTags, tagToRemove) {
  return existingTags.filter((tag) => tag !== tagToRemove);
}

export function toDisplayLabel(value) {
  if (typeof value !== "string" || !value) return "";
  if (value === UNKNOWN) return "Unknown";

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
