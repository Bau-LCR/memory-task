# Memory Task — API de servicio

## Estado

La función está implementada en `supabase/functions/service-api/index.ts`. Para activarla, desplegala en Supabase con el nombre `service-api` después de aplicar las migraciones.

Endpoint:
`https://<PROJECT_REF>.supabase.co/functions/v1/service-api`

Método: `POST`. Los registros usan JSON; la carga de archivos usa `multipart/form-data`.

En Supabase, desactivá **Verify JWT** solamente para `service-api`: esta función valida su propia clave `mt_live_...` y una identidad firmada ES256. Las funciones administrativas deben conservar Verify JWT activado.

## Seguridad de identidad externa

Memory Task no acepta un identificador externo sin comprobarlo. Cada aplicación debe registrar una clave pública ECDSA P-256 (ES256) en la consola.

1. Tu backend genera un par de claves ES256.
2. Registrás la clave pública JWK en la aplicación correspondiente desde Memory Task.
3. La clave privada queda exclusivamente en el backend de tu aplicación. Nunca se sube a Memory Task ni se incluye en una web o APK.
4. Cuando un usuario inicia sesión en tu aplicación, tu backend firma un token de identidad de corta duración (máximo cinco minutos).
5. Memory Task verifica la firma y toma el identificador externo del campo `sub` firmado. No confía en un ID enviado libremente por el cliente.

La clave API por sí sola no permite elegir la identidad de otro usuario. El backend integrador debe autenticar al usuario antes de firmar su token.

## Generar y registrar la clave pública

Ejemplo para Node.js usando el paquete `jose`:

```js
import { generateKeyPair, exportJWK } from "jose";

const { publicKey, privateKey } = await generateKeyPair("ES256");
const publicJwk = await exportJWK(publicKey);

// Registrá publicJwk en Memory Task > Cuenta de servicio
// > Aplicaciones registradas > Configurar identidad.

// Guardá privateKey de forma segura en tu backend.
// No la publiques ni la envíes al navegador.
```

En Memory Task pegá solo el objeto JWK público, con `kty`, `crv`, `x` e `y`. La consola rechaza una clave que incluya el parámetro privado `d`.

## Firmar la identidad de un usuario

Después de autenticar al usuario en tu propio backend:

```js
import { SignJWT } from "jose";

const identityToken = await new SignJWT({})
  .setProtectedHeader({ alg: "ES256" })
  .setIssuer(memoryTaskAppId)
  .setAudience(memoryTaskAppId)
  .setSubject(authenticatedUser.id)
  .setIssuedAt()
  .setExpirationTime("2m")
  .sign(privateKey);
```

Enviá ese token en el encabezado `X-Memory-Task-Identity`. La aplicación debe generar un token nuevo para cada solicitud o sesión de usuario; no lo guardes en el navegador.

## Encabezados

```http
Authorization: Bearer mt_live_YOUR_SECRET
Content-Type: application/json
X-Memory-Task-Identity: <signed-ES256-token>
```

La clave API y la clave privada son secretos de servidor. No las incluyas en JavaScript público, repositorios abiertos ni APKs.

## Registros JSON

### Guardar o actualizar

```json
{
  "action": "put",
  "key": "profile",
  "category": "user",
  "data": {
    "displayName": "Usuario de ejemplo",
    "preferences": { "language": "es" }
  }
}
```

### Leer

```json
{ "action": "get", "key": "profile" }
```

### Listar

```json
{ "action": "list", "category": "chat", "limit": 50 }
```

### Eliminar

```json
{ "action": "delete", "key": "profile" }
```

## Archivos privados

### Subir

Usá `multipart/form-data` con estos campos:

- `action`: `upload_file`
- `key`: identificador del archivo dentro del usuario externo
- `category`: `document`, `image` o `custom`
- `file`: contenido del archivo

El tamaño máximo actual es 10 MiB por archivo.

### Listar

```json
{ "action": "list_files", "limit": 50 }
```

### Descargar

```json
{ "action": "download_file", "key": "avatar" }
```

La respuesta contiene un enlace firmado que vence a los 60 segundos.

### Eliminar

```json
{ "action": "delete_file", "key": "avatar" }
```

## Categorías y estructura sugerida

- `user`: perfil, preferencias y atributos del usuario.
- `chat`: conversación y mensajes estructurados, por ejemplo `{ "conversationId": "...", "messages": [{ "role": "user", "content": "..." }] }`.
- `document`: título, tipo, origen, metadatos y/o archivo asociado.
- `image`: texto alternativo, tipo, dimensiones, metadatos y/o archivo asociado.
- `custom`: cualquier objeto JSON propio de la aplicación.

La categoría queda registrada para estadísticas y filtros. La estructura interna del JSON la define la aplicación integradora.

## Permisos de claves

- `records:read` y `records:write`: lectura y escritura de registros JSON.
- `files:read` y `files:write`: listado/descarga y carga/eliminación de archivos.

## Límites actuales

- Cada registro JSON admite hasta 256 KiB.
- Cada archivo admite hasta 10 MiB.
- La cuota de almacenamiento es compartida entre todas las aplicaciones de la cuenta de servicio.
- El límite lógico no amplía el espacio físico disponible en el proyecto Supabase.
- Las claves API se muestran una sola vez y pueden revocarse desde la consola.
- La actividad de lectura, escritura, carga, descarga y eliminación queda registrada en la auditoría de la cuenta de servicio.

## Explorador de datos de la consola

La consola de Memory Task puede agrupar registros por usuario externo y mostrar su ID, cantidad de registros, chats y archivos. Para que la lista muestre nombre y correo, guardá un registro de categoría `user` con una clave como `profile` y campos `name` y `email` dentro de `data`. Esos campos son proporcionados por tu aplicación; Memory Task no los obtiene por su cuenta.

Los registros JSON se pueden inspeccionar y editar desde el explorador. Los archivos privados generan enlaces temporales para su vista previa o descarga. Eliminar una aplicación borra sus claves y registros asociados, además de los archivos del bucket privado. Las claves revocadas pueden eliminarse definitivamente desde la consola.

## Integración selectiva con Qutrial u otra aplicación

La decisión de qué conversaciones guardar se toma en el backend de la aplicación integradora, después de autenticar al usuario. Por ejemplo, si querés guardar solamente las conversaciones de tu cuenta administradora en Memory Task, tu backend puede comparar el ID autenticado con el ID interno que ya conoce y llamar a la API de Memory Task solo para esa cuenta. Las conversaciones de los demás usuarios pueden seguir en el almacenamiento que elijas.

No hagas esa comparación en el navegador ni publiques la clave API o la clave privada ES256. Cada chat se puede guardar como un registro de categoría `chat`, con una clave única por conversación y el ID externo autenticado como propietario.

