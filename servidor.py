import hashlib
import json
import secrets
import threading
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import NamedTemporaryFile

BASE_DIR = Path(__file__).parent
XML_DB = BASE_DIR / 'datos.xml'
PORT = 8000
SESSION_TTL_SECONDS = 60 * 60 * 24 * 7
DB_LOCK = threading.RLock()
ALLOWED_AVATAR_COLORS = {'#2b7a78', '#3a6b88', '#52796f', '#b56576', '#6d597a'}
ROOT_COLLECTIONS = (
    'usuarios', 'canciones_agregadas', 'canciones_eliminadas', 'favoritos',
    'likes', 'sesiones', 'playlists', 'comentarios', 'historial',
)


def initialize_database():
    with DB_LOCK:
        if not XML_DB.exists():
            root = ET.Element('sonora_db')
            ET.SubElement(root, 'usuarios')
            ET.SubElement(root, 'canciones_agregadas')
            ET.SubElement(root, 'canciones_eliminadas')
            ET.SubElement(root, 'favoritos')
            for tag in ROOT_COLLECTIONS:
                ET.SubElement(root, tag)
            save_xml(root)


def load_xml():
    if not XML_DB.exists():
        initialize_database()
    tree = ET.parse(XML_DB)
    root = tree.getroot()
    for tag in ROOT_COLLECTIONS:
        if root.find(tag) is None:
            ET.SubElement(root, tag)
    return root


def save_xml(root):
    ET.indent(root, space='  ')
    tree = ET.ElementTree(root)
    with NamedTemporaryFile('wb', delete=False, dir=BASE_DIR, prefix='datos-', suffix='.xml.tmp') as temp:
        temporary_path = Path(temp.name)
    try:
        tree.write(temporary_path, encoding='utf-8', xml_declaration=True)
        ET.parse(temporary_path)
        temporary_path.replace(XML_DB)
    finally:
        temporary_path.unlink(missing_ok=True)


def password_hash(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 200_000).hex()


def safe_text(value, limit):
    return str(value or '').strip()[:limit]


def find_user(root, user_id):
    return next(
        (u for u in root.find('usuarios').findall('usuario') if u.get('id') == str(user_id)),
        None,
    )


def catalog_songs():
    try:
        root = ET.parse(BASE_DIR / 'canciones.xml').getroot()
    except (ET.ParseError, OSError):
        return []
    songs = []
    for song in root.findall('cancion'):
        songs.append({
            'trackId': song.get('id', ''),
            'trackName': song.findtext('titulo', ''),
            'artistName': song.findtext('artista', ''),
            'collectionName': song.findtext('album', ''),
            'primaryGenreName': song.get('genero', ''),
            'releaseDate': f"{song.findtext('anio', '')}-01-01T00:00:00Z",
            'previewUrl': song.findtext('audio', ''),
        })
    return songs


def all_song_metadata(root):
    songs = {song['trackId']: song for song in catalog_songs()}
    for element in root.find('canciones_agregadas').findall('cancion'):
        song = song_response(element)
        songs[song['trackId']] = song
    return songs


def json_body(handler):
    try:
        length = int(handler.headers.get('Content-Length', 0))
        return json.loads(handler.rfile.read(length) or '{}')
    except (ValueError, json.JSONDecodeError):
        return {}


def user_dict(user_elem):
    if user_elem is None:
        return None
    perfil = user_elem.find('perfil')
    return {
        'id': user_elem.get('id'),
        'username': user_elem.get('username'),
        'createdAt': user_elem.get('created_at', ''),
        'bio': perfil.get('bio', '') if perfil is not None else '',
        'favoriteGenres': perfil.get('generos', '') if perfil is not None else '',
        'favoriteArtists': perfil.get('artistas', '') if perfil is not None else '',
        'avatarColor': perfil.get('avatar_color', '#2b7a78') if perfil is not None else '#2b7a78',
    }


def song_response(song_elem):
    year = song_elem.get('year', '')
    duration_ms = song_elem.get('duration_ms', '')
    return {
        'trackId': song_elem.get('track_id', ''),
        'trackName': song_elem.get('title', ''),
        'artistName': song_elem.get('artist', ''),
        'collectionName': song_elem.get('album', ''),
        'primaryGenreName': song_elem.get('genre', ''),
        'releaseDate': f'{year}-01-01T00:00:00Z' if year else '',
        'artworkUrl100': song_elem.get('artwork_url', ''),
        'previewUrl': song_elem.get('preview_url', ''),
        'trackViewUrl': song_elem.get('track_url', ''),
        'trackTimeMillis': int(duration_ms) if str(duration_ms).isdigit() else None,
        'addedBy': song_elem.get('added_by', 'Usuario'),
        'addedById': song_elem.get('user_id', ''),
    }


class SonoraHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)
        
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
        
    def send_json(self, payload, status=200, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def current_user(self):
        raw_cookie = self.headers.get('Cookie', '')
        parsed = cookies.SimpleCookie(raw_cookie)
        token = parsed.get('sonora_session')
        if not token:
            return None
        with DB_LOCK:
            root = load_xml()
            now = datetime.now().timestamp()
            session = next(
                (s for s in root.find('sesiones').findall('sesion')
                 if s.get('token') == token.value),
                None,
            )
            if session is None or float(session.get('expires_at', '0')) <= now:
                if session is not None:
                    root.find('sesiones').remove(session)
                    save_xml(root)
                return None
            user = find_user(root, session.get('user_id'))
            if user is not None:
                return user_dict(user)
        return None

    def require_user(self):
        user = self.current_user()
        if not user:
            self.send_json({'error': 'Debes iniciar sesión.'}, 401)
            return None
        return user

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == '/api/me':
            user = self.current_user()
            self.send_json({'user': user})
            return

        if parsed.path == '/api/songs':
            with DB_LOCK:
                root = load_xml()
                songs_elems = list(root.find('canciones_agregadas').findall('cancion'))
                deleted_elems = list(root.find('canciones_eliminadas').findall('cancion'))
            songs_elems.reverse()
            result = [song_response(s) for s in songs_elems]
            deleted_ids = [d.get('track_id') for d in deleted_elems if d.get('track_id')]
            self.send_json({'songs': result, 'deletedIds': deleted_ids})
            return

        if parsed.path == '/api/favorites':
            user = self.require_user()
            if not user:
                return
            with DB_LOCK:
                root = load_xml()
                favs = [
                    f.get('track_id')
                    for f in root.find('favoritos').findall('favorito')
                    if f.get('user_id') == str(user['id'])
                ]
            self.send_json({'favorites': favs})
            return

        if parsed.path == '/api/likes':
            user = self.current_user()
            counts = {}
            user_likes = []
            with DB_LOCK:
                root = load_xml()
                for like in root.find('likes').findall('like'):
                    tid = like.get('track_id', '')
                    uid = like.get('user_id', '')
                    if tid:
                        counts[tid] = counts.get(tid, 0) + 1
                        if user and uid == str(user['id']):
                            user_likes.append(tid)
            self.send_json({'counts': counts, 'userLikes': user_likes})
            return

        if parsed.path == '/api/recommendations':
            user = self.require_user()
            if not user:
                return
            with DB_LOCK:
                root = load_xml()
                songs = list(all_song_metadata(root).values())
                profile = find_user(root, user['id']).find('perfil')
                genres = {g.strip().lower() for g in (profile.get('generos', '') if profile is not None else '').split(',') if g.strip()}
                artists = (profile.get('artistas', '') if profile is not None else '').lower()
                recommendations = [
                    song for song in songs
                    if song.get('primaryGenreName', '').lower() in genres
                    or any(a.strip() and a.strip() in song.get('artistName', '').lower()
                           for a in artists.split(','))
                ]
            self.send_json({'recommendations': recommendations[:12]})
            return

        if parsed.path == '/api/stats':
            user = self.require_user()
            if not user:
                return
            with DB_LOCK:
                root = load_xml()
                favorites = [f for f in root.find('favoritos').findall('favorito') if f.get('user_id') == str(user['id'])]
                likes = [l for l in root.find('likes').findall('like') if l.get('user_id') == str(user['id'])]
                history = [h for h in root.find('historial').findall('reproduccion') if h.get('user_id') == str(user['id'])]
                added = [s for s in root.find('canciones_agregadas').findall('cancion') if s.get('user_id') == str(user['id'])]
                songs = all_song_metadata(root)
                genres = {}
                for item in favorites + history:
                    song = songs.get(item.get('track_id'))
                    genre = song.get('primaryGenreName', 'desconocido') if song else 'desconocido'
                    genres[genre] = genres.get(genre, 0) + 1
            self.send_json({
                'favorites': len(favorites), 'likes': len(likes),
                'history': len(history), 'added': len(added), 'genres': genres,
            })
            return

        if parsed.path == '/api/playlists':
            user = self.require_user()
            if not user:
                return
            with DB_LOCK:
                root = load_xml()
                song_catalog = all_song_metadata(root)
                playlists = [
                    {
                        'id': p.get('id'),
                        'name': p.get('name', ''),
                        'description': p.get('description', ''),
                        'public': p.get('public', 'false') == 'true',
                        'songs': [s.get('track_id') for s in p.findall('cancion')],
                        'songDetails': [
                            song_catalog[s.get('track_id')]
                            for s in p.findall('cancion')
                            if s.get('track_id') in song_catalog
                        ],
                    }
                    for p in root.find('playlists').findall('playlist')
                    if p.get('user_id') == str(user['id']) or p.get('public') == 'true'
                ]
            self.send_json({'playlists': playlists})
            return

        if parsed.path == '/api/reviews':
            track_id = urllib.parse.parse_qs(parsed.query).get('trackId', [''])[0]
            with DB_LOCK:
                root = load_xml()
                reviews = [
                    {'user': find_user(root, r.get('user_id')).get('username', 'Usuario'),
                     'rating': int(r.get('rating', '0')), 'text': r.text or '',
                     'createdAt': r.get('created_at', '')}
                    for r in root.find('comentarios').findall('comentario')
                    if r.get('track_id') == track_id
                ]
            self.send_json({'reviews': reviews})
            return

        if parsed.path == '/api/music':
            query = urllib.parse.parse_qs(parsed.query).get('term', [''])[0]
            url = 'https://itunes.apple.com/search?' + urllib.parse.urlencode({
                'term': query, 'entity': 'song', 'limit': 1, 'country': 'ES'
            })
            try:
                request = urllib.request.Request(url, headers={'User-Agent': 'Sonora/1.0'})
                with urllib.request.urlopen(request, timeout=10) as response:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    body = response.read()
                    self.send_header('Content-Length', str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
            except (urllib.error.URLError, TimeoutError):
                self.send_json({'error': 'No se pudo consultar iTunes.'}, 502)
            return

        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        data = json_body(self)

        if parsed.path == '/api/logout':
            raw_cookie = self.headers.get('Cookie', '')
            parsed_cookie = cookies.SimpleCookie(raw_cookie)
            token = parsed_cookie.get('sonora_session')
            with DB_LOCK:
                root = load_xml()
                for session in list(root.find('sesiones').findall('sesion')):
                    if token and session.get('token') == token.value:
                        root.find('sesiones').remove(session)
                save_xml(root)
            self.send_json({'ok': True}, extra_headers={
                'Set-Cookie': 'sonora_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
            })
            return

        if parsed.path in ('/api/register', '/api/login'):
            username = safe_text(data.get('username'), 40)
            password = str(data.get('password', ''))
            if len(username) < 3 or len(password) < 4:
                self.send_json({'error': 'Usuario mínimo de 3 caracteres y contraseña de 4.'}, 400)
                return

            with DB_LOCK:
                root = load_xml()
                usuarios = root.find('usuarios')
                existing = None
                for u in usuarios.findall('usuario'):
                    if u.get('username', '').lower() == username.lower():
                        existing = u
                        break

                if parsed.path == '/api/register' and existing is not None:
                    self.send_json({'error': 'Ese usuario ya existe.'}, 409)
                    return

                if existing is not None:
                    if password_hash(password, existing.get('password_salt', '')) != existing.get('password_hash', ''):
                        self.send_json({'error': 'La contraseña no coincide.'}, 401)
                        return
                    user_obj = user_dict(existing)
                else:
                    salt = secrets.token_hex(16)
                    existing_ids = [int(u.get('id', 0)) for u in usuarios.findall('usuario') if u.get('id', '').isdigit()]
                    new_id = str(max(existing_ids, default=0) + 1)
                    now_str = datetime.now().strftime('%Y-%m-%d')
                    new_user = ET.SubElement(usuarios, 'usuario', {
                        'id': new_id,
                        'username': username,
                        'password_hash': password_hash(password, salt),
                        'password_salt': salt,
                        'created_at': now_str,
                    })
                    ET.SubElement(new_user, 'perfil', {
                        'bio': 'Amante de la música en Sonora.',
                        'generos': 'pop,rock,latino',
                        'artistas': '',
                        'avatar_color': '#2b7a78',
                    })
                    save_xml(root)
                    user_obj = user_dict(new_user)

            token = secrets.token_urlsafe(32)
            with DB_LOCK:
                root = load_xml()
                sesiones = root.find('sesiones')
                now = datetime.now().timestamp()
                for session in list(sesiones.findall('sesion')):
                    if float(session.get('expires_at', '0')) <= now:
                        sesiones.remove(session)
                ET.SubElement(sesiones, 'sesion', {
                    'token': token,
                    'user_id': str(user_obj['id']),
                    'created_at': str(now),
                    'last_seen': str(now),
                    'expires_at': str(now + SESSION_TTL_SECONDS),
                })
                save_xml(root)
            self.send_json({'user': user_obj}, extra_headers={
                'Set-Cookie': f'sonora_session={token}; Path=/; HttpOnly; SameSite=Lax'
            })
            return

        user = self.require_user()
        if not user:
            return

        if parsed.path == '/api/profile':
            with DB_LOCK:
                root = load_xml()
                for u in root.find('usuarios').findall('usuario'):
                    if u.get('id') == str(user['id']):
                        perfil = u.find('perfil')
                        if perfil is None:
                            perfil = ET.SubElement(u, 'perfil')
                        if 'bio' in data:
                            perfil.set('bio', safe_text(data['bio'], 300))
                        if 'favoriteGenres' in data:
                            genres = [safe_text(g, 30).lower() for g in str(data['favoriteGenres']).split(',') if safe_text(g, 30)]
                            perfil.set('generos', ','.join(genres[:10]))
                        if 'favoriteArtists' in data:
                            perfil.set('artistas', safe_text(data['favoriteArtists'], 200))
                        if 'avatarColor' in data:
                            color = safe_text(data['avatarColor'], 7).lower()
                            if color not in ALLOWED_AVATAR_COLORS:
                                self.send_json({'error': 'Color de perfil no permitido.'}, 400)
                                return
                            perfil.set('avatar_color', color)
                        save_xml(root)
                        self.send_json({'user': user_dict(u)})
                        return
            self.send_json({'error': 'Usuario no encontrado.'}, 404)
            return

        if parsed.path == '/api/songs':
            required = ['trackId', 'trackName', 'artistName']
            if any(not data.get(key) for key in required):
                self.send_json({'error': 'La canción no tiene los datos necesarios.'}, 400)
                return
            track_id = str(data['trackId'])
            with DB_LOCK:
                root = load_xml()
                canciones = root.find('canciones_agregadas')
                for s in canciones.findall('cancion'):
                    if s.get('track_id') == track_id:
                        self.send_json({'error': f"Esa canción ya está incluida por {s.get('added_by', 'otro usuario')}."}, 409)
                        return

                ET.SubElement(canciones, 'cancion', {
                    'user_id': str(user['id']),
                    'added_by': user['username'],
                    'track_id': track_id,
                    'title': str(data['trackName']),
                    'artist': str(data['artistName']),
                    'album': str(data.get('collectionName', '')),
                    'genre': str(data.get('primaryGenreName', 'pop')),
                    'year': str(data.get('releaseDate', ''))[:4],
                    'artwork_url': str(data.get('artworkUrl100', '')),
                    'preview_url': str(data.get('previewUrl', '')),
                    'track_url': str(data.get('trackViewUrl', '')),
                    'duration_ms': str(data.get('trackTimeMillis') or ''),
                })
                save_xml(root)
            self.send_json({'ok': True}, 201)
            return

        if parsed.path == '/api/favorites':
            track_id = str(data.get('trackId', '')).strip()
            if not track_id:
                self.send_json({'error': 'Falta el identificador de la canción.'}, 400)
                return
            with DB_LOCK:
                root = load_xml()
                favoritos = root.find('favoritos')
                exists = any(
                    f.get('user_id') == str(user['id']) and f.get('track_id') == track_id
                    for f in favoritos.findall('favorito')
                )
                if not exists:
                    ET.SubElement(favoritos, 'favorito', {
                        'user_id': str(user['id']),
                        'track_id': track_id,
                        'created_at': datetime.now().isoformat(),
                    })
                    save_xml(root)
            self.send_json({'ok': True}, 201)
            return

        if parsed.path == '/api/likes':
            track_id = str(data.get('trackId', '')).strip()
            if not track_id:
                self.send_json({'error': 'Falta el identificador de la canción.'}, 400)
                return
            with DB_LOCK:
                root = load_xml()
                likes = root.find('likes')
                exists = any(
                    l.get('user_id') == str(user['id']) and l.get('track_id') == track_id
                    for l in likes.findall('like')
                )
                if not exists:
                    ET.SubElement(likes, 'like', {
                        'user_id': str(user['id']),
                        'track_id': track_id,
                        'created_at': datetime.now().isoformat(),
                    })
                    save_xml(root)
            self.send_json({'ok': True}, 201)
            return

        if parsed.path == '/api/playlists':
            playlist_id = safe_text(data.get('playlistId'), 50)
            track_id = safe_text(data.get('trackId'), 100)
            if playlist_id and track_id:
                with DB_LOCK:
                    root = load_xml()
                    playlist = next(
                        (p for p in root.find('playlists').findall('playlist')
                         if p.get('id') == playlist_id
                         and p.get('user_id') == str(user['id'])),
                        None,
                    )
                    if playlist is None:
                        self.send_json({'error': 'Playlist no encontrada.'}, 404)
                        return
                    if any(song.get('track_id') == track_id for song in playlist.findall('cancion')):
                        self.send_json({'error': 'La canción ya está en esa playlist.'}, 409)
                        return
                    ET.SubElement(playlist, 'cancion', {'track_id': track_id})
                    save_xml(root)
                self.send_json({'ok': True}, 201)
                return
            name = safe_text(data.get('name'), 80)
            if not name:
                self.send_json({'error': 'La playlist necesita un nombre.'}, 400)
                return
            with DB_LOCK:
                root = load_xml()
                playlists = root.find('playlists')
                normalized_name = name.casefold()
                duplicate = next(
                    (p for p in playlists.findall('playlist')
                     if p.get('user_id') == str(user['id'])
                     and p.get('name', '').strip().casefold() == normalized_name),
                    None,
                )
                if duplicate is not None:
                    self.send_json({'error': 'Ya tienes una playlist con ese nombre.'}, 409)
                    return
                ids = [int(p.get('id', '0')) for p in playlists.findall('playlist') if p.get('id', '').isdigit()]
                playlist = ET.SubElement(playlists, 'playlist', {
                    'id': str(max(ids, default=0) + 1),
                    'user_id': str(user['id']),
                    'name': name,
                    'description': safe_text(data.get('description'), 300),
                    'public': 'true' if data.get('public') is True else 'false',
                    'created_at': datetime.now().isoformat(),
                })
                for track_id in data.get('songs', [])[:100]:
                    ET.SubElement(playlist, 'cancion', {'track_id': safe_text(track_id, 100)})
                save_xml(root)
                self.send_json({'ok': True, 'id': playlist.get('id')}, 201)
            return

        if parsed.path == '/api/reviews':
            track_id = safe_text(data.get('trackId'), 100)
            try:
                rating = int(data.get('rating', 0))
            except (TypeError, ValueError):
                rating = 0
            review_text = safe_text(data.get('text'), 500)
            if not track_id or rating not in range(1, 6) or not review_text:
                self.send_json({'error': 'La reseña requiere canción, texto y una calificación de 1 a 5.'}, 400)
                return
            with DB_LOCK:
                root = load_xml()
                comments = root.find('comentarios')
                existing = next((r for r in comments.findall('comentario')
                                 if r.get('track_id') == track_id and r.get('user_id') == str(user['id'])), None)
                if existing is None:
                    existing = ET.SubElement(comments, 'comentario', {
                        'track_id': track_id, 'user_id': str(user['id']),
                        'rating': str(rating), 'created_at': datetime.now().isoformat(),
                    })
                else:
                    existing.set('rating', str(rating))
                    existing.set('created_at', datetime.now().isoformat())
                existing.text = review_text
                save_xml(root)
            self.send_json({'ok': True}, 201)
            return

        if parsed.path == '/api/history':
            track_id = safe_text(data.get('trackId'), 100)
            if not track_id:
                self.send_json({'error': 'Falta el identificador de la canción.'}, 400)
                return
            with DB_LOCK:
                root = load_xml()
                ET.SubElement(root.find('historial'), 'reproduccion', {
                    'user_id': str(user['id']), 'track_id': track_id,
                    'created_at': datetime.now().isoformat(),
                })
                history = root.find('historial').findall('reproduccion')
                user_history = [h for h in history if h.get('user_id') == str(user['id'])]
                for old in user_history[:-50]:
                    root.find('historial').remove(old)
                save_xml(root)
            self.send_json({'ok': True}, 201)
            return

        self.send_json({'error': 'Ruta no encontrada.'}, 404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        user = self.require_user()
        if not user:
            return

        if parsed.path.startswith('/api/favorites/'):
            track_id = urllib.parse.unquote(parsed.path.rsplit('/', 1)[-1])
            with DB_LOCK:
                root = load_xml()
                favoritos = root.find('favoritos')
                for f in list(favoritos.findall('favorito')):
                    if f.get('user_id') == str(user['id']) and f.get('track_id') == track_id:
                        favoritos.remove(f)
                save_xml(root)
            self.send_json({'ok': True})
            return

        if parsed.path.startswith('/api/likes/'):
            track_id = urllib.parse.unquote(parsed.path.rsplit('/', 1)[-1])
            with DB_LOCK:
                root = load_xml()
                likes = root.find('likes')
                for l in list(likes.findall('like')):
                    if l.get('user_id') == str(user['id']) and l.get('track_id') == track_id:
                        likes.remove(l)
                save_xml(root)
            self.send_json({'ok': True})
            return

        if parsed.path.startswith('/api/songs/'):
            track_id = urllib.parse.unquote(parsed.path.rsplit('/', 1)[-1])
            with DB_LOCK:
                root = load_xml()
                canciones = root.find('canciones_agregadas')
                eliminadas = root.find('canciones_eliminadas')
                removed_user_song = False
                for s in list(canciones.findall('cancion')):
                    if s.get('track_id') == track_id:
                        if s.get('user_id') != str(user['id']):
                            self.send_json({'error': 'Solo quien agregó la canción puede eliminarla.'}, 403)
                            return
                        canciones.remove(s)
                        removed_user_song = True
                if not removed_user_song:
                    self.send_json({'error': 'Las canciones del catálogo base no se pueden eliminar.'}, 403)
                    return
                for f in list(root.find('favoritos').findall('favorito')):
                    if f.get('track_id') == track_id:
                        root.find('favoritos').remove(f)
                for l in list(root.find('likes').findall('like')):
                    if l.get('track_id') == track_id:
                        root.find('likes').remove(l)
                save_xml(root)
            self.send_json({'ok': True})
            return

        self.send_json({'error': 'Ruta no encontrada.'}, 404)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()


if __name__ == '__main__':
    initialize_database()
    print(f'SONORA (Base de datos XML) ejecutándose en http://localhost:{PORT}/canciones.xml')
    ThreadingHTTPServer(('localhost', PORT), SonoraHandler).serve_forever()