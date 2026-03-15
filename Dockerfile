FROM node:20-slim

# Install Chromium, build tools (for better-sqlite3), and fonts
RUN apt-get update && apt-get install -y \
    chromium \
    build-essential \
    python3 \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-khmeros \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Verify Chromium installed and log its location
RUN which chromium || which chromium-browser || echo "WARNING: chromium not in PATH" \
    && (chromium --version || chromium-browser --version || true)

# Tell Puppeteer to skip downloading its bundled Chromium (we use the system one)
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Set Chrome path — the scraper also auto-detects, but this is the explicit hint
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files first (better Docker caching)
COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Install all dependencies
RUN cd backend && npm install && cd ../frontend && npm install --include=dev

# Copy the rest of the source code
COPY . .

# Build frontend
RUN cd frontend && npm run build

# Create data and uploads directories (for SQLite DB and uploaded images)
RUN mkdir -p backend/data backend/uploads

EXPOSE 3001

CMD ["node", "backend/src/index.js"]
