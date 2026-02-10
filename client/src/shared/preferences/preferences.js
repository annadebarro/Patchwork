export const MAX_SIZE_ENTRIES_PER_CATEGORY = 10;

export const SIZE_CATEGORIES = [
  { key: "tops", label: "Tops" },
  { key: "bottoms", label: "Bottoms" },
  { key: "dresses", label: "Dresses" },
  { key: "outerwear", label: "Outerwear" },
  { key: "shoes", label: "Shoes" },
];

export const SEEDED_BRANDS = [
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
];

function createEmptySizePreferences() {
  return {
    tops: [],
    bottoms: [],
    dresses: [],
    outerwear: [],
    shoes: [],
  };
}

export function normalizeSizePreferences(rawSizePreferences) {
  const normalized = createEmptySizePreferences();
  if (!rawSizePreferences || typeof rawSizePreferences !== "object" || Array.isArray(rawSizePreferences)) {
    return normalized;
  }

  for (const category of SIZE_CATEGORIES) {
    const rawEntries = rawSizePreferences[category.key];
    if (!Array.isArray(rawEntries)) continue;

    normalized[category.key] = rawEntries
      .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
      .map((entry) => {
        const label = typeof entry.label === "string" ? entry.label.trim() : "";
        if (!label) return null;

        return {
          label,
          measurementName:
            typeof entry.measurementName === "string" ? entry.measurementName : "",
          measurementValue:
            entry.measurementValue !== undefined && entry.measurementValue !== null
              ? String(entry.measurementValue)
              : "",
          measurementUnit: entry.measurementUnit === "cm" ? "cm" : "in",
        };
      })
      .filter(Boolean);
  }

  return normalized;
}

export function normalizeFavoriteBrands(rawBrands) {
  if (!Array.isArray(rawBrands)) return [];

  const seen = new Set();
  const cleaned = [];

  for (const brand of rawBrands) {
    if (typeof brand !== "string") continue;
    const trimmed = brand.trim();
    if (!trimmed) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(trimmed);
  }

  return cleaned;
}

export function toSizePreferencesApiPayload(sizePreferences) {
  const payload = createEmptySizePreferences();

  for (const category of SIZE_CATEGORIES) {
    const rawEntries = Array.isArray(sizePreferences?.[category.key])
      ? sizePreferences[category.key]
      : [];

    payload[category.key] = rawEntries.slice(0, MAX_SIZE_ENTRIES_PER_CATEGORY)
      .map((entry) => {
        const label = typeof entry?.label === "string" ? entry.label.trim() : "";
        if (!label) return null;

        const normalizedEntry = { label };

        const measurementName =
          typeof entry.measurementName === "string" ? entry.measurementName.trim() : "";
        if (measurementName) normalizedEntry.measurementName = measurementName;

        const measurementValueRaw = entry.measurementValue;
        if (
          measurementValueRaw !== undefined &&
          measurementValueRaw !== null &&
          String(measurementValueRaw).trim() !== ""
        ) {
          const measurementValue = Number(measurementValueRaw);
          if (Number.isFinite(measurementValue) && measurementValue > 0) {
            normalizedEntry.measurementValue = measurementValue;
            normalizedEntry.measurementUnit = entry.measurementUnit === "cm" ? "cm" : "in";
          }
        }

        return normalizedEntry;
      })
      .filter(Boolean);
  }

  return payload;
}
