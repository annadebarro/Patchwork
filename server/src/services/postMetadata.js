const TAXONOMY_VERSION = "post-metadata-v2";
const UNKNOWN = "unknown";
const MAX_BRAND_LENGTH = 50;
const MAX_STYLE_TAGS = 8;
const MAX_COLOR_TAGS = 6;
const MIN_TAG_LENGTH = 2;
const MAX_TAG_LENGTH = 24;

const POST_TYPES = Object.freeze({
  REGULAR: "regular",
  MARKET: "market",
});

const SUBCATEGORIES_BY_CATEGORY = Object.freeze({
  unknown: [UNKNOWN],
  tops: [UNKNOWN, "t_shirt", "blouse", "button_down", "sweater", "hoodie", "tank"],
  bottoms: [UNKNOWN, "jeans", "trousers", "shorts", "skirt", "leggings"],
  dresses: [UNKNOWN, "mini_dress", "midi_dress", "maxi_dress", "slip_dress", "bodycon"],
  outerwear: [UNKNOWN, "jacket", "coat", "blazer", "cardigan", "vest"],
  shoes: [UNKNOWN, "sneakers", "boots", "heels", "flats", "sandals", "loafers"],
  bags: [UNKNOWN, "tote", "crossbody", "backpack", "shoulder_bag", "clutch"],
  accessories: [UNKNOWN, "jewelry", "belt", "hat", "scarf", "sunglasses"],
  activewear: [
    UNKNOWN,
    "sports_bra",
    "athletic_top",
    "athletic_shorts",
    "athletic_leggings",
    "track_jacket",
  ],
});

const CATEGORIES = Object.freeze(Object.keys(SUBCATEGORIES_BY_CATEGORY));
const CONDITIONS = Object.freeze([
  UNKNOWN,
  "new_with_tags",
  "like_new",
  "gently_used",
  "used",
  "well_worn",
]);

const SIZE_LABELS = Object.freeze([
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
]);

const SUGGESTED_STYLE_TAGS = Object.freeze([
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
]);

const SUGGESTED_COLOR_TAGS = Object.freeze([
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
]);

const SUGGESTED_BRANDS = Object.freeze([
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
]);

const PROFILE_FIELDS = Object.freeze({
  [POST_TYPES.REGULAR]: Object.freeze(["brand", "styleTags", "colorTags"]),
  [POST_TYPES.MARKET]: Object.freeze([
    "category",
    "subcategory",
    "brand",
    "styleTags",
    "colorTags",
    "condition",
    "sizeLabel",
  ]),
});

const MARKET_REQUIRED_FIELDS = Object.freeze(["category", "condition", "sizeLabel"]);
const CONTROLLED_FIELDS = new Set(["category", "subcategory", "condition", "sizeLabel"]);
const ALL_FIELDS = new Set([
  "category",
  "subcategory",
  "brand",
  "styleTags",
  "colorTags",
  "condition",
  "sizeLabel",
]);

const categorySet = new Set(CATEGORIES);
const conditionSet = new Set(CONDITIONS);
const sizeLabelSet = new Set(SIZE_LABELS);
const suggestedBrandMap = new Map(SUGGESTED_BRANDS.map((brand) => [brand.toLowerCase(), brand]));

function normalizePostType(rawType) {
  if (typeof rawType !== "string") return null;
  const normalized = rawType.trim().toLowerCase();
  if (normalized === POST_TYPES.REGULAR || normalized === POST_TYPES.MARKET) {
    return normalized;
  }
  return null;
}

function defaultPostMetadata() {
  return {
    category: UNKNOWN,
    subcategory: UNKNOWN,
    brand: "",
    styleTags: [],
    colorTags: [],
    condition: UNKNOWN,
    sizeLabel: UNKNOWN,
  };
}

function normalizeWhitespace(value) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeControlledValue(rawValue, allowedSet, fieldLabel) {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return { value: UNKNOWN };
  }

  if (typeof rawValue !== "string") {
    return { error: `${fieldLabel} must be a string.` };
  }

  const normalized = normalizeWhitespace(rawValue).toLowerCase().replace(/\s+/g, "_");
  if (!allowedSet.has(normalized)) {
    return { error: `${fieldLabel} is invalid.` };
  }

  return { value: normalized };
}

function normalizeBrand(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return { value: "" };
  }

  if (typeof rawValue !== "string") {
    return { error: "brand must be a string." };
  }

  const normalized = normalizeWhitespace(rawValue);
  if (!normalized) {
    return { value: "" };
  }

  if (normalized.length > MAX_BRAND_LENGTH) {
    return { error: `brand cannot exceed ${MAX_BRAND_LENGTH} characters.` };
  }

  const seededMatch = suggestedBrandMap.get(normalized.toLowerCase());
  return { value: seededMatch || normalized };
}

function normalizeTagToken(rawTag) {
  if (typeof rawTag !== "string") return "";

  return rawTag
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeTagArray(rawValue, fieldLabel, maxCount) {
  if (rawValue === null || rawValue === undefined) {
    return { value: [] };
  }

  if (!Array.isArray(rawValue)) {
    return { error: `${fieldLabel} must be an array.` };
  }

  const seen = new Set();
  const normalizedTags = [];

  for (const rawTag of rawValue) {
    if (typeof rawTag !== "string") {
      return { error: `Each ${fieldLabel} entry must be a string.` };
    }

    const tag = normalizeTagToken(rawTag);
    if (!tag) continue;

    if (tag.length < MIN_TAG_LENGTH || tag.length > MAX_TAG_LENGTH) {
      return {
        error: `${fieldLabel} entries must be between ${MIN_TAG_LENGTH} and ${MAX_TAG_LENGTH} characters after normalization.`,
      };
    }

    if (seen.has(tag)) continue;
    seen.add(tag);
    normalizedTags.push(tag);

    if (normalizedTags.length > maxCount) {
      return { error: `${fieldLabel} cannot exceed ${maxCount} entries.` };
    }
  }

  return { value: normalizedTags };
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function ensureMarketRequiredFields(value) {
  for (const field of MARKET_REQUIRED_FIELDS) {
    if (value[field] === UNKNOWN) {
      return { error: `${field} is required for market posts.` };
    }
  }
  return null;
}

function normalizeAndValidatePostMetadata(input, options = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Post metadata payload must be an object." };
  }

  const postType = normalizePostType(options.postType) || POST_TYPES.REGULAR;
  if (!postType) {
    return { error: "Post type must be either 'regular' or 'market'." };
  }

  const mode = options.mode === "patch" ? "patch" : "create";
  const current = mode === "patch" ? { ...defaultPostMetadata(), ...(options.current || {}) } : null;
  const value = mode === "patch" ? { ...current } : defaultPostMetadata();
  const allowedFields = new Set(PROFILE_FIELDS[postType] || []);

  const fieldProvided = {
    category: hasOwn(input, "category"),
    subcategory: hasOwn(input, "subcategory"),
    brand: hasOwn(input, "brand"),
    styleTags: hasOwn(input, "styleTags"),
    colorTags: hasOwn(input, "colorTags"),
    condition: hasOwn(input, "condition"),
    sizeLabel: hasOwn(input, "sizeLabel"),
  };

  const disallowedFields = Object.keys(fieldProvided).filter(
    (field) => fieldProvided[field] && !allowedFields.has(field)
  );
  if (disallowedFields.length > 0) {
    return {
      error: `${disallowedFields.join(", ")} cannot be set for ${postType} posts.`,
    };
  }

  if (fieldProvided.category) {
    const normalized = normalizeControlledValue(input.category, categorySet, "category");
    if (normalized.error) return normalized;
    value.category = normalized.value;
  }

  if (fieldProvided.subcategory) {
    if (input.subcategory === null || input.subcategory === undefined || input.subcategory === "") {
      value.subcategory = UNKNOWN;
    } else if (typeof input.subcategory !== "string") {
      return { error: "subcategory must be a string." };
    } else {
      value.subcategory = normalizeWhitespace(input.subcategory)
        .toLowerCase()
        .replace(/\s+/g, "_");
    }
  }

  if (fieldProvided.brand) {
    const normalized = normalizeBrand(input.brand);
    if (normalized.error) return normalized;
    value.brand = normalized.value;
  }

  if (fieldProvided.styleTags) {
    const normalized = normalizeTagArray(input.styleTags, "styleTags", MAX_STYLE_TAGS);
    if (normalized.error) return normalized;
    value.styleTags = normalized.value;
  }

  if (fieldProvided.colorTags) {
    const normalized = normalizeTagArray(input.colorTags, "colorTags", MAX_COLOR_TAGS);
    if (normalized.error) return normalized;
    value.colorTags = normalized.value;
  }

  if (fieldProvided.condition) {
    const normalized = normalizeControlledValue(input.condition, conditionSet, "condition");
    if (normalized.error) return normalized;
    value.condition = normalized.value;
  }

  if (fieldProvided.sizeLabel) {
    const normalized = normalizeControlledValue(input.sizeLabel, sizeLabelSet, "sizeLabel");
    if (normalized.error) return normalized;
    value.sizeLabel = normalized.value;
  }

  if (postType === POST_TYPES.REGULAR) {
    // Keep regular posts tag-first and non-clothing-centric.
    value.category = UNKNOWN;
    value.subcategory = UNKNOWN;
    value.condition = UNKNOWN;
    value.sizeLabel = UNKNOWN;
    return { value };
  }

  const allowedSubcategories = new Set(SUBCATEGORIES_BY_CATEGORY[value.category] || [UNKNOWN]);
  if (!allowedSubcategories.has(value.subcategory)) {
    const changedCategory =
      mode === "patch" && fieldProvided.category && value.category !== current.category;

    if (changedCategory) {
      value.subcategory = UNKNOWN;
    } else {
      return { error: `subcategory is invalid for category "${value.category}".` };
    }
  }

  const marketRequiredError = ensureMarketRequiredFields(value);
  if (marketRequiredError) return marketRequiredError;

  return { value };
}

const REGULAR_PROFILE_OPTIONS = Object.freeze({
  fields: Object.freeze({
    brand: true,
    styleTags: true,
    colorTags: true,
  }),
  requiredFields: Object.freeze([]),
  suggestedBrands: SUGGESTED_BRANDS,
  suggestedStyleTags: SUGGESTED_STYLE_TAGS,
  suggestedColorTags: SUGGESTED_COLOR_TAGS,
});

const MARKET_PROFILE_OPTIONS = Object.freeze({
  fields: Object.freeze({
    category: true,
    subcategory: true,
    condition: true,
    sizeLabel: true,
    brand: true,
    styleTags: true,
    colorTags: true,
  }),
  requiredFields: MARKET_REQUIRED_FIELDS,
  categories: CATEGORIES,
  subcategoriesByCategory: SUBCATEGORIES_BY_CATEGORY,
  conditions: CONDITIONS,
  sizeLabels: SIZE_LABELS,
  suggestedBrands: SUGGESTED_BRANDS,
  suggestedStyleTags: SUGGESTED_STYLE_TAGS,
  suggestedColorTags: SUGGESTED_COLOR_TAGS,
});

function getPostMetadataOptions(options = {}) {
  const postType = normalizePostType(options.postType || options.type);
  const limits = {
    brandMaxLength: MAX_BRAND_LENGTH,
    styleTagsMaxCount: MAX_STYLE_TAGS,
    colorTagsMaxCount: MAX_COLOR_TAGS,
    tagMinLength: MIN_TAG_LENGTH,
    tagMaxLength: MAX_TAG_LENGTH,
  };

  if (postType === POST_TYPES.REGULAR) {
    return {
      version: TAXONOMY_VERSION,
      postType,
      ...REGULAR_PROFILE_OPTIONS,
      limits,
    };
  }

  if (postType === POST_TYPES.MARKET) {
    return {
      version: TAXONOMY_VERSION,
      postType,
      ...MARKET_PROFILE_OPTIONS,
      limits,
    };
  }

  return {
    version: TAXONOMY_VERSION,
    postTypes: [POST_TYPES.REGULAR, POST_TYPES.MARKET],
    profiles: {
      [POST_TYPES.REGULAR]: {
        ...REGULAR_PROFILE_OPTIONS,
        limits,
      },
      [POST_TYPES.MARKET]: {
        ...MARKET_PROFILE_OPTIONS,
        limits,
      },
    },
    // Backward-compatible top-level fields for older clients.
    ...MARKET_PROFILE_OPTIONS,
    limits,
  };
}

function getPostMetadataFromPost(post) {
  if (!post) return defaultPostMetadata();

  return {
    category: typeof post.category === "string" ? post.category : UNKNOWN,
    subcategory: typeof post.subcategory === "string" ? post.subcategory : UNKNOWN,
    brand: typeof post.brand === "string" ? post.brand : "",
    styleTags: Array.isArray(post.styleTags)
      ? post.styleTags.filter((tag) => typeof tag === "string")
      : [],
    colorTags: Array.isArray(post.colorTags)
      ? post.colorTags.filter((tag) => typeof tag === "string")
      : [],
    condition: typeof post.condition === "string" ? post.condition : UNKNOWN,
    sizeLabel: typeof post.sizeLabel === "string" ? post.sizeLabel : UNKNOWN,
  };
}

function hasPostMetadataFields(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;

  for (const field of ALL_FIELDS) {
    if (hasOwn(input, field)) return true;
  }

  return false;
}

module.exports = {
  CONTROLLED_FIELDS,
  POST_TYPES,
  UNKNOWN,
  defaultPostMetadata,
  getPostMetadataFromPost,
  getPostMetadataOptions,
  hasPostMetadataFields,
  normalizeAndValidatePostMetadata,
  normalizePostType,
  normalizeTagToken,
};
