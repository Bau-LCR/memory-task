export const fmtSize = (b: number) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })

export const FILE_CATEGORIES = ['Imágenes', 'Documentos', 'Audio y video', 'Código', 'Otros']

export function categoryOf(name: string, type: string): string {
  if (type.startsWith('image/')) return 'Imágenes'
  if (type.startsWith('audio/') || type.startsWith('video/')) return 'Audio y video'
  if (/\.(pdf|docx?|txt|md|odt|xlsx?|pptx?)$/i.test(name)) return 'Documentos'
  if (/\.(js|ts|tsx|jsx|py|java|c|cpp|go|rs|json|html|css|sql|ya?ml)$/i.test(name)) return 'Código'
  return 'Otros'
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
