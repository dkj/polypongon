# Spectator Mode Tests

## Overview
This document describes the test coverage for the spectator mode feature, which allows users to join a multiplayer game as observers when all 5 player slots are occupied.

## Test Coverage

### 1. **testSixthPlayerBecomesSpectator()**
- **Purpose**: Verifies that when all 5 pentagon edges are occupied, the 6th player receives `playerIndex = -1`
- **Validation**:
  - First 5 players get edges 0-4
  - 6th player gets index -1
  - Paddle count remains at 5
  - Players map size stays at 5 (spectators are not added to active players)

### 2. **testSpectatorDoesNotGetPaddle()**
- **Purpose**: Ensures spectators cannot control any paddle during active gameplay
- **Validation**:
  - No paddle exists with edgeIndex -1
  - All 5 edges (0-4) have valid paddles
  - Game runs normally with spectators present

### 3. **testSpectatorReceivesGameState()**
- **Purpose**: Confirms spectators receive real-time game state updates via Socket.IO room broadcasts
- **Validation**:
  - Game state broadcasts are sent to the room
  - Spectators (as room members) receive these updates
  - Multiple broadcasts occur during active gameplay

### 4. **testMultipleSpectators()**
- **Purpose**: Verifies multiple spectators can join simultaneously without breaking the game
- **Validation**:
  - Multiple users can all receive index -1
  - Paddle count remains constant at 5
  - Game logic is unaffected by spectator count

### 5. **testSpectatorAfterPlayerLeaves()**
- **Purpose**: Tests spectator behavior when the game state changes due to player disconnect
- **Validation**:
  - Spectators exist alongside active players
  - Player disconnect triggers expected game termination
  - Spectator presence doesn't interfere with disconnect logic

### 6. **testSpectatorCannotControlPaddle()**
- **Purpose**: Ensures spectator input commands are ignored by the server
- **Validation**:
  - Spectator socket sends input commands
  - `handleInput()` method returns early (spectator not in players map)
  - No paddle movement or creation occurs
  - Game integrity maintained

## Implementation Details

### Server-Side Logic (`ServerGame.js`)
```javascript
addPlayer(socketId) {
    if (this.paddles.length >= this.polygon.sides) return -1;
    // ... assigns edge index and creates paddle ...
    return edgeIndex;
}
```
- Returns `-1` when all slots are full
- Spectators are **not** added to the `players` map
- Only active players with valid edge indices are tracked

### Client-Side Indicator (`Game.js`)
```javascript
if (this.mode === 'online' && this.playerIndex === -1 && this.socket) {
    // Display "SPECTATOR MODE" text
    // Display "All player slots are full" subtitle
}
```
- Visual indicator appears at bottom-center of screen
- Golden/yellow color with glow effect for visibility
- Only shown when connected as a spectator

## Test Execution
All tests pass successfully as part of the unit test suite:
```bash
npm run test:unit
```

## Coverage Summary
✅ Player capacity limits (5 players max)  
✅ Spectator assignment (playerIndex -1)  
✅ Spectator receives game state  
✅ Spectator cannot control paddles  
✅ Multiple spectators supported  
✅ Spectator input ignored  
✅ Game integrity with spectators present
