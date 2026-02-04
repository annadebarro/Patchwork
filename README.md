# Patchwork
CS 422 Group Project

## Project Description

Patchwork is a social media site for selling/buying clothing, developing a brand, and building relationships with others. With this, our platform implements a quilt theme to create a more curated and fashionable look to posts and profiles. 

From a business perspective, Patchwork helps you easily establish a brand around your style and obtain user feedback through direct messaging and reviews.

From the social side, Patchwork creates an all-in-one platform to share your interests, create inspiration boards, and pass of those hand-me-downs that have been aching to get out of your closet to either friends or others with similar styles.


## Team Roles

- Team Leader: Jack
- Team Communicator: Inna
- Project Master: Emily
- Project Delivery: Anna


## General UI/UX 

- Create an account using personal information (email, name, username, password). 
- Post and edit content that symbolize patches on a quilt or a backpack, with the grid/profile view of your posts literally looking like a collection of patches on a quilt sewn together through front-end design
- View different feeds with two separate categories – one for non-sale/stylistic posts, the other for the marketplace – to better organize content and user personalization
- Follow other users to keep track of their content/listings and curate the user’s feeds accordingly
- Build inspiration boards or “quilts” using a mix of their own and other’s posts
- Direct message and create group chats to aid in the consumer/seller relationships 
- Use two way rating system so buyers can rate sellers and sellers can rate buyers


## Backend Breakdown

- Our Backend will be made up of:
    - Node.js/Express Server to host the site
    - MongoDB to store information and posts

- What does the Node.js/Express Server consist of?
    - Authentication Service
        - Hashing of password using bcrypt (minimum 10 salt rounds)
        - Generation and validation of JWT tokens for session management
    - User Management Service
        - Handles profile CRUD operations
        - Management of follow/unfollow logic and relationship data
    - Content Management Service
        - Post creation, editing, and deletion
    - Board Management Service
        - Board creation and organization (post assignment)
    - Feed Algorithm Service
        - Content filtering (all/inspiration/listings)
    - Search Service
    - Collection Storage (Users, Posts, Boards, Sessions, Images)

## Getting Started

- Requirements: Node.js 18+, npm, and a running Postgres instance.
- Copy environment files and install dependencies:
  - `cp server/.env.example server/.env` and update `DATABASE_URL` if needed
  - `npm install --prefix server`
  - `npm install --prefix client`
- Optional: set `client/.env` from `client/.env.example` when pointing the UI to a non-local API.
- Run the stack locally:
  - API: `npm run dev --prefix server` (listens on port 5000)
  - Frontend: `npm run dev --prefix client` (listens on port 5173 with an API proxy to \`/api\`)
- Health check is at `/api/health`; the frontend displays API/DB status on load.

## Project Structure

- `server/` — Express API with Postgres (Sequelize) connection (entry: `src/server.js`)
- `client/` — Vite + React frontend scaffolded for Patchwork
