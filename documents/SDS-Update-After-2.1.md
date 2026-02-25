# Patchwork SDS Updates (After 2.1)

This document is intended to be copied into the existing SDS starting after **Section 2.1 Software Architecture – Tier 3 Data Layer (Postgres)**.

It reflects the **current implementation** in this repo and the **planned direction** of the project (search + suggestions as the main focus; marketplace as an MVP “Facebook Marketplace style” flow coordinated via direct messages; payment outside the website).

## 2.2 Component Design (Tier 2 Application Layer)

The Patchwork backend is a Node.js/Express service organized by route modules and supporting services. Database access is through Sequelize models backed by Postgres (Neon). Image files are stored externally (Supabase Storage), and Postgres stores only the image URL plus metadata.

### 2.2.1 API Server Core

Primary files:

- `server/src/server.js`: Express app, CORS, JSON parsing, error handling, Socket.IO setup for realtime messaging.
- `server/src/routes/index.js`: registers route modules under `/api/*`.
- `server/src/config/db.js`: initializes Sequelize connection from `DATABASE_URL`.
- `server/src/config/migrationGuard.js`: blocks startup if migrations are pending (environment dependent).

Responsibilities:

- Route registration and request lifecycle.
- Centralized error handler (JSON errors).
- CORS configuration via `CLIENT_ORIGIN`.
- JWT verification for protected endpoints.

### 2.2.2 Authentication Service (JWT)

Primary files:

- `server/src/routes/auth.js`
- `server/src/middleware/auth.js`

Responsibilities:

- Account registration and login.
- Stateless sessions using signed JWTs.
- Middleware that sets `req.user` from `Authorization: Bearer <token>`.

Notes:

- For SDS: “Sessions” are not stored server-side (no session table). JWT expiry is enforced by token validation.

### 2.2.3 Content (Posts) Service

Primary files:

- `server/src/routes/posts.js`
- `server/src/models/index.js` (Post model and associations)

Current behaviors:

- Create post (regular and marketplace types).
- Read post feed (`GET /api/posts`) and details (`GET /api/posts/:postId`).
- Author attribution is stored in the `posts.user_id` column.
- Marketplace extensions: `price_cents`, `is_sold`.

Planned behaviors:

- Add tags/categories for search and personalization.
- Add lightweight marketplace listing fields (condition, location radius, pickup/shipping notes).

### 2.2.4 Social Interaction Services

Primary files:

- `server/src/routes/likes.js` (likes)
- `server/src/routes/comments.js` (comments + comment likes)
- `server/src/routes/follows.js` (follow graph)
- `server/src/routes/notifications.js` (notifications)

Responsibilities:

- Store engagement signals used by suggestions and ranking (likes, comments, follows).
- Provide “interest signals” for recommendation tuning.

### 2.2.5 Messaging Service (DMs)

Primary files:

- `server/src/routes/messages.js`
- `server/src/models/index.js` (Conversation, ConversationParticipant, Message)
- `server/src/server.js` (Socket.IO)

Responsibilities:

- Direct messages between users.
- Marketplace coordination via DM (payment happens outside Patchwork).

Notes:

- Messaging supports realtime updates using Socket.IO with JWT handshake auth.

### 2.2.6 Search Service (Primary Project Focus)

Primary files:

- `server/src/routes/search.js`

Current approach (implemented):

- Case-insensitive search using `ILIKE` over user and post fields.
- Lightweight in-memory scoring heuristics for ranking results.
- Multiple tabs and “overall” mode that returns sections (users, social posts, marketplace posts, quilts).

Planned improvements (Postgres-first):

- Postgres full-text search (FTS) using `tsvector` + `GIN` indexes for scalable lexical matching.
- Ranking that blends text score with engagement and personalization signals.
- Query logging via `user_actions` (to measure search satisfaction and tune ranking).

### 2.2.7 Recommendations / Suggestions Service (Primary Project Focus)

Primary files:

- `server/src/routes/recommendations.js`
- `server/src/services/recommendations.js`
- `server/src/services/actionLogger.js`

Current approach (implemented):

- Chronological fallback feed from `posts.created_at` (`algorithm = chronological_fallback`).

Planned approach (hybrid recommender):

- Content-based: match user’s recent likes/saves/searches to post tags, post type, and author affinity.
- Collaborative: “users with similar likes/follows engaged with …”.
- Constraints: enforce freshness, diversity (avoid too many posts from same author), and marketplace availability (`is_sold = false`).
- Outputs: separate ranking strategies for `regular` vs `market` posts.

## 2.3 Data Design (Tier 3 Data Layer Details)

This section describes the logical schema stored in Postgres. Sequelize models define and migrate these tables.

### 2.3.1 Core Tables (Current)

Key entities (see `server/src/models/index.js`):

- `users`: accounts, onboarding preferences, profile fields.
- `posts`: regular + marketplace posts.
- `likes`: user likes on posts.
- `comments`: comments on posts (supports parent/child structure).
- `follows`: follower/followee edges.
- `conversations`, `conversation_participants`, `messages`: direct messaging.
- `notifications`: user notifications.
- `quilts`, `patches`: board/collection feature (“quilts”) and their patches.
- `user_actions`: normalized event stream for “what a user did” (used for suggestions).

### 2.3.2 Image Storage (External)

Images are stored in Supabase Storage (bucket `images`). Postgres stores:

- `posts.image_url`: public URL (or signed URL reference in future).
- Potential future: `users.profile_picture` for avatars.

### 2.3.3 Planned Tables / Columns (Search + Suggestions)

To improve relevance and performance, we plan to add:

- `post_tags` (many-to-many) and `tags` (or a `posts.tags TEXT[]`) for topic/category signals.
- Optional: derived tables for speed:
  - `user_tag_affinity(user_id, tag_id, score, updated_at)`
  - `user_author_affinity(user_id, author_id, score, updated_at)`
  - `post_search_vector` (or a generated column) for Postgres FTS.

## 2.4 Interface Design

### 2.4.1 REST API (Current)

Backend endpoints are under `/api/*` (see `server/src/routes/index.js`). Key endpoints for the core workflow:

- Auth:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/auth/me`
- Uploads:
  - `POST /api/uploads` (multipart form-data `file`; uploads to Supabase)
- Posts:
  - `GET /api/posts?type=regular|market`
  - `GET /api/posts/mine`
  - `POST /api/posts`
  - `GET /api/posts/:postId`
- Search:
  - `GET /api/search?q=...&tab=overall|users|social|marketplace|quilts`
- Recommendations:
  - `GET /api/recommendations?type=regular|market`
- Messaging:
  - `GET/POST /api/messages/*` (see `server/src/routes/messages.js`)

### 2.4.2 Frontend UX (Current)

Primary files:

- `client/src/App.jsx`: routes, authenticated layout, create post modal, feed rendering.

Current screens:

- Login/signup and onboarding.
- Home feed (social + marketplace tabs).
- Profile page (shows the user’s posts).
- Settings.

Planned screens (search + suggestions focus):

- Search results page with tabs (users/social/marketplace/quilts).
- “Suggested for you” sections and personalized feed (powered by `/api/recommendations`).

## 2.5 Search Design (Planned Evolution)

### 2.5.1 MVP (Current)

Approach:

- Use `ILIKE` to match query tokens against usernames, names, bios, and post captions.
- Rank results by heuristic scoring (exact/prefix/contains, recency tie-break).

Pros:

- Simple and functional for small datasets.

Cons:

- Not as scalable or relevant as Postgres FTS.
- Personalization is limited.

### 2.5.2 Planned Postgres FTS (Next Iteration)

Approach:

- Add `tsvector` for searchable text (caption, username, tags).
- Add `GIN` index for fast queries.
- Use `ts_rank` / `ts_rank_cd` to compute lexical relevance.
- Blend lexical relevance with engagement/personalization signals from `user_actions`, `likes`, and `follows`.

Ranking blend (example):

- `final_score = 0.70 * text_rank + 0.20 * affinity_score + 0.10 * popularity_score`

## 2.6 Suggestions / Recommendation Design (Planned)

### 2.6.1 Current Implementation

`GET /api/recommendations` returns chronological posts as a safe default.

### 2.6.2 Planned Personalization Signals

Signals captured in:

- `likes`, `comments`, `follows`
- `user_actions` (views, clicks, search events, message events, etc.)

Derived features:

- Tag affinity: which categories a user engages with.
- Author affinity: which creators a user likes.
- Marketplace intent: whether the user engages more with `market` posts.

### 2.6.3 Planned Algorithms (Hybrid)

For each user:

- Candidate generation:
  - Recent posts by followed users.
  - Posts matching top tag affinities.
  - Marketplace: only unsold items (`is_sold = false`).
- Ranking:
  - Content-based similarity + engagement + recency.
  - Diversity constraints (author cooldown, type mix).

## 2.7 Marketplace System (MVP + Plan)

MVP goal:

- Simple listings via `Post(type='market')` with `price_cents`.
- Buyer/seller coordinate via DMs.
- Payment occurs outside the website.

Planned improvements (if time):

- Filters: distance, price range, condition, category.
- Moderation: report listing, hide sold listings by default.
- “Mark as sold” UX (already supported by `PATCH /api/posts/:postId/sold`).

## 2.8 Image Upload / Storage Integration

Current approach:

- Direct upload to the backend (`POST /api/uploads`).
- Backend uploads to Supabase Storage bucket `images`.
- Backend returns `publicUrl`.
- Post creation stores `imageUrl` in Postgres.

Planned improvements:

- Signed upload URLs (client uploads directly to Supabase).
- Private buckets + signed read URLs (if privacy becomes a requirement).
- Image transformations (thumbnails) using a CDN/transform service if needed.

## 2.9 Security Considerations

- JWT auth for protected endpoints.
- Service role key for Supabase remains server-side only.
- CORS locked down in production via `CLIENT_ORIGIN`.
- Input validation for post creation, auth, and uploads (size/type checks).

## 2.10 Testing Plan (Recommended)

Current:

- Unit test exists for action logger: `server/src/services/actionLogger.test.js`.

Planned:

- API integration tests (auth, post create, upload, recommendations).
- Manual test checklist for demo:
  - Create user, upload image, create post.
  - Verify post appears on home feed and profile.
  - Run a search and confirm results and ranking behavior.

## 2.11 Deployment / Environments (Planned)

Local development:

- Client: Vite dev server (default `:5173`)
- Server: Express (port via `PORT`, commonly `:5050`)
- DB: Neon Postgres via `DATABASE_URL`
- Storage: Supabase via `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`

Production (if deployed):

- Hosted frontend (static build) + hosted Node backend.
- Neon + Supabase remain managed external services.

