import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AuthModal from './components/AuthModal.jsx'
import ConversationList from './components/ConversationList.jsx'
import ChatWindow from './components/ChatWindow.jsx'
import UserSearchModal from './components/UserSearchModal.jsx'
import { api, clearSession, getStoredSession, saveSession } from './api/client.js'
import { useChatSocket } from './hooks/useChatSocket.js'

const WS_ENABLED = import.meta.env.VITE_WS_ENABLED !== 'false'
const WS_URL = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:8000/ws/chat/`

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
  const [searchOpen, setSearchOpen] = useState(false)
  const [conversations, setConversations] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [unread, setUnread] = useState({})
  const [conversationLoading, setConversationLoading] = useState(false)
  const [conversationError, setConversationError] = useState('')
  const [messageLoading, setMessageLoading] = useState(false)
  const [messageError, setMessageError] = useState('')

  const activeUserIdRef = useRef(initialSession?.user?.id || null)
  const selectedConversationRef = useRef(null)
  const receivedEventsRef = useRef(new Set())

  useEffect(() => {
    selectedConversationRef.current = selectedConversation
  }, [selectedConversation])

  const forceLogout = useCallback(() => {
    clearSession()
    activeUserIdRef.current = null
    selectedConversationRef.current = null
    receivedEventsRef.current.clear()

    setUser(null)
    setConversations([])
    setSelectedConversation(null)
    setMessages([])
    setUnread({})
    setConversationLoading(false)
    setConversationError('')
    setMessageLoading(false)
    setMessageError('')
    setAuthOpen(true)
    setSearchOpen(false)
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
    receivedEventsRef.current.clear()

    setUser(session.user)
    setAuthOpen(false)
    setSearchOpen(false)
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
    setMessages([])
    setUnread((current) => ({ ...current, [conversationId]: 0 }))
    setMessageLoading(true)
    setMessageError('')

    try {
      const data = await api.getMessages(conversationId)
      if (activeUserIdRef.current !== requestUserId) return

      const nextMessages = normalizeMessages(data)

      if (selectedConversationRef.current?.id === conversationId) {
        setMessages((current) => normalizeMessages([
          ...nextMessages,
          ...current.filter((item) => !nextMessages.some((incoming) => String(incoming.id) === String(item.id))),
        ]))
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

  async function startConversationWith(selectedUser) {
    const requestUserId = activeUserIdRef.current
    if (!requestUserId || !selectedUser?.id) {
      throw new Error('Please log in and select a valid user.')
    }

    // The backend POST endpoint is get-or-create: an existing conversation
    // is reused instead of creating a second direct chat.
    const created = await api.createConversation(selectedUser.id)
    if (activeUserIdRef.current !== requestUserId) {
      throw new Error('Session changed. Please try again.')
    }
    if (created?.id == null) {
      throw new Error('Backend did not return a conversation ID.')
    }

    // POST uses ConversationCreateSerializer and only returns the ID.
    // Refetch GET so the chat header has both participants' details.
    const data = await api.getConversations()
    if (activeUserIdRef.current !== requestUserId) {
      throw new Error('Session changed. Please try again.')
    }

    const updatedConversations = Array.isArray(data) ? data : data?.results || []
    const conversation = updatedConversations.find(
      (item) => String(item.id) === String(created.id),
    )
    if (!conversation) {
      throw new Error('Conversation was saved but could not be found. Refresh and try again.')
    }

    setConversations(updatedConversations)
    setSearchOpen(false)
    await selectConversation(conversation)
  }

  async function sendMessage(content) {
    const conversationId = selectedConversationRef.current?.id
    if (!conversationId) return false

    setMessageError('')
    if (!sendSocketMessage({ message: content }, conversationId)) {
      setMessageError('Chat is connecting. Try sending again when Live appears.')
      return false
    }
    // Backend broadcasts the saved message back to this user's group.
    // Do not POST it via REST too: that would insert the message twice.
    return true
  }

  const handleSocketMessage = useCallback((event) => {
    // Current Django consumer emits a flat frame with these fields.
    if (
      event?.id == null ||
      event?.conversation_id == null ||
      typeof event.message !== 'string' ||
      !event.sender_id
    ) return

    const conversationId = String(event.conversation_id)
    const senderId = String(event.sender_id)
    const key = `${conversationId}:${event.id}`
    if (receivedEventsRef.current.has(key)) return
    receivedEventsRef.current.add(key)
    if (receivedEventsRef.current.size > 500) {
      receivedEventsRef.current.delete(receivedEventsRef.current.values().next().value)
    }

    const incoming = {
      id: event.id,
      content: event.message,
      created_at: event.created_at,
      sender: { id: senderId },
    }

    if (String(selectedConversationRef.current?.id) === conversationId) {
      setMessages((current) => normalizeMessages(
        current.some((item) => String(item.id) === String(incoming.id))
          ? current
          : [...current, incoming],
      ))
      setUnread((current) => ({ ...current, [conversationId]: 0 }))
    } else if (senderId !== String(activeUserIdRef.current)) {
      setUnread((current) => ({
        ...current,
        [conversationId]: (current[conversationId] || 0) + 1,
      }))
    }

    loadConversations({ showLoading: false })
  }, [loadConversations])

  // A personal Redis group receives all conversations' events. The current
  // backend still needs a conversation ID in the URL to send messages, so we
  // keep one socket connected to the selected (or first available) conversation.
  const socketConversationId = selectedConversation?.id ?? conversations[0]?.id ?? null
  const {
    status: socketStatus,
    connectedConversationId,
    send: sendSocketMessage,
  } = useChatSocket({
    enabled: WS_ENABLED && Boolean(user),
    url: WS_URL,
    conversationId: socketConversationId,
    onMessage: handleSocketMessage,
    onAuthError: forceLogout,
  })
  const socketReady = socketStatus === 'connected'
    && String(connectedConversationId) === String(selectedConversation?.id)

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
          onSearch={() => setSearchOpen(true)}
          onLogout={handleLogout}
        />
        <ChatWindow
          conversation={selectedConversation}
          currentUser={user}
          messages={messages}
          loading={messageLoading}
          error={messageError}
          socketReady={socketReady}
          onSend={sendMessage}
        />
      </div>

      {searchOpen && !authOpen && (
        <UserSearchModal
          onClose={() => setSearchOpen(false)}
          onSelect={startConversationWith}
          onAuthError={forceLogout}
        />
      )}

      <AuthModal
        open={authOpen}
        onLogin={handleLogin}
        onSignup={handleSignup}
      />
    </div>
  )
}
