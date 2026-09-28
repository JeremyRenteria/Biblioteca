# Aplicación de OOHDM — Biblioteca El Roble

**Autor:** Jeremy Renteria Serna · **Asignatura:** Ingeniería Web · **Temática:** Biblioteca

Este documento aplica la metodología **OOHDM** (*Object-Oriented Hypermedia Design Method*) a la plataforma *Biblioteca El Roble*. Se documentan las cuatro actividades de diseño: **conceptual**, **navegacional**, **interfaz abstracta** e **implementación**. Todos los nombres de rutas, archivos, tablas y campos son los que existen en el repositorio.

**Entidades asignadas:** `Lector` (tabla `lectores`) y `Préstamo` (tabla `prestamos`).

## Índice

1. [Diseño conceptual](#1-diseño-conceptual)
2. [Diseño navegacional](#2-diseño-navegacional)
3. [Diseño de interfaz abstracta](#3-diseño-de-interfaz-abstracta)
4. [Implementación](#4-implementación)
5. [Matriz de correspondencia](#5-matriz-de-correspondencia)
6. [Consistencia entre diseño y código: hallazgos y ajustes](#6-consistencia-entre-diseño-y-código-hallazgos-y-ajustes)
7. [Fuentes editables](#7-fuentes-editables)

---

## 1. Diseño conceptual

**Pregunta que responde:** ¿qué información maneja la plataforma y cómo se relaciona?

![Modelo conceptual](01_modelo_conceptual.png)

| Clase | Atributos | Descripción |
|---|---|---|
| `Lector` | `id`, `nombre`, `correo`, `telefono` | Persona registrada en la biblioteca. Es la entidad principal. |
| `Préstamo` | `id`, `lector_id`, `libro`, `fecha_prestamo`, `dias` | Operación de préstamo de un libro solicitada por un lector. |

**Relación:** `Lector` **1** — solicita — **0..\*** `Préstamo`.

**Reglas del dominio representadas.** Un lector se identifica de forma única mediante `id`, un valor que no escribe el usuario sino que se genera al registrarlo. Un préstamo solo puede existir si pertenece a exactamente un lector ya registrado (multiplicidad 1 del lado de `Lector`), y por eso se vincula con `lector_id`, que referencia a `Lector.id`. Un lector recién registrado puede no tener ningún préstamo y, con el tiempo, acumular muchos (multiplicidad 0..\*). Cada préstamo describe un `libro`, una `fecha_prestamo` y una duración en `dias`. Este modelo no contiene páginas, rutas, HTML ni decisiones visuales.

## 2. Diseño navegacional

**Pregunta que responde:** ¿qué nodos visita el usuario y cómo se desplaza entre ellos?

![Modelo navegacional](02_modelo_navegacional.png)

**Nodos** (cada uno corresponde a una ruta real):

| Nodo | Ruta | Origen del contenido |
|---|---|---|
| Inicio | `GET /` | `index.html` |
| Acerca de | `GET /acerca` | `acerca.html` |
| Registro | `GET /registro` | `registro.html` |
| Servicios | `GET /servicios` | `servicios.html` |
| Confirmación: Registro exitoso | `POST /lectores` → 201 | HTML generado por `server.js` |
| Confirmación: Préstamo registrado | `POST /prestamos` → 201 | HTML generado por `server.js` |
| Respuesta: Faltan datos | `POST /lectores` o `POST /prestamos` → 400 | HTML generado por `server.js` |
| Respuesta: Página no encontrada | cualquier otra ruta → 404 | HTML generado por `server.js` |

**Estructuras de acceso.** (a) El **menú principal** (`<nav aria-label="Navegación principal">`) con los enlaces Inicio, Acerca de, Registro y Servicios, presente en las cuatro páginas y en todas las respuestas generadas. (b) Los **botones de la portada** «Registrarme como lector» y «Ver servicios». (c) Los **enlaces del pie de página**, que conducen al paso siguiente natural: desde Registro, «Ya tengo mi ID: ir a Servicios»; desde Servicios, «Aún no tengo ID: registrarme».

**Acciones y enlaces con nombre:** *registrar / guardar* (formulario de Registro → `POST /lectores`), *solicitar servicio* (formulario de Servicios → `POST /prestamos`), *volver* («Volver al formulario de registro», «Volver al formulario de préstamo», «Volver al inicio») y *solicitar otro préstamo* (de la confirmación de préstamo de vuelta a Servicios). La plataforma **no implementa una acción de consulta** de lectores ni de préstamos, por lo que el diagrama no la incluye.

**Uso del identificador.** Al registrarse, el servidor genera el `id` del lector (SQLite `AUTOINCREMENT`) y lo **muestra** en la confirmación de registro. El recorrido continúa por el enlace «Ir a Servicios y solicitar un préstamo», pero el identificador **no viaja automáticamente**: el usuario lo escribe en el campo `lector_id` del formulario de Servicios. Al enviarlo, el servidor lo comprueba con `SELECT id, nombre FROM lectores WHERE id = ?`; si no existe, responde 400 con el enlace «Registrarme como lector».

## 3. Diseño de interfaz abstracta

**Pregunta que responde:** ¿qué información, controles y respuestas contiene cada nodo?

![Interfaz abstracta](03_interfaz_abstracta.png)

**Formulario Registro** (`GET /registro`, envía `POST /lectores`):

| Elemento | Tipo abstracto | Quién aporta el dato |
|---|---|---|
| Título, introducción y nota del autor | Información visible | Sistema |
| `nombre`, `correo`, `telefono` | Campos de entrada (obligatorios) | **Usuario** |
| Botón «Registrarme» | Acción | Usuario |
| `id` del lector | Respuesta del sistema | **Servidor** (SQLite) |

**Formulario Servicios** (`GET /servicios`, envía `POST /prestamos`):

| Elemento | Tipo abstracto | Quién aporta el dato |
|---|---|---|
| Lista de servicios, título e introducción | Información visible | Sistema |
| `lector_id` | **Dato conservado** del nodo Registro (ID generado por el servidor); campo obligatorio | **Servidor** lo genera; el **usuario** lo digita |
| `libro`, `fecha_prestamo`, `dias` (1 a 60) | Campos de entrada (obligatorios) | **Usuario** |
| Botón «Solicitar préstamo» | Acción | Usuario |
| `id` del préstamo y nombre del lector | Respuesta del sistema | **Servidor** |

Ninguno de los dos formularios tiene campos ocultos (`type="hidden"`): el identificador de lector se conserva únicamente porque el usuario lo copia.

**Comportamiento ante envío correcto:** el servidor responde **201** con «¡Registro exitoso!» (nombre y `id` generado) o «¡Préstamo registrado!» (nombre del lector, `id` de préstamo, libro, fecha, días e ID de lector).

**Comportamiento ante datos incompletos o inválidos:** el servidor responde **400** con «Faltan datos» y un enlace para volver. Casos cubiertos: campos vacíos; `lector_id` o `dias` que no son enteros positivos; `dias` mayor que 60; y `lector_id` que no existe en `lectores`. Los colores, tipografías y decoración pertenecen a `styles.css` y no se evalúan en este modelo.

## 4. Implementación

**Pregunta que responde:** ¿cómo se materializan los tres modelos anteriores mediante tecnologías concretas?

![Implementación](04_implementacion.png)

**Arquitectura:** Usuario → Navegador (HTML + `styles.css`) → Servidor Node.js (`server.js`, módulo `node:http`, puerto 3000) → SQLite (`biblioteca.db`, módulo `node:sqlite`).

| Modelo OOHDM | Materialización |
|---|---|
| Nodos (navegacional) | Rutas `GET` de `STATIC_ROUTES` que sirven `index.html`, `acerca.html`, `registro.html`, `servicios.html` y `styles.css`; respuestas generadas con `renderPage()`. |
| Interfaz abstracta | Elementos `<form>` con `action="/lectores"` y `action="/prestamos"`, ambos `method="POST"`. |
| Clases (conceptual) | `Lector` → tabla `lectores`; `Préstamo` → tabla `prestamos`. |
| Relación 1 a 0..\* | Columna `prestamos.lector_id`, validada en código con `findLectorById`. |

**Operaciones sobre SQLite** (sentencias parametrizadas preparadas en `server.js`):

| Sentencia | Constante | Cuándo se ejecuta |
|---|---|---|
| `INSERT INTO lectores (nombre, correo, telefono) VALUES (?, ?, ?)` | `insertLector` | `POST /lectores` con datos completos |
| `SELECT id, nombre FROM lectores WHERE id = ?` | `findLectorById` | `POST /prestamos`, antes de insertar |
| `INSERT INTO prestamos (lector_id, libro, fecha_prestamo, dias) VALUES (?, ?, ?, ?)` | `insertPrestamo` | `POST /prestamos` con datos válidos y lector existente |

Al iniciar, `server.js` ejecuta `CREATE TABLE IF NOT EXISTS` para ambas tablas, de modo que la base de datos existente se conserva intacta.

## 5. Matriz de correspondencia

| Elemento OOHDM | Ruta o archivo | Tabla o campo | Evidencia funcional |
|---|---|---|---|
| Entidad principal `Lector` | `POST /lectores` (`handleRegistrarLector`) | `lectores`: `id`, `nombre`, `correo`, `telefono` | Registro almacenado e ID generado (`capturas/registro-exitoso.png`, `tabla1.png`) |
| Operación `Préstamo` | `POST /prestamos` (`handleRegistrarPrestamo`) | `prestamos`: `id`, `lector_id`, `libro`, `fecha_prestamo`, `dias` | Operación asociada mediante `lector_id` (`capturas/prestamo-exitoso.png`, `tabla2.png`) |
| Relación `Lector` 1 — 0..\* `Préstamo` | `server.js`: `findLectorById` | `prestamos.lector_id` → `lectores.id` | ID inexistente devuelve 400 «No existe un lector con ID …» |
| Nodo Inicio | `GET /` · `index.html` | No aplica | Página principal presentada (`capturas/inicio.png`) |
| Nodo Acerca de | `GET /acerca` · `acerca.html` | No aplica | Página presentada (`capturas/acerca.png`) |
| Nodo de registro | `GET /registro` · `registro.html` | No aplica | Formulario presentado (`capturas/registro.png`) |
| Nodo de servicios | `GET /servicios` · `servicios.html` | No aplica | Formulario presentado (`capturas/servicios.png`) |
| Estructura de acceso: menú | `<nav>` en cada HTML y en `renderPage()` | No aplica | Menú visible en todas las páginas y respuestas |
| Evento de envío (registro) | `POST /lectores` | `INSERT INTO lectores … VALUES (?, ?, ?)` | Respuesta 201 «¡Registro exitoso!» |
| Evento de envío (préstamo) | `POST /prestamos` | `INSERT INTO prestamos … VALUES (?, ?, ?, ?)` | Respuesta 201 «¡Préstamo registrado!» y mensaje `[CONFIRMACION]` en terminal (`capturas/terminal.png`) |
| Conservación del identificador | Campo `lector_id` de `servicios.html` | `lectores.id` → `prestamos.lector_id` | El ID mostrado en el registro se usa para solicitar el préstamo |
| Envío incompleto | `send400()` en `server.js` | Sin escritura en la base | Respuesta 400 «Faltan datos» |
| Ruta inexistente | `send404()` en `server.js` | No aplica | Respuesta 404 (`capturas/paginanoencontrada.png`) |
| Presentación visual | `styles.css` | No aplica | Estilo compartido por páginas estáticas y generadas |

## 6. Consistencia entre diseño y código: hallazgos y ajustes

Al contrastar los diagramas con el código se revisaron rutas, formularios, tablas y campos. El resultado:

**Ajuste realizado en el código (1).** El formulario de `servicios.html` declara `dias` con `min="1" max="60"`, pero `server.js` solo exigía que fuera un entero positivo, por lo que un envío directo (sin pasar por el navegador) aceptaba, por ejemplo, 61 días. Se agregó en `handleRegistrarPrestamo` una validación que responde 400 cuando `dias` supera 60, con el mensaje «Los días de préstamo deben estar entre 1 y 60.». Los envíos válidos y las tablas no cambian; el funcionamiento anterior se conserva.

**Observaciones documentadas, sin cambio de código:**

1. **Integridad referencial.** `prestamos.lector_id` no está declarada como `FOREIGN KEY` en `CREATE TABLE`. La regla «un préstamo pertenece a un lector existente» se garantiza en la aplicación con `findLectorById`. No se modificó el esquema para conservar la misma base de datos de la práctica anterior (`CREATE TABLE IF NOT EXISTS` no altera tablas ya creadas).
2. **Identificador.** El `id` del lector no se transfiere automáticamente entre nodos (no hay campo oculto ni parámetro en la URL); el usuario lo digita. Los modelos navegacional e interfaz abstracta lo reflejan así.
3. **Consulta.** No existe ruta de consulta de lectores ni de préstamos; por eso no aparece en el modelo navegacional.
4. **Nombre de la base de datos.** El enunciado sugiere `proyecto.db`; en este repositorio la base se llama `biblioteca.db` y se mantiene ese nombre porque el código y la práctica anterior la usan.

## 7. Fuentes editables

Los diagramas están definidos en **Graphviz (DOT)** dentro de [`fuentes_editables/`](fuentes_editables/). Se pueden editar con cualquier editor de texto y volver a exportar.

| Diagrama | Fuente editable | Exportados |
|---|---|---|
| Conceptual | `fuentes_editables/01_modelo_conceptual.dot` | `01_modelo_conceptual.png` / `.svg` |
| Navegacional | `fuentes_editables/02_modelo_navegacional.dot` | `02_modelo_navegacional.png` / `.svg` |
| Interfaz abstracta | `fuentes_editables/03_interfaz_abstracta.dot` | `03_interfaz_abstracta.png` / `.svg` |
| Implementación | `fuentes_editables/04_implementacion.dot` | `04_implementacion.png` / `.svg` |

Para regenerar (requiere [Graphviz](https://graphviz.org/download/)), desde `docs/oohdm/`:

```bash
dot -Tpng -Gdpi=130 fuentes_editables/01_modelo_conceptual.dot -o 01_modelo_conceptual.png
dot -Tsvg fuentes_editables/01_modelo_conceptual.dot -o 01_modelo_conceptual.svg
```

También se pueden pegar los archivos `.dot` en <https://dreampuf.github.io/GraphvizOnline/> sin instalar nada.
