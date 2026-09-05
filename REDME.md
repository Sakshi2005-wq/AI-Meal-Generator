# MealAI

An AI-assisted meal planning app — generate meal plans, save favorites,
track eaten meals and nutrition, manage a grocery list, browse full
recipes with step-by-step instructions, and chat with a simple meal
assistant. Includes an admin panel for managing users and adding
meals/recipes.

## Project structure

```
mealai/
├── backend/
│   ├── server.js          Express + MongoDB API (also serves the frontend)
│   ├── package.json
│   ├── .env.example        Copy to .env and fill in your own values
│   └── .env                 (you create this locally - never committed)
├── index.html               Frontend entry point
├── style.css
├── script.js
├── admin.html                Admin panel
├── admin.css
├── admin.js
├── config.js                 Sets the API URL the frontend talks to
├── assets/
│   └── default_image.jpg
├── render.yaml                One-click Render deploy config for the backend
├── vercel.json                 Config for deploying just the frontend to Vercel
├── .gitignore
└── README.md
```

The backend serves the frontend directly — `backend/server.js` uses
`express.static()` on the parent folder, so in production you can run
this as a **single service** with one URL (Option A below). You can
also split it into two services — API on Render, static frontend on
Vercel (Option B) — if you'd rather host the frontend on Vercel's CDN.

## 1. Local setup

### Requirements
- Node.js 18+
- A MongoDB Atlas account (free tier is enough) — see step 2 below

### Install and run

```bash
cd backend
npm install
cp .env.example .env
```

Open `backend/.env` and fill in your own values — your MongoDB Atlas
connection string, and admin credentials (see step 2 and step 4
below). Then start the server:

```bash
npm start
```

Visit **http://localhost:5000** — the frontend and API are both
served from this one address. The admin panel is at
**http://localhost:5000/admin.html**.

For auto-restart on file changes during development:

```bash
npm run dev
```

## 2. MongoDB Atlas setup

1. Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
   and create a free account (or sign in).
2. Create a new **free (M0) cluster** — any provider/region is fine.
3. Under **Database Access**, add a new database user with a username
   and password (save these — you'll need them in the connection
   string). Give it "Read and write to any database."
4. Under **Network Access**, add an IP address. For quick setup you
   can allow access from anywhere (`0.0.0.0/0`) — fine for a small
   personal project; for production, restrict this to your hosting
   provider's IP ranges if possible.
5. Go to **Database → Connect → Drivers**, copy the connection
   string. It looks like:
   ```
   mongodb+srv://<username>:<password>@<cluster-url>/?retryWrites=true&w=majority
   ```
6. Replace `<username>` and `<password>` with the database user you
   created, and add a database name before the `?`, e.g.:
   ```
   mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/mealai?retryWrites=true&w=majority
   ```
7. Paste this full string as `MONGO_URI` in `backend/.env`.

The database and its collections are created automatically the first
time the app writes data (e.g. when someone registers) — you don't
need to create anything manually in Atlas beyond the cluster itself.

> ⚠️ **If you've ever shared a real connection string** (in a chat, a
> screenshot, a public repo, etc.), treat it as compromised: go to
> Database Access in Atlas and reset that user's password immediately.

## 3. Admin credentials

The admin panel (`/admin.html`) is protected by three environment
variables on the backend, set in `backend/.env`:

```
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=pick-a-strong-password
ADMIN_TOKEN_SECRET=a-long-random-string
```

Generate a good `ADMIN_TOKEN_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set a fixed `ADMIN_TOKEN_SECRET` in production — if it's left unset,
the server generates a new random one on every restart, which logs
every admin out each time the server redeploys or restarts.

From the admin panel you can:
- View stats and manage registered users (suspend/activate, delete)
- **Add meals** — these are immediately included in every user's
  AI-generated meal plans
- **Add recipes** — these are immediately included in the public
  recipe catalog everyone can browse

## 4. Push to GitHub

```bash
cd mealai
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

`.gitignore` already excludes `node_modules/` and both `.env` files,
so your MongoDB credentials and admin secrets will never be committed.

## 5. Deploy

### Option A — Single service on Render (simplest)

The backend also serves the frontend, so one Render web service is
enough.

1. Go to [render.com](https://render.com) and create a new **Web
   Service**, connecting your GitHub repo. If you commit the included
   `render.yaml`, Render will pick up these settings automatically via
   "New > Blueprint" instead of manual setup.
2. If setting up manually, set:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. Under **Environment**, add:
   - `MONGO_URI` = your full Atlas connection string from step 2
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_TOKEN_SECRET` (step 3)
   - `FRONTEND_URL` = your Render service's own URL, e.g.
     `https://mealai.onrender.com` (or leave unset — same-origin
     requests are always allowed)
   - You don't need to set `PORT` — Render provides it automatically.
4. Deploy. Render will give you a public URL (e.g.
   `https://mealai.onrender.com`) that serves both the API and the
   frontend, including `/admin.html`.

### Option B — Backend on Render, frontend on Vercel (split)

Use this if you want the frontend on Vercel's CDN instead.

**Backend (Render):**
1. Same as Option A steps 1–3, except set `FRONTEND_URL` to your
   Vercel URL instead, e.g. `https://mealai.vercel.app` (comma-separate
   multiple origins if you have a preview URL too).
2. Note your Render backend's URL once deployed, e.g.
   `https://mealai-api.onrender.com`.

**Frontend (Vercel):**
1. In `config.js`, change:
   ```js
   window.MEALAI_API_URL = "https://mealai-api.onrender.com/api";
   ```
   (using your actual Render URL), then commit and push.
2. Go to [vercel.com](https://vercel.com), **Add New > Project**,
   import the same GitHub repo.
3. Vercel will detect it as a static site via `vercel.json` — no
   framework preset or build command is needed. `backend/` is excluded
   from this deployment via `.vercelignore`.
4. Deploy. The frontend will be served from Vercel, and every API
   call goes to your Render backend. The admin panel is at
   `https://<your-vercel-app>.vercel.app/admin`.

After deploying, if you update `MONGO_URI`'s IP allowlist in Atlas
(step 2, item 4), make sure it also allows Render's outbound IPs, or
use `0.0.0.0/0` for simplicity.

## Features

- Register/login (simple email + hashed password, no third-party auth)
- AI-style meal plan generator — filtered by diet, allergies, health
  condition, cooking time, and goal
- **Recipes** — browse the full recipe catalog and view step-by-step
  cooking instructions and ingredients for any meal
- Favorites — save and remove meals
- Eaten-meal tracking per day, with a streak counter
- Nutrition tracking against daily goals
- Calendar view of meals by date
- Grocery list, auto-filled from generated meal ingredients
- Basic AI assistant chat that responds based on your message content
  and profile (diet, goal, calorie target, allergies)
- **Admin panel** — manage users, and add meals/recipes that flow
  straight into the generator and recipe catalog for all users

## API overview

| Method | Route                                | Purpose                        |
|--------|---------------------------------------|---------------------------------|
| POST   | `/api/register`                       | Create an account               |
| POST   | `/api/login`                          | Log in                          |
| GET/PUT| `/api/users/:id`                      | Get / update profile            |
| GET/POST/DELETE | `/api/favorites/:id[...]`    | Manage favorites                |
| GET/PUT| `/api/groceries/:id`                  | Get / save grocery list         |
| GET/POST/DELETE | `/api/meals/eaten/:id[...]`  | Track eaten meals               |
| POST   | `/api/meals/generate`                 | Generate a meal plan            |
| GET    | `/api/recipes`                        | List all recipes (summary)      |
| GET    | `/api/recipes/:id`                    | Full recipe with instructions   |
| POST   | `/api/chat`                           | AI assistant reply              |
| GET    | `/api/health`                         | Server/DB health check          |
| POST   | `/api/admin/login`                    | Admin login                     |
| GET    | `/api/admin/stats`                    | Dashboard stats                 |
| GET/PATCH/DELETE | `/api/admin/users[...]`     | Manage users                    |
| GET/POST/DELETE | `/api/admin/meals[/:id]`     | Add/remove admin meals          |
| GET/POST/DELETE | `/api/admin/recipes[/:id]`   | Add/remove admin recipes        |
