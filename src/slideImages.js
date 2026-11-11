import img1 from './assets/1-Desconectados QR.png'
import img2 from './assets/2-Fondo.png'
import img3 from './assets/3-Manu.png'
import img4 from './assets/4-Tarek.png'
import img5 from './assets/5-Pato.png'
import img6 from './assets/6-Ailin.png'

// Imágenes incluidas en la app. Se usan como intro mientras no se configure
// nada desde el admin, y se pueden importar a Firestore con un botón.
export const BUNDLED_IMAGES = [
  { key: '1', name: '1-Desconectados QR', src: img1 },
  { key: '2', name: '2-Fondo', src: img2 },
  { key: '3', name: '3-Manu', src: img3 },
  { key: '4', name: '4-Tarek', src: img4 },
  { key: '5', name: '5-Pato', src: img5 },
  { key: '6', name: '6-Ailin', src: img6 },
]

// Orden por defecto: 1 → 6, luego vuelve a la 2 antes de la canción
export const DEFAULT_INTRO_KEYS = ['1', '2', '3', '4', '5', '6', '2']

export const BUNDLED_INTRO = DEFAULT_INTRO_KEYS.map(
  k => BUNDLED_IMAGES.find(i => i.key === k).src
)

// Firestore admite documentos de hasta 1 MiB; dejamos margen.
const MAX_DATA_URL_LENGTH = 900_000
const MAX_SIDE = 1920
const BG = '#0f0f0f'

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo leer la imagen'))
    img.src = src
  })
}

// Recibe un File/Blob o una URL y devuelve un data URL JPEG comprimido.
export async function compressImage(input) {
  const objectUrl = typeof input === 'string' ? null : URL.createObjectURL(input)
  try {
    const img = await loadImage(objectUrl ?? input)
    let scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))

    for (let attempt = 0; attempt < 6; attempt++) {
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = BG // fondo para PNG con transparencia
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)

      for (const quality of [0.85, 0.75, 0.65]) {
        const data = canvas.toDataURL('image/jpeg', quality)
        if (data.length <= MAX_DATA_URL_LENGTH) return data
      }
      scale *= 0.8
    }
    throw new Error('La imagen es demasiado grande')
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}
