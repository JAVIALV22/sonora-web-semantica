let sessionUser = null;
let favoriteIds = new Set();
let userLikes = new Set();
let likeCounts = {};
let deletedSongIds = new Set();
let onlyFavoritesMode = false;

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
      const initial = user.username.charAt(0).toUpperCase();
      const headerAvatar = document.querySelector('#header-avatar');
      const dropdownAvatar = document.querySelector('#dropdown-avatar');
      if (headerAvatar) {
        headerAvatar.textContent = initial;
        headerAvatar.style.backgroundColor = user.avatarColor || '#2b7a78';
      }
      if (dropdownAvatar) {
        dropdownAvatar.style.backgroundColor = user.avatarColor || '#2b7a78';
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
  info.querySelector('.delete-song-button').dataset.title = title;

  const audio = document.createElement('audio');
  audio.controls = true;
  audio.preload = 'none';
  audio.src = song.previewUrl || '';
  info.append(audio);

  card.append(cover, info);
  card.querySelector('.favorite-button').addEventListener('click', toggleFavorite);
  card.querySelector('.like-button').addEventListener('click', toggleLike);
  card.querySelector('.delete-song-button').addEventListener('click', handleDeleteSong);
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
    message.textContent = 'Canción agregada correctamente en XML.';
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
  avatarEl.style.backgroundColor = sessionUser.avatarColor || '#2b7a78';
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
      li.innerHTML = `
        <div>
          <strong>${info.title}</strong>
          <span>${info.artist} · <em>${info.genre}</em></span>
        </div>
        <button type="button" class="button button-outline btn-remove-fav-profile" data-id="${id}" data-title="${info.title}">Quitar ★</button>
      `;
      li.querySelector('.btn-remove-fav-profile').addEventListener('click', async (e) => {
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
      document.querySelector('#profile-page-avatar').style.backgroundColor = sessionUser.avatarColor;
      msg.className = 'auth-message is-success';
      msg.textContent = 'Información del usuario actualizada en XML.';
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
      msg.textContent = 'Gustos musicales guardados en XML.';
    });
    return;
  }

  document.querySelectorAll('.favorite-button').forEach((b) => b.addEventListener('click', toggleFavorite));
  document.querySelectorAll('.like-button').forEach((b) => b.addEventListener('click', toggleLike));
  document.querySelectorAll('.delete-song-button').forEach((b) => b.addEventListener('click', handleDeleteSong));

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

  const session = await api('/api/me');
  sessionUser = session.user;
  await restoreUserSongs();
});