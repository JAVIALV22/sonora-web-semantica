# SONORA - Proyecto de Web Semantica

## Estructura del proyecto

- `canciones.xml`: catálogo base de canciones.
- `canciones.dtd`: estructura XML básica.
- `canciones.xsd`: tipos y valores permitidos.
- `canciones.xsl`: transformación del XML en la interfaz.
- `canciones.css` y `canciones.js`: diseño e interacción.
- `servidor.py`: servidor web, API propia y conexión SQLite.
- `sonora.db`: se genera localmente y está excluido de Git.

## Funcionalidades

- Catalogo de canciones almacenado en `canciones.xml`.
- Validacion estructural basica mediante `canciones.dtd`.
- Validacion de tipos y valores mediante `canciones.xsd`.
- Transformacion de XML a una interfaz HTML con `canciones.xsl`.
- Busqueda por titulo, artista o album.
- Filtros por genero y rango de anio.
- Reproductor HTML5 para la pista de demostracion de cada registro.
- Registro e inicio de sesion de demostracion.
- Favoritos independientes para cada usuario.
- Cada usuario puede agregar canciones escribiendo solamente el título.
- Portadas, previews y enlaces oficiales obtenidos desde iTunes Search API.
- Usuarios, sesiones, canciones añadidas y favoritos almacenados en SQLite.
- Biblioteca compartida: las canciones añadidas por un usuario aparecen para los demás usuarios.

## Como probarlo

1. Instala Python 3.11 o una versión reciente.
2. Usa la barra de busqueda y los filtros.
3. Pulsa el boton de reproduccion de una tarjeta.
4. Crea un usuario con una contrasena de al menos cuatro caracteres.
5. Pulsa la estrella para guardar o quitar una cancion de favoritos.
6. Inicia sesión, pulsa `+ Agregar canción`, escribe un título y confirma la canción encontrada.
7. Cierra sesión o entra con otra cuenta: la canción añadida seguirá apareciendo con el nombre de quien la agregó.

La versión completa se ejecuta con el backend incluido:

```powershell
python servidor.py
```

Despues visita `http://localhost:8000/canciones.xml`. El archivo `sonora.db` se crea automaticamente junto a `servidor.py`.

## Subirlo a GitHub

Desde esta carpeta:

```powershell
git init
git add .
git commit -m "Crear proyecto Sonora de web semantica"
git branch -M main
git remote add origin https://github.com/USUARIO/sonora.git
git push -u origin main
```

Antes de publicar, comprueba que `sonora.db`, `__pycache__` y cualquier archivo `.env` no aparezcan en `git status`. El archivo `.gitignore` ya los excluye.

## Base de datos y login

El backend usa SQLite con las tablas `users`, `songs` y `favorites`. Las canciones de `songs` forman una biblioteca compartida y conservan el usuario que las agregó. Las contraseñas no se guardan en texto plano: se almacenan con salt y PBKDF2-SHA256. La sesión usa una cookie HttpOnly mientras el servidor está activo. Los favoritos continúan siendo privados para cada usuario.

Las portadas y los previews se consultan desde iTunes Search API al cargar la página. El preview dura aproximadamente 30 segundos; la API no permite reproducir gratuitamente la canción completa. Para eso se debe enviar al usuario a una plataforma oficial como Apple Music, Spotify o YouTube.

Las canciones agregadas por un usuario se guardan en SQLite y no modifican `canciones.xml`. Para publicar el proyecto en internet habría que añadir HTTPS, una gestión persistente de sesiones y desplegar el backend con la base de datos.

Las pistas incluidas en XML son un respaldo de demostración. Para publicar el proyecto, deben reemplazarse por archivos propios o por audio con licencia compatible.
