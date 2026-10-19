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

BASE_DIR = Path(__file__).parent
XML_DB = BASE_DIR / 'datos.xml'
PORT = 8000
SESSIONS = {}
DB_LOCK = threading.Lock()


def initialize_database():
    with DB_LOCK:
        if not XML_DB.exists():
            root = ET.Element('sonora_db')
            ET.SubElement(root, 'usuarios')
            ET.SubElement(root, 'canciones_agregadas')
            ET.SubElement(root, 'canciones_eliminadas')
            ET.SubElement(root, 'favoritos')
            ET.SubElement(root, 'likes')
            save_xml(root)


def load_xml():
    if not XML_DB.exists():
        initialize_database()
    tree = ET.parse(XML_DB)
    root = tree.getroot()
    for tag in ('usuarios', 'canciones_agregadas', 'canciones_eliminadas', 'favoritos', 'likes'):
        if root.find(tag) is None:
            ET.SubElement(root, tag)
    return root


def save_xml(root):
    ET.indent(root, space='  ')
    tree = ET.ElementTree(root)
    tree.write(XML_DB, encoding='utf-8', xml_declaration=True)


def password_hash(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 200_000).hex()


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
        user_id = SESSIONS.get(token.value) if token else None
        if not user_id:
            return None
        with DB_LOCK:
            root = load_xml()
            for u in root.find('usuarios').findall('usuario'):
                if u.get('id') == str(user_id):
                    return user_dict(u)
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

        if parsed.path == '/api/music':
            query = urllib.parse.parse_qs(parsed.query).get('term', [''])[0]
            url = 'https://itunes.apple.com/search?' + urllib.parse.urlencode({
                'term': query, 'entity': 'song', 'limit': 1, 'country': 'ES'
            })
            try:
                with urllib.request.urlopen(url, timeout=10) as response:
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
            if token:
                SESSIONS.pop(token.value, None)
            self.send_json({'ok': True}, extra_headers={
                'Set-Cookie': 'sonora_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
            })
            return

        if parsed.path in ('/api/register', '/api/login'):
            username = str(data.get('username', '')).strip()
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
            SESSIONS[token] = user_obj['id']
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
                            perfil.set('bio', str(data['bio']).strip()[:300])
                        if 'favoriteGenres' in data:
                            perfil.set('generos', str(data['favoriteGenres']).strip())
                        if 'favoriteArtists' in data:
                            perfil.set('artistas', str(data['favoriteArtists']).strip()[:200])
                        if 'avatarColor' in data:
                            perfil.set('avatar_color', str(data['avatarColor']).strip())
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
                        canciones.remove(s)
                        removed_user_song = True
                if not removed_user_song:
                    already_deleted = any(d.get('track_id') == track_id for d in eliminadas.findall('cancion'))
                    if not already_deleted:
                        ET.SubElement(eliminadas, 'cancion', {'track_id': track_id})
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