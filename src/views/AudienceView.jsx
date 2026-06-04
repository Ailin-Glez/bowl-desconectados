import { useState, useEffect } from 'react'
import { doc, runTransaction, collection, writeBatch, serverTimestamp, onSnapshot } from 'firebase/firestore'
import { db, isConfigured } from '../firebase'
import logo from '../assets/logo web.png'

const DEFAULT_QUESTIONS = [
  '¿Qué marca de shampoo usas?',
  '¿Cuál es la primera frase que dices al despertar?',
  '¿Qué comiste hoy?',
  '¿Qué ves cuando miras por la ventana?',
]

const DEFAULTS = { questions: DEFAULT_QUESTIONS, nombre: 'Des-conectados' }
const TOTAL = 3

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
  const [answers, setAnswers] = useState(['', '', ''])
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
    if (session?.done) { setStatus('done'); return }
    if (session?.questions) {
      setQuestions(session.questions)
      setAnswers(session.answers || ['', '', ''])
      setStep(session.step || 0)
      setStatus('form')
      return
    }
    setStatus('intro')
  }, [])

  const assignQuestions = async () => {
    try {
      const configRef = doc(db, 'config', 'main')
      const assigned = await runTransaction(db, async tx => {
        const snap = await tx.get(configRef)
        let counter, qs
        if (!snap.exists()) {
          counter = 1; qs = DEFAULT_QUESTIONS
          tx.set(configRef, { ...DEFAULTS, counter })
        } else {
          counter = (snap.data().counter ?? 0) + 1
          qs = snap.data().questions?.length ? snap.data().questions : DEFAULT_QUESTIONS
          tx.update(configRef, { counter })
        }
        const start = (counter - 1) % qs.length
        return Array.from({ length: TOTAL }, (_, i) => qs[(start + i) % qs.length])
      })
      setQuestions(assigned)
      saveSession({ questions: assigned, answers: ['', '', ''], step: 0 })
      setStatus('form')
    } catch {
      const fallback = DEFAULT_QUESTIONS.slice(0, TOTAL)
      setQuestions(fallback)
      saveSession({ questions: fallback, answers: ['', '', ''], step: 0 })
      setStatus('form')
    }
  }

  const updateAnswer = (val) => {
    const next = [...answers]
    next[step] = val
    setAnswers(next)
    const session = loadSession() || {}
    saveSession({ ...session, answers: next })
  }

  const handleNext = () => {
    const next = step + 1
    setStep(next)
    const session = loadSession() || {}
    saveSession({ ...session, step: next })
  }

  const handleSubmit = async () => {
    if (!isConfigured) return
    setStatus('sending')
    try {
      const batch = writeBatch(db)
      const colRef = collection(db, 'entries')
      questions.forEach((q, i) => {
        const ref = doc(colRef)
        batch.set(ref, { text: answers[i].trim(), question: q, createdAt: serverTimestamp() })
      })
      await batch.commit()
      clearSession()
      saveSession({ done: true })
      setStatus('done')
    } catch {
      setStatus('error')
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

        {status === 'intro' && (
          <div className="intro-screen">
            <div className="intro-icon">
              <i className="ti ti-microphone-2" />
              <h2 className="intro-title">¡Eres parte del show!</h2>
            </div>
            <p className="intro-body">
              Responde <strong>3 preguntas cortas</strong>. No hay respuestas correctas —
              solo honestas, raras o absurdas.
            </p>
            <p className="intro-body">
              Tus respuestas serán parte de la canción
              que se compone <em>esta noche</em>, ¡en vivo!
            </p>
            <p className="intro-body" style={{ color: 'var(--accent)' }}>
              Mientras más auténtica o ridícula la respuesta, MEJOR.
            </p>
            <button className="send-btn" onClick={assignQuestions}>
              Empezar <i className="ti ti-arrow-right" />
            </button>
          </div>
        )}

        {status === 'form' && (
          <>
            <div className="audience-hint">
              Mientras más ridícula la respuesta, mejor. Nadie te va a juzgar (mucho).
            </div>
            <div className="question-box">
              <div className="question-label">
                Pregunta {step + 1} de {TOTAL}
                <span className="step-dots">
                  {Array.from({ length: TOTAL }, (_, i) => (
                    <span key={i} className={`step-dot ${i <= step ? 'active' : ''}`} />
                  ))}
                </span>
              </div>
              <div className="question-text">{questions[step]}</div>
            </div>
            <textarea
              placeholder="Tu respuesta aquí..."
              maxLength={120}
              value={answers[step]}
              onChange={e => updateAnswer(e.target.value)}
              autoFocus
            />
            <div className="char-count">{answers[step].length}/120</div>
            {isLast ? (
              <button className="send-btn" onClick={handleSubmit} disabled={!canAdvance}>
                Enviar todo <i className="ti ti-send" />
              </button>
            ) : (
              <button className="send-btn" onClick={handleNext} disabled={!canAdvance}>
                Siguiente <i className="ti ti-arrow-right" />
              </button>
            )}
          </>
        )}

        {status === 'sending' && <div className="loading-msg">Enviando...</div>}

        {status === 'done' && (
          <div className="sent-msg">
            <div className="sent-icon"><i className="ti ti-music" /></div>
            <div className="sent-title">¡Ya estás en el bowl!</div>
            <div className="sent-sub">
              Tus {TOTAL} respuestas llegaron. Quédate atent@ — pueden convertirse en canción.
            </div>
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
