# Configuración del asistente de Memory Task

El asistente usa una Edge Function llamada `memory-ai` y un proveedor compatible con la API de chat de OpenAI. La clave de Groq se lee exclusivamente como secreto del servidor.

## Configuración en Supabase

1. Aplicá la migración `20261112000400_admin_recovery_ai_and_service_explorer.sql`.
2. En Supabase, abrí **Edge Functions → Secrets**.
3. Creá el secreto `GROQ_API_KEY` con la clave que generaste en Groq. No la pegues en el frontend, en GitHub ni en el chat.
4. Opcionalmente creá `GROQ_MODEL` con un modelo que esté habilitado para tu cuenta de Groq. Si no se define, la función usa `llama-3.3-70b-versatile`.
5. Creá la función `memory-ai` desde el archivo `supabase/functions/memory-ai/index.ts` y mantené **Verify JWT activado**.
6. Actualizá `service-console` desde `supabase/functions/service-console/index.ts`.

## Límite de uso

La cuota inicial es de 20 solicitudes por usuario y día UTC. El consumo se cuenta en la base de datos, en el servidor, para que no se pueda eludir cambiando el navegador. El límite del proveedor Groq es independiente: el servicio puede responder con un error si se agota la cuota gratuita de Groq.

## Privacidad

Las conversaciones y mensajes se guardan en tablas privadas, asociadas al usuario autenticado. La función de IA recibe el mensaje y el historial reciente de esa conversación. No consulta automáticamente archivos, recuerdos ni conversaciones de otros usuarios. No guardes secretos, contraseñas ni información especialmente sensible en el chat.
