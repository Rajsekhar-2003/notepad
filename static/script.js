
    // ==================== ULTRA NOTE PRO - WITH APPEND/REPLACE MODAL ====================
    // Core elements
    const editor = document.getElementById('editor');
    let saveTimeout;
    let pendingFile = null;
    let pendingFileContent = null;

    // ==================== UTILITY FUNCTIONS ====================
    function showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast-msg ${type}`;
        const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
        toast.innerHTML = `<i class="bi ${icons[type]}"></i> ${escapeHtml(message)}`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function setStatus(message, isError = false) {
        const statusSpan = document.getElementById('statusMsg');
        if (statusSpan) {
            statusSpan.innerHTML = `<i class="bi ${isError ? 'bi-exclamation-triangle-fill text-danger' : 'bi-check-circle-fill text-success'} me-1"></i> ${message}`;
            setTimeout(() => {
                if (statusSpan.innerHTML.includes(message)) {
                    statusSpan.innerHTML = '<i class="bi bi-check-circle-fill text-success me-1"></i> Ready';
                }
            }, 3000);
        }
    }

    // ==================== FORMATTING FUNCTIONS ====================
    function execCommand(cmd, value = null) {
        document.execCommand(cmd, false, value);
        editor.focus();
        updateStats();
        triggerAutoSave();
    }

    function clearFormattingOnly() {
        document.execCommand('removeFormat', false, null);
        editor.focus();
        updateStats();
        triggerAutoSave();
        showToast('Text formatting cleared', 'success');
        setStatus('Formatting removed');
    }

    function removeBackgroundColor() {
        document.execCommand('backColor', false, 'transparent');
        editor.focus();
        showToast('Background color removed', 'success');
        setStatus('Background removed');
        triggerAutoSave();
    }

    function removeAllStyles() {
        document.execCommand('removeFormat', false, null);
        document.execCommand('backColor', false, 'transparent');
        editor.focus();
        updateStats();
        showToast('All styles removed', 'success');
        setStatus('All formatting cleared');
        triggerAutoSave();
    }

    function insertLink() {
        const url = prompt('Enter URL:', 'https://');
        if (url) execCommand('createLink', url);
    }

    function insertImage() {
        const url = prompt('Enter image URL:', 'https://picsum.photos/400/300');
        if (url) execCommand('insertImage', url);
    }

    function insertTable() {
        const rows = prompt('Number of rows:', '3');
        const cols = prompt('Number of columns:', '3');
        if (rows && cols && !isNaN(rows) && !isNaN(cols)) {
            let table = '<table class="table table-bordered" style="width:100%; border-collapse: collapse; margin: 16px 0;">';
            for (let i = 0; i < parseInt(rows); i++) {
                table += '<tr>';
                for (let j = 0; j < parseInt(cols); j++) {
                    table += '<td style="border: 1px solid #ddd; padding: 8px;">&nbsp;<\/td>';
                }
                table += '<\/tr>';
            }
            table += '<\/table><br>';
            execCommand('insertHTML', table);
        }
    }

    function changeFontFamily() {
        execCommand('fontName', document.getElementById('fontFamily').value);
    }

    function changeFontSize() {
        const size = document.getElementById('fontSize').value;
        execCommand('fontSize', '7');
        document.querySelectorAll('font[size="7"]').forEach(el => {
            el.style.fontSize = size;
            el.removeAttribute('size');
        });
    }

    function changeTextColor() {
        execCommand('foreColor', document.getElementById('textColor').value);
    }

    function changeBgColor() {
        execCommand('backColor', document.getElementById('bgColor').value);
    }

    // ==================== STATISTICS ====================
    function updateStats() {
        const text = editor.innerText || '';
        const chars = text.length;
        const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
        const lines = (editor.innerHTML.match(/<br>/g) || []).length + 1;
        const readingTime = Math.max(1, Math.ceil(words / 200));
        
        document.getElementById('charCount').innerText = chars.toLocaleString();
        document.getElementById('wordCount').innerText = words.toLocaleString();
        document.getElementById('lineCount').innerText = lines;
        document.getElementById('readingTime').innerText = readingTime;
    }

    // ==================== AUTO-SAVE & STORAGE ====================
    function triggerAutoSave() {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveToLocal();
        }, 1000);
    }

    function saveToLocal() {
        try {
            const content = editor.innerHTML;
            const saveData = {
                content: content,
                timestamp: new Date().toISOString(),
                version: '2.0'
            };
            localStorage.setItem('ultranote_draft', JSON.stringify(saveData));
            document.getElementById('lastSaved').innerHTML = `<i class="bi bi-check-lg"></i> Saved ${new Date().toLocaleTimeString()}`;
            setStatus('Draft saved');
        } catch(e) {
            console.error('Save failed:', e);
        }
    }

    function loadDraft() {
        const saved = localStorage.getItem('ultranote_draft');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.content && data.content.trim()) {
                    editor.innerHTML = data.content;
                    updateStats();
                    setStatus('Draft restored');
                    showToast('Previous draft loaded', 'info');
                }
            } catch(e) { console.error('Load failed:', e); }
        } else {
            editor.innerHTML = `
                <div>
                    <h1>✨ Welcome to OmeBox Notepad</h1>
                    <p>This is a <strong>powerful online notepad</strong> with features like:</p>
                    <ul>
                        <li><b>Rich text formatting</b> - Bold, Italic, Underline</li>
                        <li><i>Insert images and links</i></li>
                        <li><span style="background-color: #fef3c7;">Highlight text with colors</span></li>
                        <li><u>Undo/Redo support</u> (Ctrl+Z / Ctrl+Y)</li>
                        <li>📎 Export as PDF, Word, HTML, TXT, Markdown, JSON</li>
                        <li>📂 <strong>Upload files with Append or Replace options</strong></li>
                    </ul>
                    <p>Start typing or paste your content here. Everything is auto-saved locally!</p>
                    <hr>
                    <p><small>Supports 300K+ concurrent users • No server required • Privacy focused</small></p>
                </div>
            `;
            updateStats();
        }
    }

    // ==================== NOTES MANAGEMENT ====================
    function getNotes() {
        const notes = localStorage.getItem('ultranote_notes');
        return notes ? JSON.parse(notes) : {};
    }

    function saveNotes(notes) {
        localStorage.setItem('ultranote_notes', JSON.stringify(notes));
        displayNotes();
    }

    function saveAsNewNote() {
        const nameInput = document.getElementById('noteName');
        const name = nameInput.value.trim();
        if (!name) {
            showToast('Please enter a note name', 'warning');
            nameInput.focus();
            return;
        }
        const notes = getNotes();
        notes[name] = {
            content: editor.innerHTML,
            timestamp: new Date().toISOString(),
            wordCount: document.getElementById('wordCount').innerText
        };
        saveNotes(notes);
        nameInput.value = '';
        showToast(`Note "${name}" saved`, 'success');
        setStatus(`Note saved: ${name}`);
    }

    function loadNote(name) {
        const notes = getNotes();
        if (notes[name]) {
            editor.innerHTML = notes[name].content;
            updateStats();
            showToast(`Loaded: ${name}`, 'success');
            setStatus(`Note loaded: ${name}`);
            triggerAutoSave();
        }
    }

    function deleteNote(name) {
        const notes = getNotes();
        delete notes[name];
        saveNotes(notes);
        showToast(`Note "${name}" deleted`, 'info');
    }

    function displayNotes() {
        const notes = getNotes();
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '';
        const sorted = Object.keys(notes).sort().reverse();
        if (sorted.length === 0) {
            fileList.innerHTML = '<p class="text-muted text-center small py-3">No saved notes yet</p>';
            return;
        }
        sorted.forEach(name => {
            const note = notes[name];
            const div = document.createElement('div');
            div.className = 'file-item';
            div.innerHTML = `
                <div class="file-info" onclick="loadNote('${escapeHtml(name)}')">
                    <div class="file-name"><i class="bi bi-file-text me-1 text-primary"></i> ${escapeHtml(name)}</div>
                    <div class="file-date">${new Date(note.timestamp).toLocaleDateString()}</div>
                </div>
                <button class="btn btn-sm btn-link text-danger" onclick="event.stopPropagation(); deleteNote('${escapeHtml(name)}')">
                    <i class="bi bi-trash3"></i>
                </button>
            `;
            fileList.appendChild(div);
        });
    }

    // ==================== EXPORT FUNCTIONS ====================
    function getExportHTML() {
        const date = new Date().toLocaleString();
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>UltraNote Export</title><style>body{font-family:Inter,sans-serif;max-width:900px;margin:0 auto;padding:40px;line-height:1.6;}img{max-width:100%;}</style></head><body>${editor.innerHTML || '<p><em>Empty document</em></p>'}<hr><small>Generated by UltraNote Pro on ${date}</small></body></html>`;
    }

    async function exportPDF() {
        showToast('Generating PDF...', 'info');
        const element = document.createElement('div');
        element.innerHTML = getExportHTML();
        element.style.padding = '20px';
        try {
            await html2pdf().set({ margin: 0.5, filename: `ultranote_${Date.now()}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'a4' } }).from(element).save();
            showToast('PDF saved', 'success');
        } catch(e) {
            showToast('PDF failed, using print', 'warning');
            const w = window.open('', '_blank');
            w.document.write(getExportHTML());
            w.document.close();
            w.print();
        }
    }

    function exportWord() {
        const blob = new Blob([getExportHTML()], { type: 'application/msword' });
        saveAs(blob, `ultranote_${Date.now()}.doc`);
        showToast('Word document saved', 'success');
    }

    function exportHTML() {
        const blob = new Blob([getExportHTML()], { type: 'text/html' });
        saveAs(blob, `ultranote_${Date.now()}.html`);
        showToast('HTML saved', 'success');
    }

    function exportTXT() {
        const blob = new Blob([editor.innerText], { type: 'text/plain' });
        saveAs(blob, `ultranote_${Date.now()}.txt`);
        showToast('Text file saved', 'success');
    }

    function exportMD() {
        let text = editor.innerText;
        const blob = new Blob([text], { type: 'text/markdown' });
        saveAs(blob, `ultranote_${Date.now()}.md`);
        showToast('Markdown saved', 'success');
    }

    function exportJSON() {
        const data = { content: editor.innerHTML, plainText: editor.innerText, exportedAt: new Date().toISOString() };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        saveAs(blob, `ultranote_${Date.now()}.json`);
        showToast('JSON saved', 'success');
    }

    function clearAllContent() {
        if (confirm('⚠️ Clear all content? This cannot be undone.')) {
            editor.innerHTML = '';
            updateStats();
            triggerAutoSave();
            showToast('Editor cleared', 'info');
            setStatus('All content cleared');
            editor.focus();
        }
    }

    // ==================== FILE UPLOAD WITH APPEND/REPLACE MODAL ====================
    async function processFileToHTML(file) {
        const name = file.name.toLowerCase();
        
        try {
            // TXT files
            if (name.endsWith('.txt')) {
                const text = await file.text();
                return text.replace(/\n/g, '<br>');
            }
            // DOCX files
            else if (name.endsWith('.docx') && typeof mammoth !== 'undefined') {
                showToast('Converting Word document...', 'info');
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.convertToHtml({ arrayBuffer });
                return result.value;
            }
            // PDF files
            else if (name.endsWith('.pdf') && typeof pdfjsLib !== 'undefined') {
                showToast('Extracting text from PDF...', 'info');
                const arrayBuffer = await file.arrayBuffer();
                const typedArray = new Uint8Array(arrayBuffer);
                const pdf = await pdfjsLib.getDocument(typedArray).promise;
                let text = '';
                for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    text += content.items.map(item => item.str).join(' ') + '<br><br>';
                }
                return text || '<p><em>No text extracted from PDF</em></p>';
            }
            // Image files
            else if (file.type.startsWith('image/')) {
                const base64 = await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(file);
                });
                return `<img src="${base64}" style="max-width:100%; border-radius:12px; margin:10px 0;" alt="Uploaded image: ${escapeHtml(file.name)}">`;
            }
            // HTML files
            else if (name.endsWith('.html') || name.endsWith('.htm')) {
                const html = await file.text();
                const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
                return bodyMatch ? bodyMatch[1] : html;
            }
            // JSON files
            else if (name.endsWith('.json')) {
                const text = await file.text();
                try {
                    const parsed = JSON.parse(text);
                    return `<pre style="background:#f5f5f5;padding:16px;border-radius:8px;overflow-x:auto;"><code>${escapeHtml(JSON.stringify(parsed, null, 2))}</code></pre>`;
                } catch {
                    return `<pre>${escapeHtml(text)}</pre>`;
                }
            }
            // Markdown files
            else if (name.endsWith('.md') || name.endsWith('.markdown')) {
                const text = await file.text();
                let html = text
                    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
                    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
                    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
                    .replace(/\n/g, '<br>');
                return html;
            }
            // Default - treat as plain text
            else {
                const text = await file.text();
                return escapeHtml(text).replace(/\n/g, '<br>');
            }
        } catch (error) {
            console.error('Process error:', error);
            throw new Error(`Failed to process ${file.name}: ${error.message}`);
        }
    }

    function showAppendReplaceModal(file, processedContent) {
        // Remove any existing modal
        const existingModal = document.querySelector('.modal-overlay');
        if (existingModal) existingModal.remove();
        
        // Format file size
        const fileSize = file.size < 1024 ? `${file.size} B` : 
                         file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` : 
                         `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
        
        // Get file icon
        const fileExt = file.name.split('.').pop().toLowerCase();
        const fileIcon = {
            'txt': 'bi-filetype-txt', 'docx': 'bi-filetype-docx', 'pdf': 'bi-filetype-pdf',
            'jpg': 'bi-filetype-jpg', 'png': 'bi-filetype-png', 'html': 'bi-filetype-html',
            'md': 'bi-markdown', 'json': 'bi-filetype-json'
        }[fileExt] || 'bi-file-earmark';
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <i class="bi ${fileIcon}"></i>
                    <h3>Import File</h3>
                    <p>How would you like to add this content?</p>
                </div>
                <div class="file-preview">
                    <i class="bi ${fileIcon}"></i>
                    <div class="file-name-preview">${escapeHtml(file.name)}</div>
                    <div class="file-size-preview">${fileSize}</div>
                </div>
                <div class="modal-buttons">
                    <button class="btn-replace" id="modalReplaceBtn">
                        <i class="bi bi-arrow-repeat"></i> Replace
                    </button>
                    <button class="btn-append" id="modalAppendBtn">
                        <i class="bi bi-plus-lg"></i> Append
                    </button>
                    <button class="btn-cancel" id="modalCancelBtn">
                        <i class="bi bi-x-lg"></i> Cancel
                    </button>
                </div>
                <div class="text-center mt-3 small text-muted">
                    <i class="bi bi-info-circle"></i> Replace = Overwrite current content<br>
                    <i class="bi bi-plus-circle"></i> Append = Add below existing content
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Handle button clicks
        const replaceBtn = document.getElementById('modalReplaceBtn');
        const appendBtn = document.getElementById('modalAppendBtn');
        const cancelBtn = document.getElementById('modalCancelBtn');
        
        replaceBtn.onclick = () => {
            editor.innerHTML = processedContent;
            modal.remove();
            updateStats();
            triggerAutoSave();
            showToast(`File "${file.name}" loaded (replaced)`, 'success');
            setStatus(`Replaced with: ${file.name}`);
        };
        
        appendBtn.onclick = () => {
            const existingContent = editor.innerHTML.trim();
            const separator = existingContent ? '<hr style="margin: 24px 0;"><br>' : '';
            editor.innerHTML = existingContent + separator + processedContent;
            modal.remove();
            updateStats();
            triggerAutoSave();
            showToast(`File "${file.name}" appended`, 'success');
            setStatus(`Appended: ${file.name}`);
        };
        
        cancelBtn.onclick = () => {
            modal.remove();
            showToast('Import cancelled', 'info');
        };
        
        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    async function handleFileUpload(file) {
        if (!file) return;
        
        // Check file size (max 50MB)
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
            showToast(`File too large! Max size: 50MB`, 'error');
            return;
        }
        
        showToast(`Processing ${file.name}...`, 'info');
        
        try {
            const processedContent = await processFileToHTML(file);
            
            // Check if editor has existing content
            const hasContent = editor.innerHTML.trim() && editor.innerHTML !== '<div><br></div>' && editor.innerHTML !== '';
            
            if (hasContent) {
                // Show the Append/Replace modal
                showAppendReplaceModal(file, processedContent);
            } else {
                // No content, just replace
                editor.innerHTML = processedContent;
                updateStats();
                triggerAutoSave();
                showToast(`File "${file.name}" loaded`, 'success');
                setStatus(`Loaded: ${file.name}`);
            }
        } catch (error) {
            console.error('Upload error:', error);
            showToast(`Error: ${error.message}`, 'error');
            setStatus('Upload failed', true);
        }
    }

    function triggerUpload() {
        document.getElementById('fileInput').click();
    }

    function onFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            handleFileUpload(file);
        }
        e.target.value = '';
    }

    // ==================== KEYBOARD SHORTCUTS ====================
    function handleKeyboard(e) {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key) {
                case 'b': e.preventDefault(); execCommand('bold'); break;
                case 'i': e.preventDefault(); execCommand('italic'); break;
                case 'u': e.preventDefault(); execCommand('underline'); break;
                case 's': e.preventDefault(); saveToLocal(); showToast('Saved', 'success'); break;
                case 'z': e.preventDefault(); document.execCommand('undo'); updateStats(); break;
                case 'y': e.preventDefault(); document.execCommand('redo'); updateStats(); break;
            }
        }
    }

    // ==================== ONLINE STATUS ====================
    function updateOnlineStatus() {
        const statusSpan = document.getElementById('onlineStatus');
        if (navigator.onLine) {
            statusSpan.innerHTML = '<i class="bi bi-wifi"></i> Online';
        } else {
            statusSpan.innerHTML = '<i class="bi bi-wifi-off"></i> Offline';
        }
    }

    // ==================== INITIALIZATION ====================
    function init() {
        // Load draft
        loadDraft();
        displayNotes();
        
        // Event listeners
        editor.addEventListener('input', () => {
            updateStats();
            triggerAutoSave();
        });
        
        // Tool buttons
        document.querySelectorAll('[data-cmd]').forEach(btn => {
            btn.addEventListener('click', () => execCommand(btn.dataset.cmd));
        });
        
        // Clear functions
        document.getElementById('clearFormatBtn').addEventListener('click', clearFormattingOnly);
        document.getElementById('removeBgBtn').addEventListener('click', removeBackgroundColor);
        document.getElementById('removeAllStylesBtn').addEventListener('click', removeAllStyles);
        document.getElementById('insertLinkBtn').addEventListener('click', insertLink);
        document.getElementById('insertImageBtn').addEventListener('click', insertImage);
        document.getElementById('insertTableBtn').addEventListener('click', insertTable);
        document.getElementById('undoBtn').addEventListener('click', () => { document.execCommand('undo'); updateStats(); });
        document.getElementById('redoBtn').addEventListener('click', () => { document.execCommand('redo'); updateStats(); });
        document.getElementById('saveBtn').addEventListener('click', saveToLocal);
        document.getElementById('printBtn').addEventListener('click', () => window.print());
        document.getElementById('clearAllBtn').addEventListener('click', clearAllContent);
        document.getElementById('uploadBtn').addEventListener('click', triggerUpload);
        document.getElementById('saveNewNoteBtn').addEventListener('click', saveAsNewNote);
        
        // Export buttons
        document.getElementById('exportPDF').addEventListener('click', exportPDF);
        document.getElementById('exportWord').addEventListener('click', exportWord);
        document.getElementById('exportHTML').addEventListener('click', exportHTML);
        document.getElementById('exportTXT').addEventListener('click', exportTXT);
        document.getElementById('exportMD').addEventListener('click', exportMD);
        document.getElementById('exportJSON').addEventListener('click', exportJSON);
        
        // Font controls
        document.getElementById('fontFamily').addEventListener('change', changeFontFamily);
        document.getElementById('fontSize').addEventListener('change', changeFontSize);
        document.getElementById('textColor').addEventListener('change', changeTextColor);
        document.getElementById('bgColor').addEventListener('change', changeBgColor);
        
        // File upload
        document.getElementById('fileInput').addEventListener('change', onFileSelect);
        
        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboard);
        
        // Online status
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        updateOnlineStatus();
        
        // Auto-save interval (every 30 seconds)
        setInterval(() => {
            if (editor.innerHTML.trim()) saveToLocal();
        }, 30000);
        
        showToast('UltraNote Pro ready! Upload files with Append or Replace options', 'success');
    }
    
    // Make functions globally available for onclick handlers
    window.loadNote = loadNote;
    window.deleteNote = deleteNote;
    
    // Start app
    init();
