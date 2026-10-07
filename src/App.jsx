import { useCallback, useEffect, useMemo, useState } from 'react'
import AuthModal from './components/AuthModal.jsx'
import ConversationList from './components/ConversationList.jsx'
import ChatWindow from './components/ChatWindow.jsx'
import { api, clearSession, getAccessToken, getStoredSession, saveSession } from './api/client.js'
import { useChatSocket } from './hooks/useChatSocket.js'

const WS_ENABLED = import.meta.env.VITE_WS_ENABLED === 'true'
const WS_URL = import.meta.env.VITE_WS_URL || ''

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

  const forceLogout = useCallback(() => {
    clearSession()
    setUser(null)
    setConversations([])
    setSelectedConversation(null)
    setMessages([])
    setUnread({})
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
    setUser(session.user)
    setAuthOpen(false)
    setSelectedConversation(null)
    setMessages([])
  }

  async function handleSignup(payload) {
    await api.register(payload)
  }

  async function handleLogout() {
    try {
      await api.logout()
    } catch {
      // Local logout must still succeed if backend token blacklisting is unavailable.
    } finally {
      forceLogout()
    }
  }

  async function selectConversation(conversation) {
    setSelectedConversation(conversation)
    setUnread((current) => ({ ...current, [conversation.id]: 0 }))
    setMessageLoading(true)
    setMessageError('')

    try {
      const data = await api.getMessages(conversation.id)
      setMessages(Array.isArray(data) ? data : [])
    } catch (err) {
      if (err.message?.toLowerCase().includes('session expired')) forceLogout()
      else setMessageError(err.message || 'Could not load messages.')
    } finally {
      setMessageLoading(false)
    }
  }

  async function sendMessage(content) {
    if (!selectedConversation) return false
    setSending(true)
    setMessageError('')

    try {
      await api.sendMessage(selectedConversation.id, content)
      const freshMessages = await api.getMessages(selectedConversation.id)
      setMessages(Array.isArray(freshMessages) ? freshMessages : [])
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

  const handleSocketMessage = useCallback((event) => {
    // Expected future shape: { type: 'message', conversation_id, message }.
    // This path is inactive while VITE_WS_ENABLED is false.
    if (event?.type !== 'message' || !event?.conversation_id || !event?.message) return

    const conversationId = Number(event.conversation_id)
    if (selectedConversation?.id === conversationId) {
      setMessages((current) => {
        if (current.some((item) => item.id === event.message.id)) return current
        return [...current, event.message]
      })
    } else {
      setUnread((current) => ({
        ...current,
        [conversationId]: (current[conversationId] || 0) + 1,
      }))
    }

    loadConversations()
  }, [selectedConversation, loadConversations])

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
