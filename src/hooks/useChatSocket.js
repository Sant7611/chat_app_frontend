import { useCallback, useEffect, useRef, useState } from 'react'
import { getWebSocketAccessToken } from '../api/client.js'

// Backend contract: /ws/chat/<conversation_id>/?token=<JWT>
// The backend joins the authenticated user's personal Redis group.
// Keeping one active socket receives events from all conversations, but sending
// is limited to the conversation ID in the current URL until backend routing changes.
export function useChatSocket({ enabled, url, conversationId, onMessage, onAuthError }) {
  const socketRef = useRef(null)
  const routeRef = useRef(null)
  const messageRef = useRef(onMessage)
  const authErrorRef = useRef(onAuthError)
  const [status, setStatus] = useState('disconnected')
  const [connectedConversationId, setConnectedConversationId] = useState(null)

  messageRef.current = onMessage
  authErrorRef.current = onAuthError

  useEffect(() => {
    if (!enabled || conversationId == null || !url) {
      setStatus('disconnected')
      setConnectedConversationId(null)
      return undefined
    }

    let stopped = false
    let socket = null
    let retryTimer = null
    let retries = 0

    function retry() {
      if (stopped) return
      setStatus('reconnecting')
      setConnectedConversationId(null)
      const delay = Math.min(1000 * 2 ** retries, 15000)
      retries += 1
      retryTimer = window.setTimeout(connect, delay)
    }

    async function connect() {
      if (stopped) return
      setStatus('connecting')
      try {
        const token = await getWebSocketAccessToken()
        if (stopped) return

        const base = url.endsWith('/') ? url : `${url}/`
        const target = new URL(`${base}${conversationId}/`)
        target.searchParams.set('token', token)

        socket = new WebSocket(target.toString())
        socketRef.current = socket
        routeRef.current = conversationId

        socket.onopen = () => {
          if (stopped) return
          retries = 0
          setStatus('connected')
          setConnectedConversationId(conversationId)
        }

        socket.onmessage = (event) => {
          if (stopped) return
          try {
            messageRef.current?.(JSON.parse(event.data))
          } catch {
            // Ignore malformed or non-JSON frames.
          }
        }

        socket.onclose = () => {
          if (socketRef.current === socket) {
            socketRef.current = null
            routeRef.current = null
          }
          retry()
        }

        socket.onerror = () => {
          // onclose handles reconnection, including handshake failures.
          socket.close()
        }
      } catch (error) {
        if (stopped) return
        if (error.message?.toLowerCase().includes('session expired')) {
          authErrorRef.current?.()
        } else {
          retry()
        }
      }
    }

    connect()
    return () => {
      stopped = true
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      if (socket) {
        socket.onclose = null
        socket.close()
      }
      if (socketRef.current === socket) {
        socketRef.current = null
        routeRef.current = null
      }
    }
  }, [enabled, url, conversationId])

  const send = useCallback((payload, targetConversationId) => {
    const socket = socketRef.current
    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      String(routeRef.current) !== String(targetConversationId)
    ) {
      return false
    }
    socket.send(JSON.stringify(payload))
    return true
  }, [])

  return { status, connectedConversationId, send }
}
