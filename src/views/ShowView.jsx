import { useState, useEffect } from 'react'
import { doc, collection, onSnapshot } from 'firebase/firestore'
import { db, isConfigured } from '../firebase'
import logo from '../assets/logo web.png'

export default function ShowView() {
  const [entries, setEntries] = useState([])
  const [revealedQuestion, setRevealedQuestion] = useState('')
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!isConfigured) return
    return onSnapshot(collection(db, 'entries'), snap => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
      setEntries(items)
    })
  }, [])

  useEffect(() => {
    if (!isConfigured) return
    return onSnapshot(doc(db, 'config', 'main'), snap => {
      if (snap.exists()) setRevealedQuestion(snap.data().revealedQuestion || '')
    })
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault()
        setIndex(i => Math.min(i + 1, entries.length - 1))
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex(i => Math.max(i - 1, 0))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [entries.length])

  // Keep index in bounds as entries arrive
  useEffect(() => {
    if (entries.length > 0 && index >= entries.length) {
      setIndex(entries.length - 1)
    }
  }, [entries.length])

  const current = entries[index]
  const total = entries.length

  return (
    <div className="show-page">
      {/* Logo */}
      <div className="show-logo">
        <img src={logo} alt="Des-conectados" />
      </div>

      {/* Pregunta revelada */}
      <div className="show-question-section">
        <div className="show-question-label">Pregunta</div>
        <div className="show-question-text">
          {revealedQuestion || '—'}
        </div>
      </div>

      <div className="show-divider" />

      {/* Respuesta */}
      <div className="show-answer-section">
        {total === 0 ? (
          <div className="show-waiting">Esperando respuestas...</div>
        ) : current ? (
          <>
            <div className="show-answer-text">"{current.text}"</div>
          </>
        ) : null}
      </div>

      {/* Navegación */}
      {total > 0 && (
        <div className="show-nav">
          <button
            className="show-nav-btn"
            onClick={() => setIndex(i => Math.max(i - 1, 0))}
            disabled={index === 0}
          >
            ←
          </button>
          <span className="show-nav-count">{index + 1} / {total}</span>
          <button
            className="show-nav-btn"
            onClick={() => setIndex(i => Math.min(i + 1, total - 1))}
            disabled={index === total - 1}
          >
            →
          </button>
        </div>
      )}
    </div>
  )
}
