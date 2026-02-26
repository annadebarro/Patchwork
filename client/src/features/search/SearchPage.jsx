import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch, parseApiResponse, REQUEST_SURFACES } from "../../shared/api/http";
import PostCard from "../feed/PostCard";
import ProfilePatch from "../../shared/ui/ProfilePatch";

const SEARCH_TABS = [
  { key: "overall", label: "Overall" },
  { key: "users", label: "Users" },
  { key: "social", label: "Social" },
  { key: "marketplace", label: "Marketplace" },
  { key: "quilts", label: "Quilts" },
];
const SEARCH_TAB_KEYS = SEARCH_TABS.map((tab) => tab.key);
const SEARCH_TAB_SET = new Set(SEARCH_TAB_KEYS);
const SEARCH_DEFAULT_TAB = "overall";
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_LIMIT = 20;
const SEARCH_SECTION_LIMIT = 5;

function normalizeSearchTab(rawTab) {
  const value = typeof rawTab === "string" ? rawTab.toLowerCase().trim() : "";
  return SEARCH_TAB_SET.has(value) ? value : SEARCH_DEFAULT_TAB;
}

function createEmptySearchSection() {
  return { items: [], total: 0, hasMore: false };
}

function createEmptySearchSections() {
  return {
    users: createEmptySearchSection(),
    social: createEmptySearchSection(),
    marketplace: createEmptySearchSection(),
    quilts: createEmptySearchSection(),
  };
}

function createSearchPagination(offset = 0, limit = SEARCH_PAGE_LIMIT, total = 0, hasMore = false) {
  return {
    offset,
    limit,
    total,
    hasMore,
    nextOffset: offset + limit,
  };
}

function createEmptySearchTabState() {
  return {
    loading: false,
    error: "",
    items: [],
    pagination: createSearchPagination(),
    lastQuery: "",
  };
}

function createEmptySearchTabResults() {
  return {
    users: createEmptySearchTabState(),
    social: createEmptySearchTabState(),
    marketplace: createEmptySearchTabState(),
    quilts: createEmptySearchTabState(),
  };
}

function mergeById(existingItems, nextItems) {
  const seen = new Set();
  const merged = [];

  for (const item of [...existingItems, ...nextItems]) {
    if (!item || typeof item !== "object") continue;
    const id = item.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }

  return merged;
}

function normalizeSearchPagination(rawPagination, fallbackOffset, fallbackLimit) {
  const offsetCandidate = Number(rawPagination?.offset);
  const limitCandidate = Number(rawPagination?.limit);
  const totalCandidate = Number(rawPagination?.total);
  const nextOffsetCandidate = Number(rawPagination?.nextOffset);

  const offset = Number.isFinite(offsetCandidate) ? Math.max(offsetCandidate, 0) : fallbackOffset;
  const limit = Number.isFinite(limitCandidate) ? Math.max(limitCandidate, 1) : fallbackLimit;
  const total = Number.isFinite(totalCandidate) ? Math.max(totalCandidate, 0) : 0;
  const nextOffset = Number.isFinite(nextOffsetCandidate) ? Math.max(nextOffsetCandidate, offset + limit) : offset + limit;

  return {
    offset,
    limit,
    total,
    hasMore: Boolean(rawPagination?.hasMore),
    nextOffset,
  };
}

function normalizeSearchSections(rawSections) {
  const normalized = createEmptySearchSections();
  for (const sectionKey of ["users", "social", "marketplace", "quilts"]) {
    const section = rawSections?.[sectionKey];
    const totalCandidate = Number(section?.total);
    normalized[sectionKey] = {
      items: Array.isArray(section?.items) ? section.items : [],
      total: Number.isFinite(totalCandidate) ? Math.max(totalCandidate, 0) : 0,
      hasMore: Boolean(section?.hasMore),
    };
  }
  return normalized;
}

function SearchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentSearchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const tabFromUrl = normalizeSearchTab(currentSearchParams.get("tab"));
  const queryFromUrl = (currentSearchParams.get("q") || "").slice(0, 80);

  const [queryInput, setQueryInput] = useState(queryFromUrl);
  const [debouncedQuery, setDebouncedQuery] = useState(queryFromUrl.trim());
  const [overallResult, setOverallResult] = useState({
    loading: false,
    error: "",
    sections: createEmptySearchSections(),
    lastQuery: "",
  });
  const [tabResults, setTabResults] = useState(createEmptySearchTabResults);

  const tabResultsRef = useRef(tabResults);
  const requestIdsRef = useRef({
    overall: 0,
    users: 0,
    social: 0,
    marketplace: 0,
    quilts: 0,
  });
  const abortControllersRef = useRef({
    overall: null,
    users: null,
    social: null,
    marketplace: null,
    quilts: null,
  });

  useEffect(() => {
    tabResultsRef.current = tabResults;
  }, [tabResults]);

  useEffect(() => {
    setQueryInput(queryFromUrl);
  }, [queryFromUrl]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(queryFromUrl.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [queryFromUrl]);

  useEffect(() => {
    const controllers = abortControllersRef.current;
    return () => {
      for (const key of SEARCH_TAB_KEYS) {
        const controller = controllers[key];
        if (controller) controller.abort();
      }
    };
  }, []);

  const updateSearchUrl = useCallback(
    (nextQuery, nextTab, replace = true) => {
      const params = new URLSearchParams(location.search);
      const cleanedQuery = String(nextQuery ?? "").slice(0, 80);
      if (cleanedQuery) params.set("q", cleanedQuery);
      else params.delete("q");
      params.set("tab", normalizeSearchTab(nextTab));

      const nextSearch = params.toString();
      navigate(`/search${nextSearch ? `?${nextSearch}` : ""}`, { replace });
    },
    [location.search, navigate]
  );

  const fetchOverallResults = useCallback(async (query) => {
    const token = localStorage.getItem("token");
    if (!token) {
      setOverallResult({
        loading: false,
        error: "Please log in again.",
        sections: createEmptySearchSections(),
        lastQuery: query,
      });
      return;
    }

    if (abortControllersRef.current.overall) {
      abortControllersRef.current.overall.abort();
    }

    const controller = new AbortController();
    abortControllersRef.current.overall = controller;
    const requestId = ++requestIdsRef.current.overall;

    setOverallResult((prev) => ({
      ...prev,
      loading: true,
      error: "",
    }));

    try {
      const params = new URLSearchParams();
      params.set("q", query);
      params.set("tab", "overall");
      params.set("sectionLimit", String(SEARCH_SECTION_LIMIT));
      const res = await apiFetch(`/search?${params.toString()}`, {
        auth: true,
        surface: REQUEST_SURFACES.SEARCH_RESULTS,
        signal: controller.signal,
      });
      const data = await parseApiResponse(res);
      if (requestId !== requestIdsRef.current.overall) return;

      if (!res.ok) {
        const message = data?.message || `Search failed (${res.status})`;
        setOverallResult({
          loading: false,
          error: message,
          sections: createEmptySearchSections(),
          lastQuery: query,
        });
        return;
      }

      setOverallResult({
        loading: false,
        error: "",
        sections: normalizeSearchSections(data?.sections),
        lastQuery: query,
      });
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (requestId !== requestIdsRef.current.overall) return;
      setOverallResult({
        loading: false,
        error: "Network error while searching.",
        sections: createEmptySearchSections(),
        lastQuery: query,
      });
    } finally {
      if (abortControllersRef.current.overall === controller) {
        abortControllersRef.current.overall = null;
      }
    }
  }, []);

  const fetchTabResults = useCallback(async (tab, query, options = {}) => {
    if (!SEARCH_TAB_SET.has(tab) || tab === "overall") return;

    const append = Boolean(options.append);
    const token = localStorage.getItem("token");
    if (!token) {
      setTabResults((prev) => ({
        ...prev,
        [tab]: {
          ...prev[tab],
          loading: false,
          error: "Please log in again.",
          lastQuery: query,
        },
      }));
      return;
    }

    const currentTabState = tabResultsRef.current[tab] || createEmptySearchTabState();
    const offset = append ? currentTabState.pagination.nextOffset : 0;
    const limit = SEARCH_PAGE_LIMIT;

    if (abortControllersRef.current[tab]) {
      abortControllersRef.current[tab].abort();
    }

    const controller = new AbortController();
    abortControllersRef.current[tab] = controller;
    const requestId = ++requestIdsRef.current[tab];

    setTabResults((prev) => {
      const prevTab = prev[tab];
      const shouldReset = !append && prevTab.lastQuery !== query;
      return {
        ...prev,
        [tab]: {
          ...prevTab,
          loading: true,
          error: "",
          items: shouldReset ? [] : prevTab.items,
          pagination: shouldReset ? createSearchPagination(0, limit, 0, false) : prevTab.pagination,
        },
      };
    });

    try {
      const params = new URLSearchParams();
      params.set("q", query);
      params.set("tab", tab);
      params.set("offset", String(offset));
      params.set("limit", String(limit));
      const res = await apiFetch(`/search?${params.toString()}`, {
        auth: true,
        surface: REQUEST_SURFACES.SEARCH_RESULTS,
        signal: controller.signal,
      });
      const data = await parseApiResponse(res);
      if (requestId !== requestIdsRef.current[tab]) return;

      if (!res.ok) {
        const message = data?.message || `Search failed (${res.status})`;
        setTabResults((prev) => ({
          ...prev,
          [tab]: {
            ...prev[tab],
            loading: false,
            error: message,
            items: append ? prev[tab].items : [],
            pagination: append ? prev[tab].pagination : createSearchPagination(0, limit, 0, false),
            lastQuery: query,
          },
        }));
        return;
      }

      const incomingItems = Array.isArray(data?.items) ? data.items : [];
      const normalizedPagination = normalizeSearchPagination(data?.pagination, offset, limit);

      setTabResults((prev) => {
        const prevTab = prev[tab];
        return {
          ...prev,
          [tab]: {
            ...prevTab,
            loading: false,
            error: "",
            items: append ? mergeById(prevTab.items, incomingItems) : incomingItems,
            pagination: normalizedPagination,
            lastQuery: query,
          },
        };
      });
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (requestId !== requestIdsRef.current[tab]) return;

      setTabResults((prev) => ({
        ...prev,
        [tab]: {
          ...prev[tab],
          loading: false,
          error: "Network error while searching.",
          lastQuery: query,
        },
      }));
    } finally {
      if (abortControllersRef.current[tab] === controller) {
        abortControllersRef.current[tab] = null;
      }
    }
  }, []);

  useEffect(() => {
    const query = debouncedQuery.trim();
    if (query.length < 2) {
      for (const key of SEARCH_TAB_KEYS) {
        const controller = abortControllersRef.current[key];
        if (controller) {
          controller.abort();
          abortControllersRef.current[key] = null;
        }
      }

      setOverallResult({
        loading: false,
        error: "",
        sections: createEmptySearchSections(),
        lastQuery: query,
      });

      setTabResults(() => {
        const next = createEmptySearchTabResults();
        for (const tabKey of ["users", "social", "marketplace", "quilts"]) {
          next[tabKey].lastQuery = query;
        }
        return next;
      });
      return;
    }

    if (tabFromUrl === "overall") {
      fetchOverallResults(query);
    } else {
      fetchTabResults(tabFromUrl, query, { append: false });
    }
  }, [debouncedQuery, tabFromUrl, fetchOverallResults, fetchTabResults]);

  function handleQueryChange(event) {
    const nextQuery = event.target.value;
    setQueryInput(nextQuery);
    updateSearchUrl(nextQuery, tabFromUrl, true);
  }

  function handleTabChange(nextTab, replace = false) {
    updateSearchUrl(queryInput, nextTab, replace);
  }

  function handleLoadMore() {
    if (tabFromUrl === "overall") return;
    const query = debouncedQuery.trim();
    const activeTabState = tabResults[tabFromUrl];
    if (!activeTabState || activeTabState.loading || !activeTabState.pagination.hasMore) return;
    if (query.length < 2) return;
    fetchTabResults(tabFromUrl, query, { append: true });
  }

  const queryReady = debouncedQuery.trim().length >= 2;
  const activeTabState = tabFromUrl === "overall" ? null : tabResults[tabFromUrl];

  function renderUsersList(items, compact = false) {
    return (
      <div className={`search-user-list${compact ? " search-user-list--compact" : ""}`}>
        {items.map((user) => (
          <button
            key={user.id}
            type="button"
            className="search-user-item"
            onClick={() => navigate(`/userpage/${user.username}`)}
          >
            <ProfilePatch name={user.name} imageUrl={user.profilePicture} />
            <div className="search-user-meta">
              <span className="search-user-name">{user.name || user.username}</span>
              <span className="search-user-handle">@{user.username}</span>
              {user.bio && <span className="search-user-bio">{user.bio}</span>}
            </div>
          </button>
        ))}
      </div>
    );
  }

  function renderPostResults(items, compact = false) {
    if (!items.length) return <p className="search-empty">No matches found.</p>;
    if (compact) {
      return (
        <div className="search-post-grid search-post-grid--compact">
          {items.map((post) => (
            <PostCard key={post.id} post={post} imageOnly />
          ))}
        </div>
      );
    }

    return (
      <div className="masonry-grid">
        {items.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    );
  }

  function renderQuiltResults(items, compact = false) {
    if (!items.length) return <p className="search-empty">No matches found.</p>;
    return (
      <div className={`search-quilt-grid${compact ? " search-quilt-grid--compact" : ""}`}>
        {items.map((quilt) => {
          const ownerUsername = quilt.owner?.username;
          return (
            <button
              key={quilt.id}
              type="button"
              className="search-quilt-card"
              disabled={!ownerUsername}
              onClick={() => {
                if (ownerUsername) navigate(`/userpage/${ownerUsername}`);
              }}
            >
              <div className="search-quilt-header">
                <span className="search-quilt-name">{quilt.name}</span>
                <span className="search-quilt-count">{quilt.patchCount || 0} patches</span>
              </div>
              <span className="search-quilt-owner">
                {ownerUsername ? `@${ownerUsername}` : "Unknown owner"}
              </span>
              <div className="search-quilt-preview">
                {(quilt.previewImageUrl ? [quilt.previewImageUrl] : (quilt.previewImages || []).slice(0, 4))
                  .map((url, index) => (
                    <img key={`${quilt.id}-preview-${index}`} src={url} alt="" />
                  ))}
              </div>
              {quilt.description && (
                <p className="search-quilt-description">{quilt.description}</p>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  function renderOverallSection(sectionKey, sectionTitle) {
    const section = overallResult.sections[sectionKey] || createEmptySearchSection();
    const sectionItems = Array.isArray(section.items) ? section.items : [];
    const showCompact = sectionKey === "social" || sectionKey === "marketplace";

    return (
      <section key={sectionKey} className="search-section-card">
        <div className="search-section-header">
          <h3>{sectionTitle}</h3>
          <button type="button" onClick={() => handleTabChange(sectionKey, false)}>
            View all
          </button>
        </div>
        {sectionItems.length === 0 ? (
          <p className="search-empty search-empty--section">No matches.</p>
        ) : sectionKey === "users" ? (
          renderUsersList(sectionItems, true)
        ) : sectionKey === "quilts" ? (
          renderQuiltResults(sectionItems, true)
        ) : (
          renderPostResults(sectionItems, showCompact)
        )}
      </section>
    );
  }

  function renderActiveTab() {
    if (tabFromUrl === "overall") {
      if (overallResult.loading) {
        return <div className="search-empty">Searching...</div>;
      }

      if (overallResult.error) {
        return <div className="search-empty">{overallResult.error}</div>;
      }

      return (
        <div className="search-overall-grid">
          {renderOverallSection("users", "Users")}
          {renderOverallSection("social", "Social")}
          {renderOverallSection("marketplace", "Marketplace")}
          {renderOverallSection("quilts", "Quilts")}
        </div>
      );
    }

    if (!activeTabState) {
      return <div className="search-empty">No results.</div>;
    }

    if (activeTabState.loading && !activeTabState.items.length) {
      return <div className="search-empty">Searching...</div>;
    }

    if (activeTabState.error) {
      return <div className="search-empty">{activeTabState.error}</div>;
    }

    if (!activeTabState.items.length) {
      return <div className="search-empty">No matches found.</div>;
    }

    return (
      <>
        {tabFromUrl === "users" && renderUsersList(activeTabState.items)}
        {(tabFromUrl === "social" || tabFromUrl === "marketplace") && renderPostResults(activeTabState.items)}
        {tabFromUrl === "quilts" && renderQuiltResults(activeTabState.items)}
        {(activeTabState.loading || activeTabState.pagination.hasMore) && (
          <div className="search-load-more-wrap">
            <button
              type="button"
              className="save-button"
              disabled={!activeTabState.pagination.hasMore || activeTabState.loading}
              onClick={handleLoadMore}
            >
              {activeTabState.loading ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="feed-content search-page">
      <div className="search-page-header">
        <div className="search-page-input-wrap">
          <svg className="search-page-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={queryInput}
            onChange={handleQueryChange}
            placeholder="Search users, posts, marketplace listings, and quilts"
            maxLength={80}
          />
        </div>
      </div>

      <nav className="search-tabs">
        {SEARCH_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`feed-tab ${tabFromUrl === tab.key ? "active" : ""}`}
            onClick={() => handleTabChange(tab.key, false)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {queryReady ? (
        renderActiveTab()
      ) : (
        <div className="search-empty">Type at least 2 characters to search.</div>
      )}
    </div>
  );
}

export default SearchPage;
