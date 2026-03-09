# Patchwork Presentation Outline

This outline is built for the CS 422 presentation rubric in [7 Presentations.pdf](/Users/jacklund/Downloads/7 Presentations.pdf).

Presentation timing:

- Slides: 5 minutes
- Demo: 5 minutes
- Q&A: 5 minutes

Use 6 slides total. Keep each slide to one main visual and 2-3 short bullets.

## Slide 1: Title + Pitch

Time: 15-20 seconds

Suggested title:

`Patchwork: A Quilt-Themed Social Marketplace for Fashion`

On-slide bullets:

- Share style, sell clothing, and connect in one place
- Social feed + marketplace + direct messaging
- Today: 5 min slides, 5 min demo, 5 min Q&A

Visual:

- App logo, title, and one clean screenshot of the home feed or marketplace

Speaker notes:

Patchwork is a social platform for fashion-focused users who want to post outfits, sell clothing, build a personal brand, and connect with others. The central idea is combining inspiration, resale, and communication in one app instead of making users jump between different platforms.

## Slide 2: Problem + User Perspective

Time: 40-45 seconds

Suggested title:

`The User Problem We Solved`

On-slide bullets:

- Fashion inspiration, resale, and messaging are usually split across multiple apps
- Users need one workflow for browsing, posting, selling, and coordinating
- Patchwork turns that workflow into a quilt-themed social experience

Visual:

- Simple 5-step user journey:
  `Sign up -> Browse feed/marketplace -> Create post or listing -> Message another user -> Save ideas into quilts`

Speaker notes:

We framed the project around a real user journey. A user creates an account, browses social and marketplace content, creates a post or listing, messages another user to coordinate, and saves inspiration into quilts. That end-to-end flow is the core reason the app exists, and it is also what the demo should prove.

## Slide 3: What We Built

Time: 45-50 seconds

Suggested title:

`What Patchwork Includes`

On-slide bullets:

- Core flows: authentication, onboarding, profile, and post creation
- Social features: follows, quilts, comments, notifications, search
- Marketplace features: listings, post detail, messaging, recommendation/admin work

Visual:

- 2-column feature map or 4-panel screenshot collage:
  `Home`, `Marketplace`, `Messages`, `Profile/Search`

Speaker notes:

The current app supports the main user-facing flows already present in the codebase: auth and onboarding, a home feed, marketplace pages, post detail pages, messages, profile pages, settings, search, and an admin recommendations view. The project also evolved into a focused MVP that combines social sharing with marketplace coordination instead of trying to solve every commerce feature at once.

## Slide 4: How the System Works

Time: 50-55 seconds

Suggested title:

`System Design`

On-slide bullets:

- Frontend: React + Vite
- Backend: Node.js + Express + Socket.IO
- Data/storage: Postgres via Sequelize, Supabase for images, JWT auth

Visual:

- Simplified version of the architecture diagram from [architecture-diagram-one-page.md](/Users/jacklund/Documents/CS/CS422/Patchwork/documents/architecture-diagram-one-page.md)
- Keep only these boxes:
  `Client -> API -> Database`
  plus side labels for `Socket.IO`, `JWT`, and `Supabase Storage`
- If you want a second technical visual, use the core ERD from [database-diagram.md](/Users/jacklund/Documents/CS/CS422/Patchwork/documents/database-diagram.md) as a separate zoomed-in database slide

Speaker notes:

The architecture supports both the social and marketplace sides of the app. The React frontend handles the user interface and routing. The Express backend exposes domain routes for auth, posts, comments, follows, quilts, messages, search, recommendations, uploads, and health checks. Postgres stores the core application data, Supabase stores uploaded images, JWT secures protected endpoints, and Socket.IO supports live messaging.

## Slide 5: How We Designed and Validated It

Time: 60-70 seconds

Suggested title:

`How We Built It`

On-slide bullets:

- Requirements: started from a real user workflow, existing platforms, and team research
- Design: split the system into clear services for auth, posts, messaging, search, and recommendations
- Testing: 12 server test files, 60 passing tests on March 9, 2026, plus manual workflow checks

Visual:

- 3-box layout:
  `Requirements -> Design -> Testing`

Speaker notes:

For requirements analysis, mention the strongest real source your team used, such as competitor analysis, class deliverables, interviews, or observed user needs. For software design, explain that user requirements became concrete backend services and frontend routes instead of staying as vague feature ideas. For testing, the strongest repo-backed evidence is the current server suite: 12 test files and 60 passing tests, verified locally on March 9, 2026. You can pair that with manual checks for posting, uploads, search, and messaging.

Callout to customize before presenting:

- Replace "team research" with your strongest real requirement source
- If you interviewed users or studied specific competitor apps, name them here

## Slide 6: Team Process + Demo Handoff

Time: 40-45 seconds

Suggested title:

`Team Lessons and Demo Plan`

On-slide bullets:

- Team structure: leadership, communication, project management, and delivery roles
- Lessons: divide ownership clearly, integrate early, and test shared flows often
- Demo next: feed -> listing/post -> message -> technical/admin screen

Visual:

- Left side: team lessons
- Right side: demo path

Speaker notes:

Keep the teamwork section short because the repo does not fully capture team retrospectives. A safe structure is to mention role division, one challenge in coordination or integration, and three concise lessons learned:

- Clear ownership reduces duplicated work
- Early integration catches interface problems sooner
- Regular testing prevents last-minute merge surprises

End by telling the audience exactly what the demo will show: a real user workflow from browsing content to interacting with another user, followed by one technical screen if time allows.

## Demo Flow

Start the demo on the home feed so it matches slide 2.

Recommended order:

1. Show the home feed and explain the quilt/social-marketplace concept
2. Open a post or listing and show the user-facing detail view
3. Show how a user coordinates through messaging
4. Briefly show search or the admin recommendations page as the technical add-on

Demo line to say out loud:

`This demo shows that Patchwork works as one connected user workflow, not just as isolated features.`

## Presenter Reminders

- Use at least 18-point text
- Keep diagrams readable and simplified
- Do not overload slides with paragraphs
- Rehearse the slide-to-demo handoff so the first click of the demo is immediate
- If the instructor asks about requirements interviews or team retrospectives, answer using your real group experience rather than inventing details from the repo

## Repo-Backed Facts Used Here

- Project description and feature scope: [README.md](/Users/jacklund/Documents/CS/CS422/Patchwork/README.md)
- Architecture summary: [architecture-diagram-one-page.md](/Users/jacklund/Documents/CS/CS422/Patchwork/documents/architecture-diagram-one-page.md)
- Software design summary: [SDS-Update-After-2.1.md](/Users/jacklund/Documents/CS/CS422/Patchwork/documents/SDS-Update-After-2.1.md)
- Frontend routes confirming current screens: [App.jsx](/Users/jacklund/Documents/CS/CS422/Patchwork/client/src/App.jsx)
- Testing evidence verified locally on March 9, 2026: `npm test --prefix server` returned 60 passing tests across 12 server test files
