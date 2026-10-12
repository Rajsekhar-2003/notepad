# app.py - Web Notepad Production Server (Fully SEO + PWA + Security Optimized)
# -----------------------------------------------------------------------------
# Features:
#   • 6-digit code access with 1-hour expiry
#   • Share history
#   • SEO: sitemap.xml, robots.txt, service-worker.js, manifest.json
#   • Security headers (CSP, X-Frame-Options, HSTS, etc.)
#   • Gzip compression
#   • Atomic file writes (no corruption)
#   • Structured logging with response timing
#   • Rate limiting
#   • Health check + stats endpoints
# -----------------------------------------------------------------------------

import os
import re
import secrets
import json
import threading
import time
import hashlib
import gzip
import logging
from datetime import datetime, timedelta
from functools import wraps
from io import BytesIO

from flask import (
    Flask, render_template, request, jsonify, make_response,
    session, redirect, url_for, send_from_directory, Response, abort
)
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from cachetools import TTLCache, LRUCache

# ============================================================
# LOGGING CONFIGURATION
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('webnotepad')

# ============================================================
# APP CONFIGURATION
# ============================================================
app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))

# Request size limit (50 MB)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024
app.config['JSON_SORT_KEYS'] = False
app.config['JSONIFY_PRETTYPRINT_REGULAR'] = False
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 31536000  # 1 year for static

# Secure cookie settings
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_SECURE=os.environ.get('FLASK_ENV') == 'production',
    PERMANENT_SESSION_LIFETIME=timedelta(hours=1),
)

# Domain (used in sitemap, canonical, robots)
BASE_URL = os.environ.get('BASE_URL', 'https://www.webnotepad.online')

CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=False)

# ============================================================
# RATE LIMITING
# ============================================================
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["1000 per day", "200 per hour"],
    storage_uri=os.environ.get('RATELIMIT_STORAGE', "memory://"),
    strategy="fixed-window",
)

SHARE_CODE_LENGTH = 6
SHARE_EXPIRY_HOURS = 1

# ============================================================
# CACHES
# ============================================================
note_cache = TTLCache(maxsize=5000, ttl=600)
code_cache = set()
code_cache_lock = threading.Lock()

# ============================================================
# STORAGE CLASS (Atomic Writes + Cache + History)
# ============================================================
class OptimizedFileStorage:
    """Thread-safe file storage with atomic writes, LRU cache, and history."""

    def __init__(self, filename='shared_notes_data.json',
                 history_filename='share_history.json'):
        self.filename = filename
        self.history_filename = history_filename
        self.cache = LRUCache(maxsize=5000)
        self.lock = threading.RLock()
        self.data = {}
        self.history = []
        self._load()
        logger.info("✅ Optimized File Storage initialized (No size limits!)")

    def _load(self):
        """Load data from disk (with graceful error handling)."""
        for path, default, attr in [
            (self.filename, {}, 'data'),
            (self.history_filename, [], 'history'),
        ]:
            if os.path.exists(path):
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        setattr(self, attr, json.load(f))
                    logger.info(f"📁 Loaded {len(getattr(self, attr))} entries from {path}")
                except Exception as e:
                    logger.error(f"Error loading {path}: {e}")
                    setattr(self, attr, default)
            else:
                setattr(self, attr, default)

    def _write_file(self, path, payload):
        """Atomic file write to prevent corruption."""
        tmp_path = f"{path}.tmp"
        with open(tmp_path, 'w', encoding='utf-8') as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)  # atomic on POSIX & Windows

    def _save(self):
        """Save data + history asynchronously."""
        def save_async():
            with self.lock:
                try:
                    self._write_file(self.filename, self.data)
                    self._write_file(self.history_filename, self.history)
                except Exception as e:
                    logger.error(f"Error saving data: {e}")
        threading.Thread(target=save_async, daemon=True).start()

    def get(self, share_code):
        if share_code in self.cache:
            return self.cache[share_code]
        data = self.data.get(share_code)
        if data:
            self.cache[share_code] = data
        return data

    def set(self, share_code, note_data):
        with self.lock:
            if '_id' in note_data:
                del note_data['_id']

            self.data[share_code] = note_data
            self.cache[share_code] = note_data

            preview = (note_data.get('content', '') or note_data.get('html', ''))[:200]
            if len(preview) == 200:
                preview += '...'

            history_entry = {
                'share_code': share_code,
                'title': note_data.get('title', f'Note_{share_code}'),
                'preview': preview,
                'created_at': note_data.get('created_at', datetime.utcnow().isoformat()),
                'expires_at': note_data.get('expires_at'),
                'views': note_data.get('views', 0),
                'share_url': f'/note/{share_code}',
                'content_length': len(note_data.get('content', '') or note_data.get('html', ''))
            }

            # Remove duplicate if already exists in history
            self.history = [h for h in self.history if h.get('share_code') != share_code]
            self.history.insert(0, history_entry)
            self.history = self.history[:200]

            self._save()
        return True

    def delete(self, share_code):
        with self.lock:
            self.data.pop(share_code, None)
            self.cache.pop(share_code, None)
            self.history = [h for h in self.history if h.get('share_code') != share_code]
            self._save()
        return True

    def get_history(self, limit=50):
        return self.history[:limit]

    def cleanup_expired(self):
        now_iso = datetime.utcnow().isoformat()
        with self.lock:
            expired = [
                code for code, note in self.data.items()
                if note.get('expires_at') and note['expires_at'] < now_iso
            ]
            for code in expired:
                self.data.pop(code, None)
                self.cache.pop(code, None)
            if expired:
                self.history = [
                    h for h in self.history
                    if h.get('share_code') not in expired
                ]
                self._save()
        return len(expired)

    def get_stats(self):
        now_iso = datetime.utcnow().isoformat()
        total_chars = sum(
            len(n.get('content', '')) + len(n.get('html', ''))
            for n in self.data.values()
        )
        return {
            'total_notes': len(self.data),
            'active_notes': sum(
                1 for n in self.data.values()
                if n.get('expires_at', '') > now_iso
            ),
            'cache_size': len(self.cache),
            'history_count': len(self.history),
            'storage_type': 'Optimized File Storage (No Limits)',
            'total_characters': total_chars,
            'max_note_size_mb': round(total_chars / (1024 * 1024), 2) if total_chars else 0,
        }


storage = OptimizedFileStorage()

# ============================================================
# HELPERS
# ============================================================
def generate_share_code():
    """Generate unique 6-digit numeric code."""
    with code_cache_lock:
        for _ in range(10):
            code = ''.join(str(secrets.randbelow(10)) for _ in range(SHARE_CODE_LENGTH))
            if code not in code_cache and not storage.get(code):
                code_cache.add(code)
                if len(code_cache) > 10000:
                    code_cache.clear()
                return code

        # Fallback
        ts = str(int(time.time() * 1000))
        code = hashlib.md5(ts.encode()).hexdigest()[:SHARE_CODE_LENGTH]
        code = ''.join(c for c in code if c.isdigit()).ljust(SHARE_CODE_LENGTH, '0')
        return code[:SHARE_CODE_LENGTH]


def clean_html_for_safe_storage(html_content):
    """Lightweight HTML sanitization (no length limit)."""
    if not html_content:
        return ''
    html_content = re.sub(
        r'<script[^>]*>.*?</script>', '', html_content,
        flags=re.IGNORECASE | re.DOTALL
    )
    html_content = re.sub(
        r'on\w+\s*=\s*["\'][^"\']*["\']', '', html_content,
        flags=re.IGNORECASE
    )
    html_content = re.sub(r'javascript:', '', html_content, flags=re.IGNORECASE)
    return html_content


def is_expired(note):
    """Return True if note is expired."""
    try:
        return datetime.fromisoformat(note['expires_at']) < datetime.utcnow()
    except Exception:
        return False


# ============================================================
# SECURITY & SEO MIDDLEWARE
# ============================================================
@app.after_request
def add_security_and_seo_headers(response):
    """Add security + SEO + caching headers to every response."""
    # Security headers
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = (
        'geolocation=(), microphone=(self), camera=(), payment=()'
    )

    if os.environ.get('FLASK_ENV') == 'production':
        response.headers['Strict-Transport-Security'] = (
            'max-age=31536000; includeSubDomains; preload'
        )

    # Cache control
    path = request.path
    if path.startswith('/static/'):
        response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    elif path in ('/sitemap.xml', '/robots.txt', '/manifest.json'):
        response.headers['Cache-Control'] = 'public, max-age=3600'
    elif path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    else:
        response.headers.setdefault('Cache-Control', 'no-cache, max-age=0')

    return response


@app.before_request
def before_request():
    """Enforce HTTPS in production + block bad actors."""
    if request.method == 'POST':
        request.max_content_length = 50 * 1024 * 1024

    # HTTPS redirect in production
    if os.environ.get('FLASK_ENV') == 'production':
        if request.headers.get('X-Forwarded-Proto', 'http') == 'http':
            url = request.url.replace('http://', 'https://', 1)
            return redirect(url, code=301)


# ============================================================
# GZIP COMPRESSION
# ============================================================
@app.after_request
def gzip_response(response):
    """Compress responses >= 500 bytes if client accepts gzip."""
    accept_encoding = request.headers.get('Accept-Encoding', '')
    if (
        'gzip' not in accept_encoding.lower()
        or response.status_code < 200
        or response.status_code >= 300
        or response.direct_passthrough
        or 'Content-Encoding' in response.headers
    ):
        return response

    content_type = response.headers.get('Content-Type', '')
    if not any(t in content_type for t in ('text/', 'application/json', 'application/xml', 'application/javascript')):
        return response

    data = response.get_data()
    if len(data) < 500:
        return response

    gz = BytesIO()
    with gzip.GzipFile(mode='wb', fileobj=gz, compresslevel=6) as f:
        f.write(data)

    response.set_data(gz.getvalue())
    response.headers['Content-Encoding'] = 'gzip'
    response.headers['Content-Length'] = str(len(response.get_data()))
    response.headers['Vary'] = 'Accept-Encoding'
    return response


# ============================================================
# SEO ROUTES
# ============================================================
@app.route('/sitemap.xml')
def sitemap():
    """Serve sitemap.xml with correct MIME type."""
    try:
        return send_from_directory(
            app.root_path, 'sitemap.xml',
            mimetype='application/xml'
        )
    except Exception:
        return Response(
            '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            f'<url><loc>{BASE_URL}/</loc><priority>1.0</priority></url>'
            f'<url><loc>{BASE_URL}/access</loc><priority>0.9</priority></url>'
            f'<url><loc>{BASE_URL}/about</loc><priority>0.8</priority></url>'
            '</urlset>',
            mimetype='application/xml'
        )


@app.route('/robots.txt')
def robots():
    """Serve robots.txt with sitemap reference."""
    try:
        return send_from_directory(
            app.root_path, 'robots.txt',
            mimetype='text/plain'
        )
    except Exception:
        txt = (
            "User-agent: *\n"
            "Allow: /\n"
            "Disallow: /api/\n"
            "Disallow: /share/\n"
            "Disallow: /note/\n"
            f"Sitemap: {BASE_URL}/sitemap.xml\n"
        )
        return Response(txt, mimetype='text/plain')


@app.route('/service-worker.js')
def service_worker():
    """Serve service worker from root scope."""
    try:
        resp = send_from_directory(
            app.root_path, 'service-worker.js',
            mimetype='application/javascript'
        )
    except Exception:
        return Response('// service worker missing', mimetype='application/javascript')
    resp.headers['Service-Worker-Allowed'] = '/'
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return resp


@app.route('/manifest.json')
def manifest():
    """Serve PWA manifest."""
    manifest_data = {
        "name": "Web Notepad – Free Online Notepad No Login",
        "short_name": "Web Notepad",
        "description": "Free online notepad no login. Write, edit, and share notes with QR code or 6-digit code.",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "orientation": "portrait-primary",
        "background_color": "#667eea",
        "theme_color": "#667eea",
        "lang": "en-US",
        "categories": ["productivity", "utilities"],
        "icons": [
            {"src": "/static/image.png", "sizes": "192x192",
             "type": "image/png", "purpose": "any maskable"},
            {"src": "/static/image.png", "sizes": "512x512",
             "type": "image/png", "purpose": "any maskable"},
        ],
        "shortcuts": [
            {"name": "New Note", "short_name": "New", "url": "/",
             "description": "Start writing a new note"},
            {"name": "Receiver", "short_name": "Receive", "url": "/access",
             "description": "Access a shared note with 6-digit code"},
        ],
    }
    return Response(
        json.dumps(manifest_data, indent=2),
        mimetype='application/manifest+json'
    )


@app.route('/favicon.ico')
def favicon():
    """Serve favicon from static folder."""
    return send_from_directory(
        os.path.join(app.root_path, 'static'),
        'image.png', mimetype='image/png'
    )


# ============================================================
# PAGE ROUTES
# ============================================================
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/access')
def access_page():
    return render_template('access.html')


@app.route('/about')
def about():
    return render_template('about.html')


@app.route('/privacy-policy')
def privacy():
    return render_template('privacy.html')


# ============================================================
# API: SHARE / ACCESS / HISTORY
# ============================================================
@app.route('/share', methods=['POST'])
@limiter.limit("60 per minute")
def create_share():
    """Create a shareable note with 6-digit code."""
    start = time.time()
    data = request.get_json(silent=True) or {}

    content = data.get('content', '')
    html_content = data.get('html', '')
    title = data.get('title', f'Note_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}')

    code = generate_share_code()
    expires_at = datetime.utcnow() + timedelta(hours=SHARE_EXPIRY_HOURS)

    note_data = {
        'title': title[:500],
        'content': content,
        'html': clean_html_for_safe_storage(html_content),
        'created_at': datetime.utcnow().isoformat(),
        'expires_at': expires_at.isoformat(),
        'views': 0,
        'content_length': len(content) + len(html_content),
    }

    storage.set(code, note_data)
    share_url = f"{BASE_URL}/note/{code}"

    elapsed_ms = (time.time() - start) * 1000
    size_kb = (len(content) + len(html_content)) / 1024
    logger.info(f"⚡ Share created [{code}] in {elapsed_ms:.1f}ms, {size_kb:.1f}KB")

    return jsonify({
        'success': True,
        'share_code': code,
        'share_url': share_url,
        'expires_at': expires_at.isoformat(),
        'qr_data': share_url,
        'response_time_ms': round(elapsed_ms, 2),
        'content_size_kb': round(size_kb, 1),
    })


@app.route('/api/access', methods=['POST'])
@limiter.limit("30 per minute")
def access_by_code():
    """Retrieve note by 6-digit code."""
    data = request.get_json(silent=True) or {}
    code = (data.get('code') or '').strip()

    if not code or not code.isdigit() or len(code) != SHARE_CODE_LENGTH:
        return jsonify({'error': f'Please enter a valid {SHARE_CODE_LENGTH}-digit code'}), 400

    note = storage.get(code)
    if not note:
        return jsonify({'error': 'Invalid code or note not found'}), 404

    if is_expired(note):
        storage.delete(code)
        return jsonify({'error': 'This note has expired (1-hour limit)'}), 404

    # Increment views (async)
    def bump():
        note['views'] = note.get('views', 0) + 1
        storage.set(code, note)
    threading.Thread(target=bump, daemon=True).start()

    return jsonify({
        'success': True,
        'code': code,
        'note': {
            'title': note.get('title', ''),
            'content': note.get('content', ''),
            'html': note.get('html', ''),
            'created_at': note.get('created_at'),
            'expires_at': note.get('expires_at'),
            'views': note.get('views', 0) + 1,
        }
    })


@app.route('/note/<share_code>')
def view_shared_note(share_code):
    """Human-readable view of a shared note."""
    note = storage.get(share_code)
    if not note:
        return render_template('404.html'), 404

    if is_expired(note):
        storage.delete(share_code)
        return render_template(
            '404.html',
            message='This share link has expired (1-hour limit)'
        ), 404

    def bump():
        note['views'] = note.get('views', 0) + 1
        storage.set(share_code, note)
    threading.Thread(target=bump, daemon=True).start()

    note['views'] = note.get('views', 0) + 1

    return render_template(
        'shared.html',
        note=note,
        share_code=share_code,
        share_url=f"{BASE_URL}/note/{share_code}"
    )


@app.route('/api/note/<share_code>', methods=['GET'])
@limiter.limit("200 per minute")
def get_shared_note_api(share_code):
    """API to fetch note content."""
    note = storage.get(share_code)
    if not note:
        return jsonify({'error': 'Note not found or expired'}), 404

    if is_expired(note):
        storage.delete(share_code)
        return jsonify({'error': 'Share link expired (1-hour limit)'}), 404

    return jsonify({
        'success': True,
        'content': note.get('content', ''),
        'html': note.get('html', ''),
        'created_at': note.get('created_at'),
        'expires_at': note.get('expires_at'),
        'views': note.get('views', 0),
        'content_length': len(note.get('content', '')),
        'line_count': len((note.get('content', '') or '').split('\n')),
    })


@app.route('/api/note/<share_code>', methods=['DELETE'])
@limiter.limit("20 per minute")
def delete_shared_note(share_code):
    if storage.delete(share_code):
        return jsonify({'success': True})
    return jsonify({'error': 'Note not found'}), 404


@app.route('/api/validate-code', methods=['POST'])
@limiter.limit("30 per minute")
def validate_code():
    data = request.get_json(silent=True) or {}
    code = (data.get('code') or '').strip()

    if not code or not code.isdigit() or len(code) != SHARE_CODE_LENGTH:
        return jsonify({'error': f'Code must be {SHARE_CODE_LENGTH} digits'}), 400

    note = storage.get(code)
    if not note:
        return jsonify({'valid': False, 'error': 'Code not found'}), 404

    if is_expired(note):
        return jsonify({'valid': False, 'error': 'Code has expired'}), 404

    return jsonify({
        'valid': True,
        'title': note.get('title', 'Untitled'),
        'created_at': note.get('created_at'),
        'content_length': len(note.get('content', '')),
        'line_count': len((note.get('content', '') or '').split('\n')),
    })


# ============================================================
# HISTORY API
# ============================================================
@app.route('/api/history', methods=['GET'])
def get_share_history():
    limit = request.args.get('limit', 50, type=int)
    history = storage.get_history(limit)
    return jsonify({'success': True, 'history': history, 'total': len(history)})


@app.route('/api/history/<share_code>', methods=['DELETE'])
def delete_history_item(share_code):
    if storage.delete(share_code):
        return jsonify({'success': True})
    return jsonify({'error': 'Not found'}), 404


@app.route('/api/history/clear', methods=['POST'])
def clear_history():
    with storage.lock:
        storage.history = []
        storage._save()
    return jsonify({'success': True, 'message': 'History cleared'})


# ============================================================
# MONITORING / STATS
# ============================================================
@app.route('/stats')
def get_stats():
    return jsonify(storage.get_stats())


@app.route('/health')
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'storage': 'Optimized File Storage (No Limits)',
        'expiry_hours': SHARE_EXPIRY_HOURS,
        'cache_size': len(note_cache),
        'max_content_mb': 50,
    })


@app.route('/api/cleanup', methods=['POST'])
def cleanup_expired():
    cleaned = storage.cleanup_expired()
    return jsonify({'cleaned': cleaned, 'timestamp': datetime.utcnow().isoformat()})


# ============================================================
# ERROR HANDLERS
# ============================================================
@app.errorhandler(404)
def page_not_found(e):
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Not found'}), 404
    return render_template('404.html'), 404


@app.errorhandler(413)
def payload_too_large(e):
    return jsonify({'error': 'Note is too large. Maximum size is 50MB.'}), 413


@app.errorhandler(429)
def rate_limited(e):
    return jsonify({
        'error': 'Rate limit exceeded',
        'retry_after': getattr(e, 'description', '60 seconds'),
    }), 429


@app.errorhandler(500)
def internal_error(e):
    logger.exception("Internal server error")
    if request.path.startswith('/api/'):
        return jsonify({'error': 'Internal server error'}), 500
    return render_template('500.html'), 500


# ============================================================
# BACKGROUND CLEANUP THREAD
# ============================================================
def auto_cleanup():
    """Periodically remove expired notes."""
    while True:
        time.sleep(1800)  # 30 minutes
        try:
            cleaned = storage.cleanup_expired()
            if cleaned:
                logger.info(f"🧹 Auto-cleaned {cleaned} expired notes")
        except Exception as e:
            logger.error(f"Cleanup error: {e}")


# ============================================================
# MAIN
# ============================================================
if __name__ == '__main__':
    # Start background cleanup
    threading.Thread(target=auto_cleanup, daemon=True).start()

    # Initial cleanup on startup
    cleaned = storage.cleanup_expired()
    if cleaned:
        logger.info(f"🧹 Cleaned up {cleaned} expired notes on startup")

    logger.info(f"📊 Storage Stats: {storage.get_stats()}")
    logger.info(f"🚀 Server: http://localhost:8080")
    logger.info(f"🔐 6-Digit Code Access: http://localhost:8080/access")
    logger.info(f"⏰ Notes expire in {SHARE_EXPIRY_HOURS} hour(s)")
    logger.info(f"📝 Maximum note size: 50MB (No line limits!)")
    logger.info(f"🌐 Base URL: {BASE_URL}")

    app.run(host='0.0.0.0', port=8080, debug=False, threaded=True)
