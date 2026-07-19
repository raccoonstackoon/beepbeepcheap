# TestFlight release checklist

The project is now packaged as a Capacitor iPhone app at `frontend/ios` with
native APNs support. The bundle identifier is `cheap.beepbeep.app`.

## One-time Apple setup

1. Enrol in the Apple Developer Program and create an App ID for
   `cheap.beepbeep.app` with **Push Notifications** enabled.
2. In Apple Developer, create an **Apple Push Notification service (APNs)** key.
   Keep the downloaded `.p8` file private.
3. In the API host's environment variables, set:

   ```text
   APNS_KEY_BASE64=<base64 of the .p8 file>
   APNS_KEY_ID=<APNs key ID>
   APNS_TEAM_ID=<Apple Developer team ID>
   APNS_BUNDLE_ID=cheap.beepbeep.app
   APNS_PRODUCTION=true
   ```

   On macOS, produce the value for `APNS_KEY_BASE64` with:

   ```bash
   base64 -i AuthKey_XXXXXXXXXX.p8 | tr -d '\n'
   ```

## Build and upload

1. Install the full Xcode app (not only Command Line Tools), then run:

   ```bash
   cd frontend
   npm run ios:sync
   npm run ios:open
   ```
2. In Xcode, select the **App** target → **Signing & Capabilities**:
   - choose your Apple Developer team;
   - enable **Push Notifications**;
   - set the version and build number;
   - check the bundle ID is `cheap.beepbeep.app`.
3. Select **Any iOS Device (arm64)**, use **Product → Archive**, then
   **Distribute App → App Store Connect → Upload**.
4. In App Store Connect, add the build to TestFlight and install it on an iPhone.
   Open beepbeep.cheap in the app, tap **Enable alerts**, and accept the prompt.

## Deployment architecture

Keep Vercel for the React frontend. Do not move this backend wholesale to Vercel:
it uses a persistent SQLite file, a long-running daily scheduler, Chromium/Puppeteer
scraping, and WebSockets. Use a persistent worker host for the API (Render Starter,
Railway with a volume, Fly.io, or a small VPS) and keep its `DATABASE_PATH`,
`UPLOADS_PATH`, and `VAPID_PATH` on persistent storage.

The new `VAPID_PATH` entry in both Render blueprints is important: changing VAPID
keys invalidates existing browser notification subscriptions.
