/**
 * Nido · Sesión permanente
 * ------------------------------------------------------------
 * Este Apps Script guarda en secreto el "Client secret" de Google y
 * cambia el código de inicio de sesión por una llave de renovación.
 * Con esa llave, Nido renueva su acceso solo, sin volver a pedir permisos.
 *
 * Instalación (una sola vez):
 * 1. script.google.com → Nuevo proyecto → pegá este código.
 * 2. Configuración del proyecto (⚙️) → Propiedades de la secuencia de comandos:
 *      CLIENT_ID      = el mismo Client ID que usa Nido
 *      CLIENT_SECRET  = el Client secret de ese mismo cliente OAuth (Google Cloud → Credenciales)
 *      REDIRECT_URI   = la dirección exacta de Nido, p. ej. https://tuusuario.github.io/nido/
 * 3. Implementar → Nueva implementación → Tipo: Aplicación web
 *      Ejecutar como: Yo   ·   Quién tiene acceso: Cualquier persona
 * 4. Copiá la URL que termina en /exec y pegala en AUTH_URL dentro de index.html.
 */

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    const props = PropertiesService.getScriptProperties();
    const clientId = props.getProperty('CLIENT_ID');
    const secret = props.getProperty('CLIENT_SECRET');
    const redirect = props.getProperty('REDIRECT_URI');
    if (!clientId || !secret) return out({ error: 'config', error_description: 'Faltan CLIENT_ID o CLIENT_SECRET en las propiedades del script.' });

    let payload;
    if (req.action === 'exchange') {
      if (redirect && req.redirect_uri !== redirect) return out({ error: 'redirect', error_description: 'La dirección de Nido no coincide con REDIRECT_URI.' });
      payload = { code: req.code, client_id: clientId, client_secret: secret, redirect_uri: req.redirect_uri, grant_type: 'authorization_code' };
    } else if (req.action === 'refresh') {
      payload = { refresh_token: req.refresh_token, client_id: clientId, client_secret: secret, grant_type: 'refresh_token' };
    } else if (req.action === 'ping') {
      return out({ ok: true });
    } else {
      return out({ error: 'action' });
    }

    const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', payload: payload, muteHttpExceptions: true });
    const d = JSON.parse(r.getContentText());
    // Solo devolvemos lo necesario
    return out({
      access_token: d.access_token, expires_in: d.expires_in, refresh_token: d.refresh_token,
      scope: d.scope, error: d.error, error_description: d.error_description
    });
  } catch (err) {
    return out({ error: 'server', error_description: String(err) });
  }
}

function doGet() { return out({ ok: true, app: 'nido-auth' }); }

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
