import { useMemo } from "react";
import { SEEDED_BRANDS, normalizeFavoriteBrands } from "../../shared/preferences/preferences";

function BrandPreferencesEditor({
  favoriteBrands,
  setFavoriteBrands,
  customBrand,
  setCustomBrand,
}) {
  const selectedBrandSet = useMemo(
    () => new Set(favoriteBrands.map((brand) => brand.toLowerCase())),
    [favoriteBrands]
  );

  function toggleSeededBrand(brand) {
    const key = brand.toLowerCase();

    setFavoriteBrands((prev) => {
      if (prev.some((item) => item.toLowerCase() === key)) {
        return prev.filter((item) => item.toLowerCase() !== key);
      }
      return normalizeFavoriteBrands([...prev, brand]);
    });
  }

  function addCustomBrand() {
    const trimmed = customBrand.trim();
    if (!trimmed) return;

    setFavoriteBrands((prev) => normalizeFavoriteBrands([...prev, trimmed]));
    setCustomBrand("");
  }

  function removeBrand(brandToRemove) {
    const key = brandToRemove.toLowerCase();
    setFavoriteBrands((prev) => prev.filter((brand) => brand.toLowerCase() !== key));
  }

  return (
    <div className="brand-survey">
      <div className="brand-chip-grid">
        {SEEDED_BRANDS.map((brand) => {
          const selected = selectedBrandSet.has(brand.toLowerCase());
          return (
            <button
              key={brand}
              type="button"
              className={`brand-chip ${selected ? "selected" : ""}`}
              onClick={() => toggleSeededBrand(brand)}
            >
              {brand}
            </button>
          );
        })}
      </div>

      <div className="brand-custom-row">
        <input
          type="text"
          value={customBrand}
          onChange={(event) => setCustomBrand(event.target.value)}
          placeholder="Add custom brand"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addCustomBrand();
            }
          }}
        />
        <button type="button" className="size-add" onClick={addCustomBrand}>
          Add
        </button>
      </div>

      {favoriteBrands.length > 0 ? (
        <div className="brand-selected-list">
          {favoriteBrands.map((brand) => (
            <span key={brand} className="brand-selected-item">
              {brand}
              <button type="button" onClick={() => removeBrand(brand)}>
                remove
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="size-category-empty">No favorite brands selected.</p>
      )}
    </div>
  );
}

export default BrandPreferencesEditor;
