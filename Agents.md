# AI Agent Rules

## Testing Protocols
1. **Always Check Tests**: Before and after making changes, run existing tests to ensure no regressions.
2. **Update Tests**: When adding new functionality or modifying existing behavior, create or update tests to verify the changes.
3. **Verify Success**: Ensure all tests (new and existing) pass before completing a task.
4. **Test Location**:
   - Server/Physics logic tests: `test/` directory (e.g., `test/gameplay_test.js`).
   - Run with `node test/<filename>.js`.
