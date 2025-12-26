## 🚀 Fly.io Instance Affinity

Polypongon implements **instance-specific routing** to ensure all players in a multiplayer room connect to the same Fly.io machine, guaranteeing consistent game state.

### How It Works

When you create a room, the instance ID is encoded in the shareable URL:
```
https://polypongon.fly.dev/?room=XY4Z&instance=abc123
```

When anyone joins using this URL:
1. Their browser connects with the instance parameter
2. Fly's proxy routes the WebSocket to the correct instance using `fly-replay`
3. All players see the same game state

### Benefits

✅ **Reliable Multiplayer** - No split-brain scenarios  
✅ **Seamless Sharing** - URLs work across all devices  
✅ **Automatic Routing** - Fly handles instance redirection  
✅ **Local Development** - Works on localhost without changes

### Development

The instance affinity works automatically:
- **On Fly.io**: Instance routing is enforced
- **Locally**: Works normally without enforcement (instance = "local")

See [`FLY_INSTANCE_AFFINITY.md`](./FLY_INSTANCE_AFFINITY.md) for technical details.
