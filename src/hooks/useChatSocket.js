import { useEffect, useRef } from 'react'

// The Django backend does not expose a WebSocket route yet.
// Keep this disabled until Channels/ASGI routing is added on the backend.
export function useChatSocket({ enabled, url, accessToken, onMessage }) {
  const socketRef = useRef(null)
  const onMessageRef = useRef(onMessage)

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    if (!enabled || !url || !accessToken) return undefined

    const separator = url.includes('?') ? '&' : '?'
    const socket = new WebSocket(
      `${url}${separator}token=${encodeURIComponent(accessToken)}`,
    )
    socketRef.current = socket

    socket.onmessage = (event) => {
      try {
        onMessageRef.current?.(JSON.parse(event.data))
      } catch {
        // Ignore non-JSON frames for now.
      }
    }

    socket.onerror = () => {
      // Deliberately quiet. Reconnection can be added after the backend WS contract exists.
    }

    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [enabled, url, accessToken])

  return socketRef
}
