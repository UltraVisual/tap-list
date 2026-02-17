# Tap List

A configurable tap list application to display your beer selection on a screen in your tap room, home bar, or brewery.

## Features

- **Display Screen** — Grid layout showing each beer's tap number, label artwork, name, style, description, and ABV
- **Brewery Logo** — Prominent logo/name display at the top of the screen
- **Admin Panel** — Add, edit, and remove beers with image uploads
- **Draft Mode** — Prepare beers in draft so switchovers are instant when a keg blows
- **Pint Tracker** — Each beer shows remaining pints (defaults to 38 per keg)
- **Pour Screen** — Mobile-friendly view for recording pours (pint, half, third) to keep counts accurate
- **Auto-refresh** — Display screen refreshes every 30 seconds to stay in sync

## Quick Start

```bash
npm install
npm start
```

The app runs on `http://localhost:3000` by default (set `PORT` env var to change).

## Routes

| URL | Purpose |
|---|---|
| `/` | Public tap list display (put this on your screen) |
| `/admin` | Admin panel — manage beers, drafts, and settings |
| `/admin/settings` | Set tap room name and upload logo |
| `/pour` | Mobile pour tracker — tap to record pours |
| `/api/beers` | JSON API for active beers |

## How It Works

1. Go to `/admin/settings` to set your tap room name and upload a logo
2. Go to `/admin` and click **+ Add Beer** to add beers to your taps
3. Upload label artwork, set ABV, style, description, and tap number
4. Check **Save as draft** if you want to prepare a beer without showing it yet
5. Point a screen at `/` to display your tap list
6. Use `/pour` on your phone to track pours and monitor keg levels

## Tech Stack

- **Node.js + Express** — web server
- **SQLite** (via better-sqlite3) — zero-config database, stored in `data/`
- **EJS** — server-side templates
- **Multer** — image upload handling

No build step required. No external database to configure.
