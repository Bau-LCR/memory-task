// Datos ILUSTRATIVOS de la cuenta de servicio. No provienen de ningún backend.
export const SERVICE_STATS: Array<[string, string]> = [['Espacios', '3'], ['Usuarios externos', '42'], ['Sectores', '5'], ['API keys', '2']]

export const SERVICE_SECTIONS: Array<{ title: string; items: string[]; action: string }> = [
  { title: 'Espacios', items: ['app-principal · 120 MB', 'staging · 8 MB'], action: 'Crear espacio' },
  { title: 'Usuarios externos', items: ['usuario-001 · activo', 'usuario-002 · activo'], action: 'Agregar usuario' },
  { title: 'Sectores', items: ['Conversaciones', 'Documentos', 'Archivos', 'Registros', 'Contexto de IA'], action: 'Crear sector' },
  { title: 'API keys', items: ['Servidor producción · mt_••••3f9a', 'Pruebas · mt_••••b1c2'], action: 'Generar clave' },
  { title: 'Integraciones', items: ['Sin integraciones configuradas'], action: 'Conectar' },
]

export const SERVICE_USAGE: Array<[string, number]> = [['Almacenamiento', 24], ['Solicitudes diarias', 41], ['Transferencia mensual', 12]]
