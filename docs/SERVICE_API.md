# Memory Task — API de registros de servicio

## Estado

La función está implementada en `supabase/functions/service-api/index.ts`. Para usarla, el propietario debe desplegarla en Supabase con el nombre `service-api` después de aplicar las migraciones correspondientes. En la configuración de esa función, desactivá **Verify JWT** en la puerta de enlace de Supabase: la función valida su propia clave `mt_live_...`. Esta excepción se aplica solo a `service-api`; las funciones administrativas deben conservar la verificación JWT.

Endpoint:
`https://<PROJECT_REF>.supabase.co/functions/v1/service-api`

Método: `POST`
Formato: `application/json`

## Seguridad obligatoria

- La clave `mt_live_...` es un secreto de servidor. No la incluyas en JavaScript del navegador, aplicaciones móviles distribuidas, repositorios públicos ni APKs.
- El backend de la aplicación que integra Memory Task debe autenticar primero a su propio usuario.
- Solo después de verificar la sesión propia, ese backend envía el identificador estable del usuario mediante `X-Memory-Task-User-Id`.
- Ese identificador es una afirmación del backend integrador; la API de Memory Task no puede verificar las sesiones internas de una aplicación externa. Por eso, nunca debe llamarse desde un cliente público con la clave de servicio.
- Cada clave está vinculada a una aplicación y a una cuenta de servicio. Las operaciones quedan limitadas a esa aplicación y al identificador externo recibido.
- Permisos disponibles: `records:read`, `records:write`, `files:read` y `files:write`.

## Encabezados

```http
Authorization: Bearer mt_live_YOUR_SECRET
Content-Type: application/json
X-Memory-Task-User-Id: user-123
```

## Acciones

### Guardar o actualizar un registro

```json
{
  "action": "put",
  "key": "profile",
  "category": "user",
  "data": {
    "displayName": "Usuario de ejemplo",
    "preferences": {
      "language": "es"
    }
  }
}
```

### Leer un registro

```json
{
  "action": "get",
  "key": "profile"
}
```

### Listar registros

```json
{
  "action": "list",
  "category": "chat",
  "limit": 50
}
```

### Eliminar un registro

```json
{
  "action": "delete",
  "key": "profile"
}
```

### Subir un archivo

Usá `multipart/form-data` con los campos `action=upload_file`, `key`, `category` y `file`. Conservá los mismos encabezados de autorización y usuario externo. El tamaño máximo actual por archivo es 10 MiB.

### Listar archivos

```json
{ "action": "list_files", "limit": 50 }
```

### Obtener un enlace temporal de descarga

```json
{ "action": "download_file", "key": "avatar" }
```

La respuesta contiene un enlace firmado que vence a los 60 segundos.

### Eliminar un archivo

```json
{ "action": "delete_file", "key": "avatar" }
```

## Categorías

- `user`: datos de perfil y preferencias del usuario externo.
- `chat`: conversaciones y mensajes estructurados.
- `document`: datos y metadatos de documentos.
- `image`: metadatos asociados a imágenes.
- `custom`: cualquier estructura JSON propia de la aplicación.

## Límites actuales

- Cada registro JSON admite hasta 256 KiB.
- La cuota es compartida por todas las aplicaciones de una cuenta de servicio.
- La API contempla registros JSON y archivos binarios en un bucket privado. Los enlaces de descarga expiran a los 60 segundos.
- El límite lógico configurado no amplía el almacenamiento físico disponible en el proyecto Supabase.
- Las claves pueden revocarse desde Memory Task y dejan de autenticar nuevas solicitudes.

## Ejemplo desde un backend Node.js

```js
const response = await fetch(
  "https://<PROJECT_REF>.supabase.co/functions/v1/service-api",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MEMORY_TASK_API_KEY}`,
      "Content-Type": "application/json",
      "X-Memory-Task-User-Id": authenticatedUser.id
    },
    body: JSON.stringify({
      action: "put",
      key: "profile",
      category: "user",
      data: { displayName: "Usuario de ejemplo" }
    })
  }
);

if (!response.ok) {
  throw new Error("Memory Task API: " + response.status);
}
const result = await response.json();
```

No uses este ejemplo directamente en el navegador. `authenticatedUser.id` debe provenir de la sesión que tu propio servidor ya verificó.
