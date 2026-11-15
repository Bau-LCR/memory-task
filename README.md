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


## Vincular con Cut-real

La pestaña **Conectar Cut-real** utiliza un emparejamiento temporal entre servidores:

1. En Cut-real → Administración → Memory Task, generá un código temporal.
2. En Memory Task → Servicios → Conectar Cut-real, pegá el código y pulsá **Vincular ahora**.
3. Memory Task crea o reutiliza una aplicación de servicio, registra la clave pública ES256 y genera una API key con permisos `records:read` y `records:write`.
4. Memory Task entrega las credenciales directamente al endpoint de vinculación de Cut-real mediante una solicitud servidor a servidor.
5. Cut-real cifra y conserva la API key y la identidad privada en su propia base de datos. Las claves privadas y API keys no se muestran ni se envían al navegador.

El código temporal vence a los 10 minutos y solo puede utilizarse una vez. Si el intercambio falla, generá un código nuevo. Si una aplicación ya tiene otra identidad registrada, el flujo automático crea una aplicación independiente para no romper la identidad anterior.

La vinculación requiere que estén desplegadas las funciones `service-console`, `service-api` y `memory-task-pairing` en sus respectivos proyectos, además de las migraciones nuevas de Cut-real. Los workflows `deploy-supabase.yml` y `deploy-memory-task.yml` automatizan el despliegue al integrar los cambios en `main`. Para habilitarlos, agregá el secreto de repositorio `SUPABASE_ACCESS_TOKEN` en Memory Task; en Cut-real agregá `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD`. Son secretos de GitHub Actions: no los agregues al código ni los compartas. El despliegue del frontend por GitHub Pages, por sí solo, no despliega funciones ni aplica migraciones.

## Despliegue automático (GitHub Pages)

Cada push a `main` ejecuta `.github/workflows/deploy.yml`: instala, comprueba tipos, corre las pruebas, compila y publica en
`https://bau-lcr.github.io/memory-task/`. En ramas y pull requests corre `.github/workflows/ci.yml` (sin publicar).

Activación, una sola vez: en GitHub, **Settings → Pages → Build and deployment → Source: GitHub Actions**.

El sitio usa rutas relativas (`base: './'`) y un router por hash, por lo que funciona en el subdirectorio `/memory-task/` y también en un dominio propio.

## Seguridad del repositorio

El repositorio es público: todo lo que se suba es visible. No subas `.env` ni secretos (el `.gitignore` ya los excluye) y no actives
facturación ni vincules tarjetas en ningún servicio. Todo lo que empiece con `VITE_` queda visible en el navegador.
