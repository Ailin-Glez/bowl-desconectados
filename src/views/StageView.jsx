import { useState, useEffect } from 'react'
import {
  collection, onSnapshot, doc, addDoc,
  deleteDoc, setDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { QRCodeSVG } from 'qrcode.react'
import { db, isConfigured } from '../firebase'

const DEFAULT_QUESTIONS = [
  '¿Cuál es tu refrán favorito?',
  '¿Cuál es la primera frase que dices al despertar?',
  '¿Qué comiste hoy?',
  '¿Qué cosas te molestan de los demás?',
  '¿Qué fue lo último que buscaste en Google?'
]

const DEFAULTS = { questions: DEFAULT_QUESTIONS, nombre: 'Des-conectados' }

const SAMPLE_RESPUESTAS = [
  'Tres empanadas frías y mucho arrepentimiento',
  'Mi vecino y una paloma muy sospechosa',
  'El precio del aguacate en el supermercado',
  'Porque el wifi nunca funciona cuando más lo necesito',
  'Una playlist de Ed Sheeran y mucho llanto',
  'Básicamente nada, y eso es lo peor',
]

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

export default function StageView() {
  const [activeTab, setActiveTab] = useState('stage')
  const [entries, setEntries] = useState([])
  const [config, setConfig] = useState(DEFAULTS)

  // Manual order (array of IDs)
  const [order, setOrder] = useState([])

  // Inline edit
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')

  // Config form
  const [questionsText, setQuestionsText] = useState(DEFAULT_QUESTIONS.join('\n'))
  const [nombreForm, setNombreForm] = useState(DEFAULTS.nombre)
  const [savedMsg, setSavedMsg] = useState(false)
  const [copied, setCopied] = useState(false)

  const audienceUrl = `${window.location.origin}/`

  useEffect(() => {
    if (!isConfigured) return
    return onSnapshot(collection(db, 'entries'), snap => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
      setEntries(items)
      setOrder(prev => {
        const existing = new Set(prev)
        const incoming = new Set(items.map(e => e.id))
        const kept = prev.filter(id => incoming.has(id))
        const added = items.map(e => e.id).filter(id => !existing.has(id))
        return [...kept, ...added]
      })
    })
  }, [])

  useEffect(() => {
    if (!isConfigured) return
    return onSnapshot(doc(db, 'config', 'main'), snap => {
      if (snap.exists()) {
        const d = snap.data()
        const questions = d.questions?.length ? d.questions : DEFAULT_QUESTIONS
        const nombre = d.nombre || DEFAULTS.nombre
        setConfig({ questions, nombre })
        setQuestionsText(questions.join('\n'))
        setNombreForm(nombre)
      }
    })
  }, [])

  const addSample = async () => {
    if (!isConfigured) return
    const questions = config.questions.length ? config.questions : DEFAULT_QUESTIONS
    const q1 = questions[0]
    const q2 = questions.length > 1 ? questions[1] : questions[0]
    await Promise.all([
      addDoc(collection(db, 'entries'), { text: rand(SAMPLE_RESPUESTAS), question: q1, createdAt: serverTimestamp() }),
      addDoc(collection(db, 'entries'), { text: rand(SAMPLE_RESPUESTAS), question: q2, createdAt: serverTimestamp() }),
    ])
  }

  const clearAll = async () => {
    if (!isConfigured) return
    if (!confirm('¿Limpiar todas las entradas?')) return
    await Promise.all(entries.map(e => deleteDoc(doc(db, 'entries', e.id))))
  }

  const saveConfig = async () => {
    if (!isConfigured) return
    const questions = questionsText.split('\n').map(q => q.trim()).filter(Boolean)
    await setDoc(doc(db, 'config', 'main'), { questions, nombre: nombreForm }, { merge: true })
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 2000)
  }

  const moveEntry = (id, dir) => {
    setOrder(prev => {
      const idx = prev.indexOf(id)
      const next = idx + dir
      if (next < 0 || next >= prev.length) return prev
      const arr = [...prev]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr
    })
  }

  const deleteEntry = async (id) => {
    await deleteDoc(doc(db, 'entries', id))
  }

  const startEdit = (entry) => {
    setEditingId(entry.id)
    setEditText(entry.text)
  }

  const saveEdit = async (id) => {
    if (!editText.trim()) return
    await updateDoc(doc(db, 'entries', id), { text: editText.trim() })
    setEditingId(null)
  }

  const copyUrl = () => {
    navigator.clipboard.writeText(audienceUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isConfigured) {
    return (
      <div className="stage-page">
        <div className="setup-screen">
          <div className="phone-logo" style={{ marginBottom: 20 }}>Des-conectados</div>
          <h2>Configuración inicial</h2>
          <p>Crea un proyecto en <strong>Firebase Console</strong>, habilita Firestore y copia las credenciales en el archivo <code>.env</code>.</p>
          <div className="setup-code">
            VITE_FIREBASE_API_KEY=...<br />
            VITE_FIREBASE_PROJECT_ID=...<br />
            VITE_FIREBASE_APP_ID=...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="stage-page">
      <div className="container">
        <div className="tabs">
          <button className={`tab ${activeTab === 'stage' ? 'active' : ''}`} onClick={() => setActiveTab('stage')}>
            <i className="ti ti-device-tv" /> Vista escenario
          </button>
          <button className={`tab ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
            <i className="ti ti-settings" /> Configurar
          </button>
          <a href="/show" target="_blank" className="tab" style={{ textDecoration: 'none' }}>
            <i className="ti ti-presentation" /> Proyección
          </a>
        </div>

        {activeTab === 'stage' && (
          <div className="stage-wrap">
            {/* QR */}
            <div className="qr-section">
              <div className="qr-box">
                <QRCodeSVG value={audienceUrl} size={156} bgColor="#ffffff" fgColor="#111111" />
              </div>
              <div className="qr-url">{audienceUrl}</div>
              <div className="qr-actions">
                <button className="ctrl-btn" onClick={copyUrl}>
                  <i className={`ti ti-${copied ? 'check' : 'copy'}`} />
                  {copied ? 'Copiado' : 'Copiar link'}
                </button>
              </div>
              <div className="qr-hint">
                El público responde preguntas — sus respuestas aparecen abajo en tiempo real
              </div>
            </div>

            {/* Controls */}
            <div className="stage-header">
              <div className="stage-title"><i className="ti ti-messages" /> Respuestas del público</div>
              <div className="stage-count">{entries.length} {entries.length === 1 ? 'respuesta' : 'respuestas'}</div>
            </div>
            <div className="stage-controls">
              <button className="ctrl-btn primary" onClick={addSample}>
                <i className="ti ti-plus" /> Agregar ejemplo
              </button>
              <button className="ctrl-btn" onClick={clearAll} disabled={!entries.length}>
                <i className="ti ti-trash" /> Limpiar todo
              </button>
            </div>

            {/* Queue */}
            <div className="queue-section">
              <div className="queue-list">
                {entries.length === 0 ? (
                  <div className="empty-state" style={{ padding: '0.75rem' }}>
                    <i className="ti ti-music" style={{ fontSize: 28, display: 'block', marginBottom: 8 }} />
                    Sin respuestas todavía. Esperá que el público participe o agregá ejemplos.
                  </div>
                ) : (
                  order
                    .map(id => entries.find(e => e.id === id))
                    .filter(Boolean)
                    .map((entry, idx) => (
                    <div key={entry.id} className="queue-item">
                      {editingId === entry.id ? (
                        <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            className="config-input"
                            style={{ flex: 1, fontSize: 13, padding: '4px 8px' }}
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveEdit(entry.id)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            autoFocus
                          />
                          <button className="ctrl-btn primary" style={{ padding: '4px 8px' }} onClick={() => saveEdit(entry.id)}>
                            <i className="ti ti-check" />
                          </button>
                          <button className="ctrl-btn" style={{ padding: '4px 8px' }} onClick={() => setEditingId(null)}>
                            <i className="ti ti-x" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="queue-item-num">{idx + 1}</div>
                          <div style={{ flex: 1 }}>
                            <div>{entry.text}</div>
                            {entry.question && (
                              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
                                Respondía: {entry.question}
                              </div>
                            )}
                          </div>
                          <div className="queue-actions">
                            <button className="ctrl-btn" style={{ padding: '4px 6px' }} onClick={() => moveEntry(entry.id, -1)} disabled={idx === 0} title="Subir">
                              <i className="ti ti-chevron-up" />
                            </button>
                            <button className="ctrl-btn" style={{ padding: '4px 6px' }} onClick={() => moveEntry(entry.id, 1)} disabled={idx === order.length - 1} title="Bajar">
                              <i className="ti ti-chevron-down" />
                            </button>
                            <button className="ctrl-btn" style={{ padding: '4px 6px' }} onClick={() => startEdit(entry)} title="Editar">
                              <i className="ti ti-pencil" />
                            </button>
                            <button className="ctrl-btn" style={{ padding: '4px 6px', color: 'var(--accent)' }} onClick={() => deleteEntry(entry.id)} title="Eliminar">
                              <i className="ti ti-trash" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Config tab */}
        {activeTab === 'config' && (
          <div className="stage-wrap">
            <div className="stage-header">
              <div className="stage-title"><i className="ti ti-settings" /> Configuración del bowl</div>
            </div>
            <div className="config-section">
              <div className="config-title"><i className="ti ti-list" /> Preguntas banales</div>
              <div className="config-label">
                Una por línea — el público las recibe en rotación sin saber la pregunta real
              </div>
              <textarea
                style={{ minHeight: 180, marginBottom: 0 }}
                value={questionsText}
                onChange={e => setQuestionsText(e.target.value)}
                placeholder={'¿Qué marca de shampoo usás?\n¿Qué comiste hoy?\n...'}
              />
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, marginBottom: 8 }}>
                {questionsText.split('\n').filter(q => q.trim()).length} preguntas configuradas
              </div>

              <div className="config-title"><i className="ti ti-palette" /> Nombre del show</div>
              <div className="config-label">Aparece en la pantalla del público</div>
              <input
                type="text"
                className="config-input"
                value={nombreForm}
                onChange={e => setNombreForm(e.target.value)}
              />

              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button className="save-btn" onClick={saveConfig}>Guardar cambios</button>
                {savedMsg && <span className="saved-msg">¡Guardado!</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
