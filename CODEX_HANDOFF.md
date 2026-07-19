# BeepBeep.Cheap — continuation note

This project was prepared for TestFlight from the existing Vite/React app.

## Completed in the workspace

- A Capacitor iOS project exists in `frontend/ios`.
- `frontend/package.json` includes `npm run ios:sync` and `npm run ios:open`.
- Browser notifications now require an explicit **Enable alerts** tap, which is
  required for iPhone Safari.
- Native iOS APNs registration and backend token storage/delivery were added.
- Native Capacitor traffic is routed to the production API and allowed by CORS.
- Render configuration persists the VAPID key at `/var/beepbeep-data/vapid-keys.json`.
- `TESTFLIGHT.md` is the full Apple setup and release checklist.

## Still needed

1. Upgrade macOS and install full Xcode.
2. In Apple Developer, register `cheap.beepbeep.app` and enable Push Notifications.
3. Add the APNs key values listed in `TESTFLIGHT.md` to the production backend host.
4. Deploy the backend changes, then run `cd frontend && npm run ios:sync`.
5. In Xcode, select an Apple Developer signing team, enable Push Notifications,
   archive the app, and upload it to TestFlight.

## Hosting recommendation

Keep Vercel for the frontend. Keep the API on a persistent worker host because
it needs SQLite persistence, Puppeteer scraping, a scheduler, and WebSockets.
Render Starter with its disk is the least-setup choice; a small VPS is generally
the lower-cost, more hands-on option.
