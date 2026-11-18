# Nido · Organización del hogar

App web (PWA) para manejar el hogar entre dos: lo que falta en la casa, pendientes del día, pagos del mes y tareas del hogar. Los datos se guardan en un archivo de Google Drive compartido.

**App:** https://pedro-romero-leiva.github.io/Organizacion-del-Hogar/

## Archivos
| Archivo | Para qué sirve |
|---|---|
| `index.html` | La app completa |
| `manifest.webmanifest` + íconos | Permiten instalarla en la pantalla de inicio |
| `sw.js` | Hace que abra aunque no haya señal y envía el aviso diario |
| `barcode-ponyfill.js` + `zxing_reader.wasm` | Lector rápido de códigos de barras y QR (en Android usa el lector nativo del teléfono) |
| `juego.js` | Minijuego de reto «Salto Nido» |
| `nido-auth.gs` | Apps Script para la sesión permanente y para entregar las notificaciones entre teléfonos (no se publica, se pega en script.google.com) |
| `icons/` + `manifest-*.webmanifest` | Ícono y manifiesto de cada color de la app |

## Sesión permanente (opcional)
1. Google Cloud → Credenciales → cliente OAuth:
   - Orígenes de JavaScript: `https://pedro-romero-leiva.github.io`
   - URI de redireccionamiento: `https://pedro-romero-leiva.github.io/Organizacion-del-Hogar/`
2. Pegá `nido-auth.gs` en un proyecto de Apps Script y agregá las propiedades `CLIENT_ID`, `CLIENT_SECRET` y `REDIRECT_URI`.
3. Implementalo como aplicación web (Ejecutar como: Yo · Acceso: Cualquier persona) y pegá la URL `/exec` en `AUTH_URL` dentro de `index.html`.
4. Pantalla de consentimiento OAuth → pasar la app a **En producción** (en modo Prueba la sesión vence cada 7 días).

Sin `AUTH_URL`, la app usa el inicio de sesión normal de Google.

## Notificaciones entre teléfonos
Los mensajitos, lo que se acaba, las tareas hechas y los pagos le llegan como notificación a la otra persona. Para eso:
1. El Apps Script `nido-auth.gs` debe estar publicado y su URL en `AUTH_URL` (el mismo paso de la sesión permanente).
2. Cada persona acepta las notificaciones cuando la app lo pide al abrirla.
3. En iPhone, la app tiene que estar instalada en la pantalla de inicio (iOS 16.4 o más reciente).

Las notificaciones viajan cifradas: el Apps Script solo las reenvía y no puede leer su contenido.
