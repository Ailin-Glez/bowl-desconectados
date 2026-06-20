import { useState, useEffect } from 'react'
import { doc, collection, addDoc, serverTimestamp, onSnapshot } from 'firebase/firestore'
import { db, isConfigured } from '../firebase'
import logo from '../assets/logo web.png'

const DEFAULT_QUESTIONS = [
  '¿Qué dirías antes de morir?',
]

const DEFAULTS = { questions: DEFAULT_QUESTIONS, nombre: 'Des-conectados' }
const TOTAL = 1
const STEP_COLORS = ['#D85A30']

function loadSession() {
  try {
    const raw = sessionStorage.getItem('bowl-session')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveSession(data) {
  sessionStorage.setItem('bowl-session', JSON.stringify(data))
}

function clearSession() {
  sessionStorage.removeItem('bowl-session')
}

export default function AudienceView() {
  const [status, setStatus] = useState('loading') // loading | form | sending | done | error
  const [config, setConfig] = useState(DEFAULTS)
  const [questions, setQuestions] = useState([])   // 3 assigned questions
  const [answers, setAnswers] = useState([''])
  const [sending, setSending] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!isConfigured) { setStatus('error'); return }
    return onSnapshot(doc(db, 'config', 'main'), snap => {
      if (snap.exists()) setConfig({ ...DEFAULTS, ...snap.data() })
    })
  }, [])

  useEffect(() => {
    if (!isConfigured) return
    const session = loadSession()
    if (session?.questions) {
      setQuestions(session.questions)
      setAnswers(session.answers || ['', ''])
      setStep(session.step || 0)
      setStatus('form')
      return
    }
    setStatus('intro')
  }, [])

  const assignQuestions = () => {
    const qs = config.questions?.length ? config.questions : DEFAULT_QUESTIONS
    const assigned = qs.slice(0, TOTAL)
    setQuestions(assigned)
    saveSession({ questions: assigned, answers: [''], step: 0 })
    setStatus('form')
  }

  const updateAnswer = (val) => {
    const next = [...answers]
    next[step] = val
    setAnswers(next)
    const session = loadSession() || {}
    saveSession({ ...session, answers: next })
  }

  const handleNext = async () => {
    if (!isConfigured || sending) return
    setSending(true)
    try {
      await addDoc(collection(db, 'entries'), {
        text: answers[step].trim(),
        question: questions[step],
        createdAt: serverTimestamp(),
      })
      const next = step + 1
      setStep(next)
      const session = loadSession() || {}
      saveSession({ ...session, step: next })
    } catch {
      setStatus('error')
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = async () => {
    if (!isConfigured || sending) return
    setSending(true)
    try {
      await addDoc(collection(db, 'entries'), {
        text: answers[step].trim(),
        question: questions[step],
        createdAt: serverTimestamp(),
      })
      clearSession()
      setStatus('done')
    } catch {
      setStatus('error')
    } finally {
      setSending(false)
    }
  }

  const isLast = step === TOTAL - 1
  const canAdvance = answers[step].trim().length > 0

  if (!isConfigured) {
    return (
      <div className="audience-page">
        <div className="phone-frame">
          <div className="phone-header">
            <img src={logo} alt="Des-conectados" className="phone-logo-img" />
          </div>
          <div className="sent-msg">
            <div className="sent-title">No disponible</div>
            <div className="sent-sub">Esta app todavía no está conectada. Avísale al artista.</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="audience-page">
      <div className="phone-frame">
        <div className="phone-header">
          <img src={logo} alt="Des-conectados" className="phone-logo-img" />
          <div className="phone-sub">{config.nombre} · En vivo</div>
        </div>

        {status === 'loading' && <div className="loading-msg">Un momento...</div>}

        {config.submissionsClosed && status !== 'done' && (
          <div className="sent-msg">
            <div className="sent-icon" style={{ color: 'var(--accent)' }}>
              <i className="ti ti-lock" />
            </div>
            <div className="sent-title">Ya cerramos el bowl</div>
            <div className="sent-sub">
              Esta vez no llegaste a tiempo, pero gracias por estar aquí. ¡Disfruta el show!
            </div>
          </div>
        )}

        {!config.submissionsClosed && status === 'intro' && (
          <div className="intro-screen">
            <div className="intro-icon">
              <i className="ti ti-microphone-2" />
              <h2 className="intro-title">¡Eres parte del show!</h2>
            </div>
            <p className="intro-body">
              Tu respuesta será parte de la canción
              que se compone esta noche, ¡EN VIVO!
            </p>
            <p className="intro-body" style={{ color: 'var(--accent)' }}>
              Mientras más auténtica o ridícula la respuesta, MEJOR.
            </p>
            <button className="send-btn" onClick={assignQuestions}>
              Empezar <i className="ti ti-arrow-right" />
            </button>
          </div>
        )}

        {!config.submissionsClosed && status === 'form' && (
          <>
            <div className="audience-hint">
              Mientras más ridícula la respuesta, mejor. Nadie te va a juzgar (mucho).
            </div>
            <div className="question-box" style={{ background: STEP_COLORS[step], borderLeft: 'none' }}>
              <div className="question-label" style={{ color: 'rgba(255,255,255,0.75)' }}>
                Tu respuesta
              </div>
              <div className="question-text" style={{ color: '#fff' }}>{questions[step]}</div>
            </div>
            <textarea
              placeholder="Tu respuesta aquí..."
              maxLength={60}
              value={answers[step]}
              onChange={e => updateAnswer(e.target.value)}
              autoFocus
            />
            <div className="char-count">{answers[step].length}/60</div>
            {isLast ? (
              <button className="send-btn" style={{ background: STEP_COLORS[step] }} onClick={handleSubmit} disabled={!canAdvance || sending}>
                {sending ? 'Enviando...' : <><i className="ti ti-check" /> Enviar y terminar</>}
              </button>
            ) : (
              <button className="send-btn" style={{ background: STEP_COLORS[step] }} onClick={handleNext} disabled={!canAdvance || sending}>
                {sending ? 'Enviando...' : <><i className="ti ti-send" /> Enviar respuesta</>}
              </button>
            )}
          </>
        )}

        {!config.submissionsClosed && status === 'sending' && <div className="loading-msg">Enviando...</div>}

        {status === 'done' && (
          <div className="sent-msg">
            <div className="sent-icon"><i className="ti ti-music" /></div>
            <div className="sent-title">¡Ya estás en el bowl!</div>
            <div className="sent-sub">
              Tu respuesta llegó. Quedate atent@ — puede convertirse en canción esta noche.
            </div>
            <button className="again-btn" onClick={() => { clearSession(); setAnswers(['']); setStep(0); setStatus('intro') }}>
              Responder de nuevo
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="sent-msg">
            <div className="sent-icon" style={{ color: 'var(--accent)' }}>
              <i className="ti ti-alert-circle" />
            </div>
            <div className="sent-title">Algo salió mal</div>
            <div className="sent-sub">No se pudo enviar. Revisa tu conexión e intenta de nuevo.</div>
            <button className="again-btn" onClick={() => { clearSession(); assignQuestions() }}>
              Intentar de nuevo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
