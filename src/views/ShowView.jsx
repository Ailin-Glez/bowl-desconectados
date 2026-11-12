import { useState, useEffect, useRef } from 'react'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db, isConfigured } from '../firebase'
import logo from '../assets/logo web.png'
import { BUNDLED_INTRO } from '../slideImages'

function buildSlides(entries, introImages, outroImages) {
  const slides = introImages.map(src => ({ type: 'image', src }))
  slides.push({ type: 'logo' })
  for (const entry of entries) {
    slides.push({ type: 'answer', entry })
    slides.push({ type: 'logo' })
  }
  for (const src of outroImages) slides.push({ type: 'image', src })
  return slides
}

export default function ShowView() {
  const [entries, setEntries] = useState([])
  const [entryOrder, setEntryOrder] = useState([])
  const [index, setIndex] = useState(0)
  const [introOrder, setIntroOrder] = useState(null) // null = sin configurar
  const [outroOrder, setOutroOrder] = useState([])
  const [imageDocs, setImageDocs] = useState({})
  const slidesRef = useRef([])

  const syncTimeout = useRef(null)
  const pushState = (updates) => {
    if (!isConfigured) return
    clearTimeout(syncTimeout.current)
    syncTimeout.current = setTimeout(() => {
      setDoc(doc(db, 'config', 'main'), updates, { merge: true })
    }, 150)
  }

  const navigate = (i) => {
    const clamped = Math.max(0, Math.min(i, slidesRef.current.length - 1))
    setIndex(clamped)
    pushState({ showIndex: clamped })
  }

  // Reset to slide 0 on every mount
  useEffect(() => {
    if (!isConfigured) return
    setDoc(doc(db, 'config', 'main'), { showIndex: 0 }, { merge: true })
  }, [])

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
    return onSnapshot(collection(db, 'slideImages'), snap => {
      const map = {}
      snap.docs.forEach(d => { map[d.id] = d.data().data })
      setImageDocs(map)
    })
  }, [])

  useEffect(() => {
    if (!isConfigured) return
    return onSnapshot(doc(db, 'config', 'main'), snap => {
      if (snap.exists()) {
        const d = snap.data()
        setIndex(d.showIndex ?? 0)
        if (d.entryOrder?.length) setEntryOrder(d.entryOrder)
        setIntroOrder(Array.isArray(d.introSlides) ? d.introSlides : null)
        setOutroOrder(Array.isArray(d.outroSlides) ? d.outroSlides : [])
      }
    })
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault()
        setIndex(i => { const next = Math.min(i + 1, slidesRef.current.length - 1); pushState({ showIndex: next }); return next })
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex(i => { const next = Math.max(i - 1, 0); pushState({ showIndex: next }); return next })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const sortedEntries = entryOrder.length > 0
    ? entryOrder.map(id => entries.find(e => e.id === id)).filter(Boolean)
    : entries

  // Una imagen que todavía se está descargando ocupa igual su lugar (slide negro),
  // así la cantidad de slides —y el número de slide sincronizado— no cambia mientras carga.
  const introImages = introOrder === null
    ? BUNDLED_INTRO
    : introOrder.map(id => imageDocs[id] ?? null)

  const outroImages = outroOrder.map(id => imageDocs[id] ?? null)

  const slides = buildSlides(sortedEntries, introImages, outroImages)
  slidesRef.current = slides
  const total = slides.length
  const slide = slides[index]

  const answerFontSize = (text = '') => {
    const len = text.length
    if (len < 40)  return 'clamp(56px, 9vw, 140px)'
    if (len < 70)  return 'clamp(44px, 6.5vw, 100px)'
    if (len < 100) return 'clamp(34px, 5vw, 76px)'
    return                 'clamp(26px, 3.8vw, 58px)'
  }

  return (
    <div className="show-page">
      {slide?.type === 'image' ? (
        slide.src
          ? <img key={index} src={slide.src} alt="" className="show-image-slide" />
          : <div key={index} className="show-image-slide" />
      ) : slide?.type === 'logo' ? (
        <div key={index} className="show-logo-slide">
          <div className="show-slide-tagline">
            <span className="show-slide-title">CANCIÓN</span>
            <span className="show-slide-sub">con el público</span>
          </div>
          <img src={logo} alt="Des-conectados" className="show-slide-logo" />
        </div>
      ) : (
        <>
          <div className="show-logo">
            <img src={logo} alt="Des-conectados" />
          </div>
          <div className="show-answer-section">
            <div key={index} className="show-answer-text" style={{ fontSize: answerFontSize(slide?.entry?.text) }}>
              {slide?.entry?.text}
            </div>
          </div>
        </>
      )}

      <div className="show-nav">
        <button className="show-nav-btn" onClick={() => navigate(index - 1)} disabled={index === 0}>←</button>
        <span className="show-nav-count">{index + 1} / {total}</span>
        <button className="show-nav-btn" onClick={() => navigate(index + 1)} disabled={index === total - 1}>→</button>
      </div>
    </div>
  )
}
