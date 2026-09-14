# Biblioteca El Roble

**Autor:** Jeremy Rentería Serna
**Asignatura:** Ingeniería Web
**Práctica:** Diseño de una aplicación Web temática con Node.js y SQLite (20 %)
**Temática asignada:** Biblioteca

Aplicación web individual que implementa el sitio de una biblioteca de barrio ficticia. Permite registrar lectores y, con el identificador que genera ese registro, solicitar préstamos de libros. Construida únicamente con módulos incorporados de Node.js (`node:http`, `node:fs`, `node:path`, `node:sqlite`), sin frameworks de frontend ni dependencias externas.

---

## 1. Descripción funcional

El sitio tiene cuatro páginas y un flujo de uso obligatorio de dos pasos:

1. **Registro** (`/registro`): el visitante completa un formulario con **nombre, correo y teléfono**. El servidor valida los datos, los inserta en la tabla `lectores` y responde mostrando el **ID de lector** generado por SQLite (`lastInsertRowid`).
2. **Servicios** (`/servicios`): el lector ya registrado completa un segundo formulario con **su ID de lector, el libro, la fecha del préstamo y los días** que lo necesita. El servidor valida que ese `lector_id` exista, inserta el préstamo en la tabla `prestamos` y confirma la operación.

El segundo formulario nunca vuelve a pedir nombre, correo o teléfono: solo pide el identificador que ya se generó en el primer paso, y ese identificador es lo que conecta las dos tablas.

Página principal (`/`) presenta el proyecto y enlaza al flujo de registro; página **Acerca de** (`/acerca`) explica el propósito del sitio, quiénes somos y datos de contacto ficticios.

---

## 2. Tecnologías utilizadas

- **HTML** semántico (`header`, `nav`, `main`, `section`, `footer`) en las 4 páginas.
- **CSS** externo (`styles.css`), sin frameworks (Bootstrap/Tailwind no se usan).
- **JavaScript** (Node.js) para el servidor.
- **Node.js** con el módulo `node:http` para servir rutas GET/POST.
- **HTTP**: códigos 200, 201, 400, 404 y 500 controlados explícitamente.
- **SQL / SQLite** mediante `node:sqlite` (`DatabaseSync`) para la persistencia.

---

## 3. Árbol de archivos

```
biblioteca-el-roble/
├── index.html        # Página principal: presentación del proyecto y del flujo
├── acerca.html        # Quiénes somos, propósito, horario y ubicación
├── registro.html       # Formulario de registro de lector (POST /lectores)
├── servicios.html       # Presentación de servicios + formulario de préstamo (POST /prestamos)
├── styles.css         # Hoja de estilos compartida por las 4 páginas
├── server.js          # Servidor HTTP, rutas, validación y persistencia SQLite
├── biblioteca.db        # Base de datos SQLite con registros de prueba
└── README.md          # Este archivo
```

**Explicación de cada archivo principal**

- `server.js`: crea el servidor HTTP, abre/crea `biblioteca.db`, define las tablas `lectores` y `prestamos`, sirve las páginas y `styles.css`, y procesa los dos formularios con validación en servidor e inserciones parametrizadas.
- `styles.css`: define la identidad visual del sitio (paleta verde bosque / pergamino / latón, tipografía Fraunces + Inter, motivo de lomos de libros), compartida por las cuatro páginas mediante `<link rel="stylesheet" href="/styles.css">`.
- `index.html`, `acerca.html`, `registro.html`, `servicios.html`: páginas estáticas con estructura semántica; los dos últimos contienen los formularios obligatorios.

---

## 4. Tabla de rutas

| Método | Ruta         | Recurso / respuesta                          | Código esperado |
|--------|--------------|-----------------------------------------------|------------------|
| GET    | `/`          | `index.html`                                   | 200 |
| GET    | `/acerca`    | `acerca.html`                                  | 200 |
| GET    | `/registro`  | `registro.html`                                | 200 |
| GET    | `/servicios` | `servicios.html`                               | 200 |
| GET    | `/styles.css`| `styles.css` (`Content-Type: text/css`)        | 200 |
| POST   | `/lectores`  | Inserta en `lectores`, muestra el ID generado  | 201 (400 si faltan datos) |
| POST   | `/prestamos` | Inserta en `prestamos` asociado a `lector_id`  | 201 (400 si faltan datos o el lector no existe) |
| *      | cualquier otra | Página de error                              | 404 |
| *      | error interno  | Página de error                              | 500 |

---

## 5. Modelo de datos

Base de datos: **`biblioteca.db`** (SQLite, `DatabaseSync` de `node:sqlite`), con dos tablas.

### Tabla `lectores` (entidad principal)

| Columna   | Tipo    | Restricciones          | Propósito                        |
|-----------|---------|--------------------------|-----------------------------------|
| id        | INTEGER | PRIMARY KEY AUTOINCREMENT | Identificador único del lector    |
| nombre    | TEXT    | NOT NULL                  | Nombre completo del lector        |
| correo    | TEXT    | NOT NULL                  | Correo de contacto                |
| telefono  | TEXT    | NOT NULL                  | Teléfono de contacto              |

### Tabla `prestamos` (operación asociada)

| Columna         | Tipo    | Restricciones            | Propósito                                  |
|------------------|---------|----------------------------|----------------------------------------------|
| id               | INTEGER | PRIMARY KEY AUTOINCREMENT | Identificador único del préstamo             |
| lector_id        | INTEGER | NOT NULL                  | Referencia lógica al `id` de `lectores`      |
| libro            | TEXT    | NOT NULL                  | Título del libro solicitado                  |
| fecha_prestamo   | TEXT    | NOT NULL                  | Fecha en que se realiza el préstamo          |
| dias             | INTEGER | NOT NULL                  | Días de duración del préstamo                |

No se declara `FOREIGN KEY` (no es obligatorio en esta práctica), pero el servidor verifica en el backend que el `lector_id` recibido exista en `lectores` antes de insertar el préstamo.

El archivo `biblioteca.db` incluido en el repositorio ya contiene registros de prueba en ambas tablas. Si se elimina, `server.js` la vuelve a crear automáticamente (junto con las dos tablas) al iniciar.

---

## 6. Cómo se procesa cada POST

1. El servidor lee el cuerpo de la petición como *stream* (`req.on('data' / 'end')`) y lo interpreta con `new URLSearchParams(cuerpo)`.
2. Cada campo de texto se limpia con `.trim()`.
3. Si falta algún campo obligatorio, responde **400** con una página que explica qué falta y un enlace de regreso al formulario.
4. **`/lectores`**: si los datos son válidos, ejecuta el `INSERT` parametrizado preparado (`insertLector.run(...)`), obtiene `lastInsertRowid` y lo muestra en la página de respuesta (201) y en la terminal.
5. **`/prestamos`**: además de validar que los campos no estén vacíos, valida que `lector_id` y `dias` sean números enteros positivos, y consulta si el `lector_id` existe en `lectores`. Si no existe, responde 400 e invita a registrarse. Si existe, ejecuta el `INSERT` parametrizado (`insertPrestamo.run(...)`) y confirma con 201, mostrando el libro, la fecha, los días y el ID de lector asociado.
6. Cualquier error no controlado durante la lectura o la inserción se captura con `try/catch` y responde **500** con un mensaje genérico.

Todas las inserciones usan parámetros `?` — nunca se concatenan datos del usuario dentro del SQL.

---

## 7. Requisitos previos

- **Node.js 22 o superior** con soporte del módulo `node:sqlite` (recomendado Node 24, tal como pide la práctica). Verificar con `node --version`.
- No se requiere instalar dependencias (`npm install`) porque el proyecto solo usa módulos incorporados.

---

## 8. Instrucciones paso a paso

```bash
git clone URL_DEL_REPOSITORIO
cd biblioteca-el-roble
node --version
node server.js
```

Luego abrir en el navegador:

```
http://localhost:3000
```

El servidor imprime en la terminal la URL, la ruta de la base de datos y cada petición que recibe (incluyendo `GET /styles.css`).

**Orden de uso obligatorio dentro de la aplicación:**

1. Entrar a `http://localhost:3000/registro` y completar el formulario de registro.
2. Copiar el **ID de lector** que muestra la página de confirmación.
3. Entrar a `http://localhost:3000/servicios`, ingresar ese ID junto con el libro, la fecha y los días, y enviar el formulario de préstamo.

Si se elimina `biblioteca.db` antes de ejecutar, `node server.js` la crea de nuevo junto con las tablas `lectores` y `prestamos` vacías.

---

## 9. Pruebas realizadas y resultados esperados

| Prueba            | Cómo se probó                                              | Resultado obtenido |
|--------------------|--------------------------------------------------------------|----------------------|
| Navegación         | `curl` a `/`, `/acerca`, `/registro`, `/servicios`            | 200 en las cuatro rutas |
| CSS                | `curl -D - /styles.css`                                       | 200, `Content-Type: text/css; charset=utf-8`, y la terminal registra la petición |
| Registro           | POST `/lectores` con datos válidos                             | 201 y muestra el ID generado (`lastInsertRowid`) |
| Servicio           | POST `/prestamos` con un `lector_id` existente                | 201 y crea el préstamo asociado |
| Coherencia         | Consulta directa a `biblioteca.db`                             | `prestamos.lector_id` referencia un `id` real de `lectores`, sin repetir nombre/correo/teléfono |
| Validación         | POST `/lectores` con `nombre` vacío                             | 400, no se crea el registro |
| Validación (FK lógica) | POST `/prestamos` con `lector_id=999` (inexistente)         | 400, no se crea el préstamo |
| Codificación       | Registro de "María José Peña" y libro "El amor en los tiempos del cólera" | Tildes y ñ almacenados y mostrados correctamente |
| Persistencia       | Reinicio del servidor y nueva consulta a las tablas             | Los datos de la sesión anterior permanecen |
| Ruta inexistente   | `GET /noexiste`                                                | 404 |
| Reproducibilidad   | Clonado en otra carpeta y ejecución con `node server.js`        | Sitio disponible en `http://localhost:3000` sin pasos adicionales |

---

## 10. Capturas de pantalla

*(Espacio para incluir, antes de la entrega final, las capturas solicitadas: las cuatro páginas, el ID generado en el registro, los dos mensajes de confirmación, la terminal mostrando las peticiones, y las tablas `lectores` y `prestamos` abiertas en una herramienta para SQLite como DB Browser for SQLite.)*
