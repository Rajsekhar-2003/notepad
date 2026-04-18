# app.py - Complete with Share History & 6-Digit Code Access Feature (1-Hour Expiry)
import os
import re
import secrets
import json
import threading
import time
import hashlib
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, render_template, request, jsonify, make_response, session, redirect, url_for
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from cachetools import TTLCache, LRUCache

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))

# Increase request size limits - IMPORTANT for large notes
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max for large notes

CORS(app)

# Rate limiting
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["500 per day", "100 per hour"],
    storage_uri="memory://",
)

SHARE_CODE_LENGTH = 6  # 6 digits
SHARE_EXPIRY_HOURS = 1  # 1 hour expiry

# ============ PERFORMANCE CACHE ============
note_cache = TTLCache(maxsize=5000, ttl=600)
code_cache = set()

# ============ OPTIMIZED FILE STORAGE WITH NO SIZE LIMITS ============

class OptimizedFileStorage:
    def __init__(self):
        """Initialize fast file-based storage with caching"""
        self.filename = 'shared_notes_data.json'
        self.history_filename = 'share_history.json'
        self.cache = LRUCache(maxsize=5000)
        self.lock = threading.Lock()
        self._load()
        print("✅ Optimized File Storage initialized (No size limits!)")
    
    def _load(self):
        """Load data from file"""
        if os.path.exists(self.filename):
            try:
                with open(self.filename, 'r', encoding='utf-8') as f:
                    self.data = json.load(f)
                print(f"📁 Loaded {len(self.data)} notes from storage")
            except Exception as e:
                print(f"Error loading data: {e}")
                self.data = {}
        else:
            self.data = {}
        
        # Load share history
        if os.path.exists(self.history_filename):
            try:
                with open(self.history_filename, 'r', encoding='utf-8') as f:
                    self.history = json.load(f)
                print(f"📜 Loaded {len(self.history)} share history entries")
            except Exception as e:
                print(f"Error loading history: {e}")
                self.history = []
        else:
            self.history = []
    
    def _save(self):
        """Save data to file asynchronously"""
        def save_async():
            with self.lock:
                try:
                    with open(self.filename, 'w', encoding='utf-8') as f:
                        json.dump(self.data, f, indent=2, ensure_ascii=False)
                    with open(self.history_filename, 'w', encoding='utf-8') as f:
                        json.dump(self.history, f, indent=2, ensure_ascii=False)
                except Exception as e:
                    print(f"Error saving data: {e}")
        
        threading.Thread(target=save_async, daemon=True).start()
    
    def get(self, share_code):
        """Get note with caching"""
        if share_code in self.cache:
            return self.cache[share_code]
        
        data = self.data.get(share_code)
        if data:
            self.cache[share_code] = data
        return data
    
    def set(self, share_code, note_data):
        """Store note and add to history"""
        if '_id' in note_data:
            del note_data['_id']
        
        self.data[share_code] = note_data
        self.cache[share_code] = note_data
        
        # Create preview (first 200 chars)
        content_preview = note_data.get('content', '') or note_data.get('html', '')
        if len(content_preview) > 200:
            content_preview = content_preview[:200] + '...'
        
        # Add to share history
        history_entry = {
            'share_code': share_code,
            'title': note_data.get('title', f'Note_{share_code}'),
            'preview': content_preview,
            'created_at': note_data.get('created_at', datetime.utcnow().isoformat()),
            'expires_at': note_data.get('expires_at'),
            'views': note_data.get('views', 0),
            'share_url': f'/note/{share_code}',
            'content_length': len(note_data.get('content', '') or note_data.get('html', ''))
        }
        
        # Add to beginning of history (most recent first)
        self.history.insert(0, history_entry)
        
        # Keep only last 200 history entries
        if len(self.history) > 200:
            self.history = self.history[:200]
        
        self._save()
        return True
    
    def delete(self, share_code):
        """Delete note and remove from history"""
        if share_code in self.data:
            del self.data[share_code]
        
        if share_code in self.cache:
            del self.cache[share_code]
        
        # Remove from history
        self.history = [h for h in self.history if h.get('share_code') != share_code]
        
        self._save()
        return True
    
    def get_history(self, limit=50):
        """Get share history"""
        return self.history[:limit]
    
    def cleanup_expired(self):
        """Clean up expired notes"""
        now = datetime.utcnow().isoformat()
        expired = []
        
        for code, note in self.data.items():
            expires_at = note.get('expires_at', '')
            if expires_at and expires_at < now:
                expired.append(code)
        
        for code in expired:
            del self.data[code]
            if code in self.cache:
                del self.cache[code]
            # Remove from history
            self.history = [h for h in self.history if h.get('share_code') != code]
        
        if expired:
            self._save()
        
        return len(expired)
    
    def get_stats(self):
        """Get storage statistics"""
        total_chars = sum(len(n.get('content', '')) + len(n.get('html', '')) for n in self.data.values())
        return {
            'total_notes': len(self.data),
            'active_notes': len([n for n in self.data.values() if n.get('expires_at', '') > datetime.utcnow().isoformat()]),
            'cache_size': len(self.cache),
            'history_count': len(self.history),
            'storage_type': 'Optimized File Storage (No Limits)',
            'total_characters': total_chars,
            'max_note_size_mb': round(total_chars / (1024 * 1024) if total_chars > 0 else 0, 2)
        }

# Initialize storage
storage = OptimizedFileStorage()

# ============ HELPER FUNCTIONS ============

def generate_share_code():
    """Generate unique 6-digit numeric code FAST"""
    for _ in range(10):
        # Generate 6-digit numeric code
        code = ''.join([str(secrets.randbelow(10)) for _ in range(SHARE_CODE_LENGTH)])
        
        # Ensure it's a valid 6-digit number
        if len(code) == SHARE_CODE_LENGTH and code not in code_cache:
            if not storage.get(code):
                code_cache.add(code)
                if len(code_cache) > 10000:
                    code_cache.clear()
                return code
    
    # Fallback: use timestamp hash to generate 6-digit code
    timestamp = str(int(time.time() * 1000))
    code = hashlib.md5(timestamp.encode()).hexdigest()[:SHARE_CODE_LENGTH]
    # Convert hex to numeric if possible
    code = ''.join(c for c in code if c.isdigit())
    if len(code) < SHARE_CODE_LENGTH:
        code = code.ljust(SHARE_CODE_LENGTH, '0')
    return code[:SHARE_CODE_LENGTH]

def clean_html_for_safe_storage(html_content):
    """Fast HTML sanitization - NO LENGTH LIMIT"""
    if not html_content:
        return ''
    # Remove script tags
    html_content = re.sub(r'<script[^>]*>.*?</script>', '', html_content, flags=re.IGNORECASE | re.DOTALL)
    # Remove event handlers
    html_content = re.sub(r'on\w+\s*=\s*["\'][^"\']*["\']', '', html_content, flags=re.IGNORECASE)
    # Remove javascript: protocol
    html_content = re.sub(r'javascript:', '', html_content, flags=re.IGNORECASE)
    # No length limit - allow full content
    return html_content

# ============ MIDDLEWARE ============

@app.before_request
def before_request():
    """Set max content length for POST requests"""
    if request.method == 'POST':
        request.max_content_length = 50 * 1024 * 1024  # 50MB

# ============ ROUTES ============

@app.route('/')
def index():
    """Serve the main notepad page"""
    return render_template('index.html')

@app.route('/access')
def access_page():
    """Page for entering 6-digit code"""
    return render_template('access.html')

@app.route('/api/access', methods=['POST'])
@limiter.limit("30 per minute")
def access_by_code():
    """Access content using 6-digit code"""
    data = request.get_json()
    if not data or 'code' not in data:
        return jsonify({'error': 'Code is required'}), 400
    
    code = data.get('code', '').strip()
    
    # Validate code format (6 digits)
    if not code or not code.isdigit() or len(code) != SHARE_CODE_LENGTH:
        return jsonify({'error': f'Please enter a valid {SHARE_CODE_LENGTH}-digit code'}), 400
    
    # Look up the note
    note = storage.get(code)
    if not note:
        return jsonify({'error': 'Invalid code or note not found'}), 404
    
    # Check if expired
    try:
        expires_at = datetime.fromisoformat(note['expires_at'])
        if expires_at < datetime.utcnow():
            storage.delete(code)
            return jsonify({'error': 'This note has expired (1-hour limit)'}), 404
    except:
        pass
    
    # Increment views
    def increment_views_async():
        updated_note = {
            'title': note.get('title', ''),
            'content': note.get('content', ''),
            'html': note.get('html', ''),
            'created_at': note.get('created_at', datetime.utcnow().isoformat()),
            'expires_at': note.get('expires_at'),
            'views': note.get('views', 0) + 1
        }
        storage.set(code, updated_note)
    
    threading.Thread(target=increment_views_async, daemon=True).start()
    
    return jsonify({
        'success': True,
        'code': code,
        'note': {
            'title': note.get('title', ''),
            'content': note.get('content', ''),
            'html': note.get('html', ''),
            'created_at': note.get('created_at'),
            'expires_at': note.get('expires_at'),
            'views': note.get('views', 0) + 1
        }
    })

@app.route('/share', methods=['POST'])
@limiter.limit("60 per minute")
def create_share():
    """Create a shareable link with 6-digit code (expires in 1 hour)"""
    start_time = time.time()
    
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request'}), 400
    
    content = data.get('content', '')
    html_content = data.get('html', '')
    title = data.get('title', f'Note_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}')
    
    share_code = generate_share_code()
    expires_at = datetime.utcnow() + timedelta(hours=SHARE_EXPIRY_HOURS)  # 1 hour expiry
    
    # NO SIZE LIMITS - Allow full content
    note_data = {
        'title': title[:500],  # Only limit title length
        'content': content if content else '',  # NO LIMIT - Full content preserved
        'html': clean_html_for_safe_storage(html_content),  # NO LIMIT - Full HTML preserved
        'created_at': datetime.utcnow().isoformat(),
        'expires_at': expires_at.isoformat(),
        'views': 0,
        'content_length': len(content) + len(html_content)  # Track for stats
    }
    
    storage.set(share_code, note_data)
    share_url = request.host_url.rstrip('/') + '/note/' + share_code
    
    elapsed_ms = (time.time() - start_time) * 1000
    content_size_kb = (len(content) + len(html_content)) / 1024
    print(f"⚡ Share created in {elapsed_ms:.2f}ms - Code: {share_code} (Size: {content_size_kb:.1f}KB) - Expires in 1 hour")
    
    return jsonify({
        'success': True,
        'share_code': share_code,
        'share_url': share_url,
        'expires_at': expires_at.isoformat(),
        'qr_data': share_url,
        'response_time_ms': round(elapsed_ms, 2),
        'content_size_kb': round(content_size_kb, 1)
    })

@app.route('/api/history', methods=['GET'])
def get_share_history():
    """Get share history"""
    limit = request.args.get('limit', 50, type=int)
    history = storage.get_history(limit)
    return jsonify({
        'success': True,
        'history': history,
        'total': len(history)
    })

@app.route('/api/history/<share_code>', methods=['DELETE'])
def delete_history_item(share_code):
    """Delete a history item"""
    if storage.delete(share_code):
        return jsonify({'success': True})
    return jsonify({'error': 'Not found'}), 404

@app.route('/api/history/clear', methods=['POST'])
def clear_history():
    """Clear all history"""
    storage.history = []
    storage._save()
    return jsonify({'success': True, 'message': 'History cleared'})

@app.route('/note/<share_code>')
def view_shared_note(share_code):
    """View a shared note"""
    start_time = time.time()
    
    note = storage.get(share_code)
    if not note:
        return render_template('404.html'), 404
    
    try:
        expires_at = datetime.fromisoformat(note['expires_at'])
        if expires_at < datetime.utcnow():
            storage.delete(share_code)
            return render_template('404.html', message='This share link has expired (1-hour limit)'), 404
    except:
        pass
    
    def increment_views_async():
        updated_note = {
            'title': note.get('title', ''),
            'content': note.get('content', ''),
            'html': note.get('html', ''),
            'created_at': note.get('created_at', datetime.utcnow().isoformat()),
            'expires_at': note.get('expires_at'),
            'views': note.get('views', 0) + 1
        }
        storage.set(share_code, updated_note)
    
    threading.Thread(target=increment_views_async, daemon=True).start()
    note['views'] = note.get('views', 0) + 1
    
    elapsed_ms = (time.time() - start_time) * 1000
    content_lines = len((note.get('content', '') or '').split('\n'))
    print(f"⚡ Note viewed in {elapsed_ms:.2f}ms - Code: {share_code} (Lines: {content_lines})")
    
    return render_template('shared.html', 
                         note=note, 
                         share_code=share_code,
                         share_url=request.host_url.rstrip('/') + '/note/' + share_code)

@app.route('/api/note/<share_code>', methods=['GET'])
@limiter.limit("200 per minute")
def get_shared_note_api(share_code):
    """API endpoint to fetch shared note content"""
    note = storage.get(share_code)
    if not note:
        return jsonify({'error': 'Note not found or expired'}), 404
    
    try:
        expires_at = datetime.fromisoformat(note['expires_at'])
        if expires_at < datetime.utcnow():
            storage.delete(share_code)
            return jsonify({'error': 'Share link expired (1-hour limit)'}), 404
    except:
        pass
    
    return jsonify({
        'success': True,
        'content': note.get('content', ''),
        'html': note.get('html', ''),
        'created_at': note.get('created_at'),
        'expires_at': note.get('expires_at'),
        'views': note.get('views', 0),
        'content_length': len(note.get('content', '')),
        'line_count': len((note.get('content', '') or '').split('\n'))
    })

@app.route('/api/note/<share_code>', methods=['DELETE'])
@limiter.limit("20 per minute")
def delete_shared_note(share_code):
    """Delete a shared note"""
    if storage.delete(share_code):
        return jsonify({'success': True})
    return jsonify({'error': 'Note not found'}), 404

@app.route('/stats')
def get_stats():
    """Get database statistics"""
    stats = storage.get_stats()
    return jsonify(stats)

@app.route('/health')
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'storage': 'Optimized File Storage (No Limits)',
        'expiry_hours': SHARE_EXPIRY_HOURS,
        'cache_size': len(note_cache),
        'max_content_mb': 50
    })

@app.route('/api/cleanup', methods=['POST'])
def cleanup_expired():
    """Manually trigger cleanup of expired notes"""
    cleaned = storage.cleanup_expired()
    return jsonify({'cleaned': cleaned, 'timestamp': datetime.utcnow().isoformat()})

@app.route('/api/validate-code', methods=['POST'])
@limiter.limit("30 per minute")
def validate_code():
    """Validate if a 6-digit code exists and is not expired"""
    data = request.get_json()
    if not data or 'code' not in data:
        return jsonify({'error': 'Code is required'}), 400
    
    code = data.get('code', '').strip()
    
    if not code or not code.isdigit() or len(code) != SHARE_CODE_LENGTH:
        return jsonify({'error': f'Code must be {SHARE_CODE_LENGTH} digits'}), 400
    
    note = storage.get(code)
    if not note:
        return jsonify({'valid': False, 'error': 'Code not found'}), 404
    
    try:
        expires_at = datetime.fromisoformat(note['expires_at'])
        if expires_at < datetime.utcnow():
            return jsonify({'valid': False, 'error': 'Code has expired (1-hour limit)'}), 404
    except:
        pass
    
    return jsonify({
        'valid': True,
        'title': note.get('title', 'Untitled'),
        'created_at': note.get('created_at'),
        'content_length': len(note.get('content', '')),
        'line_count': len((note.get('content', '') or '').split('\n'))
    })

# Auto-cleanup thread for expired notes
def auto_cleanup():
    """Background thread to clean expired notes every 30 minutes"""
    while True:
        time.sleep(1800)  # 30 minutes
        cleaned = storage.cleanup_expired()
        if cleaned > 0:
            print(f"🧹 Auto-cleaned {cleaned} expired notes")

@app.route('/about')
def about():
    return render_template('about.html')

@app.route('/privacy-policy')
def privacy():
    return render_template('privacy.html')

@app.errorhandler(413)
def too_large(e):
    """Handle file too large error"""
    return jsonify({'error': 'Note is too large. Maximum size is 50MB.'}), 413

if __name__ == '__main__':
    # Start auto-cleanup thread
    cleanup_thread = threading.Thread(target=auto_cleanup, daemon=True)
    cleanup_thread.start()
    
    # Initial cleanup
    cleaned = storage.cleanup_expired()
    if cleaned > 0:
        print(f"🧹 Cleaned up {cleaned} expired notes")
    
    stats = storage.get_stats()
    print(f"📊 Storage Stats: {stats}")
    print(f"🚀 Server running at http://localhost:5000")
    print(f"🔐 6-Digit Code Access: http://localhost:5000/access")
    print(f"⏰ Notes expire in {SHARE_EXPIRY_HOURS} hour(s)")
    print(f"📝 Maximum note size: 50MB (No line limits!)")
    
    app.run(host='0.0.0.0', port=3000, debug=False, threaded=True)