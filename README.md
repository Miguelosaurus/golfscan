# GolfScan-AI - Dev Runbook

## Prerequisites
- Node 18+
- iOS Simulator or Expo Go on a device
- Yarn or npm

## Environment
Create `.env` in the repo root:

```
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3001   # Simulator
# For device via tunnel, replace with your tunnel URL (https://*.loca.lt)
EXPO_PUBLIC_GOLF_COURSE_API_KEY=YOUR_KEY
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
```

## Start the backend (Hono + tRPC)
```
npm run backend
```
- Default: http://localhost:3001/api
- For device testing, server binds to 0.0.0.0

## Start the app (Expo)
```
npm start
# or
expo start --lan
```
- Press `i` for iOS Simulator
- For Expo Go on a device, ensure `EXPO_PUBLIC_API_BASE_URL` points to a reachable URL (see Tunnel).

## Tunnel for device testing (no LAN hassles)
Start a tunnel on port 3001 and use the printed URL in `.env` as `EXPO_PUBLIC_API_BASE_URL`.

Option A: LocalTunnel (no account)
```
npx localtunnel --port 3001 --print-requests
# Example URL: https://your-subdomain.loca.lt
# If the browser shows a password page, add this header in client requests:
#   Bypass-Tunnel-Reminder: true
```

Option B: Cloudflared (stable, free)
```
brew install cloudflare/cloudflare/cloudflared  # macOS
cloudflared tunnel --url http://localhost:3001
# Copy the https URL it prints and set EXPO_PUBLIC_API_BASE_URL
```

## Scan flow (high level)
- App uploads images to `/api/upload`
- Backend uploads to Gemini Files API and runs the model
- Use job endpoints to poll long scans without timeouts

## Useful scripts
```
# Clean Metro cache
expo start -c

# Doctor
npx expo-doctor
```
