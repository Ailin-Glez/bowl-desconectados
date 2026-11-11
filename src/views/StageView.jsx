import { useState, useEffect, useRef } from 'react'
import {
  collection, onSnapshot, doc, addDoc,
  deleteDoc, setDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { QRCodeSVG } from 'qrcode.react'
import { db, isConfigured } from '../firebase'
import { BUNDLED_IMAGES, DEFAULT_INTRO_KEYS, compressImage } from '../slideImages'

const DEFAULT_QUESTIONS = [
  '¿Cuál es tu refrán favorito?',
  '¿Cuál es la primera frase que dices al despertar?',
  '¿Qué comiste hoy?',
  '¿Qué cosas te molestan de los demás?',
  '¿Qué fue lo último que buscaste en Google?'
]

const DEFAULTS = { questions: DEFAULT_QUESTIONS, nombre: 'Des-conectados' }

const SAMPLE_PAIRS = [
  {
    molesta: 'Que mastiquen con la boca abierta',
    morir: 'Yo tenía razón',
  },
  {
    molesta: 'Que lleguen tarde y encima vengan de buen humor',
    morir: 'Debí haber dormido más',
  },
  {
    molesta: 'Que hablen en altavoz',
    morir: 'Ojalá hubiera comido más empanadas',
  }
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
  const entriesRef = useRef([])
  const orderLoaded = useRef(false)
  const [orderSaved, setOrderSaved] = useState(false)
  const [submissionsClosed, setSubmissionsClosed] = useState(false)

  // Inline edit
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')

  // Config form
  const [questionsText, setQuestionsText] = useState(DEFAULT_QUESTIONS.join('\n'))
  const [nombreForm, setNombreForm] = useState(DEFAULTS.nombre)
  const [savedMsg, setSavedMsg] = useState(false)
  const [copied, setCopied] = useState(false)

  // Imágenes de la proyección (intro antes de la canción)
  const [slideImages, setSlideImages] = useState([])
  const [introOrder, setIntroOrder] = useState(null) // null = usa las incluidas en la app
  const [outroOrder, setOutroOrder] = useState([])
  const [imgBusy, setImgBusy] = useState('')
  const fileInputRef = useRef(null)

  const audienceUrl = `${window.location.origin}/`

  useEffect(() => {
    if (!isConfigured) return
    return onSnapshot(collection(db, 'slideImages'), snap => {
      setSlideImages(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0))
      )
    })
  }, [])

  useEffect(() => {
    if (!isConfigured) return
    return onSnapshot(collection(db, 'entries'), snap => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      entriesRef.current = items
      setEntries(items)
      setOrder(prev => {
        const existing = new Set(prev)
        const incoming = new Set(items.map(e => e.id))
        const kept = prev.filter(id => incoming.has(id))
        const added = items.map(e => e.id).filter(id => !existing.has(id))
        return [...added, ...kept]
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
        setSubmissionsClosed(d.submissionsClosed ?? false)
        setIntroOrder(Array.isArray(d.introSlides) ? d.introSlides : null)
        setOutroOrder(Array.isArray(d.outroSlides) ? d.outroSlides : [])
        if (!orderLoaded.current && d.entryOrder?.length) {
          orderLoaded.current = true
          const all = entriesRef.current
          const inSaved = new Set(d.entryOrder)
          const kept = d.entryOrder.filter(id => all.find(e => e.id === id))
          const added = all.filter(e => !inSaved.has(e.id)).map(e => e.id)
          setOrder([...added, ...kept])
        }
      }
    })
  }, [])

  const addSample = async () => {
    if (!isConfigured) return
    const questions = config.questions.length ? config.questions : DEFAULT_QUESTIONS
    const pair = rand(SAMPLE_PAIRS)
    await Promise.all([
      addDoc(collection(db, 'entries'), { text: pair.molesta, question: questions[0], createdAt: serverTimestamp() }),
      addDoc(collection(db, 'entries'), { text: pair.morir,   question: questions[1] ?? questions[0], createdAt: serverTimestamp() }),
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

  const saveOrder = async () => {
    if (!isConfigured) return
    await setDoc(doc(db, 'config', 'main'), { entryOrder: order }, { merge: true })
    setOrderSaved(true)
    setTimeout(() => setOrderSaved(false), 2000)
  }

  const toggleSubmissions = async () => {
    if (!isConfigured) return
    await setDoc(doc(db, 'config', 'main'), { submissionsClosed: !submissionsClosed }, { merge: true })
  }

  // ── Imágenes de la proyección ──
  // field: 'introSlides' (antes de la canción) | 'outroSlides' (después)
  const listFor = (field) => field === 'introSlides' ? (introOrder ?? []) : outroOrder

  const saveList = (field, arr) => {
    if (field === 'introSlides') setIntroOrder(arr)
    else setOutroOrder(arr)
    return setDoc(doc(db, 'config', 'main'), { [field]: arr }, { merge: true })
  }

  const uploadImage = async (name, source) => {
    const data = await compressImage(source)
    const ref = await addDoc(collection(db, 'slideImages'), { name, data, createdAt: serverTimestamp() })
    return ref.id
  }

  // Sube las imágenes incluidas en la app con el orden por defecto (1→6, 2)
  const importBundled = async () => {
    setImgBusy('Importando imágenes…')
    try {
      const ids = {}
      for (const img of BUNDLED_IMAGES) {
        ids[img.key] = await uploadImage(img.name, img.src)
      }
      await saveList('introSlides', DEFAULT_INTRO_KEYS.map(k => ids[k]))
    } finally {
      setImgBusy('')
    }
  }

  // Las imágenes nuevas quedan en "Todas las imágenes"; desde ahí se suman a cada lista
  const onFilesSelected = async (e) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!files.length) return
    try {
      if (introOrder === null) await importBundled()
      for (const [i, file] of files.entries()) {
        setImgBusy(`Subiendo ${i + 1} de ${files.length}…`)
        await uploadImage(file.name.replace(/\.[^.]+$/, ''), file)
      }
    } catch (err) {
      alert(err.message)
    } finally {
      setImgBusy('')
    }
  }

  const moveInList = (field, idx, dir) => {
    const list = listFor(field)
    const next = idx + dir
    if (next < 0 || next >= list.length) return
    const arr = [...list]
    ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
    saveList(field, arr)
  }

  const removeFromList = (field, idx) => saveList(field, listFor(field).filter((_, i) => i !== idx))

  const addToList = (field, id) => saveList(field, [...listFor(field), id])

  const deleteImage = async (img) => {
    if (!confirm(`¿Borrar "${img.name}" definitivamente?`)) return
    await Promise.all([
      saveList('introSlides', (introOrder ?? []).filter(id => id !== img.id)),
      saveList('outroSlides', outroOrder.filter(id => id !== img.id)),
    ])
    await deleteDoc(doc(db, 'slideImages', img.id))
  }

  const renderSlideList = (field, emptyText) => {
    const list = listFor(field)
    return (
      <div className="queue-list">
        {list.length === 0 && (
          <div className="empty-state" style={{ padding: '0.75rem' }}>{emptyText}</div>
        )}
        {list.map((id, idx) => {
          const img = slideImages.find(i => i.id === id)
          if (!img) return null
          return (
            <div key={`${id}-${idx}`} className="queue-item">
              <div className="queue-item-num">{idx + 1}</div>
              <img src={img.data} alt="" className="slide-thumb" />
              <div style={{ flex: 1 }}>{img.name}</div>
              <div className="queue-actions">
                <button className="ctrl-btn" style={{ padding: '4px 6px' }} onClick={() => moveInList(field, idx, -1)} disabled={idx === 0} title="Subir">
                  <i className="ti ti-chevron-up" />
                </button>
                <button className="ctrl-btn" style={{ padding: '4px 6px' }} onClick={() => moveInList(field, idx, 1)} disabled={idx === list.length - 1} title="Bajar">
                  <i className="ti ti-chevron-down" />
                </button>
                <button className="ctrl-btn" style={{ padding: '4px 6px', color: 'var(--accent)' }} onClick={() => removeFromList(field, idx)} title="Quitar de la proyección">
                  <i className="ti ti-x" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    )
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

  const downloadQR = () => {
    const svg = document.querySelector('#qr-box svg')
    if (!svg) return
    const size = 600
    const xml = new XMLSerializer().serializeToString(svg)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(img, 0, 0, size, size)
      const a = document.createElement('a')
      a.download = 'qr-desconectados.png'
      a.href = canvas.toDataURL('image/png')
      a.click()
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(new TextDecoder('latin1').decode(new TextEncoder().encode(xml)))
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
        {/* Action bar */}
        <div className="action-bar">
          <a href="/show" target="_blank" className="action-btn">
            <i className="ti ti-presentation" />
            Proyección
          </a>
          <button
            className={`action-btn ${submissionsClosed ? 'danger' : ''}`}
            onClick={toggleSubmissions}
          >
            <i className={`ti ti-${submissionsClosed ? 'player-play' : 'player-stop'}`} />
            {submissionsClosed ? 'Abrir bowl' : 'Cerrar bowl'}
          </button>
          <button
            className={`action-btn ${orderSaved ? 'highlight' : ''}`}
            onClick={saveOrder}
            disabled={!order.length}
          >
            <i className={`ti ti-${orderSaved ? 'check' : 'send'}`} />
            {orderSaved ? '¡Proyectando!' : 'Actualizar proyección'}
          </button>
        </div>

        {/* Nav tabs */}
        <div className="tabs">
          <button className={`tab ${activeTab === 'stage' ? 'active' : ''}`} onClick={() => setActiveTab('stage')}>
            <i className="ti ti-device-tv" /> Respuestas
          </button>
          <button className={`tab ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
            <i className="ti ti-settings" /> Configurar
          </button>
          <button className={`tab ${activeTab === 'images' ? 'active' : ''}`} onClick={() => setActiveTab('images')}>
            <i className="ti ti-photo" /> Imágenes
          </button>
        </div>

        {activeTab === 'stage' && (
          <div className="stage-wrap">
            {/* QR oculto para descarga */}
            <div id="qr-box" style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>
              <QRCodeSVG value={audienceUrl} size={156} bgColor="#ffffff" fgColor="#111111" />
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
              <div className="stage-title"><i className="ti ti-settings" /> Pregunta del bowl</div>
            </div>
            <div className="config-section">
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

              <div className="config-title" style={{ marginTop: 20 }}><i className="ti ti-link" /> Link del público</div>
              <div className="config-label">{audienceUrl}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="ctrl-btn" onClick={copyUrl}>
                  <i className={`ti ti-${copied ? 'check' : 'copy'}`} />
                  {copied ? 'Copiado' : 'Copiar link'}
                </button>
                <button className="ctrl-btn" onClick={downloadQR}>
                  <i className="ti ti-download" /> Descargar QR
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Images tab */}
        {activeTab === 'images' && (
          <div className="stage-wrap">
            <div className="stage-header">
              <div className="stage-title"><i className="ti ti-photo" /> Imágenes de la proyección</div>
              <div className="stage-count">Se muestran antes de la canción</div>
            </div>

            <div className="stage-controls">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={onFilesSelected}
              />
              <button className="ctrl-btn primary" onClick={() => fileInputRef.current?.click()} disabled={!!imgBusy}>
                <i className="ti ti-upload" /> Subir imágenes
              </button>
              {imgBusy && <span className="stage-count">{imgBusy}</span>}
            </div>

            {introOrder === null ? (
              <div className="empty-state" style={{ padding: '0.75rem' }}>
                Ahora se proyectan las imágenes incluidas en la app (1 a 6 y otra vez la 2).
                Importalas para poder ordenarlas, quitarlas o sumar nuevas.
                <div style={{ marginTop: 10 }}>
                  <button className="ctrl-btn" onClick={() => importBundled().catch(err => alert(err.message))} disabled={!!imgBusy}>
                    <i className="ti ti-download" /> Importar imágenes actuales
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="config-title"><i className="ti ti-player-skip-back" /> Antes de la canción</div>
                {renderSlideList('introSlides', 'Sin imágenes: la proyección empieza directo con la canción.')}

                <div className="config-title" style={{ marginTop: 20 }}><i className="ti ti-player-skip-forward" /> Después de la canción</div>
                <div className="config-label">Se muestran después de la última frase del público.</div>
                {renderSlideList('outroSlides', 'Sin imágenes: la proyección termina con la última frase.')}

                <div className="config-title" style={{ marginTop: 20 }}><i className="ti ti-library-photo" /> Todas las imágenes</div>
                <div className="config-label">Sumá una imagen al final de cada lista (se puede repetir) o borrala del todo.</div>
                <div className="queue-list">
                  {slideImages.map(img => (
                    <div key={img.id} className="queue-item">
                      <img src={img.data} alt="" className="slide-thumb" />
                      <div style={{ flex: 1 }}>{img.name}</div>
                      <div className="queue-actions">
                        <button className="ctrl-btn" style={{ padding: '4px 8px' }} onClick={() => addToList('introSlides', img.id)} title="Agregar antes de la canción">
                          <i className="ti ti-plus" /> Antes
                        </button>
                        <button className="ctrl-btn" style={{ padding: '4px 8px' }} onClick={() => addToList('outroSlides', img.id)} title="Agregar después de la canción">
                          <i className="ti ti-plus" /> Después
                        </button>
                        <button className="ctrl-btn" style={{ padding: '4px 6px', color: 'var(--accent)' }} onClick={() => deleteImage(img)} title="Borrar imagen">
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
