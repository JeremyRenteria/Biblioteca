// server.js — Biblioteca El Roble
// Servidor construido únicamente con módulos incorporados de Node.js.
// Sirve las 4 páginas + styles.css, procesa dos formularios (POST /lectores
// y POST /prestamos) y persiste los datos con node:sqlite.

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = 3000;
const PUBLIC_DIR = __dirname;
const DB_PATH = path.join(__dirname, 'biblioteca.db');

// ---------------------------------------------------------------------------
// 1. Base de datos: una sola DB, dos tablas con responsabilidades distintas.
// ---------------------------------------------------------------------------
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS lectores (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre   TEXT NOT NULL,
    correo   TEXT NOT NULL,
    telefono TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS prestamos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    lector_id      INTEGER NOT NULL,
    libro          TEXT NOT NULL,
    fecha_prestamo TEXT NOT NULL,
    dias           INTEGER NOT NULL
  );
`);

// Sentencias preparadas una sola vez, fuera de los manejadores de petición.
const insertLector = db.prepare(
  'INSERT INTO lectores (nombre, correo, telefono) VALUES (?, ?, ?)'
);
const insertPrestamo = db.prepare(
  'INSERT INTO prestamos (lector_id, libro, fecha_prestamo, dias) VALUES (?, ?, ?, ?)'
);
const findLectorById = db.prepare('SELECT id, nombre FROM lectores WHERE id = ?');

// ---------------------------------------------------------------------------
// 2. Archivos estáticos servidos por rutas explícitas (GET).
// ---------------------------------------------------------------------------
const STATIC_ROUTES = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/acerca': { file: 'acerca.html', type: 'text/html; charset=utf-8' },
  '/registro': { file: 'registro.html', type: 'text/html; charset=utf-8' },
  '/servicios': { file: 'servicios.html', type: 'text/html; charset=utf-8' },
  '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
};

// ---------------------------------------------------------------------------
// 3. Plantilla compartida para las páginas generadas por el servidor
//    (confirmaciones de POST y error 404), reutilizando la misma estructura
//    semántica y la misma hoja de estilos que las páginas estáticas.
// ---------------------------------------------------------------------------
function renderPage({ title, active, bodyHtml }) {
  const navItem = (href, label) => {
    const current = active === href ? ' aria-current="page"' : '';
    return `<li><a href="${href}"${current}>${label}</a></li>`;
  };

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Biblioteca El Roble — ${title}</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="site-header">
    <div class="wrap">
      <a class="brand" href="/">
        <span class="brand-mark">Biblioteca El Roble</span>
        <span class="brand-tagline">un lugar para volver, libro tras libro</span>
      </a>
      <nav class="site-nav" aria-label="Navegación principal">
        <ul>
          ${navItem('/', 'Inicio')}
          ${navItem('/acerca', 'Acerca de')}
          ${navItem('/registro', 'Registro')}
          ${navItem('/servicios', 'Servicios')}
        </ul>
      </nav>
    </div>
  </header>
  <main>
    ${bodyHtml}
  </main>
  <footer class="site-footer">
    <div class="wrap">
      <span>© 2026 Biblioteca El Roble</span>
      <span><a href="/">Volver al inicio</a></span>
    </div>
  </footer>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// 4. Utilidades de respuesta.
// ---------------------------------------------------------------------------
function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function send404(res, pathname) {
  const body = `
    <section>
      <div class="wrap">
        <div class="section-heading"><h2>Página no encontrada</h2></div>
        <div class="result-panel is-error">
          <p>La ruta <strong>${escapeHtml(pathname)}</strong> no existe en este sitio.</p>
          <p><a href="/">Volver al inicio</a></p>
        </div>
      </div>
    </section>`;
  sendHtml(res, 404, renderPage({ title: 'No encontrado', active: '', bodyHtml: body }));
}

function send500(res, message) {
  const body = `
    <section>
      <div class="wrap">
        <div class="section-heading"><h2>Error interno</h2></div>
        <div class="result-panel is-error">
          <p>Ocurrió un error procesando la solicitud. Intenta de nuevo.</p>
          <p class="hint">${escapeHtml(message)}</p>
        </div>
      </div>
    </section>`;
  sendHtml(res, 500, renderPage({ title: 'Error', active: '', bodyHtml: body }));
}

function send400(res, active, backHref, backLabel, missingMessage) {
  const body = `
    <section>
      <div class="wrap">
        <div class="section-heading"><h2>Faltan datos</h2></div>
        <div class="result-panel is-error">
          <p>${escapeHtml(missingMessage)}</p>
          <p><a href="${backHref}">${backLabel}</a></p>
        </div>
      </div>
    </section>`;
  sendHtml(res, 400, renderPage({ title: 'Datos incompletos', active, bodyHtml: body }));
}

// Lee y acumula el cuerpo de una petición POST; devuelve una Promise<string>.
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.destroy();
        reject(new Error('Cuerpo de la petición demasiado grande'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// 5. Manejadores de POST.
// ---------------------------------------------------------------------------

// POST /lectores — registra la entidad principal (lector).
async function handleRegistrarLector(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    return send500(res, err.message);
  }

  const params = new URLSearchParams(raw);
  const nombre = (params.get('nombre') || '').trim();
  const correo = (params.get('correo') || '').trim();
  const telefono = (params.get('telefono') || '').trim();

  if (!nombre || !correo || !telefono) {
    return send400(
      res,
      '/registro',
      '/registro',
      'Volver al formulario de registro',
      'Nombre, correo y teléfono son obligatorios. Vuelve al formulario y completa todos los campos.'
    );
  }

  try {
    const result = insertLector.run(nombre, correo, telefono);
    const nuevoId = result.lastInsertRowid;

    console.log(`[POST /lectores] Nuevo lector #${nuevoId} — ${nombre}`);

    const body = `
      <section>
        <div class="wrap">
          <div class="section-heading"><h2>¡Registro exitoso!</h2></div>
          <div class="result-panel">
            <p>Gracias, ${escapeHtml(nombre)}. Ya eres lector de Biblioteca El Roble.</p>
            <p>Este proyecto fue subido por el dueño del repositorio: JeremyRenteria.</p>
            <p>Tu identificador de lector es:</p>
            <span class="result-id">${nuevoId}</span>
            <p>Guarda este número: lo necesitarás en la página de Servicios para solicitar un préstamo.</p>
            <p><a href="/servicios">Ir a Servicios y solicitar un préstamo</a></p>
          </div>
        </div>
      </section>`;

    sendHtml(res, 201, renderPage({ title: 'Registro exitoso', active: '/registro', bodyHtml: body }));
  } catch (err) {
    console.error('Error insertando lector:', err.message);
    send500(res, err.message);
  }
}

// POST /prestamos — registra la operación asociada (préstamo) usando lector_id.
async function handleRegistrarPrestamo(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    return send500(res, err.message);
  }

  const params = new URLSearchParams(raw);
  const lectorIdRaw = (params.get('lector_id') || '').trim();
  const libro = (params.get('libro') || '').trim();
  const fechaPrestamo = (params.get('fecha_prestamo') || '').trim();
  const diasRaw = (params.get('dias') || '').trim();

  if (!lectorIdRaw || !libro || !fechaPrestamo || !diasRaw) {
    return send400(
      res,
      '/servicios',
      '/servicios',
      'Volver al formulario de préstamo',
      'ID de lector, libro, fecha de préstamo y días son obligatorios. Vuelve al formulario y completa todos los campos.'
    );
  }

  const lectorId = Number.parseInt(lectorIdRaw, 10);
  const dias = Number.parseInt(diasRaw, 10);

  if (!Number.isInteger(lectorId) || lectorId <= 0 || !Number.isInteger(dias) || dias <= 0) {
    return send400(
      res,
      '/servicios',
      '/servicios',
      'Volver al formulario de préstamo',
      'El ID de lector y los días deben ser números enteros positivos.'
    );
  }

  try {
    const lector = findLectorById.get(lectorId);
    if (!lector) {
      return send400(
        res,
        '/servicios',
        '/registro',
        'Registrarme como lector',
        `No existe un lector con ID ${lectorId}. Regístrate primero en la página de Registro.`
      );
    }

    const result = insertPrestamo.run(lectorId, libro, fechaPrestamo, dias);
    const prestamoId = result.lastInsertRowid;

    console.log(`[POST /prestamos] Nuevo préstamo #${prestamoId} — lector ${lectorId} — "${libro}"`);

    const body = `
      <section>
        <div class="wrap">
          <div class="section-heading"><h2>¡Préstamo registrado!</h2></div>
          <div class="result-panel">
            <p>Hola ${escapeHtml(lector.nombre)}, tu préstamo quedó registrado con el número:</p>
            <span class="result-id">${prestamoId}</span>
            <table class="data-table">
              <tbody>
                <tr><th>Libro</th><td>${escapeHtml(libro)}</td></tr>
                <tr><th>Fecha de préstamo</th><td>${escapeHtml(fechaPrestamo)}</td></tr>
                <tr><th>Días</th><td>${dias}</td></tr>
                <tr><th>ID de lector</th><td>${lectorId}</td></tr>
              </tbody>
            </table>
            <p><a href="/servicios">Solicitar otro préstamo</a></p>
          </div>
        </div>
      </section>`;

    sendHtml(res, 201, renderPage({ title: 'Préstamo registrado', active: '/servicios', bodyHtml: body }));
  } catch (err) {
    console.error('Error insertando préstamo:', err.message);
    send500(res, err.message);
  }
}

// ---------------------------------------------------------------------------
// 6. Servidor HTTP y enrutamiento.
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  console.log(`${new Date().toISOString()} ${method} ${pathname}`);

  if (method === 'GET' && STATIC_ROUTES[pathname]) {
    const route = STATIC_ROUTES[pathname];
    const filePath = path.join(PUBLIC_DIR, route.file);

    fs.readFile(filePath, (err, content) => {
      if (err) {
        console.error(`Error leyendo ${route.file}:`, err.message);
        return send500(res, `No se pudo leer ${route.file}`);
      }
      res.writeHead(200, { 'Content-Type': route.type });
      res.end(content);
    });
    return;
  }

  if (method === 'POST' && pathname === '/lectores') {
    return handleRegistrarLector(req, res);
  }

  if (method === 'POST' && pathname === '/prestamos') {
    return handleRegistrarPrestamo(req, res);
  }

  return send404(res, pathname);
});

server.listen(PORT, () => {
  console.log(`Biblioteca El Roble escuchando en http://localhost:${PORT}`);
  console.log(`Base de datos: ${DB_PATH}`);
});
