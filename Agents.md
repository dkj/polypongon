## Continuous Learning & Memory
AI Agents should update this file whenever a significant project lesson is learned (e.g., a tricky bug fix, a successful refactoring pattern, or a clarified requirement). This ensures subsequent sessions benefit from previous insights.

## Architecture & Play Modes
- **Single-player (Local)**: Standalone play without a server.
    - **Static Build**: `npm run build:static` (sets `VITE_STATIC_BUILD=true`) generates assets for standalone single-player functionality **only**.
- **Multi-player (Online)**: Uses a "Snap to Server Truth" model. The server is authoritative; clients apply received state directly without prediction or interpolation.
- **Core Split**:
    - `Physics.js`: Shared shared logic.
    - `ServerGame.js`: Server-side game loop and state management.
    - `Game.js`: Client-side rendering, input handling, and server state application.

## Testing Protocols
1. **Run All Checks**: Execute `npm run lint && npm run test` before and after changes.
    - `npm run lint`: Checks for coding style and syntax errors.
    - `npm run test`: Runs both **Unit Tests** (server/physics) and **Browser Tests** (Playwright).
2. **Maintenance**: Always add or update tests when modifying functionality.
3. **Refined Testing**:
    - **Partial Units**: Run `node test/<filename>.js` for targeted server tests.
    - **UI Only**: Run `npm run test:browser` for Playwright only.
    - **Simulating Latency**: Set `SIMULATED_LATENCY_MS=<ms>` (e.g. 100) when running the server to simulate network delay on both inputs and game state updates. This aids in reproducing production lag.

## Running the Test Server
To run a test server that provides both static files and the API/WebSocket services:
1. Build the client: `npm run build`
2. Start the server: `npm run server`
   - Or combine them: `npm run build && npm run server`

The server runs on port **12122** by default. This environment provides:
- Static file serving (from the `dist/` directory)
- API endpoints
- WebSocket server for multiplayer functionality

## Known Issues & Traps
- **Physics**: Do **not** modify physics logic in `Game.js`; use `Physics.js`.
- **Latency**: The current simplified sync model is a deliberate choice. Do not re-introduce complex prediction/interpolation unless explicitly asked.
