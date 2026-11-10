# Conectar Memory Task con Supabase

Esta rama prepara la primera etapa de almacenamiento personal. No contiene claves ni credenciales.

## 1. Ejecutar la migración de base de datos

1. Abrí el proyecto de Supabase.
2. Entrá en **SQL Editor** y creá una consulta nueva.
3. Copiá y ejecutá el contenido de `supabase/migrations/20261110000100_initial_private_storage.sql`.
4. En **Table Editor** deberían aparecer `mt_folders`, `mt_memories`, `mt_files` y `mt_activity`. Las versiones anteriores de cada recuerdo se guardan dentro de `mt_memories`.
5. En **Storage** debe aparecer el bucket `memory-task-private` con acceso privado.

La migración habilita RLS en todas las tablas, limita las filas al usuario autenticado y restringe los archivos a una carpeta raíz con su UUID. No hagas público el bucket.

## 2. Variables de conexión

En el proyecto local, creá `.env.local` en la raíz (al mismo nivel que `package.json`) usando `.env.example` como modelo. Completá:

- `VITE_SUPABASE_URL`: **Project URL** de Supabase.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: **Publishable API Key**.

No pongas una `secret key`, `service_role`, contraseña de base de datos ni credenciales privadas en variables `VITE_` o en el frontend. No compartas esos valores en chats.

## 3. Autenticación

La integración de Google requiere además configurar el proveedor Google en Supabase Auth y crear credenciales OAuth de tipo Web en Google Cloud. El callback se copia literalmente desde la pantalla del proveedor Google en Supabase; no inventes una URL. La URL pública de GitHub Pages debe agregarse a la lista de Redirect URLs de Supabase.

## 4. Dependencia del cliente

En el proyecto local ejecutá:

```bash
npm install @supabase/supabase-js
```

Esto actualizará `package.json` y `package-lock.json` juntos. No hagas `npm ci` antes de actualizar el lockfile.

## Estado

Este primer paso crea el esquema y sus barreras de seguridad, pero todavía no cambia la interfaz de demostración para que escriba en Supabase. La siguiente parte será integrar sesión real, recuerdos, carpetas y archivos, y probar con dos cuentas distintas que no puedan leerse entre sí. Hasta completar esas pruebas, no subas información privada real.
