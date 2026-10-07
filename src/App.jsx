import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AuthModal from './components/AuthModal.jsx'
import ConversationList from './components/ConversationList.jsx'
import ChatWindow from './components/ChatWindow.jsx'
import { api, clearSession, getAccessToken, getStoredSession, saveSession } from './api/client.js'
import { useChatSocket } from './hooks/useChatSocket.js'

const WS_ENABLED = import.meta.env.VITE_WS_ENABLED === 'true'
const WS_URL = import.meta.env.VITE_WS_URL || ''
const POLL_INTERVAL_MS = 5000

function normalizeMessages(data) {
  if (!Array.isArray(data)) return []

  return [...data].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    if (aTime !== bTime) return aTime - bTime
    return Number(a.id || 0) - Number(b.id || 0)
  })
}

function latestMessageId(messages) {
  return messages.length ? messages[messages.length - 1].id : null
}

export default function App() {
  const initialSession = useMemo(() => getStoredSession(), [])
  const [user, setUser] = useState(initialSession?.user || null)
  const [authOpen, setAuthOpen] = useState(!initialSession)
  const [conversations, setConversations] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [unread, setUnread] = useState({})
  const [conversationLoading, setConversationLoading] = useState(false)
  const [conversationError, setConversationError] = useState('')
  const [messageLoading, setMessageLoading] = useState(false)
  const [messageError, setMessageError] = useState('')
  const [sending, setSending] = useState(false)

  const selectedConversationRef = useRef(null)
  const lastMessageIdRef = useRef(new Map())
  const initializedConversationIdsRef = useRef(new Set())
  const pollInFlightRef = useRef(false)

  useEffect(() => {
    selectedConversationRef.current = selectedConversation
  }, [selectedConversation])

  const forceLogout = useCallback(() => {
    clearSession()
    selectedConversationRef.current = null
    lastMessageIdRef.current.clear()
    initializedConversationIdsRef.current.clear()
    setUser(null)
    setConversations([])
    setSelectedConversation(null)
    setMessages([])
    setUnread({})
    setConversationError('')
    setMessageError('')
    setAuthOpen(true)
  }, [])

  const loadConversations = useCallback(async () => {
    if (!user) return

    setConversationLoading(true)
    setConversationError('')

    try {
      const data = await api.getConversations()
      setConversations(Array.isArray(data) ? data : [])
    } catch (err) {
      if (err.message?.toLowerCase().includes('session expired')) forceLogout()
      else setConversationError(err.message || 'Could not load conversations.')
    } finally {
      setConversationLoading(false)
    }
  }, [user, forceLogout])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  async function handleLogin(credentials) {
    const session = await api.login(credentials)
    saveSession(session)
    lastMessageIdRef.current.clear()
    initializedConversationIdsRef.current.clear()
    setUnread({})
    setUser(session.user)
    setAuthOpen(false)
    setSelectedConversation(null)
    selectedConversationRef.current = null
    setMessages([])
  }

  async function handleSignup(payload) {
    await api.register(payload)
  }

  async function handleLogout() {
    try {
      await api.logout()
    } catch {
      // Always clear the browser session even if backend token blacklisting is unavailable.
    } finally {
      forceLogout()
    }
  }

  async function selectConversation(conversation) {
    const conversationId = conversation.id
    selectedConversationRef.current = conversation
    setSelectedConversation(conversation)
    setUnread((current) => ({ ...current, [conversationId]: 0 }))
    setMessageLoading(true)
    setMessageError('')

    try {
      const data = await api.getMessages(conversationId)
      const nextMessages = normalizeMessages(data)

      lastMessageIdRef.current.set(conversationId, latestMessageId(nextMessages))
      initializedConversationIdsRef.current.add(conversationId)

      if (selectedConversationRef.current?.id === conversationId) {
        setMessages(nextMessages)
      }
    } catch (err) {
      if (err.message?.toLowerCase().includes('session expired')) {
        forceLogout()
      } else if (selectedConversationRef.current?.id === conversationId) {
        setMessageError(err.message || 'Could not load messages.')
      }
    } finally {
      if (selectedConversationRef.current?.id === conversationId) {
        setMessageLoading(false)
      }
    }
  }

  async function sendMessage(content) {
    const conversationId = selectedConversationRef.current?.id
    if (!conversationId) return false

    setSending(true)
    setMessageError('')

    try {
      await api.sendMessage(conversationId, content)
      const data = await api.getMessages(conversationId)
      const nextMessages = normalizeMessages(data)

      lastMessageIdRef.current.set(conversationId, latestMessageId(nextMessages))
      initializedConversationIdsRef.current.add(conversationId)

      if (selectedConversationRef.current?.id === conversationId) {
        setMessages(nextMessages)
      }

      loadConversations()
      return true
    } catch (err) {
      if (err.message?.toLowerCase().includes('session expired')) forceLogout()
      else setMessageError(err.message || 'Could not send message.')
      return false
    } finally {
      setSending(false)
    }
  }

  const pollForNewMessages = useCallback(async () => {
    if (!user || WS_ENABLED || pollInFlightRef.current || document.hidden) return

    pollInFlightRef.current = true

    try {
      const conversationData = await api.getConversations()
      const latestConversations = Array.isArray(conversationData) ? conversationData : []
      setConversations(latestConversations)
      setConversationError('')

      for (const conversation of latestConversations) {
        const conversationId = conversation.id
        const data = await api.getMessages(conversationId)
        const nextMessages = normalizeMessages(data)
        const nextLatestId = latestMessageId(nextMessages)
        const alreadyInitialized = initializedConversationIdsRef.current.has(conversationId)
        const previousLatestId = lastMessageIdRef.current.get(conversationId)
        const isSelected = selectedConversationRef.current?.id === conversationId

        if (!alreadyInitialized) {
          initializedConversationIdsRef.current.add(conversationId)
          lastMessageIdRef.current.set(conversationId, nextLatestId)

          if (isSelected) setMessages(nextMessages)
          continue
        }

        if (nextLatestId === previousLatestId) continue

        let newMessages = []
        if (previousLatestId == null) {
          newMessages = nextMessages
        } else {
          const previousIndex = nextMessages.findIndex((message) => message.id === previousLatestId)
          newMessages = previousIndex >= 0
            ? nextMessages.slice(previousIndex + 1)
            : nextMessages.slice(-1)
        }

        lastMessageIdRef.current.set(conversationId, nextLatestId)

        if (isSelected) {
          setMessages(nextMessages)
          setUnread((current) => ({ ...current, [conversationId]: 0 }))
          continue
        }

        const incomingCount = newMessages.filter(
          (message) => message.sender?.id !== user.id,
        ).length

        if (incomingCount > 0) {
          setUnread((current) => ({
            ...current,
            [conversationId]: (current[conversationId] || 0) + incomingCount,
          }))
        }
      }
    } catch (err) {
      if (err.message?.toLowerCase().includes('session expired')) {
        forceLogout()
      } else {
        setConversationError((current) => current || 'Could not refresh conversations.')
      }
    } finally {
      pollInFlightRef.current = false
    }
  }, [user, forceLogout])

  useEffect(() => {
    if (!user || WS_ENABLED) return undefined

    pollForNewMessages()
    const intervalId = window.setInterval(pollForNewMessages, POLL_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [user, pollForNewMessages])

  const handleSocketMessage = useCallback((event) => {
    // Expected future shape: { type: 'message', conversation_id, message }.
    // This path is inactive while VITE_WS_ENABLED is false.
    if (event?.type !== 'message' || !event?.conversation_id || !event?.message) return

    const conversationId = Number(event.conversation_id)
    if (selectedConversationRef.current?.id === conversationId) {
      setMessages((current) => normalizeMessages(
        current.some((item) => item.id === event.message.id)
          ? current
          : [...current, event.message],
      ))
      setUnread((current) => ({ ...current, [conversationId]: 0 }))
    } else if (event.message.sender?.id !== user?.id) {
      setUnread((current) => ({
        ...current,
        [conversationId]: (current[conversationId] || 0) + 1,
      }))
    }

    loadConversations()
  }, [user, loadConversations])

  useChatSocket({
    enabled: WS_ENABLED && Boolean(user),
    url: WS_URL,
    accessToken: getAccessToken(),
    onMessage: handleSocketMessage,
  })

  return (
    <div className="page-shell">
      <div className={`app-shell ${authOpen ? 'auth-behind' : ''}`}>
        <ConversationList
          conversations={conversations}
          currentUser={user}
          selectedId={selectedConversation?.id}
          unread={unread}
          loading={conversationLoading}
          error={conversationError}
          onSelect={selectConversation}
          onLogout={handleLogout}
        />
        <ChatWindow
          conversation={selectedConversation}
          currentUser={user}
          messages={messages}
          loading={messageLoading}
          error={messageError}
          sending={sending}
          onSend={sendMessage}
        />
      </div>

      <AuthModal
        open={authOpen}
        onLogin={handleLogin}
        onSignup={handleSignup}
      />
    </div>
  )
}
