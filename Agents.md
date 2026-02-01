# AI Agent Rules

## Testing Protocols
1. **Always Check Tests**: Before and after making changes, run existing tests to ensure no regressions.
2. **Update Tests**: When adding new functionality or modifying existing behavior, create or update tests to verify the changes.
3. **Verify Success**: Ensure all tests (new and existing) pass before completing a task.
4. **Test Location**:
   - Server/Physics logic tests: `test/` directory (e.g., `test/gameplay_test.js`).
   - Run with `node test/<filename>.js`.

## Running the Test Server
To run a test server that provides both static files and the API/WebSocket services:
1. Build the client: `npm run build`
2. Start the server: `npm run server`
   - Or combine them: `npm run build && npm run server`

The server runs on port **12122** by default. This environment provides:
- Static file serving (from the `dist/` directory)
- API endpoints
- WebSocket server for multiplayer functionality

This is the recommended way to test multiplayer features locally with a production-like build.
