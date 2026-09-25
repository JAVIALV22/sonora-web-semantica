let sessionUser = null;
let favoriteIds = new Set();

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

function updateSessionUI() {
  const user = currentUser();
  document.querySelector('#user-status').textContent = user ? `Hola, ${user.username}` : 'Invitado';
  document.querySelector('#login-button').textContent = user ? 'Cerrar sesión' : 'Iniciar sesión';
  document.querySelectorAll('.favorite-button').forEach((button) => {
    const active = user && favoriteIds.has(String(button.dataset.id));
    button.classList.toggle('is-favorite', active);
    button.setAttribute('aria-label', active ? 'Quitar de favoritos' : 'Agregar a favoritos');
    button.textContent = active ? '★' : '☆';
  });
  document.querySelector('#add-song-button').disabled = !user;
}

function filterSongs() {
  const query = document.querySelector('#search').value.toLowerCase().trim();
  const genre = document.querySelector('#genre-filter').value;
  const year = document.querySelector('#year-filter').value;
  let visible = 0;
  document.querySelectorAll('.song-card').forEach((card) => {
    const matchesText = card.dataset.search.includes(query);
    const matchesGenre = !genre || card.dataset.genre === genre;
    const songYear = Number(card.dataset.year);
    const matchesYear = !year || (year === '2020' && songYear >= 2020) ||
      (year === '2010' && songYear >= 2010 && songYear < 2020) ||
      (year === '2000' && songYear >= 2000 && songYear < 2010) ||
      (year === '1900' && songYear < 2000);
    const shown = matchesText && matchesGenre && matchesYear;
    card.hidden = !shown;
    if (shown) visible += 1;
  });
  document.querySelector('#results-count').textContent = `${visible} canciones encontradas`;
}

async function openLogin() {
  const dialog = document.querySelector('#login-dialog');
  const user = currentUser();
  if (user) {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    sessionUser = null;
    favoriteIds = new Set();
    await restoreUserSongs();
    return;
  }
  dialog.showModal();
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
    favoriteIds = new Set((await api('/api/favorites')).favorites.map(String));
    form.reset();
    document.querySelector('#auth-message').textContent = '';
    document.querySelector('#login-dialog').close();
    updateSessionUI();
    await restoreUserSongs();
  } catch (error) {
    document.querySelector('#auth-message').textContent = error.message;
  }
}

async function toggleFavorite(event) {
  const user = currentUser();
  if (!user) {
    document.querySelector('#auth-message').textContent = 'Inicia sesión para guardar favoritos.';
    document.querySelector('#login-dialog').showModal();
    return;
  }
  const button = event.currentTarget;
  const trackId = button.dataset.id;
  try {
    if (favoriteIds.has(trackId)) {
      await api(`/api/favorites/${trackId}`, { method: 'DELETE' });
      favoriteIds.delete(trackId);
    } else {
      await api('/api/favorites', { method: 'POST', body: JSON.stringify({ trackId }) });
      favoriteIds.add(trackId);
    }
    updateSessionUI();
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
  const genre = (song.primaryGenreName || 'otro').toLowerCase();
  card.className = 'song-card';
  card.dataset.id = String(song.trackId || Date.now());
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
  info.innerHTML = `<div class="song-top"><span class="genre"></span><button class="favorite-button" data-id="${card.dataset.id}" aria-label="Agregar a favoritos">☆</button></div><h3></h3><p></p><div class="song-meta"><span></span><span></span></div><small class="added-by"></small>`;
  info.querySelector('.genre').textContent = genre;
  info.querySelector('h3').textContent = title;
  info.querySelector('p').textContent = `${artist} · ${album}`;
  info.querySelector('.song-meta span').textContent = year;
  info.querySelectorAll('.song-meta span')[1].textContent = song.trackTimeMillis ? formatDuration(song.trackTimeMillis) : '';
  info.querySelector('.added-by').textContent = `Agregada por ${addedBy}`;
  const audio = document.createElement('audio');
  audio.controls = true;
  audio.preload = 'none';
  audio.src = song.previewUrl || '';
  info.append(audio);
  card.append(cover, info);
  card.querySelector('.favorite-button').addEventListener('click', toggleFavorite);
  return card;
}

async function restoreUserSongs() {
  document.querySelectorAll('.user-song').forEach((card) => card.remove());
  const grid = document.querySelector('.song-grid');
  const { songs } = await api('/api/songs');
  songs.forEach((song, index) => {
    const card = createSongCard(song, index);
    card.classList.add('user-song');
    grid.append(card);
  });
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
    message.textContent = 'Canción agregada correctamente.';
    document.querySelector('#add-song-dialog').close();
    await restoreUserSongs();
  } catch (error) {
    message.className = 'auth-message is-error';
    message.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Buscar canción';
  }
}

async function loadMusicData() {
  const covers = document.querySelectorAll('.cover');
  await Promise.all([...covers].map(async (cover) => {
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
      if (song.trackViewUrl) {
        const link = document.createElement('a');
        link.className = 'music-link';
        link.href = song.trackViewUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.style.color = '#ee6c4d';
        link.style.fontSize = '10px';
        link.textContent = 'Ver en Apple Music';
        card.querySelector('.song-meta').append(link);
      }
    } catch (error) {
      console.warn(`No se pudo cargar información para ${cover.dataset.title}`, error);
    }
  }));
}

document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('.favorite-button').forEach((button) => button.addEventListener('click', toggleFavorite));
  document.querySelector('#search').addEventListener('input', filterSongs);
  document.querySelector('#genre-filter').addEventListener('change', filterSongs);
  document.querySelector('#year-filter').addEventListener('change', filterSongs);
  document.querySelector('#login-button').addEventListener('click', openLogin);
  document.querySelector('#auth-form').addEventListener('submit', handleAuth);
  document.querySelector('#close-dialog').addEventListener('click', () => document.querySelector('#login-dialog').close());
  document.querySelector('#add-song-button').addEventListener('click', openAddSong);
  document.querySelector('#add-song-form').addEventListener('submit', addSong);
  document.querySelector('#close-add-dialog').addEventListener('click', () => document.querySelector('#add-song-dialog').close());
  const session = await api('/api/me');
  sessionUser = session.user;
  if (sessionUser) favoriteIds = new Set((await api('/api/favorites')).favorites.map(String));
  updateSessionUI();
  filterSongs();
  await restoreUserSongs();
});
