import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch, parseApiResponse, REQUEST_SURFACES } from "../../shared/api/http";
import {
  fetchPostMetadataOptions,
  POST_TYPES,
  toDisplayLabel,
  UNKNOWN,
} from "../../shared/posts/postMetadata";
import {
  buildMarketplaceAnalyticsEvent,
  trackMarketplaceEvent,
} from "../../shared/analytics/marketplaceAnalytics";

const SEARCH_DEBOUNCE_MS = 350;
const CAROUSEL_LIMIT = 12;
const SEARCH_LIMIT = 24;

function formatPrice(priceCents) {
  if (!Number.isFinite(priceCents)) return "Price unavailable";
  return `$${(priceCents / 100).toFixed(2)}`;
}

function formatLikes(likeCount) {
  const value = Number.isFinite(likeCount) ? likeCount : 0;
  if (value === 1) return "1 like";
  return `${value} likes`;
}

function mapListingTitle(item) {
  if (typeof item?.title === "string" && item.title.trim()) return item.title.trim();
  if (typeof item?.caption === "string" && item.caption.trim()) return item.caption.trim();
  return "Untitled listing";
}

function MarketplaceListingCard({ item, section, onOpen }) {
  const primaryImage = Array.isArray(item?.imageUrls) && item.imageUrls.length > 0
    ? item.imageUrls[0]
    : item?.imageUrl || "";
  const sellerName = item?.seller?.username || item?.seller?.name || "Unknown seller";

  return (
    <button
      type="button"
      className="marketplace-card"
      onClick={() => onOpen(item, section)}
    >
      <div className="marketplace-card-image-wrap">
        {primaryImage ? (
          <img src={primaryImage} alt={mapListingTitle(item)} className="marketplace-card-image" />
        ) : (
          <div className="marketplace-card-image marketplace-card-image--empty">No image</div>
        )}
      </div>
      <div className="marketplace-card-body">
        <h3 className="marketplace-card-title">{mapListingTitle(item)}</h3>
        <p className="marketplace-card-price">{formatPrice(item?.priceCents)}</p>
        <p className="marketplace-card-seller">@{sellerName}</p>
        <p className="marketplace-card-location">{item?.location || "Location unavailable"}</p>
        <p className="marketplace-card-likes">{formatLikes(item?.likeCount)}</p>
      </div>
    </button>
  );
}

function MarketplaceCarousel({ title, sectionKey, items, loading, error, onMove, onOpenItem }) {
  const trackRef = useRef(null);

  function scrollByDirection(direction) {
    const track = trackRef.current;
    if (!track) return;

    const delta = Math.max(track.clientWidth * 0.82, 220);
    track.scrollBy({
      left: direction === "left" ? -delta : delta,
      behavior: "smooth",
    });

    onMove(sectionKey, direction);
  }

  return (
    <section className="marketplace-carousel-section">
      <div className="marketplace-carousel-header">
        <h2>{title}</h2>
        <div className="marketplace-carousel-actions">
          <button
            type="button"
            className="marketplace-carousel-arrow"
            aria-label={`Scroll ${title} left`}
            onClick={() => scrollByDirection("left")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            className="marketplace-carousel-arrow"
            aria-label={`Scroll ${title} right`}
            onClick={() => scrollByDirection("right")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="marketplace-empty">Loading listings...</div>
      ) : error ? (
        <div className="marketplace-empty">{error}</div>
      ) : items.length === 0 ? (
        <div className="marketplace-empty">No listings found.</div>
      ) : (
        <div className="marketplace-carousel-track" ref={trackRef}>
          {items.map((item) => (
            <div key={item.id} className="marketplace-carousel-slide">
              <MarketplaceListingCard item={item} section={sectionKey} onOpen={onOpenItem} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MarketplacePage() {
  const navigate = useNavigate();
  const [recommendedState, setRecommendedState] = useState({
    items: [],
    loading: true,
    error: "",
  });
  const [popularState, setPopularState] = useState({
    items: [],
    loading: true,
    error: "",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filters, setFilters] = useState({
    minPrice: "",
    maxPrice: "",
    category: "",
    condition: "",
  });
  const [searchState, setSearchState] = useState({
    items: [],
    loading: false,
    error: "",
    hasSearched: false,
  });
  const [filterOptions, setFilterOptions] = useState({
    categories: [UNKNOWN],
    conditions: [UNKNOWN],
  });
  const lastSearchAnalyticsKeyRef = useRef("");

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        filters.minPrice.trim() ||
          filters.maxPrice.trim() ||
          filters.category ||
          filters.condition
      ),
    [filters]
  );
  const shouldShowSearchResults = debouncedQuery.length >= 2 || hasActiveFilters;

  const trackEvent = useCallback((payload, options) => {
    void trackMarketplaceEvent(buildMarketplaceAnalyticsEvent(payload), options);
  }, []);

  const fetchSearchResults = useCallback(
    async ({ query, activeFilters }) => {
      setSearchState((prev) => ({
        ...prev,
        loading: true,
        error: "",
      }));

      try {
        const params = new URLSearchParams();
        if (query.length >= 2) params.set("q", query);
        if (activeFilters.minPrice.trim()) params.set("minPrice", activeFilters.minPrice.trim());
        if (activeFilters.maxPrice.trim()) params.set("maxPrice", activeFilters.maxPrice.trim());
        if (activeFilters.category) params.set("category", activeFilters.category);
        if (activeFilters.condition) params.set("condition", activeFilters.condition);
        params.set("limit", String(SEARCH_LIMIT));
        params.set("offset", "0");

        const res = await apiFetch(`/marketplace/search?${params.toString()}`, {
          auth: true,
          surface: REQUEST_SURFACES.MARKETPLACE,
        });
        const data = await parseApiResponse(res);
        if (!res.ok) {
          setSearchState({
            items: [],
            loading: false,
            error: data?.message || "Marketplace search failed.",
            hasSearched: true,
          });
          return;
        }

        setSearchState({
          items: Array.isArray(data?.items) ? data.items : [],
          loading: false,
          error: "",
          hasSearched: true,
        });
      } catch {
        setSearchState({
          items: [],
          loading: false,
          error: "Network error while searching marketplace.",
          hasSearched: true,
        });
      }
    },
    []
  );

  useEffect(() => {
    fetchPostMetadataOptions({ type: POST_TYPES.MARKET })
      .then((options) => {
        setFilterOptions({
          categories: Array.isArray(options?.categories) ? options.categories : [UNKNOWN],
          conditions: Array.isArray(options?.conditions) ? options.conditions : [UNKNOWN],
        });
      })
      .catch(() => {
        setFilterOptions({
          categories: [UNKNOWN],
          conditions: [UNKNOWN],
        });
      });
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim().slice(0, 80));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    let isMounted = true;

    async function loadCarouselListings() {
      try {
        const commonOptions = {
          auth: true,
          surface: REQUEST_SURFACES.MARKETPLACE,
        };

        const [recommendedResponse, popularResponse] = await Promise.all([
          apiFetch(`/marketplace/recommended?limit=${CAROUSEL_LIMIT}`, commonOptions),
          apiFetch(`/marketplace/popular?limit=${CAROUSEL_LIMIT}`, commonOptions),
        ]);

        const [recommendedData, popularData] = await Promise.all([
          parseApiResponse(recommendedResponse),
          parseApiResponse(popularResponse),
        ]);

        if (!isMounted) return;

        if (recommendedResponse.ok) {
          setRecommendedState({
            items: Array.isArray(recommendedData?.items) ? recommendedData.items : [],
            loading: false,
            error: "",
          });
        } else {
          setRecommendedState({
            items: [],
            loading: false,
            error: recommendedData?.message || "Failed to load recommended listings.",
          });
        }

        if (popularResponse.ok) {
          setPopularState({
            items: Array.isArray(popularData?.items) ? popularData.items : [],
            loading: false,
            error: "",
          });
        } else {
          setPopularState({
            items: [],
            loading: false,
            error: popularData?.message || "Failed to load popular listings.",
          });
        }
      } catch {
        if (!isMounted) return;
        setRecommendedState((prev) => ({
          ...prev,
          loading: false,
          error: prev.error || "Failed to load listings.",
        }));
        setPopularState((prev) => ({
          ...prev,
          loading: false,
          error: prev.error || "Failed to load listings.",
        }));
      }
    }

    loadCarouselListings();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!shouldShowSearchResults) return;

    const timer = setTimeout(() => {
      fetchSearchResults({ query: debouncedQuery, activeFilters: filters });
    }, 0);

    return () => clearTimeout(timer);
  }, [debouncedQuery, fetchSearchResults, filters, shouldShowSearchResults]);

  useEffect(() => {
    if (!shouldShowSearchResults) {
      lastSearchAnalyticsKeyRef.current = "";
      return;
    }

    const analyticsKey = JSON.stringify({
      query: debouncedQuery,
      minPrice: filters.minPrice.trim(),
      maxPrice: filters.maxPrice.trim(),
      category: filters.category || null,
      condition: filters.condition || null,
    });

    if (analyticsKey === lastSearchAnalyticsKeyRef.current) return;
    lastSearchAnalyticsKeyRef.current = analyticsKey;

    trackEvent({
      actionType: "marketplace_search_query",
      targetId: "marketplace_search",
      section: "search",
      query: debouncedQuery,
      metadata: {
        filters: {
          minPrice: filters.minPrice.trim() || null,
          maxPrice: filters.maxPrice.trim() || null,
          category: filters.category || null,
          condition: filters.condition || null,
        },
      },
    });
  }, [debouncedQuery, filters, shouldShowSearchResults, trackEvent]);

  function handleCarouselMove(sectionKey, direction) {
    trackEvent({
      actionType: "marketplace_carousel_nav",
      targetId: `${sectionKey}_${direction}`,
      section: sectionKey,
      metadata: {
        direction,
      },
    });
  }

  function handleOpenItem(item, section) {
    trackEvent(
      {
        actionType: "marketplace_item_click",
        targetId: item.id,
        postId: item.id,
        section,
        query: shouldShowSearchResults ? debouncedQuery : "",
        metadata: {
          sourceSection: section,
        },
      },
      { keepalive: true }
    );

    navigate(`/post/${item.id}`);
  }

  function updateFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    setFilters({
      minPrice: "",
      maxPrice: "",
      category: "",
      condition: "",
    });
  }

  return (
    <div className="feed-content marketplace-page">
      <header className="marketplace-header">
        <h1>Marketplace</h1>
        <p>Discover listings tailored to you or browse what is trending right now.</p>
      </header>

      <section className="marketplace-search-panel">
        <div className="marketplace-search-row">
          <div className="marketplace-search-input-wrap">
            <svg className="marketplace-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              maxLength={80}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search marketplace listings"
            />
          </div>
        </div>

        <div className="marketplace-filter-row">
          <label>
            Min Price
            <input
              type="number"
              min="0"
              step="1"
              value={filters.minPrice}
              onChange={(event) => updateFilter("minPrice", event.target.value)}
              placeholder="0"
            />
          </label>
          <label>
            Max Price
            <input
              type="number"
              min="0"
              step="1"
              value={filters.maxPrice}
              onChange={(event) => updateFilter("maxPrice", event.target.value)}
              placeholder="500"
            />
          </label>
          <label>
            Category
            <select
              value={filters.category}
              onChange={(event) => updateFilter("category", event.target.value)}
            >
              <option value="">All categories</option>
              {filterOptions.categories.map((entry) => (
                <option key={entry} value={entry}>
                  {toDisplayLabel(entry)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Condition
            <select
              value={filters.condition}
              onChange={(event) => updateFilter("condition", event.target.value)}
            >
              <option value="">All conditions</option>
              {filterOptions.conditions.map((entry) => (
                <option key={entry} value={entry}>
                  {toDisplayLabel(entry)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="cancel-button cancel-button--sm"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
          >
            Clear filters
          </button>
        </div>
      </section>

      {shouldShowSearchResults ? (
        <section className="marketplace-search-results">
          <div className="marketplace-results-header">
            <h2>Search Results</h2>
            {debouncedQuery ? <span>for "{debouncedQuery}"</span> : null}
          </div>
          {searchState.loading ? (
            <div className="marketplace-empty">Searching listings...</div>
          ) : searchState.error ? (
            <div className="marketplace-empty">{searchState.error}</div>
          ) : searchState.hasSearched && searchState.items.length === 0 ? (
            <div className="marketplace-empty">No listings match your search.</div>
          ) : (
            <div className="marketplace-results-grid">
              {searchState.items.map((item) => (
                <MarketplaceListingCard
                  key={item.id}
                  item={item}
                  section="search_results"
                  onOpen={handleOpenItem}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          <MarketplaceCarousel
            title="Recommended for you"
            sectionKey="recommended"
            items={recommendedState.items}
            loading={recommendedState.loading}
            error={recommendedState.error}
            onMove={handleCarouselMove}
            onOpenItem={handleOpenItem}
          />
          <MarketplaceCarousel
            title="Popular"
            sectionKey="popular"
            items={popularState.items}
            loading={popularState.loading}
            error={popularState.error}
            onMove={handleCarouselMove}
            onOpenItem={handleOpenItem}
          />
        </>
      )}
    </div>
  );
}

export default MarketplacePage;
