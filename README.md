# Memory Task

Plataforma de almacenamiento y memoria para personas (cuenta personal) y aplicaciones (cuenta de servicio). **Estado: Etapa A, frontend en modo demostración.** No hay servidor, autenticación real ni datos reales.

## Ejecutar en local

Requiere Node.js 18 o superior.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build de producción en dist/
npm run typecheck  # solo comprobación de tipos
```

## Estructura

```text
src/app/          router (hash), sesión
src/components/   ui, layout, memories
src/pages/        una página por sección
src/services/     api.ts (capa de servicios) y storage.ts (único uso de localStorage)
src/features/     datos ilustrativos de la cuenta de servicio
backend/          reservado para la API (pendiente)
```

## Qué funciona, qué es demostración y qué falta

| Función | Estado |
|---|---|
| Landing, navegación, selección de modalidad, ajustes, diseño responsive | Funciona |
| Recuerdos: crear, editar, eliminar, categorías, etiquetas, búsqueda, versiones | Funciona con datos locales del navegador |
| Archivos: seleccionar, buscar, filtrar, carpetas, mover, eliminar, cuota de 25 MB | Funciona con datos locales. No hay subida a servidor y el contenido no persiste al recargar |
| Exportar datos (JSON) y borrar datos de demostración | Funciona con datos locales |
| Inicio de sesión | Solo modo demostración, sin verificación de identidad |
| Cuenta de servicio (espacios, usuarios, sectores, API keys, consumo) | Solo ilustrativo; botones desactivados |
| Google Sign-In, términos, API, PostgreSQL, almacenamiento externo, backups, IA | Pendiente: requiere backend y servicios externos |

## Subir a un repositorio privado de GitHub

1. En GitHub: **New repository**, nombre `memory-task`, visibilidad **Private**. No agregues README ni .gitignore.
2. En la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Etapa A: frontend de Memory Task"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/memory-task.git
git push -u origin main
```

No subas `.env` ni secretos (el `.gitignore` ya los excluye). No actives facturación ni vincules tarjetas en ningún servicio.
