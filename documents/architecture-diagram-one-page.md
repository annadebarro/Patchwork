# Patchwork One-Page Architecture Diagram

```mermaid
flowchart LR
  subgraph Client["Client Layer (React + Vite)"]
    Browser["Web Browser"]
    Router["React Router\n/auth, /home, /search, /post/:id,\n/messages, /profile, /settings"]
    Features["UI Features\nFeed, Search, Post Detail,\nQuilts, Messaging, Notifications,\nOnboarding, Settings"]
    Browser --> Router --> Features
  end

  subgraph Edge["Edge / Dev Gateway"]
    Vite["Vite Dev Server (:5173)"]
    Proxy["/api Proxy -> Backend (:5050 local)"]
    Vite --> Proxy
  end

  subgraph API["Backend Service (Node.js + Express + Socket.IO)"]
    App["Express App\nCORS, JSON parser, error handler,\nroute registry"]
    Auth["JWT Auth Middleware\nBearer token (HTTP)\nOptional auth for public views"]
    Routes["Domain Routes\n/auth, /users, /posts, /comments,\n/likes, /follows, /quilts, /messages,\n/notifications, /search, /recommendations,\n/uploads, /health"]
    Socket["Socket.IO Server\nJWT handshake auth\nuserId room join"]
    Actions["Action Logger\nStructured events in user_actions\n(post_like, comment_create, follow, etc.)"]
    App --> Auth --> Routes
    App --> Socket
    Routes --> Actions
  end

  subgraph Data["Data Layer (Sequelize + Postgres)"]
    ORM["Sequelize Models + Associations\nUser, Post, Follow, Comment, Like,\nCommentLike, Quilt, Patch,\nConversation, Message, Notification,\nUserAction"]
    PG["Postgres Database\nCore social + marketplace tables"]
    Migrate["Migrations + Guard\nsequelize-cli migrations\nstartup blocks on pending migrations"]
    ORM --> PG
    Migrate --> PG
  end

  subgraph External["External Storage"]
    Supabase["Supabase Storage\nImage uploads (posts, avatars)\nreturns public URL"]
  end

  Browser -->|HTTPS| Vite
  Proxy -->|REST /api| App
  Browser -->|Socket.IO + JWT| Socket
  Routes --> ORM
  Routes -->|Upload image| Supabase
  Supabase -->|publicUrl| Routes
  Routes -->|JSON responses| Browser
  Socket -->|new_message,\nconversation_updated| Browser
```

## Notes

- Recommendations are currently a chronological fallback feed (not personalized yet).
- Notification UI polls periodically via REST; chat updates are real-time via Socket.IO.
- Uploads are optional at runtime: if Supabase env vars are missing, `/api/uploads` is disabled.
