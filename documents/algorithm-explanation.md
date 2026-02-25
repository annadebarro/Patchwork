# Recommendation System Walkthrough (Input -> Output)

## Mental model
Every feed request goes through four stages:
1. Build a user preference profile from recent behavior.
2. Build a candidate pool of posts that are eligible to show.
3. Score each candidate post.
4. Order and constrain the final list (mix + diversity), then return paginated results.

If hybrid ranking fails, the API returns chronological fallback so feed still works.

---

## 1) Request input and setup
- Endpoint: `GET /api/recommendations`
- Inputs: authenticated `userId`, optional `type` (`regular` or `market`), `limit`, `offset`.
- The service loads the active recommendation config (or defaults if config load fails).

Plain English:
- The system first reads who you are, what feed slice you asked for, and what ranking settings are active.

---

## 2) Build the user profile (what the system thinks you like)
- Data window is roughly the last 90 days of actions + current follows.
- It uses weighted events like follow/unfollow, like/unlike, comment, patch-save, click, and dwell.
- It creates normalized affinity maps (0..1) for:
  - author
  - style
  - color
  - brand
  - category
  - size
  - price band
  - condition
- It computes profile diagnostics:
  - `relevantActionCount`
  - `marketShare` preference
  - `coldStartMode` (true when action history is small)
  - `historyConfidence`
  - `regularSignalStrength` and `marketSignalStrength`

Plain English:
- This is your behavioral fingerprint. It is not one single score; it is a set of preference maps plus confidence about how reliable those maps are.

---

## 3) Candidate generation (what posts are even allowed to compete)
- Base filters:
  - post must be public
  - exclude your own posts
  - marketplace candidates must be unsold
  - recency windows per type
- Followed-author boost:
  - extra candidate query for authors you follow
  - merged ahead of base candidates
  - deduped by `postId`
- Engagement velocity is computed per candidate from recent interactions and normalized to 0..1.

Plain English:
- Before ranking, the system picks the pool of posts it is allowed to choose from, and gives followed creators an extra chance to appear in that pool.

---

## 4) Scoring formula (explicit)

### 4.1 General scoring equation
\[
\text{score}(p,u,t)=\sum_{k \in F_t} w_k(u,t)\cdot x_k(p,u,t)
\]

Variable meanings:
- `p`: a candidate post.
- `u`: the current user.
- `t`: feed type (`regular` or `market`).
- `F_t`: feature set used for type `t`.
- `x_k(p,u,t)`: value of feature `k` for post `p` and user `u` (usually normalized to `[0,1]`).
- `w_k(u,t)`: effective weight for feature `k` (adaptive; depends on profile confidence + config).
- `score(p,u,t)`: final numeric rank score (higher sorts earlier).

### 4.2 Regular feed expanded
\[
\begin{aligned}
\text{score}_{regular}(p,u)=&
w_{follow}\cdot followAff
+w_{author}\cdot authorAff
+w_{style}\cdot styleMatch \\
&+w_{color}\cdot colorMatch
+w_{brand}\cdot brandMatch
+w_{vel}\cdot engagementVelocity
+w_{fresh}\cdot freshness
\end{aligned}
\]

### 4.3 Market feed expanded
\[
\begin{aligned}
\text{score}_{market}(p,u)=&
w_{follow}\cdot followAff
+w_{author}\cdot authorAff
+w_{cat}\cdot categoryMatch \\
&+w_{brand}\cdot brandMatch
+w_{size}\cdot sizeMatch
+w_{price}\cdot priceBandMatch \\
&+w_{cond}\cdot conditionMatch
+w_{vel}\cdot engagementVelocity
+w_{fresh}\cdot freshness
\end{aligned}
\]

Component meanings:
- `followAff`: 1 if post author is followed, else 0.
- `authorAff`: affinity to this specific author.
- `styleMatch`, `colorMatch`, `brandMatch`, `categoryMatch`, `sizeMatch`, `priceBandMatch`, `conditionMatch`: affinity matches between post metadata and user profile maps.
- `engagementVelocity`: recent momentum of the post (likes/comments/saves).
- `freshness`: time-decay recency term.

---

## 5) Freshness half-life formula (explicit)

\[
freshness(p,t)=\exp\left(-\ln(2)\cdot \frac{ageDays(p)}{H_t}\right)
\]

Variable meanings:
- `freshness(p,t)`: recency score in `[0,1]` used in ranking.
- `ageDays(p)`: age of post `p` in days at ranking time.
- `H_t`: half-life in days for feed type `t`.
- `ln(2)`: natural log of 2; this makes score halve every `H_t` days.
- `exp(...)`: exponential decay function.

Runtime defaults:
- `H_regular = 7`
- `H_market = 14`

Plain English:
- A regular post loses recency weight faster than a market post.
- At exactly one half-life, the freshness term becomes 0.5.

---

## 6) Adaptive weights (why behavior maturity changes ranking)
- Weights are not fixed constants at runtime.
- `historyConfidence` increases with action count.
- Low confidence profiles get more weight on stable signals (freshness, velocity, follow relationship).
- High confidence profiles get more weight on fine-grained preference matches.
- Market scoring also uses market intent confidence to decide how much to trust market-specific matches.

Plain English:
- New users get safer ranking.
- Experienced users get more personalized ranking.

---

## 7) Final ordering rules (after scoring)
- Sort regular and market candidates by score descending.
- If `type` is forced, rank only that type.
- If all-feed:
  - interleave regular + market by target market share
  - target share is learned when enough history exists, else default share
- Apply diversity caps to limit repeated authors in top ranks.
- Slice by `offset` and `limit`, return posts + pagination metadata.

Plain English:
- High score is necessary but not sufficient; mix and diversity rules can still move a post up or down.

---

## 8) Why a post ended up where it did (practical explanation script)
Use this order in conversation:
1. Did it enter the candidate set (including follow-author boost)?
2. Which feature components were strong or weak?
3. What were the effective adaptive weights for this user state?
4. Did blend share constraints change relative position?
5. Did diversity caps suppress repeated-author placement?

That is the full input-to-output decision path the algorithm follows.
