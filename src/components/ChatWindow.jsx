import { useEffect, useRef, useState } from 'react'

function getOtherParticipant(conversation, currentUserId) {
  return conversation?.participants?.find((person) => person.id !== currentUserId)
    || conversation?.participants?.[0]
}

function formatTime(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

export default function ChatWindow({ conversation, currentUser, messages, loading, error, sending, onSend }) {
  const [content, setContent] = useState('')
  const bottomRef = useRef(null)
  const person = getOtherParticipant(conversation, currentUser?.id)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!conversation) {
    return (
      <main className="chat-panel empty-chat">
        <div className="empty-icon">💬</div>
        <h2>Select a conversation</h2>
        <p>Your messages will appear here without reloading the page.</p>
      </main>
    )
  }

  async function submit(event) {
    event.preventDefault()
    const value = content.trim()
    if (!value || sending) return

    const sent = await onSend(value)
    if (sent) setContent('')
  }

  return (
    <main className="chat-panel">
      <header className="chat-header">
        <div className="avatar">{(person?.display_name || person?.email || '?').charAt(0).toUpperCase()}</div>
        <div className="truncate">
          <strong>{person?.display_name || person?.email || `Conversation ${conversation.id}`}</strong>
          <span>{person?.email || 'Conversation'}</span>
        </div>
      </header>

      <section className="messages" aria-live="polite">
        {loading && <div className="message-state">Loading messages…</div>}
        {!loading && error && <div className="message-state error-text">{error}</div>}
        {!loading && !error && messages.length === 0 && (
          <div className="message-state">No messages yet. Send the first one.</div>
        )}

        {!loading && messages.map((message) => {
          const mine = message.sender?.id === currentUser?.id
          return (
            <div className={`message-row ${mine ? 'mine' : ''}`} key={message.id}>
              <div className="message-bubble">
                <p>{message.content}</p>
                <time>{formatTime(message.created_at)}</time>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </section>

      <form className="composer" onSubmit={submit}>
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write a message…"
          aria-label="Message"
          maxLength={5000}
        />
        <button className="send-button" type="submit" disabled={!content.trim() || sending}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </main>
  )
}
