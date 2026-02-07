## Continuous Learning & Memory
AI Agents should update this file whenever a significant project lesson is learned (e.g., a tricky bug fix, a successful refactoring pattern, or a clarified requirement). This ensures subsequent sessions benefit from previous insights.

## Architecture & Play Modes
- **Single-player (Local)**: Standalone play without a server.
    - **Static Build**: `npm run build:static` (sets `VITE_STATIC_BUILD=true`) generates assets for standalone single-player functionality **only**.
- **Multi-player (Online)**: Uses a hybrid **Client-Authoritative** model.
    - **Paddles**: Client input is authoritative for local movement to ensure responsiveness. Server validates positions.
    - **Ball**: Client predicts ball movement between server updates. Server state is reconciled smoothly unless deviation is significant.
    - **Goals**: Server tracks "pending goals" with a grace period, allowing clients to claim bounces that the server might have missed due to latency.
- **Core Split**:
    - `Physics.js`: Shared shared logic.
    - `ServerGame.js`: Server-side game loop, state management, and authority on game rules.
    - `Game.js`: Client-side rendering, input handling, prediction, and reconciliation.

## Testing Protocols
1. **Run All Checks**: Execute `npm run lint && npm run test` before and after changes.
    - `npm run lint`: Checks for coding style and syntax errors.
    - `npm run test`: Runs both **Unit Tests** (server/physics) and **Browser Tests** (Playwright).
2. **Maintenance**: Always add or update tests when modifying functionality.
3. **Refined Testing**:
    - **Partial Units**: Run `node test/<filename>.js` for targeted server tests.
    - **UI Only**: Run `npm run test:browser` for Playwright only.
    - **Simulating Latency**: Set `SIMULATED_LATENCY_MS=<ms>` (e.g. 100) when running the server or tests to simulate network delay. This aids in reproducing production lag.
    - **Client Authority**: Run `node test/client_authority_test.js` to verify goal grace periods and bounce claim logic.

## Running the Test Server
To run a test server that provides both static files and the API/WebSocket services:
1. Build the client: `npm run build`
2. Start the server (with optional latency): `SIMULATED_LATENCY_MS=100 npm run server`
   - Or combine them: `npm run build && npm run server`

The server runs on port **12122** by default. This environment provides:
- Static file serving (from the `dist/` directory)
- API endpoints
- WebSocket server for multiplayer functionality

## Known Issues & Traps
- **Physics**: Shared logic lives in `BaseGame.js` (or similar). Do not fork physics unless strictly necessary for prediction.
- **Latency**: We use explicit client-side prediction. When debugging "lag", check if `Game.js` `loop` is running physics updates correctly in online mode.
