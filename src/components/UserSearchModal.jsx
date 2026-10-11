import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'

export default function UserSearchModal({ onClose, onSelect, onAuthError }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busyUserId, setBusyUserId] = useState(null)
  const inputRef = useRef(null)
  const choosingRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !choosingRef.current) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setLoading(false)
      setError('')
      return undefined
    }

    const controller = new AbortController()
    let active = true
    setLoading(true)
    setError('')

    const timer = window.setTimeout(async () => {
      try {
        const users = await api.searchUsers(trimmed, { signal: controller.signal })
        if (active) setResults(Array.isArray(users) ? users : users?.results || [])
      } catch (err) {
        if (!active || err.name === 'AbortError') return
        setResults([])
        if (err.message?.toLowerCase().includes('session expired')) {
          onAuthError()
        } else {
          setError(err.message || 'Could not search users.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }, 300)

    return () => {
      active = false
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, onAuthError])

  async function chooseUser(person) {
    if (choosingRef.current) return
    choosingRef.current = true
    setBusyUserId(person.id)
    setError('')

    try {
      await onSelect(person)
    } catch (err) {
      if (err.message?.toLowerCase().includes('session expired')) {
        onAuthError()
      } else {
        setError(err.message || 'Could not open conversation.')
      }
    } finally {
      choosingRef.current = false
      setBusyUserId(null)
    }
  }

  return (
    <div
      className="modal-backdrop search-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !choosingRef.current) onClose()
      }}
    >
      <section className="user-search-modal" role="dialog" aria-modal="true" aria-label="Find someone to chat with">
        <div className="search-modal-header">
          <div>
            <h2>New conversation</h2>
            <p>Find someone by username or email.</p>
          </div>
          <button
            type="button"
            className="search-close-button"
            onClick={onClose}
            disabled={Boolean(busyUserId)}
            aria-label="Close user search"
          >
            ×
          </button>
        </div>

        <label className="search-label" htmlFor="chat-user-search">Search users</label>
        <input
          ref={inputRef}
          id="chat-user-search"
          className="search-input"
          type="search"
          autoComplete="off"
          placeholder="Username or email"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={Boolean(busyUserId)}
        />

        <div className="search-result-area" aria-live="polite">
          {error && <p className="search-feedback search-error" role="alert">{error}</p>}
          {!query.trim() && <p className="search-feedback">Type a username or full email address to find a user.</p>}
          {query.trim() && loading && <p className="search-feedback">Searching…</p>}
          {query.trim() && !loading && !error && results.length === 0 && (
            <p className="search-feedback">No users found.</p>
          )}

          {query.trim() && !loading && results.map((person) => (
            <button
              key={person.id}
              type="button"
              className="search-result"
              disabled={Boolean(busyUserId)}
              onClick={() => chooseUser(person)}
            >
              <span className="avatar search-avatar">
                {(person.display_name || person.email || '?').charAt(0).toUpperCase()}
              </span>
              <span className="search-result-copy">
                <strong>{person.display_name || person.email}</strong>
                {person.display_name && <small>{person.email}</small>}
              </span>
              <span className="search-result-action">
                {busyUserId === person.id ? 'Opening…' : 'Chat ›'}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
