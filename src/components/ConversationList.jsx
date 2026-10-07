function getOtherParticipant(conversation, currentUserId) {
  return conversation.participants?.find((person) => person.id !== currentUserId)
    || conversation.participants?.[0]
}

function initialFor(person) {
  const source = person?.display_name || person?.email || '?'
  return source.charAt(0).toUpperCase()
}

export default function ConversationList({ conversations, currentUser, selectedId, unread, loading, error, onSelect, onLogout }) {
  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <div>
          <span className="eyebrow">Simple Chat</span>
          <h2>Conversations</h2>
        </div>
        <button className="text-button" type="button" onClick={onLogout}>Logout</button>
      </header>

      <div className="current-user-strip">
        <div className="avatar small">{(currentUser?.username || currentUser?.email || '?').charAt(0).toUpperCase()}</div>
        <div className="truncate">
          <strong>{currentUser?.username || 'You'}</strong>
          <span>{currentUser?.email}</span>
        </div>
      </div>

      <div className="conversation-scroll">
        {loading && <div className="list-state">Loading conversations…</div>}
        {!loading && error && <div className="list-state error-text">{error}</div>}
        {!loading && !error && conversations.length === 0 && (
          <div className="list-state">
            <strong>No conversations yet.</strong>
            <span>The current backend does not expose a user directory, so this frontend only lists existing conversations.</span>
          </div>
        )}

        {!loading && conversations.map((conversation) => {
          const person = getOtherParticipant(conversation, currentUser?.id)
          const count = unread[conversation.id] || 0
          const selected = selectedId === conversation.id

          return (
            <button
              key={conversation.id}
              className={`conversation-item ${selected ? 'selected' : ''}`}
              type="button"
              onClick={() => onSelect(conversation)}
            >
              <div className="avatar">{initialFor(person)}</div>
              <div className="conversation-copy">
                <div className="conversation-topline">
                  <strong>{person?.display_name || person?.email || `Conversation ${conversation.id}`}</strong>
                  {count > 0 && <span className="unread-badge" aria-label={`${count} unread messages`}>{count > 9 ? '9+' : count}</span>}
                </div>
                <span>{person?.email || 'Open conversation'}</span>
              </div>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
