# SONORA — Proyecto de Web Semántica

SONORA es una aplicación web de catálogo musical que utiliza tecnologías XML para almacenar, validar y transformar información, además de ofrecer funciones de búsqueda, perfiles de usuario, canciones favoritas y *likes*.

## Sitio publicado

**[Abrir SONORA en GitHub Pages](https://javialv22.github.io/sonora-web-semantica/)**

La vista principal del repositorio muestra este README porque GitHub lo utiliza como presentación del proyecto. Para abrir la aplicación, utiliza el enlace anterior o entra a `index.html`.

## Estructura del proyecto

- `canciones.xml`: catálogo base de canciones.
- `canciones.dtd`: validación estructural básica del archivo XML.
- `canciones.xsd`: validación de tipos de datos y valores permitidos.
- `canciones.xsl`: transformación del XML en la interfaz web principal.
- `perfil.html`: página de perfil de usuario, con las secciones **Información del usuario** y **Gustos musicales**.
- `canciones.css`: estilos y diseño responsivo.
- `canciones.js`: interacción dinámica de la aplicación.
- `servidor.py`: servidor web, API propia y persistencia de datos en XML.
- `datos.xml`: archivo generado automáticamente para almacenar usuarios, perfiles, canciones, favoritos y *likes*.

## Funcionalidades de la v2

- Catálogo base de canciones almacenado en `canciones.xml`.
- Validación estructural básica mediante `canciones.dtd`.
- Validación de tipos de datos y valores mediante `canciones.xsd`.
- Transformación de XML a una interfaz HTML mediante `canciones.xsl`.
- **Base de datos en XML (`datos.xml`):** almacenamiento estructurado de usuarios, sesiones, gustos musicales, canciones añadidas y eliminadas, favoritos y *likes*, en sustitución de SQLite.
- Búsqueda en tiempo real por título, artista o álbum.
- Filtros combinables por género, rango de año y vista exclusiva de **Mis canciones favoritas**.
- Reproductor HTML5 integrado para la pista de demostración de cada registro.
- Portadas, avances de audio (*previews*) y enlaces oficiales obtenidos dinámicamente mediante iTunes Search API.
- **Sistema de *likes* (`♥`):** cada tarjeta muestra cuántos usuarios han marcado una canción y permite agregar o quitar el voto propio.
- **Gestión de favoritos (`★`):** cada usuario puede agregar canciones a sus favoritos o retirarlas desde el catálogo o desde su perfil.
- **Menú de perfil desplegable:** ubicado en la esquina superior derecha, muestra el avatar del usuario y proporciona acceso a **Perfil**, **Mis canciones favoritas** y **Cerrar sesión**.
- **Página de perfil (`perfil.html`):** incluye **Información del usuario** (estadísticas, fecha de registro, biografía y color de insignia) y **Gustos musicales** (géneros preferidos, artistas favoritos y administración de canciones favoritas).
- **Ventanas emergentes de confirmación:** cuadros de diálogo interactivos (`<dialog>`) al eliminar una canción, quitar una canción de favoritos o cerrar sesión.
- **Biblioteca compartida:** las canciones agregadas escribiendo únicamente el título aparecen para todos los usuarios e indican quién las añadió.
- **Recomendaciones personalizadas:** se calculan a partir de los géneros y artistas del perfil.
- **Playlists:** cada usuario puede crear listas usando sus canciones favoritas.
- **Historial:** se registra la reproducción de canciones y se utiliza para estadísticas.
- **Estadísticas:** el perfil mantiene conteos de favoritas, likes, historial, aportaciones y géneros.
- **Reseñas:** la API permite guardar calificaciones y comentarios por canción.

## Cómo probar el proyecto

1. Instala Python 3.11 o una versión reciente.
2. Abre una terminal en la carpeta del proyecto y ejecuta el servidor:

   ```powershell
   python servidor.py
   ```

3. Abre en tu navegador [http://localhost:8000/canciones.xml](http://localhost:8000/canciones.xml). El archivo `datos.xml` se crea automáticamente junto a `servidor.py`.
4. Crea un usuario con un nombre de al menos 3 caracteres y una contraseña de al menos 4 caracteres.
5. Usa el botón `♡` para dar *like* a tus canciones preferidas y el botón `☆` para agregarlas a favoritos o retirarlas de ellos.
6. Haz clic en tu nombre de usuario, en la esquina superior derecha, para abrir el menú y acceder a **Perfil**, **Mis canciones favoritas** o **Cerrar sesión**.
7. Pulsa **+ Agregar canción**, escribe el título de una pista y agrégala a la biblioteca compartida en XML.

> Las funciones de usuarios, canciones agregadas, favoritos, likes y eliminación necesitan ejecutar `servidor.py`; la versión publicada en GitHub Pages solo sirve los archivos estáticos y no puede guardar cambios en `datos.xml`.

### Usuarios de demostración

Para probar rápidamente los perfiles y permisos:

| Usuario | Contraseña |
|---|---|
| `DIOS` | `1234` |
| `JUAN` | `1234` |
| `MARIA` | `1234` |
| `ANA` | `1234` |

Las canciones base no tienen botón de eliminación. Las canciones agregadas por otro usuario tampoco muestran ese botón; únicamente aparece para quien las agregó. Al eliminar una canción agregada, también se quitan sus favoritos y likes.

## Base de datos XML y seguridad

El backend gestiona la persistencia mediante el archivo `datos.xml`, que contiene nodos como `<usuarios>`, `<canciones_agregadas>`, `<canciones_eliminadas>`, `<favoritos>` y `<likes>`.

Las contraseñas no se guardan en texto plano: se almacenan usando un *salt* aleatorio y un hash `PBKDF2-SHA256`. La sesión activa se administra mediante una cookie `HttpOnly` mientras el servidor está en ejecución.

Las portadas y los avances de audio de 30 segundos se consultan desde iTunes Search API al cargar la página. La interfaz también incluye enlaces directos a Apple Music.

## API y funciones nuevas

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/recommendations` | GET | Recomendaciones del usuario |
| `/api/playlists` | GET/POST | Consultar o crear playlists |
| `/api/reviews` | GET/POST | Consultar o guardar reseñas |
| `/api/history` | POST | Registrar una reproducción |
| `/api/stats` | GET | Estadísticas del perfil |

Las sesiones se almacenan en XML con expiración de siete días. Los cambios en `datos.xml` se escriben mediante un archivo temporal y reemplazo atómico para reducir el riesgo de corrupción.
