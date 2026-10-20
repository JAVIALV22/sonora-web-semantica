let sessionUser = null;
let favoriteIds = new Set();
let userLikes = new Set();
let likeCounts = {};
let deletedSongIds = new Set();
let onlyFavoritesMode = false;
let playlistOptions = [];

const BASE_CATALOG = {
  c1: { title: 'Billie Jean', artist: 'Michael Jackson', genre: 'pop' },
  c2: { title: 'Bohemian Rhapsody', artist: 'Queen', genre: 'rock' },
  c3: { title: 'Shape of You', artist: 'Ed Sheeran', genre: 'pop' },
  c4: { title: 'Vivir Mi Vida', artist: 'Marc Anthony', genre: 'latino' },
  c5: { title: 'Someone Like You', artist: 'Adele', genre: 'balada' },
  c6: { title: 'Ojitos Lindos', artist: 'Bad Bunny', genre: 'reggaeton' },
  c7: { title: 'Smells Like Teen Spirit', artist: 'Nirvana', genre: 'rock' },
  c8: { title: 'La Rebelion', artist: 'Joe Arroyo', genre: 'salsa' },
  c9: { title: 'Blinding Lights', artist: 'The Weeknd', genre: 'pop' },
  c10: { title: 'Ella Baila Sola', artist: 'Eslabon Armado y Peso Pluma', genre: 'regional' },
};

function currentUser() {
  return sessionUser;
}

function applyAvatar(element, user) {
  if (!element) return;
  element.style.backgroundColor = user?.avatarColor || '#2b7a78';
  if (element.id === 'header-avatar') {
    element.textContent = (user?.username || 'U').charAt(0).toUpperCase();
  }
  const icon = element.querySelector('svg');
  if (icon) icon.hidden = false;
}

async function loadStats() {
  const container = document.querySelector('#profile-stats');
  if (!container) return;
  try {
    const stats = await api('/api/stats');
    container.replaceChildren();
    const values = [
      ['Favoritas', stats.favorites],
      ['Likes dados', stats.likes],
      ['Reproducciones', stats.history],
      ['Canciones aportadas', stats.added],
    ];
    values.forEach(([label, value]) => {
      const card = document.createElement('div');
      card.className = 'recommendation-card';
      const number = document.createElement('strong');
      number.textContent = String(value);
      const text = document.createElement('p');
      text.textContent = label;
      card.append(number, text);
      container.append(card);
    });
    Object.entries(stats.genres || {}).forEach(([genre, count]) => {
      const card = document.createElement('div');
      card.className = 'recommendation-card';
      const text = document.createElement('p');
      text.textContent = `${genre}: ${count} actividad${count === 1 ? '' : 'es'}`;
      card.append(text);
      container.append(card);
    });
  } catch (error) {
    container.textContent = error.message;
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Error del servidor.');
  return data;
}

function askConfirmation({ eyebrow = 'CONFIRMACIÓN', title = '¿Estás seguro?', message = '', confirmText = 'Confirmar' }) {
  return new Promise((resolve) => {
    const dialog = document.querySelector('#confirm-dialog');
    if (!dialog) {
      resolve(window.confirm(message || title));
      return;
    }
    document.querySelector('#confirm-eyebrow').textContent = eyebrow;
    document.querySelector('#confirm-title').textContent = title;
    document.querySelector('#confirm-message').textContent = message;
    const acceptBtn = document.querySelector('#confirm-accept');
    const cancelBtn = document.querySelector('#confirm-cancel');
    acceptBtn.textContent = confirmText;

    const cleanup = (result) => {
      acceptBtn.removeEventListener('click', onAccept);
      cancelBtn.removeEventListener('click', onCancel);
      dialog.close();
      resolve(result);
    };
    const onAccept = () => cleanup(true);
    const onCancel = () => cleanup(false);

    acceptBtn.addEventListener('click', onAccept);
    cancelBtn.addEventListener('click', onCancel);
    dialog.showModal();
  });
}

function updateSessionUI() {
  const user = currentUser();
  const guestStatus = document.querySelector('#guest-status');
  const loginBtn = document.querySelector('#login-button');
  const profileContainer = document.querySelector('#profile-menu-container');

  if (guestStatus && loginBtn && profileContainer) {
    if (user) {
      guestStatus.hidden = true;
      loginBtn.hidden = true;
      profileContainer.hidden = false;
      document.querySelector('#user-status').textContent = user.username;
      document.querySelector('#dropdown-username').textContent = user.username;
      const headerAvatar = document.querySelector('#header-avatar');
      const dropdownAvatar = document.querySelector('#dropdown-avatar');
      if (headerAvatar) {
        applyAvatar(headerAvatar, user);
      }
      if (dropdownAvatar) {
        applyAvatar(dropdownAvatar, user);
      }
    } else {
      guestStatus.hidden = false;
      loginBtn.hidden = false;
      profileContainer.hidden = true;
      const dropdown = document.querySelector('#profile-dropdown');
      if (dropdown) dropdown.hidden = true;
    }
  }

  document.querySelectorAll('.favorite-button').forEach((button) => {
    const id = String(button.dataset.id);
    const active = Boolean(user && favoriteIds.has(id));
    button.classList.toggle('is-favorite', active);
    button.setAttribute('aria-label', active ? 'Quitar de favoritos' : 'Agregar a favoritos');
    button.textContent = active ? '★' : '☆';
  });

  document.querySelectorAll('.like-button').forEach((button) => {
    const id = String(button.dataset.id);
    const count = likeCounts[id] || 0;
    const liked = Boolean(user && userLikes.has(id));
    button.classList.toggle('is-liked', liked);
    const icon = button.querySelector('.like-icon');
    const countSpan = button.querySelector('.like-count');
    if (icon) icon.textContent = liked ? '♥' : '♡';
    if (countSpan) countSpan.textContent = `${count} ${count === 1 ? 'like' : 'likes'}`;
  });

  const addSongBtn = document.querySelector('#add-song-button');
  if (addSongBtn) addSongBtn.disabled = !user;
  if (user && document.querySelector('.song-grid')) refreshPlaylistControls();
}

function refreshPlaylistControls() {
  document.querySelectorAll('.song-card').forEach((card) => {
    const actions = card.querySelector('.card-actions');
    const trackId = card.dataset.id;
    const existingPicker = actions?.querySelector('.playlist-picker');
    if (!actions || !trackId) return;
    if (existingPicker) existingPicker.remove();
    const picker = document.createElement('div');
    picker.className = 'playlist-picker';
    const select = document.createElement('select');
    select.className = 'playlist-select';
    select.setAttribute('aria-label', 'Elegir playlist');
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = playlistOptions.length ? 'Agregar a playlist' : 'Crea una playlist en tu perfil';
    select.append(empty);
    playlistOptions.forEach((playlist) => {
      const option = document.createElement('option');
      option.value = playlist.id;
      option.textContent = playlist.name;
      select.append(option);
    });
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'playlist-add-button';
    button.textContent = '+';
    button.title = 'Agregar a playlist';
    button.disabled = !playlistOptions.length;
    button.addEventListener('click', async () => {
      if (!select.value) return;
      button.disabled = true;
      try {
        await api('/api/playlists', {
          method: 'POST',
          body: JSON.stringify({ playlistId: select.value, trackId }),
        });
        button.textContent = '✓';
        select.value = '';
      } catch (error) {
        window.alert(error.message);
      } finally {
        button.disabled = false;
      }
    });
    picker.append(select, button);
    actions.append(picker);
  });
}

async function loadCatalogPlaylists() {
  if (!currentUser() || !document.querySelector('.song-grid')) return;
  try {
    const [data, catalogData] = await Promise.all([
      api('/api/playlists'),
      api('/api/songs'),
    ]);
    const catalog = { ...BASE_CATALOG };
    (catalogData.songs || []).forEach((song) => {
      catalog[String(song.trackId)] = {
        trackName: song.trackName,
        artistName: song.artistName,
        collectionName: song.collectionName,
      };
    });
    playlistOptions = data.playlists || [];
    refreshPlaylistControls();
  } catch (error) {
    console.warn('No se pudieron cargar las playlists.', error);
  }
}

function filterSongs() {
  const searchInput = document.querySelector('#search');
  if (!searchInput) return;

  const query = searchInput.value.toLowerCase().trim();
  const genre = document.querySelector('#genre-filter').value;
  const year = document.querySelector('#year-filter').value;
  let visible = 0;

  document.querySelectorAll('.song-card').forEach((card) => {
    const cardId = String(card.dataset.id);
    if (deletedSongIds.has(cardId)) {
      card.hidden = true;
      return;
    }
    const matchesText = card.dataset.search.toLowerCase().includes(query);
    const matchesGenre = !genre || card.dataset.genre === genre;
    const songYear = Number(card.dataset.year);
    const matchesYear = !year ||
      (year === '2020' && songYear >= 2020) ||
      (year === '2010' && songYear >= 2010 && songYear < 2020) ||
      (year === '2000' && songYear >= 2000 && songYear < 2010) ||
      (year === '1900' && songYear < 2000);
    const matchesFavorite = !onlyFavoritesMode || favoriteIds.has(cardId);

    const shown = matchesText && matchesGenre && matchesYear && matchesFavorite;
    card.hidden = !shown;
    if (shown) visible += 1;
  });

  const resultsCount = document.querySelector('#results-count');
  if (resultsCount) {
    resultsCount.textContent = `${visible} ${visible === 1 ? 'canción encontrada' : 'canciones encontradas'}`;
  }
}

async function requestLogout() {
  const confirmed = await askConfirmation({
    eyebrow: 'SESIÓN DE USUARIO',
    title: '¿Cerrar sesión?',
    message: '¿Estás seguro de que deseas cerrar tu sesión actual en Sonora?',
    confirmText: 'Sí, cerrar sesión',
  });
  if (!confirmed) return;

  await api('/api/logout', { method: 'POST' }).catch(() => {});
  sessionUser = null;
  favoriteIds = new Set();
  userLikes = new Set();
  playlistOptions = [];
  onlyFavoritesMode = false;

  if (window.location.pathname.endsWith('perfil.html')) {
    window.location.href = 'canciones.xml';
    return;
  }

  const catalogTitle = document.querySelector('#catalog-title');
  const showAllBtn = document.querySelector('#show-all-button');
  if (catalogTitle) catalogTitle.textContent = 'Catálogo completo';
  if (showAllBtn) showAllBtn.hidden = true;

  await restoreUserSongs();
}

async function handleAuth(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const username = form.username.value.trim();
  const password = form.password.value;
  if (!username || password.length < 4) return;
  try {
    let result;
    try {
      result = await api('/api/register', { method: 'POST', body: JSON.stringify({ username, password }) });
    } catch (registerError) {
      if (!registerError.message.includes('ya existe')) throw registerError;
      result = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    }
    sessionUser = result.user;
    await syncFavoritesAndLikes();
    form.reset();
    document.querySelector('#auth-message').textContent = '';
    document.querySelector('#login-dialog').close();
    updateSessionUI();
    await restoreUserSongs();
  } catch (error) {
    document.querySelector('#auth-message').textContent = error.message;
  }
}

async function syncFavoritesAndLikes() {
  if (sessionUser) {
    const favData = await api('/api/favorites');
    favoriteIds = new Set(favData.favorites.map(String));
  } else {
    favoriteIds = new Set();
  }
  const likesData = await api('/api/likes');
  likeCounts = likesData.counts || {};
  userLikes = new Set((likesData.userLikes || []).map(String));
}

async function toggleFavorite(event) {
  const user = currentUser();
  if (!user) {
    document.querySelector('#auth-message').textContent = 'Inicia sesión para guardar favoritos.';
    document.querySelector('#login-dialog').showModal();
    return;
  }
  const button = event.currentTarget;
  const trackId = String(button.dataset.id);
  const card = button.closest('.song-card');
  const songTitle = card?.querySelector('h3')?.textContent || 'esta canción';

  try {
    if (favoriteIds.has(trackId)) {
      const confirmed = await askConfirmation({
        eyebrow: 'MIS FAVORITOS',
        title: '¿Quitar de favoritos?',
        message: `¿Deseas retirar "${songTitle}" de tu lista de canciones favoritas?`,
        confirmText: 'Sí, quitar',
      });
      if (!confirmed) return;

      await api(`/api/favorites/${encodeURIComponent(trackId)}`, { method: 'DELETE' });
      favoriteIds.delete(trackId);
    } else {
      await api('/api/favorites', { method: 'POST', body: JSON.stringify({ trackId }) });
      favoriteIds.add(trackId);
    }
    updateSessionUI();
    filterSongs();
  } catch (error) {
    console.error(error);
  }
}

async function toggleLike(event) {
  const user = currentUser();
  if (!user) {
    document.querySelector('#auth-message').textContent = 'Inicia sesión para dar like a una canción.';
    document.querySelector('#login-dialog').showModal();
    return;
  }
  const button = event.currentTarget;
  const trackId = String(button.dataset.id);
  try {
    if (userLikes.has(trackId)) {
      await api(`/api/likes/${encodeURIComponent(trackId)}`, { method: 'DELETE' });
    } else {
      await api('/api/likes', { method: 'POST', body: JSON.stringify({ trackId }) });
    }
    await syncFavoritesAndLikes();
    updateSessionUI();
  } catch (error) {
    console.error(error);
  }
}

async function handleDeleteSong(event) {
  const user = currentUser();
  if (!user) {
    document.querySelector('#auth-message').textContent = 'Inicia sesión para eliminar canciones.';
    document.querySelector('#login-dialog').showModal();
    return;
  }
  const button = event.currentTarget;
  const trackId = String(button.dataset.id);
  const title = button.dataset.title || 'esta canción';

  const confirmed = await askConfirmation({
    eyebrow: 'ELIMINAR CANCIÓN',
    title: '¿Eliminar canción?',
    message: `¿Estás seguro de que deseas eliminar "${title}" de la biblioteca? Esta acción no se puede deshacer.`,
    confirmText: 'Sí, eliminar',
  });
  if (!confirmed) return;

  try {
    await api(`/api/songs/${encodeURIComponent(trackId)}`, { method: 'DELETE' });
    favoriteIds.delete(trackId);
    userLikes.delete(trackId);
    await restoreUserSongs();
  } catch (error) {
    console.error(error);
  }
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.round(milliseconds / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function titleMatchesSearch(song, query) {
  const normalizedTitle = (song.trackName || '').toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((word) => normalizedTitle.includes(word));
}

function renderSongSummary(song, className = 'recommendation-card') {
  const card = document.createElement('article');
  card.className = className;
  const title = document.createElement('strong');
  title.textContent = song.trackName || 'Canción sin título';
  const details = document.createElement('p');
  details.textContent = `${song.artistName || 'Artista desconocido'} · ${song.primaryGenreName || 'Sin género'}`;
  card.append(title, details);
  return card;
}

async function searchSemanticCatalog(event) {
  const query = event.currentTarget.value.trim();
  const results = document.querySelector('#semantic-results');
  if (!results) return;
  if (query.length < 2) {
    results.replaceChildren();
    return;
  }
  try {
    const data = await api(`/api/semantic/search?q=${encodeURIComponent(query)}`);
    results.replaceChildren();
    if (!data.results.length) {
      results.textContent = 'No encontramos relaciones para esa búsqueda.';
      return;
    }
    data.results.slice(0, 8).forEach((song) => results.append(renderSongSummary(song, 'semantic-result')));
  } catch (error) {
    results.textContent = error.message;
  }
}

function createSongCard(song, index) {
  const card = document.createElement('article');
  const title = song.trackName || song.title;
  const artist = song.artistName || 'Artista desconocido';
  const album = song.collectionName || 'Álbum desconocido';
  const addedBy = song.addedBy || currentUser()?.username || 'Usuario';
  const year = song.releaseDate ? new Date(song.releaseDate).getFullYear() : '';
  const genre = (song.primaryGenreName || 'pop').toLowerCase();
  const trackId = String(song.trackId || Date.now());

  card.className = 'song-card user-song';
  card.dataset.id = trackId;
  card.dataset.genre = genre;
  card.dataset.year = year;
  card.dataset.search = `${title} ${artist} ${album}`.toLowerCase();

  const cover = document.createElement('div');
  cover.className = `cover cover-${index % 5}`;
  cover.dataset.title = title;
  cover.dataset.artist = artist;
  const initial = document.createElement('span');
  initial.textContent = title.charAt(0);
  cover.append(initial);

  const info = document.createElement('div');
  info.className = 'song-info';
  info.innerHTML = `
    <div class="song-top">
      <span class="genre"></span>
      <div class="card-actions">
        <button class="like-button" data-id="${trackId}" type="button" aria-label="Dar like">
          <span class="like-icon">♡</span>
          <span class="like-count" data-like-count="${trackId}">0 likes</span>
        </button>
        <button class="favorite-button" data-id="${trackId}" type="button" aria-label="Agregar a favoritos" title="Favorito">☆</button>
        <button class="delete-song-button" data-id="${trackId}" type="button" aria-label="Eliminar canción" title="Eliminar canción">🗑</button>
      </div>
    </div>
    <h3></h3>
    <p class="song-subtitle"></p>
    <div class="song-meta"><span></span><span></span></div>
    <small class="added-by"></small>
  `;
  info.querySelector('.genre').textContent = genre;
  info.querySelector('h3').textContent = title;
  info.querySelector('.song-subtitle').textContent = `${artist} · ${album}`;
  info.querySelector('.song-meta span').textContent = year ? `Año: ${year}` : '';
  info.querySelectorAll('.song-meta span')[1].textContent = song.trackTimeMillis ? `Duración: ${formatDuration(song.trackTimeMillis)}` : '';
  info.querySelector('.added-by').textContent = `Agregada por ${addedBy}`;
  const deleteButton = info.querySelector('.delete-song-button');
  const ownsSong = currentUser()?.username?.toLowerCase() === addedBy.toLowerCase();
  if (!ownsSong) {
    deleteButton.remove();
  } else {
    deleteButton.dataset.title = title;
  }

  const audio = document.createElement('audio');
  audio.controls = true;
  audio.preload = 'none';
  audio.src = song.previewUrl || '';
  audio.addEventListener('play', recordPlayback, { once: true });
  info.append(audio);

  card.append(cover, info);
  card.querySelector('.favorite-button').addEventListener('click', toggleFavorite);
  card.querySelector('.like-button').addEventListener('click', toggleLike);
  if (deleteButton.isConnected) {
    deleteButton.addEventListener('click', handleDeleteSong);
  }
  return card;
}

async function restoreUserSongs() {
  const grid = document.querySelector('.song-grid');
  if (!grid) return;

  document.querySelectorAll('.user-song').forEach((card) => card.remove());
  const { songs, deletedIds } = await api('/api/songs');
  deletedSongIds = new Set((deletedIds || []).map(String));

  songs.forEach((song, index) => {
    if (!deletedSongIds.has(String(song.trackId))) {
      const card = createSongCard(song, index);
      grid.append(card);
    }
  });

  await syncFavoritesAndLikes();
  updateSessionUI();
  filterSongs();
  await loadMusicData();
  await loadCatalogPlaylists();
}

function openAddSong() {
  if (!currentUser()) {
    document.querySelector('#auth-message').textContent = 'Inicia sesión para agregar canciones.';
    document.querySelector('#login-dialog').showModal();
    return;
  }
  document.querySelector('#add-song-dialog').showModal();
}

async function addSong(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector('#add-song-message');
  const submit = document.querySelector('#add-song-submit');
  const title = form.title.value.trim();
  if (!title) return;

  submit.disabled = true;
  submit.textContent = 'Buscando...';
  message.className = 'auth-message is-loading';
  message.textContent = 'Consultando el catálogo musical...';
  try {
    const data = await api(`/api/music?term=${encodeURIComponent(title)}`);
    const song = data.results?.[0];
    if (!song || !titleMatchesSearch(song, title)) {
      message.className = 'auth-message is-error';
      message.textContent = 'No encontramos esa canción. Prueba con otro título.';
      return;
    }
    await api('/api/songs', { method: 'POST', body: JSON.stringify(song) });
    form.reset();
    message.className = 'auth-message is-success';
    message.textContent = 'Canción agregada correctamente.';
    document.querySelector('#add-song-dialog').close();
    await restoreUserSongs();
  } catch (error) {
    message.className = 'auth-message is-error';
    message.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Buscar y agregar';
  }
}

async function loadMusicData() {
  const covers = document.querySelectorAll('.cover:not(.loaded-meta)');
  await Promise.all([...covers].map(async (cover) => {
    cover.classList.add('loaded-meta');
    const query = encodeURIComponent(`${cover.dataset.artist} ${cover.dataset.title}`);
    try {
      const data = await api(`/api/music?term=${query}`);
      const song = data.results?.[0];
      if (!song) return;
      const artwork = song.artworkUrl100?.replace('100x100', '600x600');
      if (artwork) {
        cover.style.backgroundImage = `url("${artwork}")`;
        cover.style.backgroundSize = 'cover';
        cover.style.backgroundPosition = 'center';
        cover.classList.add('has-artwork');
      }
      const card = cover.closest('.song-card');
      const audio = card.querySelector('audio');
      if (song.previewUrl) audio.src = song.previewUrl;
      if (song.trackViewUrl && !card.querySelector('.music-link')) {
        const link = document.createElement('a');
        link.className = 'music-link';
        link.href = song.trackViewUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Apple Music ↗';
        card.querySelector('.song-meta').append(link);
      }
    } catch (error) {
      console.warn(`No se pudo cargar información para ${cover.dataset.title}`, error);
    }
  }));
}

async function initProfilePage() {
  const session = await api('/api/me');
  sessionUser = session.user;
  if (!sessionUser) {
    window.location.href = 'canciones.xml';
    return;
  }

  const [{ songs }, favData, likesData] = await Promise.all([
    api('/api/songs'),
    api('/api/favorites'),
    api('/api/likes'),
  ]);

  favoriteIds = new Set(favData.favorites.map(String));
  userLikes = new Set((likesData.userLikes || []).map(String));
  const userAddedCount = songs.filter((s) => s.addedBy?.toLowerCase() === sessionUser.username.toLowerCase()).length;

  document.querySelector('#info-username').textContent = sessionUser.username;
  document.querySelector('#info-created').textContent = `Miembro desde: ${sessionUser.createdAt || 'Hoy'}`;
  document.querySelector('#stat-favorites').textContent = favoriteIds.size;
  document.querySelector('#stat-likes').textContent = userLikes.size;
  document.querySelector('#stat-added').textContent = userAddedCount;

  const avatarEl = document.querySelector('#profile-page-avatar');
  applyAvatar(avatarEl, sessionUser);
  document.querySelector('#input-bio').value = sessionUser.bio || '';
  document.querySelector('#input-avatar-color').value = sessionUser.avatarColor || '#2b7a78';
  document.querySelector('#input-artists').value = sessionUser.favoriteArtists || '';

  const savedGenres = new Set((sessionUser.favoriteGenres || '').split(',').map((g) => g.trim()).filter(Boolean));
  document.querySelectorAll('#genre-chips-container input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = savedGenres.has(checkbox.value);
  });

  const favList = document.querySelector('#profile-favorites-list');
  favList.innerHTML = '';
  const allKnownSongs = { ...BASE_CATALOG };
  songs.forEach((s) => {
    allKnownSongs[String(s.trackId)] = {
      title: s.trackName,
      artist: s.artistName,
      genre: s.primaryGenreName || 'pop',
    };
  });

  if (favoriteIds.size === 0) {
    favList.innerHTML = '<li class="empty-fav-item">Aún no has marcado canciones como favoritas.</li>';
  } else {
    favoriteIds.forEach((id) => {
      const info = allKnownSongs[id] || { title: `Canción #${id}`, artist: 'Biblioteca Sonora', genre: 'musical' };
      const li = document.createElement('li');
      li.className = 'profile-fav-item';
      const infoContainer = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = info.title;
      const details = document.createElement('span');
      details.textContent = `${info.artist} · ${info.genre}`;
      infoContainer.append(title, details);
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'button button-outline btn-remove-fav-profile';
      removeButton.textContent = 'Quitar ★';
      removeButton.dataset.id = id;
      removeButton.dataset.title = info.title;
      li.append(infoContainer, removeButton);
      removeButton.addEventListener('click', async (e) => {
        const trackId = e.currentTarget.dataset.id;
        const title = e.currentTarget.dataset.title;
        const ok = await askConfirmation({
          eyebrow: 'MIS FAVORITOS',
          title: '¿Quitar de favoritos?',
          message: `¿Deseas retirar "${title}" de tus canciones favoritas?`,
          confirmText: 'Sí, quitar',
        });
        if (!ok) return;
        await api(`/api/favorites/${encodeURIComponent(trackId)}`, { method: 'DELETE' });
        await initProfilePage();
      });
      favList.append(li);
    });
  }

  await loadRecommendations();
  await loadPlaylists();
  await loadStats();
}

async function loadRecommendations() {
  const container = document.querySelector('#recommendations-list');
  if (!container) return;
  try {
    const data = await api('/api/recommendations');
    container.replaceChildren();
    if (!data.recommendations.length) {
      container.textContent = 'Completa tus géneros o artistas favoritos para recibir recomendaciones.';
      return;
    }
    data.recommendations.forEach((song) => container.append(renderSongSummary(song)));
  } catch (error) {
    container.textContent = error.message;
  }
}

async function loadPlaylists() {
  const container = document.querySelector('#playlists-list');
  if (!container) return;
  try {
    const [data, catalogData] = await Promise.all([
      api('/api/playlists'),
      api('/api/songs'),
    ]);
    const catalog = { ...BASE_CATALOG };
    (catalogData.songs || []).forEach((song) => {
      catalog[String(song.trackId)] = {
        trackName: song.trackName,
        artistName: song.artistName,
        collectionName: song.collectionName,
      };
    });
    container.replaceChildren();
    if (!data.playlists.length) {
      container.textContent = 'Aún no tienes playlists.';
      return;
    }
    data.playlists.forEach((playlist) => {
      const item = document.createElement('article');
      item.className = 'playlist-item';
      const title = document.createElement('strong');
      title.textContent = playlist.name;
      const description = document.createElement('p');
      description.textContent = `${playlist.description || 'Sin descripción'} · ${playlist.songs.length} canciones`;
      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'button button-outline playlist-open-button';
      openButton.textContent = 'Ver canciones';
      const songsList = document.createElement('ul');
      songsList.className = 'playlist-songs';
      songsList.hidden = true;
      const details = playlist.songs
        .map((trackId) => playlist.songDetails?.find((song) => String(song.trackId) === String(trackId)) || catalog[String(trackId)])
        .filter(Boolean);
      details.forEach((song) => {
        const entry = document.createElement('li');
        const songTitle = song.trackName || song.title || 'Canción sin título';
        const artist = song.artistName || song.artist || 'Artista desconocido';
        const album = song.collectionName || song.album;
        entry.textContent = `${songTitle} — ${artist}${album ? ` · ${album}` : ''}`;
        songsList.append(entry);
      });
      if (!details.length) {
        const empty = document.createElement('li');
        empty.textContent = 'No se pudieron cargar los datos de estas canciones.';
        songsList.append(empty);
      }
      openButton.addEventListener('click', () => {
        songsList.hidden = !songsList.hidden;
        openButton.textContent = songsList.hidden ? 'Ver canciones' : 'Ocultar canciones';
      });
      item.append(title, description, openButton, songsList);
      container.append(item);
    });
  } catch (error) {
    container.textContent = error.message;
  }
}

async function createPlaylist(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const message = document.querySelector('#playlist-message');
  const name = document.querySelector('#playlist-name').value.trim();
  const description = document.querySelector('#playlist-description').value.trim();
  if (!name || !submit) return;
  submit.disabled = true;
  try {
    await api('/api/playlists', {
      method: 'POST',
      body: JSON.stringify({ name, description, songs: [] }),
    });
    form.reset();
    if (message) {
      message.className = 'auth-message is-success';
      message.textContent = 'Playlist creada con tus canciones favoritas.';
    }
    await loadPlaylists();
  } catch (error) {
    if (message) {
      message.className = 'auth-message is-error';
      message.textContent = error.message;
    }
  } finally {
    submit.disabled = false;
  }
}

async function recordPlayback(event) {
  if (!currentUser()) return;
  const card = event.currentTarget.closest('.song-card');
  const trackId = card?.dataset.id;
  if (!trackId) return;
  try {
    await api('/api/history', {
      method: 'POST',
      body: JSON.stringify({ trackId }),
    });
  } catch (error) {
    console.warn('No se pudo registrar la reproducción.', error);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (document.querySelector('.profile-page')) {
    await initProfilePage();

    document.querySelector('#profile-logout-btn').addEventListener('click', requestLogout);

    document.querySelector('#profile-info-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const bio = document.querySelector('#input-bio').value;
      const avatarColor = document.querySelector('#input-avatar-color').value;
      const msg = document.querySelector('#profile-save-msg');
      const res = await api('/api/profile', {
        method: 'POST',
        body: JSON.stringify({ bio, avatarColor }),
      });
      sessionUser = res.user;
      applyAvatar(document.querySelector('#profile-page-avatar'), sessionUser);
      msg.className = 'auth-message is-success';
      msg.textContent = 'Información del usuario actualizada.';
    });

    document.querySelector('#profile-tastes-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const selectedGenres = [...document.querySelectorAll('#genre-chips-container input:checked')].map((c) => c.value);
      const favoriteArtists = document.querySelector('#input-artists').value;
      const msg = document.querySelector('#tastes-save-msg');
      const res = await api('/api/profile', {
        method: 'POST',
        body: JSON.stringify({
          favoriteGenres: selectedGenres.join(','),
          favoriteArtists,
        }),
      });
      sessionUser = res.user;
      msg.className = 'auth-message is-success';
      msg.textContent = 'Gustos musicales guardados.';
    });
    const playlistForm = document.querySelector('#playlist-form');
    if (playlistForm) playlistForm.addEventListener('submit', createPlaylist);
    return;
  }

  document.querySelectorAll('.favorite-button').forEach((b) => b.addEventListener('click', toggleFavorite));
  document.querySelectorAll('.like-button').forEach((b) => b.addEventListener('click', toggleLike));
  document.querySelectorAll('.delete-song-button').forEach((b) => b.addEventListener('click', handleDeleteSong));
  document.querySelectorAll('.song-card audio').forEach((audio) => audio.addEventListener('play', recordPlayback, { once: true }));

  document.querySelector('#search').addEventListener('input', filterSongs);
  document.querySelector('#genre-filter').addEventListener('change', filterSongs);
  document.querySelector('#year-filter').addEventListener('change', filterSongs);
  document.querySelector('#login-button').addEventListener('click', () => {
    document.querySelector('#login-dialog').showModal();
  });

  const profileTrigger = document.querySelector('#profile-trigger');
  const profileDropdown = document.querySelector('#profile-dropdown');
  if (profileTrigger && profileDropdown) {
    profileTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = profileDropdown.hidden;
      profileDropdown.hidden = !isHidden;
      profileTrigger.setAttribute('aria-expanded', String(isHidden));
    });
    document.addEventListener('click', (e) => {
      if (!profileDropdown.hidden && !e.target.closest('#profile-menu-container')) {
        profileDropdown.hidden = true;
        profileTrigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  document.querySelector('#btn-go-profile').addEventListener('click', () => {
    window.location.href = 'perfil.html';
  });

  document.querySelector('#btn-my-favorites').addEventListener('click', () => {
    onlyFavoritesMode = true;
    document.querySelector('#catalog-title').textContent = 'Mis canciones favoritas ★';
    document.querySelector('#show-all-button').hidden = false;
    profileDropdown.hidden = true;
    filterSongs();
  });

  document.querySelector('#show-all-button').addEventListener('click', () => {
    onlyFavoritesMode = false;
    document.querySelector('#catalog-title').textContent = 'Catálogo completo';
    document.querySelector('#show-all-button').hidden = true;
    filterSongs();
  });

  document.querySelector('#btn-logout').addEventListener('click', () => {
    profileDropdown.hidden = true;
    requestLogout();
  });

  document.querySelector('#auth-form').addEventListener('submit', handleAuth);
  document.querySelector('#close-dialog').addEventListener('click', () => document.querySelector('#login-dialog').close());
  document.querySelector('#add-song-button').addEventListener('click', openAddSong);
  document.querySelector('#add-song-form').addEventListener('submit', addSong);
  document.querySelector('#close-add-dialog').addEventListener('click', () => document.querySelector('#add-song-dialog').close());

  const semanticSearch = document.querySelector('#semantic-search');
  if (semanticSearch) semanticSearch.addEventListener('input', searchSemanticCatalog);

  const session = await api('/api/me');
  sessionUser = session.user;
  await restoreUserSongs();
});