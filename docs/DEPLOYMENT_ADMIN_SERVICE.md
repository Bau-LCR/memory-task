# Despliegue de la actualización administrativa y de servicios

Esta actualización todavía no se publica en GitHub Pages. Primero deben aplicarse la base de datos y las Edge Functions; la pantalla de consentimiento depende de ellas y no conviene publicar el frontend antes.

## 1. Migraciones SQL

En Supabase → SQL Editor, ejecutar en este orden:

1. `supabase/migrations/20261112000200_admin_roles_and_audit.sql`
2. `supabase/migrations/20261112000300_legal_service_categories_and_quotas.sql`

La migración `20261112000100_service_accounts_foundation.sql` ya fue aplicada anteriormente.

La primera migración crea roles y auditoría administrativa y asigna el rol principal al UUID configurado. La segunda agrega consentimiento legal versionado, cuotas configurables, categorías de objetos, auditoría de servicios y claves públicas para identidad firmada.

## 2. Edge Functions

En Supabase → Edge Functions, desplegar o actualizar estas funciones copiando el contenido completo de cada archivo:

| Nombre de la función | Archivo | Verificación JWT |
|---|---|---|
| `admin-console` | `supabase/functions/admin-console/index.ts` | Activada |
| `account-consent` | `supabase/functions/account-consent/index.ts` | Activada |
| `service-console` | `supabase/functions/service-console/index.ts` | Activada |
| `service-api` | `supabase/functions/service-api/index.ts` | Desactivada |

**Importante:** desactivar Verify JWT únicamente en `service-api`. Esa función autentica sus propias claves `mt_live_...` y verifica las identidades ES256. No desactives la verificación JWT de las funciones administrativas.

Supabase inyecta las variables de entorno del proyecto. La clave `service_role` debe permanecer en el servidor y nunca agregarse a variables `VITE_...` ni al frontend.

## 3. Publicación web

Cuando las migraciones y las cuatro funciones estén desplegadas:

1. Verificar que las funciones respondan sin errores.
2. Fusionar el Pull Request de esta rama a `main`.
3. GitHub Actions ejecutará las pruebas y publicará GitHub Pages automáticamente.
4. Iniciar sesión en Memory Task y revisar/aceptar los términos y el aviso de privacidad.
5. Comprobar que la cuenta principal vea el menú Administración.

La rama de trabajo no publica a producción: el workflow de Pages solo despliega desde `main`.

## 4. Pruebas funcionales después del despliegue

- Panel administrativo: listado de usuarios, consulta auditada de datos, acceso temporal a archivos, roles y cuotas.
- Ajustes: preferencias de accesibilidad y registro de accesos administrativos.
- Cuenta de servicio: estadísticas por aplicación/categoría, cuotas y claves con permisos seleccionables.
- API externa: registrar una clave pública ES256 por aplicación y probar operaciones de registros/archivos desde un backend.

## 5. Límites

Las cuotas son límites lógicos dentro del almacenamiento real disponible en Supabase. Aumentar una cuota no amplía el plan ni el espacio físico contratado. Los términos y el aviso de privacidad son un borrador operativo y conviene revisarlos profesionalmente antes de abrir el servicio al público.
