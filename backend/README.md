# Backend de Memory Task (pendiente)

Esta carpeta está reservada. Hoy no contiene código: el frontend funciona solo con datos locales de demostración.

El frontend ya consume una capa de servicios (`src/services/api.ts`). El backend deberá implementar la misma interfaz como API REST versionada (`/v1`), con OpenAPI, y reemplazar esa capa sin cambiar los componentes.

Antes de guardar datos reales deben estar implementados y probados: autenticación real, autorización en el servidor, roles de base de datos separados, RLS, claves foráneas compuestas, cuotas, borrado y backups con restauración verificada.

Reglas fijas: presupuesto $0, sin tarjetas ni facturación, sin secretos en el repositorio ni en el frontend.
