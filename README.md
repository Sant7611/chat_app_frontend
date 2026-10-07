# Chat App Frontend

A deliberately small React SPA for the Django/DRF backend in `Sant7611/chat_app`.

Backend contract reviewed against commit `78210d266ccb282222b67da3a22213f97b56dd6d` (2026-10-07, `messages/conversation near completion`).

## Included

- React SPA with no page reloads
- Login and signup in a blurred-background modal
- JWT access + refresh handling
- Logout
- Conversation list
- Conversation messages
- Send message
- Red unread badge for new incoming messages
- Lightweight 5-second REST polling while WebSocket is disabled
- WebSocket hook present but disabled by default until the backend exposes a WS route
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

Start Django on port 8000, then:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

Vite proxies `/api/*` to `http://localhost:8000/*`. This avoids browser CORS problems during local development without changing the Django backend.

## Unread messages before WebSocket

Because the backend does not provide WebSocket events or an unread-count endpoint yet, the frontend checks the existing conversation/message REST endpoints every 5 seconds.

- The first check establishes a baseline and does not mark old messages as newly unread.
- A later incoming message in a conversation that is not open increases that conversation's red badge.
- Opening the conversation clears its frontend unread badge.
- This unread state is session-only for now because the backend does not update/expose `read_at` through these APIs.

This is intentionally a temporary fallback. Once WebSocket is enabled, polling stops.

## WebSocket later

WebSocket is intentionally disabled now.

When the backend adds Django Channels routing, add an `.env.local` file:

```env
VITE_WS_ENABLED=true
VITE_WS_URL=ws://localhost:8000/ws/chat/
```

The current hook sends the JWT access token as a `?token=` query parameter. If the future backend uses a different authentication format or route, update `src/hooks/useChatSocket.js` to match it.

The frontend currently expects a future incoming message payload shaped like:

```json
{
  "type": "message",
  "conversation_id": 1,
  "message": {
    "id": 25,
    "content": "Hello",
    "sender": {
      "id": "uuid",
      "display_name": "Name",
      "email": "user@example.com"
    },
    "created_at": "2026-10-07T09:00:00Z"
  }
}
```

That payload is only a frontend integration point for now; the backend WS contract does not exist yet.

## Current backend notes

The frontend can work with the present REST contract, but two backend concerns remain:

1. The chat views inherit the project's global `AllowAny` permission. They should eventually use `IsAuthenticated`.
2. `LogoutView` calls `RefreshToken(...).blacklist()`, but the backend currently does not include `rest_framework_simplejwt.token_blacklist` in `INSTALLED_APPS`. Add that app and run `python manage.py migrate` if server-side refresh-token revocation is required.

The frontend still clears its browser session if the logout endpoint fails, so the user is logged out locally.
