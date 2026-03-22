# Price Tracker

A web application that helps you track prices of products from online stores. Add items by pasting URLs, uploading photos of price tags from physical stores, or uploading photos of products to identify them.

## Features

- **Track prices from any URL** - Paste a product URL and the app automatically extracts the price, name, and image
- **Photo of price tag** - Upload a photo from a physical store and the app extracts the product info using AI
- **Photo of product** - Upload a photo of any product to identify it and find it online
- **Daily price checks** - Automatically checks prices once a day (at 9 AM)
- **Price drop alerts** - Get notified when prices drop
- **Price history** - View price trends over time with charts

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Database**: SQLite
- **Web Scraping**: Puppeteer
- **AI/Vision**: OpenAI Vision API

## Setup Instructions

### Prerequisites

- Node.js 18 or higher
- An OpenAI API key (for image processing features)

### 1. Clone and Install

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment

Create a `.env` file in the `backend` folder:

```
OPENAI_API_KEY=your_openai_api_key_here
PORT=3001
```

To get an OpenAI API key:
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy it into your `.env` file

### 3. Start the Application

Open two terminal windows:

**Terminal 1 - Start the backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Start the frontend:**
```bash
cd frontend
npm run dev
```

### 4. Open the App

Visit http://localhost:5173 in your browser.

### Production (beepbeep.cheap + Render API)

If the **website** is on Vercel (or similar) and the **API** is on Render (`beepbeep-api.onrender.com`):

1. **`frontend/vercel.json`** — `/api/*` is proxied to Render so tools and bookmarks like `https://beepbeep.cheap/api/health` return JSON instead of the React app.
2. **`frontend/src/apiConfig.js`** — When the app runs on `beepbeep.cheap` or `www.beepbeep.cheap`, the UI talks **directly** to the Render API for `fetch` and **WebSockets** (avoids Vercel timeouts on slow searches and fixes live alerts).
3. **Render** — Set `FRONTEND_URL` to `https://beepbeep.cheap` in the dashboard (see `render.yaml`) so CORS allows the browser to call the API from your domain.

**Optional overrides (any host):** set `VITE_API_URL` (full base including `/api`), or `VITE_BACKEND_ORIGIN` + path `/api` is added in production builds.

After changing config, **redeploy the frontend on Vercel** and **restart/redeploy the API on Render** if you changed env vars.

### Per-device lists (privacy between phones)

Each browser generates a **random id** (UUID) stored in `localStorage` and sends it as **`X-User-Id`** on API calls. Items, alerts, rewards, and push subscriptions are scoped to that id — **another person’s phone won’t see your list**.

This is **not** full login security (the id is secret-ish but not a password). Clearing site data generates a **new** empty list.

**Old data before per-user support:** the server migration assigns legacy rows to a fixed id `10000000-0000-4000-8000-000000000001`. To attach one browser to that bucket (e.g. recover an old shared list), advanced users can set in devtools:  
`localStorage.setItem('beepbeep_user_id', '10000000-0000-4000-8000-000000000001')` then reload.

## How to Use

### Adding Items

1. **Via URL**: Click "Add Item" → "Paste URL" → Enter a product URL from any online store
2. **Via Price Tag Photo**: Click "Add Item" → "Price Tag Photo" → Upload a photo of a price tag
3. **Via Product Photo**: Click "Add Item" → "Product Photo" → Upload a photo of a product

### Tracking Prices

- The app automatically checks prices once a day at 9 AM
- Click "Check Prices" to manually refresh all items
- Click the refresh icon on any item to check just that item

### Viewing Alerts

- Click the bell icon to see price drop alerts
- Click on an alert to view the item details
- Alerts show the old price, new price, and savings

## Limitations

- **Web Scraping**: Some websites block automated access. The scraper works best with major retailers.
- **AI Costs**: Image processing uses OpenAI's API which costs approximately $0.01-0.03 per image.
- **Scheduler**: The daily price check only runs while the app is running. For 24/7 tracking, deploy to a server.

## Troubleshooting

### "Failed to scrape product"
- Some websites block scrapers or use complex JavaScript
- Try a different product URL or retailer

### "Invalid OpenAI API key"
- Check that your `.env` file has a valid API key
- Make sure the API key has sufficient credits

### Images not loading
- Ensure the backend is running on port 3001
- Check that the `backend/uploads` folder exists










