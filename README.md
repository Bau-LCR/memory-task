# Memory Task

Plataforma de almacenamiento y memoria para personas (cuenta personal) y aplicaciones (cuenta de servicio). **Estado:** el frontend y el código de backend están en desarrollo. Las funciones y migraciones existen en el repositorio, pero su funcionamiento en producción depende de aplicarlas y desplegarlas en Supabase. Ver [`PROGRESS.md`](PROGRESS.md). No se debe asumir que una función está activa solo porque exista su código.

## Ejecutar en local

Requiere Node.js 20.19 o superior, o 22.12 o superior (ver `.nvmrc`).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build de producción en dist/
npm run typecheck  # solo comprobación de tipos
npm test           # pruebas (Vitest + Testing Library)
```

## Estructura

```text
src/app/          router (hash), sesión
src/components/   ui, layout, memories
src/pages/        una página por sección
src/services/     api.ts (capa de servicios) y storage.ts (único uso de localStorage)
src/features/     componentes auxiliares de la cuenta de servicio
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
| Cuenta de servicio (aplicaciones, identidad ES256, API keys, consumo y explorador) | Interfaz conectada a `service-console`; requiere migraciones y despliegue de la función. La API externa requiere además desplegar `service-api` con Verify JWT desactivado |
| Google Sign-In, términos, PostgreSQL, almacenamiento externo, IA y backups | Requieren completar la configuración y el despliegue de cada servicio externo |

## Despliegue automático (GitHub Pages)

Cada push a `main` ejecuta `.github/workflows/deploy.yml`: instala, comprueba tipos, corre las pruebas, compila y publica en
`https://bau-lcr.github.io/memory-task/`. En ramas y pull requests corre `.github/workflows/ci.yml` (sin publicar).

Activación, una sola vez: en GitHub, **Settings → Pages → Build and deployment → Source: GitHub Actions**.

El sitio usa rutas relativas (`base: './'`) y un router por hash, por lo que funciona en el subdirectorio `/memory-task/` y también en un dominio propio.

## Seguridad del repositorio

El repositorio es público: todo lo que se suba es visible. No subas `.env` ni secretos (el `.gitignore` ya los excluye) y no actives
facturación ni vincules tarjetas en ningún servicio. Todo lo que empiece con `VITE_` queda visible en el navegador.
