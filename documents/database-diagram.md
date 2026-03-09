# Patchwork Database Diagram

This diagram is based on the implemented Sequelize schema in [server/src/models/index.js](/Users/jacklund/Documents/CS/CS422/Patchwork/server/src/models/index.js) plus the recommendation/admin migrations in:

- [20260219-0009-add-recommendation-config-history.js](/Users/jacklund/Documents/CS/CS422/Patchwork/server/migrations/20260219-0009-add-recommendation-config-history.js)
- [20260219-0010-add-recommendation-simulation-runs.js](/Users/jacklund/Documents/CS/CS422/Patchwork/server/migrations/20260219-0010-add-recommendation-simulation-runs.js)

For presentation use, the schema is split into two diagrams so the slide stays readable.

## Core Application Schema

```mermaid
erDiagram
  USERS {
    UUID id PK
    STRING email
    STRING username
    STRING name
    ENUM onboarding_status
    ENUM role
  }

  POSTS {
    UUID id PK
    UUID user_id FK
    ENUM type
    TEXT caption
    INTEGER price_cents
    BOOLEAN is_public
    BOOLEAN is_sold
  }

  FOLLOWS {
    UUID id PK
    UUID follower_id FK
    UUID followee_id FK
  }

  LIKES {
    UUID id PK
    UUID user_id FK
    UUID post_id FK
  }

  COMMENTS {
    UUID id PK
    UUID user_id FK
    UUID post_id FK
    UUID parent_id FK
    TEXT body
  }

  COMMENT_LIKES {
    UUID id PK
    UUID user_id FK
    UUID comment_id FK
  }

  QUILTS {
    UUID id PK
    UUID user_id FK
    STRING name
    BOOLEAN is_public
    TEXT preview_image_url
  }

  PATCHES {
    UUID id PK
    UUID quilt_id FK
    UUID post_id FK
    UUID user_id FK
  }

  CONVERSATIONS {
    UUID id PK
    UUID linked_post_id FK
    TEXT deal_status
  }

  CONVERSATION_PARTICIPANTS {
    UUID id PK
    UUID conversation_id FK
    UUID user_id FK
    DATE left_at
  }

  MESSAGES {
    UUID id PK
    UUID conversation_id FK
    UUID sender_id FK
    TEXT body
  }

  NOTIFICATIONS {
    UUID id PK
    UUID user_id FK
    UUID actor_id FK
    UUID post_id FK
    UUID conversation_id FK
    ENUM type
    BOOLEAN read
  }

  RATINGS {
    UUID id PK
    UUID rater_id FK
    UUID ratee_id FK
    UUID conversation_id FK
    INTEGER score
    TEXT review
  }

  USERS ||--o{ POSTS : authors
  USERS ||--o{ FOLLOWS : follower
  USERS ||--o{ FOLLOWS : followee
  USERS ||--o{ LIKES : gives
  POSTS ||--o{ LIKES : receives

  USERS ||--o{ COMMENTS : writes
  POSTS ||--o{ COMMENTS : has
  COMMENTS o|--o{ COMMENTS : parent_of
  USERS ||--o{ COMMENT_LIKES : gives
  COMMENTS ||--o{ COMMENT_LIKES : receives

  USERS ||--o{ QUILTS : owns
  QUILTS ||--o{ PATCHES : contains
  POSTS ||--o{ PATCHES : reused_in
  USERS ||--o{ PATCHES : adds

  POSTS o|--o{ CONVERSATIONS : listing_context
  CONVERSATIONS ||--o{ CONVERSATION_PARTICIPANTS : has
  USERS ||--o{ CONVERSATION_PARTICIPANTS : joins
  CONVERSATIONS ||--o{ MESSAGES : contains
  USERS ||--o{ MESSAGES : sends

  USERS ||--o{ NOTIFICATIONS : receives
  USERS ||--o{ NOTIFICATIONS : triggers
  POSTS o|--o{ NOTIFICATIONS : references
  CONVERSATIONS o|--o{ NOTIFICATIONS : references

  USERS ||--o{ RATINGS : gives
  USERS ||--o{ RATINGS : receives
  CONVERSATIONS ||--o{ RATINGS : contextualizes
```

## Recommendation and Admin Extension

```mermaid
erDiagram
  USERS {
    UUID id PK
    STRING username
    ENUM role
  }

  USER_ACTIONS {
    UUID id PK
    UUID user_id FK
    STRING action_type
    STRING target_id
    STRING target_type
    JSONB metadata_json
    STRING source_surface
    DATE occurred_at
    UUID session_id
  }

  RECOMMENDATION_CONFIGS {
    UUID id PK
    BIGINT version
    TEXT scope
    JSONB config_json
    BOOLEAN is_active
    UUID created_by FK
    TEXT source
    UUID source_run_id
  }

  RECOMMENDATION_SIMULATION_RUNS {
    UUID id PK
    TEXT mode
    JSONB params_json
    JSONB result_summary_json
    JSONB candidate_config_json
    UUID created_by FK
    DATE created_at
  }

  USERS ||--o{ USER_ACTIONS : generates
  USERS o|--o{ RECOMMENDATION_CONFIGS : creates
  USERS o|--o{ RECOMMENDATION_SIMULATION_RUNS : launches
```

## Presentation Notes

- Use the **Core Application Schema** on a slide if you want to explain how Patchwork supports social posting, quilts, marketplace messaging, notifications, and ratings in one database.
- Use the **Recommendation and Admin Extension** only if you want to show technical depth around analytics and recommendation tuning.
- `user_actions.target_id` and `user_actions.target_type` are intentionally modeled as polymorphic event references, so they are not drawn as hard foreign keys to a single table.
- `recommendation_configs.source_run_id` is a logical reference to a simulation run, but it is not enforced as a database foreign key.
- Several tables contain more fields than shown here, especially `users` and `posts`. The diagram keeps only the most presentation-relevant attributes so it stays readable.
