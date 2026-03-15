const fs = require('fs');

const candidates = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
];

let executablePath;
for (const p of candidates) {
  if (fs.existsSync(p)) {
    executablePath = p;
    break;
  }
}

/** @type {import("puppeteer").Configuration} */
module.exports = {
  ...(executablePath ? { executablePath } : {}),
  cacheDirectory: process.env.PUPPETEER_CACHE_DIR || undefined,
};
