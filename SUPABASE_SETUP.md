# Conectar Memory Task con Supabase

Esta rama prepara la primera etapa de almacenamiento personal. No contiene claves ni credenciales.

## 1. Ejecutar la migración de base de datos

1. Abrí el proyecto de Supabase.
2. Entrá en **SQL Editor** y creá una consulta nueva.
3. Copiá y ejecutá el contenido de `supabase/migrations/20261110000100_initial_private_storage.sql`.
4. En **Table Editor** deberían aparecer `mt_folders`, `mt_memories`, `mt_files` y `mt_activity`. Las versiones anteriores de cada recuerdo se guardan dentro de `mt_memories`.
5. En **Storage** debe aparecer el bucket `memory-task-private` con acceso privado.
6. Ejecutá también `supabase/migrations/20261110000200_personal_storage_quota.sql`. Esta segunda migración aplica la cuota de 50 MiB por cuenta personal, también en la base de datos y en el bucket, y evita depender solo de la validación del navegador.

La migración habilita RLS en todas las tablas, limita las filas al usuario autenticado y restringe los archivos a una carpeta raíz con su UUID. No hagas público el bucket.

## 2. Variables de conexión

En el proyecto local, creá `.env.local` en la raíz (al mismo nivel que `package.json`) usando `.env.example` como modelo. Completá:

- `VITE_SUPABASE_URL`: **Project URL** de Supabase.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: **Publishable API Key**.

No pongas una `secret key`, `service_role`, contraseña de base de datos ni credenciales privadas en variables `VITE_` o en el frontend. No compartas esos valores en chats.

## 3. Autenticación

La integración de Google requiere además configurar el proveedor Google en Supabase Auth y crear credenciales OAuth de tipo Web en Google Cloud. El callback se copia literalmente desde la pantalla del proveedor Google en Supabase; no inventes una URL. La URL pública de GitHub Pages debe agregarse a la lista de Redirect URLs de Supabase.

## 4. Configuración de GitHub Pages

Para que la versión publicada reciba la configuración pública de Supabase durante la compilación:

1. Abrí el repositorio en GitHub y entrá en **Settings → Secrets and variables → Actions → Variables**.
2. Creá la variable `VITE_SUPABASE_URL` con el **Project URL**.
3. Creá la variable `VITE_SUPABASE_PUBLISHABLE_KEY` con la **Publishable API Key**.
4. No agregues claves `secret` ni `service_role`. La publishable key es pública; las políticas RLS son las que protegen los datos.
5. El workflow solo publica cuando se actualiza `main`; esta rama de trabajo no publica la web.

En **Supabase → Authentication → URL Configuration**, agregá como Site URL la URL real de tu web publicada y agregá también `http://localhost:5173/**` a Redirect URLs para pruebas. Para Google OAuth, la dirección de callback del proveedor es la que Supabase muestra en la configuración del proveedor; copiá esa dirección exactamente en Google Cloud.

## 5. Dependencia del cliente

En el proyecto local ejecutá:

```bash
npm install @supabase/supabase-js
```

Esto actualizará `package.json` y `package-lock.json` juntos. No hagas `npm ci` antes de actualizar el lockfile.

## Estado de esta rama

La rama conecta la cuenta personal autenticada con PostgreSQL y el bucket privado: recuerdos, carpetas, actividad y metadatos de archivos se consultan por usuario; el contenido binario se sube, descarga y elimina en Storage. La cuota personal prevista es de 50 MiB. La migración `20261110000200_personal_storage_quota.sql` debe ejecutarse manualmente en SQL Editor antes de probar las subidas.

La cuenta de servicio todavía no tiene su backend de espacios, usuarios externos, sectores ni claves API. Su cuota independiente de 50 MiB queda reservada para esa implementación y no se comparte con la personal. No uses información sensible ni publiques esta rama hasta completar las pruebas de seguridad y persistencia.
