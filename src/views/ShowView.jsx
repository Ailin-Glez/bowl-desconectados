import { useState, useEffect, useRef } from 'react'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db, isConfigured } from '../firebase'
import logo from '../assets/logo web.png'

export default function ShowView() {
  const [entries, setEntries] = useState([])
  const [index, setIndex] = useState(0)
  const [started, setStarted] = useState(false)
  const totalRef = useRef(0)

  const syncTimeout = useRef(null)
  const pushState = (updates) => {
    if (!isConfigured) return
    clearTimeout(syncTimeout.current)
    syncTimeout.current = setTimeout(() => {
      setDoc(doc(db, 'config', 'main'), updates, { merge: true })
    }, 150)
  }

  const navigate = (i) => {
    const clamped = Math.max(0, Math.min(i, totalRef.current - 1))
    setIndex(clamped)
    pushState({ showIndex: clamped })
  }

  const startShow = () => pushState({ showStarted: true })

  useEffect(() => {
    if (!isConfigured) return
    return onSnapshot(collection(db, 'entries'), snap => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
      setEntries(items)
      totalRef.current = items.length
    })
  }, [])

  useEffect(() => {
    if (!isConfigured) return
    return onSnapshot(doc(db, 'config', 'main'), snap => {
      if (snap.exists()) {
        const d = snap.data()
        setIndex(d.showIndex ?? 0)
        setStarted(d.showStarted ?? false)
      }
    })
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (!started) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startShow() }
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault()
        setIndex(i => { const next = Math.min(i + 1, totalRef.current - 1); pushState({ showIndex: next }); return next })
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex(i => { const next = Math.max(i - 1, 0); pushState({ showIndex: next }); return next })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [started])

  const current = entries[index]
  const total = entries.length

  if (!started) {
    return (
      <div className="show-page show-intro">
        <img src={logo} alt="Des-conectados" className="show-intro-logo" />
        <button className="show-start-btn" onClick={startShow}>
          Empezar
        </button>
      </div>
    )
  }

  return (
    <div className="show-page">
      <div className="show-logo">
        <img src={logo} alt="Des-conectados" />
      </div>

      <div className="show-answer-section">
        {total === 0 ? (
          <div className="show-waiting">Esperando respuestas...</div>
        ) : current ? (
          <div key={index} className="show-answer-text">"{current.text}"</div>
        ) : null}
      </div>

      {total > 0 && (
        <div className="show-nav">
          <button className="show-nav-btn" onClick={() => navigate(index - 1)} disabled={index === 0}>←</button>
          <span className="show-nav-count">{index + 1} / {total}</span>
          <button className="show-nav-btn" onClick={() => navigate(index + 1)} disabled={index === total - 1}>→</button>
        </div>
      )}
    </div>
  )
}
