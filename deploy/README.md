# Nexus VPS service

Run one Nexus Node process for one SQLite database. This process owns the API, permissions, Socket.IO signaling, sessions, stored messages and file storage. The website uses the service through HTTPS. Never expose a raw database port to clients.

## Start

Use Node.js 26.x (tested with 26.12.1) or Node.js 24.15+ in the Node 24 release line. Extract the complete project and preserve `.env` and `data/` during upgrades. On Linux run `bash start.sh`; on Windows run `start.bat`. These launchers verify the release, install missing/mismatched dependencies, open the configured persistent database and start the server in the foreground. They do not erase or reset existing records.

Use `.env.example` to prepare your own `.env`. For a normal HTTPS reverse proxy, set `PUBLIC_ORIGIN` to the exact public HTTPS origin, `TRUST_PROXY=true`, `SECURE_COOKIES=true`, and keep `HOST=127.0.0.1`. Configure TURN for real-network calls as described in the main README. Keep credentials and creator claim values only on the VPS.

`DATABASE_PATH` defaults to `data/nexus.sqlite`; `UPLOAD_PATH` defaults to `data/uploads`. Both must survive process restarts and upgrades. Back up the database and uploads together. Stop Nexus before a filesystem backup so SQLite has closed its journal/WAL correctly, or use a proper online SQLite backup tool. Do not copy only a live `.sqlite` file and assume pending WAL data was included.

## Keep it running on Linux

The supplied `nexus.service` is an **example**, installed manually by the server administrator. Create a dedicated `nexus` service account, place the project at `/opt/nexus`, install production dependencies there, and give that account access to `data/`. Confirm the Node executable path before copying the unit to systemd. Adjust `WorkingDirectory`, `ExecStart`, and `ReadWritePaths` together if your paths differ. Then enable/start the unit using your normal server administration workflow. Logs go to journald; the foreground scripts write to the console.

`Caddyfile.example` shows a minimal TLS reverse proxy. Replace its example hostname with your real domain and point its DNS at the VPS. Caddy proxies HTTP and WebSocket traffic to the same Node port. Keep SQLite and file storage on persistent local disks. Proxy/load-balancer upload size and timeout settings must permit your intended file size.

Do not run multiple independent workers against this app and expect voice presence or signaling to synchronize: those realtime maps currently live in one process. A shared realtime adapter and deliberate storage design are needed before horizontal scaling.

## Readiness

- `/api/health` identifies the running website version and exact UI build.
- `/api/ready` reads actual application tables and returns a UI build identifier and protocol version. A database read failure returns 503 and logs an error without exposing a database path or records. This route has its own request rate limit.
- Neither endpoint performs a full database integrity scan or certifies external media connectivity.

The website uses its reconnect notice during outages. Stop Nexus, copy the complete ZIP application contents over the existing installation while retaining `.env` and persistent storage, then restart its service. No separate update launcher is required.
