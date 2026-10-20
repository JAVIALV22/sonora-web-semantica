<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" encoding="UTF-8" omit-xml-declaration="yes"/>
  <xsl:template match="/">
    <html lang="es">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Sonora | Biblioteca musical</title>
        <link rel="stylesheet" href="canciones.css?v=5"/>
      </head>
      <body>
        <header class="topbar">
          <a class="brand" href="canciones.xml">
            <span class="brand-mark">S</span>
            <span>SONORA</span>
          </a>
          <div class="session">
            <span id="guest-status" class="user-status-label">Invitado</span>
            <button id="login-button" class="button button-dark" type="button">Iniciar sesión</button>

            <div id="profile-menu-container" class="profile-menu-container" hidden="hidden">
              <button id="profile-trigger" class="profile-trigger" type="button" aria-expanded="false">
                <span class="profile-avatar-small" id="header-avatar">U</span>
                <span id="user-status">Usuario</span>
                <span class="caret">▾</span>
              </button>
              <div id="profile-dropdown" class="profile-dropdown" hidden="hidden">
                <div class="dropdown-header">
                  <div class="profile-avatar-large" id="dropdown-avatar">👤</div>
                  <strong id="dropdown-username">Usuario</strong>
                  <span class="dropdown-badge">Cuenta activa</span>
                </div>
                <div class="dropdown-actions">
                  <button type="button" id="btn-go-profile" class="dropdown-btn">👤 Perfil</button>
                  <button type="button" id="btn-my-favorites" class="dropdown-btn">★ Mis canciones favoritas</button>
                  <button type="button" id="btn-logout" class="dropdown-btn dropdown-btn-danger">⎋ Cerrar sesión</button>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main>
          <section class="hero">
            <p class="eyebrow">ARCHIVO MUSICAL · <xsl:value-of select="count(cancionero/cancion)"/> PISTAS BASE</p>
            <h1>Tu música,<br/><em>a tu manera.</em></h1>
            <p class="hero-copy">Explora canciones, descubre nuevos sonidos, marca tus likes y organiza tu colección musical.</p>
          </section>

          <section class="controls" aria-label="Controles de búsqueda">
            <label class="search-box">
              <span aria-hidden="true">⌕</span>
              <input id="search" type="search" placeholder="Buscar por título, artista o álbum..."/>
            </label>
            <label class="select-box">
              <span>Género</span>
              <select id="genre-filter">
                <option value="">Todos</option>
                <option value="pop">Pop</option>
                <option value="rock">Rock</option>
                <option value="latino">Latino</option>
                <option value="balada">Balada</option>
                <option value="reggaeton">Reggaetón</option>
                <option value="salsa">Salsa</option>
                <option value="regional">Regional</option>
              </select>
            </label>
            <label class="select-box">
              <span>Año</span>
              <select id="year-filter">
                <option value="">Todos</option>
                <option value="2020">2020–Presente</option>
                <option value="2010">2010–2019</option>
                <option value="2000">2000–2009</option>
                <option value="1900">Antes de 2000</option>
              </select>
            </label>
            <button id="add-song-button" class="button button-dark" type="button">+ Agregar canción</button>
          </section>

          <div class="list-heading">
            <div class="heading-group">
              <h2 id="catalog-title">Catálogo completo</h2>
              <button id="show-all-button" class="button button-outline" type="button" hidden="hidden">Ver todas las canciones</button>
            </div>
            <span id="results-count"></span>
          </div>

          <section class="song-grid">
            <xsl:for-each select="cancionero/cancion">
              <article class="song-card" data-id="{@id}" data-genre="{@genero}" data-year="{anio}" data-search="{concat(titulo, ' ', artista, ' ', album)}">
                <div class="cover cover-{position() mod 5}" data-title="{titulo}" data-artist="{artista}">
                  <span><xsl:value-of select="substring(titulo, 1, 1)"/></span>
                </div>
                <div class="song-info">
                  <div class="song-top">
                    <span class="genre"><xsl:value-of select="@genero"/></span>
                    <div class="card-actions">
                      <button class="like-button" data-id="{@id}" type="button" aria-label="Dar like">
                        <span class="like-icon">♡</span>
                        <span class="like-count" data-like-count="{@id}">0 likes</span>
                      </button>
                      <button class="favorite-button" data-id="{@id}" type="button" aria-label="Agregar a favoritos" title="Favorito">☆</button>
                    </div>
                  </div>
                  <h3><xsl:value-of select="titulo"/></h3>
                  <p class="song-subtitle"><xsl:value-of select="artista"/> · <xsl:value-of select="album"/></p>
                  <div class="song-meta">
                    <span>Año: <xsl:value-of select="anio"/></span>
                    <span>Duración: <xsl:value-of select="duracion"/></span>
                  </div>
                  <audio controls="controls" preload="none">
                    <xsl:attribute name="src"><xsl:value-of select="audio"/></xsl:attribute>
                  </audio>
                </div>
              </article>
            </xsl:for-each>
          </section>
        </main>

        <dialog id="login-dialog">
          <form method="dialog" id="auth-form">
            <button type="button" id="close-dialog" class="close-button" aria-label="Cerrar">×</button>
            <p class="eyebrow">CUENTA SONORA</p>
            <h2>Guarda tus favoritas.</h2>
            <p class="dialog-copy">Regístrate o inicia sesión para conservar tu colección musical.</p>
            <label class="field-label">Usuario
              <input name="username" required="required" minlength="3" autocomplete="username"/>
            </label>
            <label class="field-label">Contraseña
              <input name="password" type="password" required="required" minlength="4" autocomplete="current-password"/>
            </label>
            <p id="auth-message" class="auth-message"></p>
            <button type="submit" class="button button-accent">Entrar / Registrarme</button>
          </form>
        </dialog>

        <dialog id="add-song-dialog">
          <form method="dialog" id="add-song-form">
            <button type="button" id="close-add-dialog" class="close-button" aria-label="Cerrar">×</button>
            <p class="eyebrow">NUEVA CANCIÓN</p>
            <h2>Amplía tu biblioteca.</h2>
            <p class="dialog-copy">Escribe el título de la canción para buscarla y guardarla en tu biblioteca.</p>
            <label class="field-label">Título de la canción
              <input name="title" required="required" autocomplete="off" placeholder="Ej. Imagine"/>
            </label>
            <p id="add-song-message" class="auth-message" role="status"></p>
            <button id="add-song-submit" type="submit" class="button button-accent">Buscar y agregar</button>
          </form>
        </dialog>

        <dialog id="confirm-dialog">
          <div class="confirm-box">
            <p class="eyebrow" id="confirm-eyebrow">CONFIRMACIÓN</p>
            <h2 id="confirm-title">¿Estás seguro?</h2>
            <p id="confirm-message" class="dialog-copy">Confirma si deseas realizar esta acción.</p>
            <div class="confirm-actions">
              <button type="button" id="confirm-cancel" class="button button-outline">Cancelar</button>
              <button type="button" id="confirm-accept" class="button button-accent">Confirmar</button>
            </div>
          </div>
        </dialog>

        <script src="canciones.js?v=5"></script>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>