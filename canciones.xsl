<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" encoding="UTF-8" omit-xml-declaration="yes"/>
  <xsl:template match="/">
    <html lang="es">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Sonora | Biblioteca musical</title>
        <link rel="stylesheet" href="canciones.css?v=3"/>
      </head>
      <body>
        <header class="topbar">
          <a class="brand" href="canciones.xml"><span class="brand-mark">S</span><span>SONORA</span></a>
          <div class="session"><span id="user-status">Invitado</span><button id="login-button" class="button button-dark">Iniciar sesión</button></div>
        </header>
        <main>
          <section class="hero">
            <p class="eyebrow">ARCHIVO MUSICAL · <xsl:value-of select="count(cancionero/cancion)"/> PISTAS</p>
            <h1>Tu música,<br/><em>a tu manera.</em></h1>
            <p class="hero-copy">Explora canciones, descubre nuevos sonidos y crea tu propia colección.</p>
          </section>
          <section class="controls" aria-label="Controles de búsqueda">
            <label class="search-box"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="Buscar canción, artista o álbum"/></label>
            <label class="select-box"><span>Género</span><select id="genre-filter"><option value="">Todos</option><option value="pop">Pop</option><option value="rock">Rock</option><option value="latino">Latino</option><option value="balada">Balada</option><option value="reggaeton">Reggaetón</option><option value="salsa">Salsa</option><option value="regional">Regional</option></select></label>
            <label class="select-box"><span>Año</span><select id="year-filter"><option value="">Todos</option><option value="2020">2020–2024</option><option value="2010">2010–2019</option><option value="2000">2000–2009</option><option value="1900">Antes de 2000</option></select></label>
            <button id="add-song-button" class="button button-dark" type="button">+ Agregar canción</button>
          </section>
          <div class="list-heading"><h2>Catálogo completo</h2><span id="results-count"></span></div>
          <section class="song-grid">
            <xsl:for-each select="cancionero/cancion">
              <article class="song-card" data-id="{@id}" data-genre="{@genero}" data-year="{anio}" data-search="{concat(titulo, ' ', artista, ' ', album)}">
                <div class="cover cover-{position() mod 5}" data-title="{titulo}" data-artist="{artista}"><span><xsl:value-of select="substring(titulo, 1, 1)"/></span></div>
                <div class="song-info"><div class="song-top"><span class="genre"><xsl:value-of select="@genero"/></span><button class="favorite-button" data-id="{@id}" aria-label="Agregar a favoritos">☆</button></div><h3><xsl:value-of select="titulo"/></h3><p><xsl:value-of select="artista"/> · <xsl:value-of select="album"/></p><div class="song-meta"><span><xsl:value-of select="anio"/></span><span><xsl:value-of select="duracion"/></span></div><audio controls="controls" preload="none"><xsl:attribute name="src"><xsl:value-of select="audio"/></xsl:attribute></audio></div>
              </article>
            </xsl:for-each>
          </section>
        </main>
        <footer><span>SONORA / Proyecto de Web Semántica</span><span>XML · DTD · XSD · XSL</span></footer>
        <dialog id="login-dialog"><form method="dialog" id="auth-form"><button type="button" id="close-dialog" class="close-button" aria-label="Cerrar">×</button><p class="eyebrow">CUENTA SONORA</p><h2>Guarda tus favoritas.</h2><p class="dialog-copy">Regístrate o inicia sesión para conservar tu colección en este navegador.</p><label>Usuario<input name="username" required="required" minlength="3" autocomplete="username"/></label><label>Contraseña<input name="password" type="password" required="required" minlength="4" autocomplete="current-password"/></label><p id="auth-message" class="auth-message"></p><button type="submit" class="button button-accent">Entrar / registrarme</button></form></dialog>
        <dialog id="add-song-dialog"><form method="dialog" id="add-song-form"><button type="button" id="close-add-dialog" class="close-button" aria-label="Cerrar">×</button><p class="eyebrow">NUEVA CANCIÓN</p><h2>Amplía tu biblioteca.</h2><p class="dialog-copy">Busca por título. Revisaremos la coincidencia antes de guardarla en tu cuenta.</p><label class="field-label">Título de la canción<input name="title" required="required" autocomplete="off" placeholder="Ej. Imagine"/></label><p id="add-song-message" class="auth-message" role="status"></p><button id="add-song-submit" type="submit" class="button button-accent">Buscar canción</button></form></dialog>
        <script src="canciones.js?v=3"></script>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
