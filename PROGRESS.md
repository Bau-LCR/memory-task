# Registro de progreso — Memory Task

Última actualización: 10-nov-2026. Etapa actual: **1 de 12 completada**.

## Etapa 1 — Auditoría y reparación del frontend

Se auditó el repositorio `Bau-LCR/memory-task` (rama `main`, 32 archivos, ~830 líneas). No se recibió ZIP; se trabajó sobre el repositorio.
No se eliminó ningún archivo ni funcionalidad existente.

### Hallazgos y qué se hizo

| # | Hallazgo | Gravedad | Acción |
|---|---|---|---|
| 1 | El build generaba rutas absolutas (`/assets/...`, `/favicon.svg`). En `bau-lcr.github.io/memory-task/` el JS y el CSS darían 404 y la página quedaría en blanco. | Alta | `base: './'` en `vite.config.ts`. Verificado sirviendo `dist` bajo `/memory-task/`: los 4 recursos responden 200. |
| 2 | No existía `package-lock.json`: `npm ci` (usado por CI) falla sin él y las versiones no eran reproducibles. | Alta | Se agrega el archivo de bloqueo. |
| 3 | `npm audit`: 2 vulnerabilidades (1 alta, 1 moderada) en Vite/esbuild (servidor de desarrollo). | Media | Vite 5→8.3.7 y plugin-react 4→6.3.0. `npm audit`: 0. Exige Node ≥ 20.19 / 22.12 (documentado, `engines` y `.nvmrc`). |
| 4 | Si `localStorage` está lleno o bloqueado, las escrituras lanzaban una excepción sin manejar (en Archivos, error silencioso). | Media | `localKV.set` lanza un error comprensible; `FilesPage` lo muestra. |
| 5 | El registro de actividad podía abortar una operación ya guardada y mostrar un error falso. | Baja | `log()` es de mejor esfuerzo. |
| 6 | Al fallar el guardado de archivos quedaba contenido huérfano en memoria. | Baja | Reversión de los blobs agregados. |
| 7 | No había pruebas ni CI/CD. | Alta | 39 pruebas, `ci.yml` y `deploy.yml`. |
| 8 | README pedía repositorio privado, pero el repositorio es público. | Informativo | README corregido. |

No se encontró `dangerouslySetInnerHTML` ni ejecución de contenido del usuario: React escapa el contenido.

### Estado por componente

**1. Implementado y probado**
- Typecheck (`tsc --noEmit`), build de producción y `npm audit` (0 vulnerabilidades), ejecutados desde `npm ci` limpio.
- 39 pruebas automáticas (27 de servicios, 12 de interfaz con flujos completos): sesión demo, protección de rutas, recuerdos (crear/buscar/editar con versiones/eliminar/persistir), archivos (subir/bloquear ejecutables/carpetas/mover/eliminar/cuota), cuenta de servicio, ajustes, fallos de almacenamiento.
- Las 3 pruebas de fallos de almacenamiento fallan contra el código original y pasan con las correcciones.
- Carga de recursos del build bajo el subdirectorio `/memory-task/`.

**2. Implementado pero no probado**
- Workflows de GitHub Actions: solo se ejecutan en GitHub. Sintaxis YAML validada y versiones de las acciones comprobadas (checkout v7, setup-node v7, configure-pages v6, upload-pages-artifact v5, deploy-pages v5), pero **no se han ejecutado**.
- Aspecto visual, responsive y consola del navegador: no hay navegador disponible en este entorno; jsdom no valida CSS ni maquetación. El CSS compilado con Vite 8 conserva las clases de marca, pero su apariencia no fue revisada a ojo.

**3. Simulado (modo demostración)**
- Toda la persistencia (`localStorage`), la sesión, y la cuenta de servicio (datos ilustrativos, botones desactivados).

**4. Pendiente**
- Etapas 2 a 12.

**5. Bloqueado por una acción externa**
- Subir los cambios a GitHub: no tengo credenciales del repositorio. Se entrega ZIP/parche.
- Activar GitHub Pages (Source: GitHub Actions): lo debe hacer el propietario.
- Google Sign-In, base de datos, almacenamiento de objetos, IA: requieren elegir y verificar proveedores (Etapas 3 a 5 y 11).

### Observaciones para la Etapa 2 y siguientes (no corregidas a propósito)
- No se pueden renombrar ni eliminar carpetas; no hay papelera ni recuperación.
- El `Modal` no se cierra con Escape ni atrapa el foco.
- `useAsync` no cancela peticiones ni muestra el estado de error; hay que reforzarlo al pasar a red (Etapa 3).
- `Session.demo: true` es un tipo literal: habrá que ampliarlo con la autenticación real (Etapa 4).
- Faltan términos y condiciones, política de retención, y el panel administrativo.

### Próximo paso
Etapa 2 (diseño y navegación completa), o saltar a la Etapa 3 si se prioriza el backend. Antes de elegir proveedores (Etapa 5) hay que verificar los planes gratuitos vigentes y que no exijan tarjeta.


## Actualización — 14-nov-2026: cuenta de servicio

Se agregó la implementación de backend para la cuenta de servicio:
- `ServicesPage` llama a la Edge Function autenticada `service-console` para crear aplicaciones, registrar claves públicas ES256, generar/revocar API keys, administrar cuota y explorar registros.
- `service-api` valida claves `mt_live_...`, scopes y tokens de identidad ES256; soporta registros JSON y archivos privados.
- La migración de cuota personal se renombró para evitar una versión duplicada en el historial de migraciones.

**Importante:** el código fuente existe, pero no se considera desplegado ni probado en producción hasta aplicar las migraciones y desplegar ambas Edge Functions en el proyecto Supabase correspondiente. La publicación de GitHub Pages solo publica el frontend; no despliega las funciones.
