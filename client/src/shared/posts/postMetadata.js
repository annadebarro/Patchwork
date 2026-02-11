import { apiFetch, parseApiResponse, REQUEST_SURFACES } from "../api/http";

export const UNKNOWN = "unknown";
export const MAX_STYLE_TAGS = 8;
export const MAX_COLOR_TAGS = 6;

const FALLBACK_OPTIONS = Object.freeze({
  version: "post-metadata-v1",
  categories: [
    "unknown",
    "tops",
    "bottoms",
    "dresses",
    "outerwear",
    "shoes",
    "bags",
    "accessories",
    "activewear",
  ],
  subcategoriesByCategory: {
    unknown: ["unknown"],
    tops: ["unknown", "t_shirt", "blouse", "button_down", "sweater", "hoodie", "tank"],
    bottoms: ["unknown", "jeans", "trousers", "shorts", "skirt", "leggings"],
    dresses: ["unknown", "mini_dress", "midi_dress", "maxi_dress", "slip_dress", "bodycon"],
    outerwear: ["unknown", "jacket", "coat", "blazer", "cardigan", "vest"],
    shoes: ["unknown", "sneakers", "boots", "heels", "flats", "sandals", "loafers"],
    bags: ["unknown", "tote", "crossbody", "backpack", "shoulder_bag", "clutch"],
    accessories: ["unknown", "jewelry", "belt", "hat", "scarf", "sunglasses"],
    activewear: [
      "unknown",
      "sports_bra",
      "athletic_top",
      "athletic_shorts",
      "athletic_leggings",
      "track_jacket",
    ],
  },
  conditions: ["unknown", "new_with_tags", "like_new", "gently_used", "used", "well_worn"],
  sizeLabels: [
    "unknown",
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
  ],
  suggestedBrands: [
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
  ],
  suggestedStyleTags: [
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
  ],
  suggestedColorTags: [
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
  ],
});

let cachedOptions = null;
let pendingFetch = null;

function looksLikeOptions(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray(value.categories) &&
    value.subcategoriesByCategory &&
    typeof value.subcategoriesByCategory === "object"
  );
}

function normalizeOptions(rawOptions) {
  return {
    ...FALLBACK_OPTIONS,
    ...rawOptions,
    categories: Array.isArray(rawOptions?.categories)
      ? rawOptions.categories
      : FALLBACK_OPTIONS.categories,
    subcategoriesByCategory:
      rawOptions?.subcategoriesByCategory &&
      typeof rawOptions.subcategoriesByCategory === "object" &&
      !Array.isArray(rawOptions.subcategoriesByCategory)
        ? rawOptions.subcategoriesByCategory
        : FALLBACK_OPTIONS.subcategoriesByCategory,
    conditions: Array.isArray(rawOptions?.conditions)
      ? rawOptions.conditions
      : FALLBACK_OPTIONS.conditions,
    sizeLabels: Array.isArray(rawOptions?.sizeLabels)
      ? rawOptions.sizeLabels
      : FALLBACK_OPTIONS.sizeLabels,
    suggestedBrands: Array.isArray(rawOptions?.suggestedBrands)
      ? rawOptions.suggestedBrands
      : FALLBACK_OPTIONS.suggestedBrands,
    suggestedStyleTags: Array.isArray(rawOptions?.suggestedStyleTags)
      ? rawOptions.suggestedStyleTags
      : FALLBACK_OPTIONS.suggestedStyleTags,
    suggestedColorTags: Array.isArray(rawOptions?.suggestedColorTags)
      ? rawOptions.suggestedColorTags
      : FALLBACK_OPTIONS.suggestedColorTags,
  };
}

export function getFallbackPostMetadataOptions() {
  return FALLBACK_OPTIONS;
}

export async function fetchPostMetadataOptions({ force = false } = {}) {
  if (!force && cachedOptions) {
    return cachedOptions;
  }

  if (!force && pendingFetch) {
    return pendingFetch;
  }

  pendingFetch = (async () => {
    try {
      const res = await apiFetch("/posts/metadata/options", {
        method: "GET",
        surface: REQUEST_SURFACES.UNKNOWN,
      });
      const data = await parseApiResponse(res);
      if (res.ok && looksLikeOptions(data)) {
        cachedOptions = normalizeOptions(data);
        return cachedOptions;
      }
    } catch {
      // Fall back to static options when API options are unavailable.
    }

    cachedOptions = FALLBACK_OPTIONS;
    return cachedOptions;
  })();

  try {
    return await pendingFetch;
  } finally {
    pendingFetch = null;
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
