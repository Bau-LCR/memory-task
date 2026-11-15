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

La consola de cuenta de servicio incluye la pestaña **Conectar Cut-real**. El flujo recomendado es:

1. En **Aplicaciones y datos**, crear una aplicación llamada Cut-real si todavía no existe.
2. En el administrador de Cut-real, abrir **Memory Task** y generar un par de identidad ES256.
3. Copiar únicamente la clave pública JWK y pegarla en **Cuenta de servicio → Conectar Cut-real**. Si la aplicación ya tenía otra clave pública, actualizarla solo cuando también se vaya a utilizar la nueva clave privada correspondiente.
4. Generar desde Memory Task una clave API para Cut-real con permisos `records:read` y `records:write`. La clave completa se muestra una sola vez.
5. Copiar la URL de API, el ID de aplicación y la clave API a la pestaña **Administración → Memory Task** de Cut-real.
6. En Cut-real, descargar el archivo local de secretos, guardarlo en la raíz del repositorio y ejecutar:

```bash
npx supabase secrets set --env-file memory-task-secrets.env
```

7. Volver a Cut-real, actualizar el estado y usar **Probar conexión**. La prueba crea y elimina un registro temporal.

La clave privada ES256 se conserva únicamente en los secretos del servidor de Cut-real. Nunca se pega en Memory Task, GitHub, el frontend ni un chat. El archivo `memory-task-secrets.env` está excluido por `.gitignore`; eliminá la copia local después de cargar los secretos.

La conexión real requiere que las migraciones estén aplicadas y que `service-console` y `service-api` estén desplegadas en el proyecto Supabase de Memory Task. Si todavía no lo hiciste, desde la raíz del repositorio y con el proyecto correcto vinculado ejecutá `npx supabase db push` y luego `npx supabase functions deploy service-console service-api`. El despliegue del frontend por GitHub Pages no despliega esas funciones.

## Despliegue automático (GitHub Pages)

Cada push a `main` ejecuta `.github/workflows/deploy.yml`: instala, comprueba tipos, corre las pruebas, compila y publica en
`https://bau-lcr.github.io/memory-task/`. En ramas y pull requests corre `.github/workflows/ci.yml` (sin publicar).

Activación, una sola vez: en GitHub, **Settings → Pages → Build and deployment → Source: GitHub Actions**.

El sitio usa rutas relativas (`base: './'`) y un router por hash, por lo que funciona en el subdirectorio `/memory-task/` y también en un dominio propio.

## Seguridad del repositorio

El repositorio es público: todo lo que se suba es visible. No subas `.env` ni secretos (el `.gitignore` ya los excluye) y no actives
facturación ni vincules tarjetas en ningún servicio. Todo lo que empiece con `VITE_` queda visible en el navegador.
