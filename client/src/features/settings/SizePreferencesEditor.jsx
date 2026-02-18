import { MAX_SIZE_ENTRIES_PER_CATEGORY, SIZE_CATEGORIES } from "../../shared/preferences/preferences";

function SizePreferencesEditor({ sizePreferences, setSizePreferences }) {
  function updateEntry(categoryKey, index, field, value) {
    setSizePreferences((prev) => {
      const existing = Array.isArray(prev[categoryKey]) ? prev[categoryKey] : [];
      const nextEntries = [...existing];
      nextEntries[index] = {
        ...nextEntries[index],
        [field]: value,
      };

      return {
        ...prev,
        [categoryKey]: nextEntries,
      };
    });
  }

  function addEntry(categoryKey) {
    setSizePreferences((prev) => {
      const existing = Array.isArray(prev[categoryKey]) ? prev[categoryKey] : [];
      if (existing.length >= MAX_SIZE_ENTRIES_PER_CATEGORY) return prev;

      return {
        ...prev,
        [categoryKey]: [
          ...existing,
          {
            label: "",
            measurementName: "",
            measurementValue: "",
            measurementUnit: "in",
          },
        ],
      };
    });
  }

  function removeEntry(categoryKey, index) {
    setSizePreferences((prev) => {
      const existing = Array.isArray(prev[categoryKey]) ? prev[categoryKey] : [];
      return {
        ...prev,
        [categoryKey]: existing.filter((_, entryIndex) => entryIndex !== index),
      };
    });
  }

  return (
    <div className="size-preferences-grid">
      {SIZE_CATEGORIES.map((category) => {
        const entries = Array.isArray(sizePreferences[category.key])
          ? sizePreferences[category.key]
          : [];

        return (
          <div key={category.key} className="size-category-card">
            <div className="size-category-header">
              <h3>{category.label}</h3>
              <button
                type="button"
                className="size-add"
                onClick={() => addEntry(category.key)}
                disabled={entries.length >= MAX_SIZE_ENTRIES_PER_CATEGORY}
              >
                Add size
              </button>
            </div>

            {entries.length === 0 ? (
              <p className="size-category-empty">No sizes added yet.</p>
            ) : (
              entries.map((entry, index) => (
                <div key={`${category.key}-${index}`} className="size-entry-row">
                  <label className="settings-label">
                    <span>Size label</span>
                    <input
                      type="text"
                      value={entry.label}
                      onChange={(event) =>
                        updateEntry(category.key, index, "label", event.target.value)
                      }
                      placeholder="S, M, 8, 30x32"
                    />
                  </label>

                  <label className="settings-label">
                    <span>Measurement name (optional)</span>
                    <input
                      type="text"
                      value={entry.measurementName}
                      onChange={(event) =>
                        updateEntry(category.key, index, "measurementName", event.target.value)
                      }
                      placeholder="Chest, waist, inseam"
                    />
                  </label>

                  <div className="size-measurement-fields">
                    <label className="settings-label">
                      <span>Measurement value</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={entry.measurementValue}
                        onChange={(event) =>
                          updateEntry(category.key, index, "measurementValue", event.target.value)
                        }
                        placeholder="38"
                      />
                    </label>

                    <label className="settings-label">
                      <span>Unit</span>
                      <select
                        value={entry.measurementUnit || "in"}
                        onChange={(event) =>
                          updateEntry(category.key, index, "measurementUnit", event.target.value)
                        }
                      >
                        <option value="in">in</option>
                        <option value="cm">cm</option>
                      </select>
                    </label>
                  </div>

                  <button
                    type="button"
                    className="size-remove"
                    onClick={() => removeEntry(category.key, index)}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

export default SizePreferencesEditor;
