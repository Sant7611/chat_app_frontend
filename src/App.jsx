import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AuthModal from './components/AuthModal.jsx'
import ConversationList from './components/ConversationList.jsx'
import ChatWindow from './components/ChatWindow.jsx'
import { api, clearSession, getAccessToken, getStoredSession, saveSession } from './api/client.js'
import { useChatSocket } from './hooks/useChatSocket.js'

const WS_ENABLED = import.meta.env.VITE_WS_ENABLED === 'true'
const WS_URL = import.meta.env.VITE_WS_URL || ''

function normalizeMessages(data) {
  if (!Array.isArray(data)) return []

  return [...data].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    if (aTime !== bTime) return aTime - bTime
    return Number(a.id || 0) - Number(b.id || 0)
  })
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

  const activeUserIdRef = useRef(initialSession?.user?.id || null)
  const selectedConversationRef = useRef(null)

  useEffect(() => {
    selectedConversationRef.current = selectedConversation
  }, [selectedConversation])

  const forceLogout = useCallback(() => {
    clearSession()
    activeUserIdRef.current = null
    selectedConversationRef.current = null

    setUser(null)
    setConversations([])
    setSelectedConversation(null)
    setMessages([])
    setUnread({})
    setConversationLoading(false)
    setConversationError('')
    setMessageLoading(false)
    setMessageError('')
    setSending(false)
    setAuthOpen(true)
  }, [])

  const loadConversations = useCallback(async ({ showLoading = true } = {}) => {
    if (!user) return

    const requestUserId = user.id

    if (showLoading) setConversationLoading(true)
    setConversationError('')

    try {
      const data = await api.getConversations()
      if (activeUserIdRef.current !== requestUserId) return
      setConversations(Array.isArray(data) ? data : [])
    } catch (err) {
      if (activeUserIdRef.current !== requestUserId) return

      if (err.message?.toLowerCase().includes('session expired')) forceLogout()
      else setConversationError(err.message || 'Could not load conversations.')
    } finally {
      if (showLoading && activeUserIdRef.current === requestUserId) {
        setConversationLoading(false)
      }
    }
  }, [user, forceLogout])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  async function handleLogin(credentials) {
    const session = await api.login(credentials)
    saveSession(session)

    activeUserIdRef.current = session.user.id
    selectedConversationRef.current = null

    setUser(session.user)
    setAuthOpen(false)
    setConversations([])
    setSelectedConversation(null)
    setMessages([])
    setUnread({})
    setConversationError('')
    setMessageError('')
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
    const requestUserId = activeUserIdRef.current

    selectedConversationRef.current = conversation
    setSelectedConversation(conversation)
    setUnread((current) => ({ ...current, [conversationId]: 0 }))
    setMessageLoading(true)
    setMessageError('')

    try {
      const data = await api.getMessages(conversationId)
      if (activeUserIdRef.current !== requestUserId) return

      const nextMessages = normalizeMessages(data)

      if (selectedConversationRef.current?.id === conversationId) {
        setMessages(nextMessages)
      }
    } catch (err) {
      if (activeUserIdRef.current !== requestUserId) return

      if (err.message?.toLowerCase().includes('session expired')) {
        forceLogout()
      } else if (selectedConversationRef.current?.id === conversationId) {
        setMessageError(err.message || 'Could not load messages.')
      }
    } finally {
      if (
        activeUserIdRef.current === requestUserId
        && selectedConversationRef.current?.id === conversationId
      ) {
        setMessageLoading(false)
      }
    }
  }

  async function sendMessage(content) {
    const conversationId = selectedConversationRef.current?.id
    const requestUserId = activeUserIdRef.current
    if (!conversationId || !requestUserId) return false

    setSending(true)
    setMessageError('')

    try {
      await api.sendMessage(conversationId, content)
      const data = await api.getMessages(conversationId)
      if (activeUserIdRef.current !== requestUserId) return false

      const nextMessages = normalizeMessages(data)

      if (selectedConversationRef.current?.id === conversationId) {
        setMessages(nextMessages)
      }

      loadConversations({ showLoading: false })
      return true
    } catch (err) {
      if (activeUserIdRef.current !== requestUserId) return false

      if (err.message?.toLowerCase().includes('session expired')) forceLogout()
      else setMessageError(err.message || 'Could not send message.')
      return false
    } finally {
      if (activeUserIdRef.current === requestUserId) setSending(false)
    }
  }

  const handleSocketMessage = useCallback((event) => {
    // Future WebSocket-only notification path.
    // This is inactive until VITE_WS_ENABLED=true and the backend WS contract exists.
    if (event?.type !== 'message' || !event?.conversation_id || !event?.message) return

    const conversationId = Number(event.conversation_id)

    if (selectedConversationRef.current?.id === conversationId) {
      setMessages((current) => normalizeMessages(
        current.some((item) => item.id === event.message.id)
          ? current
          : [...current, event.message],
      ))
      setUnread((current) => ({ ...current, [conversationId]: 0 }))
    } else if (event.message.sender?.id !== activeUserIdRef.current) {
      setUnread((current) => ({
        ...current,
        [conversationId]: (current[conversationId] || 0) + 1,
      }))
    }

    loadConversations({ showLoading: false })
  }, [loadConversations])

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
