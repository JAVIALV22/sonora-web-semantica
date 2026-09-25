import hashlib
import json
import secrets
import sqlite3
import urllib.parse
import urllib.request
from http import cookies
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE_DIR = Path(__file__).parent
DATABASE = BASE_DIR / 'sonora.db'
PORT = 8000
SESSIONS = {}


def database():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA foreign_keys = ON')
    return connection


def initialize_database():
    with database() as connection:
        connection.executescript('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS songs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                track_id TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT,
                genre TEXT,
                year INTEGER,
                artwork_url TEXT,
                preview_url TEXT,
                track_url TEXT,
                duration_ms INTEGER,
                UNIQUE(user_id, track_id),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS favorites (
                user_id INTEGER NOT NULL,
                track_id INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(user_id, track_id),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        ''')


def password_hash(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 200_000).hex()


def json_body(handler):
    try:
        length = int(handler.headers.get('Content-Length', 0))
        return json.loads(handler.rfile.read(length) or '{}')
    except (ValueError, json.JSONDecodeError):
        return {}


def song_response(row):
    return {
        'trackId': row['track_id'],
        'trackName': row['title'],
        'artistName': row['artist'],
        'collectionName': row['album'],
        'primaryGenreName': row['genre'],
        'releaseDate': f"{row['year']}-01-01T00:00:00Z" if row['year'] else '',
        'artworkUrl100': row['artwork_url'],
        'previewUrl': row['preview_url'],
        'trackViewUrl': row['track_url'],
        'trackTimeMillis': row['duration_ms'],
        'addedBy': row['added_by'] if 'added_by' in row.keys() else '',
    }


class SonoraHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

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
        with database() as connection:
            return connection.execute('SELECT id, username FROM users WHERE id = ?', (user_id,)).fetchone()

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
            self.send_json({'user': dict(user) if user else None})
            return
        if parsed.path == '/api/songs':
            with database() as connection:
                songs = connection.execute('''SELECT songs.*, users.username AS added_by
                    FROM songs JOIN users ON users.id = songs.user_id
                    ORDER BY songs.id DESC''').fetchall()
            result = []
            for song in songs:
                item = song_response(song)
                item['addedBy'] = item['addedBy'] or 'Usuario'
                result.append(item)
            self.send_json({'songs': result})
            return
        if parsed.path == '/api/favorites':
            user = self.require_user()
            if not user:
                return
            with database() as connection:
                rows = connection.execute('SELECT track_id FROM favorites WHERE user_id = ?', (user['id'],)).fetchall()
            self.send_json({'favorites': [row['track_id'] for row in rows]})
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
        if parsed.path == '/api/register' or parsed.path == '/api/login':
            username = str(data.get('username', '')).strip()
            password = str(data.get('password', ''))
            if len(username) < 3 or len(password) < 4:
                self.send_json({'error': 'Usuario mínimo de 3 caracteres y contraseña de 4.'}, 400)
                return
            with database() as connection:
                existing = connection.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
                if parsed.path == '/api/register' and existing:
                    self.send_json({'error': 'Ese usuario ya existe.'}, 409)
                    return
                if existing:
                    if password_hash(password, existing['password_salt']) != existing['password_hash']:
                        self.send_json({'error': 'La contraseña no coincide.'}, 401)
                        return
                    user = existing
                else:
                    salt = secrets.token_hex(16)
                    cursor = connection.execute(
                        'INSERT INTO users(username, password_hash, password_salt) VALUES (?, ?, ?)',
                        (username, password_hash(password, salt), salt)
                    )
                    user = {'id': cursor.lastrowid, 'username': username}
            token = secrets.token_urlsafe(32)
            SESSIONS[token] = user['id']
            self.send_json({'user': {'id': user['id'], 'username': user['username']}}, extra_headers={
                'Set-Cookie': f'sonora_session={token}; Path=/; HttpOnly; SameSite=Lax'
            })
            return
        user = self.require_user()
        if not user:
            return
        if parsed.path == '/api/songs':
            required = ['trackId', 'trackName', 'artistName']
            if any(not data.get(key) for key in required):
                self.send_json({'error': 'La canción no tiene los datos necesarios.'}, 400)
                return
            with database() as connection:
                existing = connection.execute(
                    'SELECT users.username FROM songs JOIN users ON users.id = songs.user_id WHERE songs.track_id = ?',
                    (str(data['trackId']),)
                ).fetchone()
                if existing:
                    self.send_json({'error': f"Esa canción ya está incluida por {existing['username']}."}, 409)
                    return
                try:
                    connection.execute('''INSERT INTO songs
                        (user_id, track_id, title, artist, album, genre, year, artwork_url, preview_url, track_url, duration_ms)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', (
                        user['id'], data['trackId'], data['trackName'], data['artistName'],
                        data.get('collectionName', ''), data.get('primaryGenreName', ''),
                        str(data.get('releaseDate', ''))[:4] or None, data.get('artworkUrl100', ''),
                        data.get('previewUrl', ''), data.get('trackViewUrl', ''), data.get('trackTimeMillis')
                    ))
                except sqlite3.IntegrityError:
                    self.send_json({'error': 'Esa canción ya está en tu biblioteca.'}, 409)
                    return
            self.send_json({'ok': True}, 201)
            return
        if parsed.path == '/api/favorites':
            track_id = data.get('trackId')
            if not track_id:
                self.send_json({'error': 'Falta el identificador de la canción.'}, 400)
                return
            with database() as connection:
                connection.execute('INSERT OR IGNORE INTO favorites(user_id, track_id) VALUES (?, ?)', (user['id'], track_id))
            self.send_json({'ok': True}, 201)
            return
        self.send_json({'error': 'Ruta no encontrada.'}, 404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        user = self.require_user()
        if not user:
            return
        if parsed.path.startswith('/api/favorites/'):
            track_id = parsed.path.rsplit('/', 1)[-1]
            with database() as connection:
                connection.execute('DELETE FROM favorites WHERE user_id = ? AND track_id = ?', (user['id'], track_id))
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
    print(f'SONORA ejecutándose en http://localhost:{PORT}/canciones.xml')
    ThreadingHTTPServer(('localhost', PORT), SonoraHandler).serve_forever()
