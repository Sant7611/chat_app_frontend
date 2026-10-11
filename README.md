# Chat App Frontend

A deliberately small React SPA for the Django/DRF backend in `Sant7611/chat_app`.

WebSocket contract reviewed against backend commit `153269c29f9c8c0126e8d013593f4f09375b11b8` (2026-10-11, `ws completed`).

## Included

- React SPA with no page reloads
- Login and signup in a blurred-background modal
- JWT access + refresh handling
- Logout
- Conversation list
- Conversation messages
- Send messages through the WebSocket (avoids saving duplicate messages via HTTP)
- One active WebSocket connection joined to the authenticated user's personal Redis group
- Live messages in the selected conversation
- Red unread badges for incoming messages in other conversations
- No REST polling for notifications
- No profile pages and no extra dashboard features

## Backend endpoints used

- `POST /auth/login/`
- `POST /auth/register/`
- `POST /auth/logout/`
- `POST /auth/token/refresh/`
- `GET /chat/conversation/`
- `GET /chat/conversation/:id/messages/`
- `POST /chat/conversation/:id/messages/`

The current backend has no user-list/search endpoint, so this frontend does not add a fake “find user” flow. It displays existing conversations only.

## Run locally

Use Node.js 20.19+.

Start Django on port 8000, then:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

Vite proxies `/api/*` to `http://localhost:8000/*`, so local development does not require changing Django CORS settings.

## Live messages and notifications

WebSocket support is enabled by default. Start **Daphne** and **Redis** on the backend and run the Vite frontend.

The current backend uses `/ws/chat/<conversation_id>/?token=<access JWT>`, even though each connected consumer subscribes to a **personal user Redis group**. The frontend therefore opens **one socket at a time** using the selected conversation's ID (or the first listed conversation if no chat has been opened).

- Incoming events from **any** conversation arrive on this personal group while the socket is connected.
- Events for the open conversation append directly to the chat, deduplicated by message ID.
- Events from other conversations increment a **red unread badge**, unless sent by the current user.
- Opening a conversation clears its badge. Unread counts are browser-session-only; the backend does not yet provide persistent per-conversation unread counts.
- Sending uses `{"message":"Hello"}` over the socket, since the current Consumer saves and broadcasts only WebSocket sends.
- REST endpoints still load conversation lists and message history. There is no notification polling.

**Current backend limitation:** Switching the active conversation reconnects the one socket to a different `/ws/chat/<id>/` URL because the Consumer chooses the sending conversation from the URL. A later backend update to a user-level `/ws/` endpoint with `conversation_id` inside outgoing JSON would remove these reconnects. Reconnecting can miss events; persistent unread counts and missed-message recovery require backend support.

## Configuration

In `.env.local` you can override the WebSocket endpoint or disable it explicitly:

```env
VITE_WS_ENABLED=true
VITE_WS_URL=ws://localhost:8000/ws/chat/
```

The default URL uses the frontend hostname and port 8000. If disabled or disconnected, the Send button remains unavailable so HTTP cannot accidentally save a message without broadcasting it.

Access JWTs are passed as `?token=` to match the current backend JWT middleware. This is for local learning; production authentication should avoid tokens in WebSocket query strings where URLs may be logged.

The backend event payload is:

```json
{
  "id": 25,
  "conversation_id": 1,
  "message": "Hello",
  "sender_id": "user-uuid",
  "created_at": "2026-10-11T08:00:00+00:00"
}
```

The frontend maps that event to its REST-style message shape (`content`, `sender.id`) before rendering.

## Backend notes

The Django app must have `CHANNEL_LAYERS` configured and Redis running. The current backend's HTTP conversation/message views use the global `AllowAny` permission setting; protect them with `IsAuthenticated` before deployment. A separate SimpleJWT blacklist app/migration is required if refresh-token blacklisting is used.
