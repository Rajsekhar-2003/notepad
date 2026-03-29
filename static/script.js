
    // ==================== RICH TEXT EDITOR FUNCTIONS ====================
    
    const editor = document.getElementById('editor');
    const liveRegion = document.getElementById('liveRegion');
    
    // Announce messages for screen readers
    function announceToScreenReader(message) {
        liveRegion.textContent = message;
        setTimeout(() => {
            liveRegion.textContent = '';
        }, 3000);
    }
    
    function formatText(command) {
        document.execCommand(command, false, null);
        updateStats();
        setStatus(`Applied: ${command}`);
        announceToScreenReader(`${command} formatting applied`);
        editor.focus();
    }
    
    function changeFontFamily() {
        const font = document.getElementById('fontFamily').value;
        document.execCommand('fontName', false, font);
        announceToScreenReader(`Font changed to ${font}`);
        editor.focus();
    }
    
    function changeFontSize() {
        const size = document.getElementById('fontSize').value;
        document.execCommand('fontSize', false, '7');
        const fontElements = document.querySelectorAll('font[size="7"]');
        fontElements.forEach(el => {
            el.style.fontSize = size;
            el.removeAttribute('size');
        });
        editor.focus();
        updateStats();
        announceToScreenReader(`Font size changed to ${size}`);
    }
    
    function changeTextColor() {
        const color = document.getElementById('textColor').value;
        document.execCommand('foreColor', false, color);
        announceToScreenReader(`Text color changed`);
        editor.focus();
    }
    
    function changeBgColor() {
        const color = document.getElementById('bgColor').value;
        document.execCommand('backColor', false, color);
        announceToScreenReader(`Background color changed`);
        editor.focus();
    }
    
    function insertLink() {
        const url = prompt('Enter URL:', 'https://');
        if (url) {
            document.execCommand('createLink', false, url);
            announceToScreenReader(`Link inserted: ${url}`);
        }
        editor.focus();
    }
    
    function insertImage() {
        const url = prompt('Enter image URL:', 'https://via.placeholder.com/400x300');
        if (url) {
            document.execCommand('insertImage', false, url);
            announceToScreenReader(`Image inserted from ${url}`);
            // Add alt text prompt for accessibility
            setTimeout(() => {
                const altText = prompt('Enter alt text for the image (for accessibility):', 'Image');
                if (altText) {
                    const images = editor.querySelectorAll('img');
                    const lastImage = images[images.length - 1];
                    if (lastImage) {
                        lastImage.setAttribute('alt', altText);
                        announceToScreenReader(`Image alt text set to: ${altText}`);
                    }
                }
            }, 100);
        }
        editor.focus();
    }
    
    function insertTable() {
        const rows = prompt('Number of rows:', '3');
        const cols = prompt('Number of columns:', '3');
        if (rows && cols) {
            let table = '<table class="table table-bordered" style="width:100%; border-collapse: collapse;" role="table">';
            for (let i = 0; i < rows; i++) {
                table += '<tr>';
                for (let j = 0; j < cols; j++) {
                    table += '<td style="border:1px solid #ddd; padding:8px;" role="cell">&nbsp;<\/td>';
                }
                table += '<\/tr>';
            }
            table += '<\/table><br>';
            document.execCommand('insertHTML', false, table);
            announceToScreenReader(`Table inserted with ${rows} rows and ${cols} columns`);
        }
        editor.focus();
    }
    
    function insertHorizontalRule() {
        document.execCommand('insertHorizontalRule', false, null);
        announceToScreenReader(`Horizontal line inserted`);
        editor.focus();
    }
    
    function clearEditor() {
        if (confirm('Are you sure you want to clear all content? This cannot be undone.')) {
            editor.innerHTML = '';
            updateStats();
            setStatus('Editor cleared');
            announceToScreenReader('Editor content cleared');
            showToast('Editor cleared', 'info');
            editor.focus();
        }
    }
    
    function copyAllText() {
        const text = editor.innerText;
        navigator.clipboard.writeText(text).then(() => {
            showToast('All text copied to clipboard!', 'success');
            setStatus('Copied to clipboard');
            announceToScreenReader('All text copied to clipboard');
        }).catch(() => {
            showToast('Failed to copy', 'error');
            announceToScreenReader('Failed to copy text');
        });
    }
    
    function selectAllText() {
        document.execCommand('selectAll', false, null);
        setStatus('All text selected');
        announceToScreenReader('All text selected');
    }
    
    // ==================== DOWNLOAD FUNCTIONS ====================
    
    function getDocumentHTML() {
        const content = editor.innerHTML;
        const title = document.getElementById('noteName').value || 'OmeBox Note';
        const date = new Date().toLocaleString();
        
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>${escapeHtml(title)}</title>
                <style>
                    body {
                        font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 40px 20px;
                        line-height: 1.6;
                        color: #1a202c;
                    }
                    img { max-width: 100%; height: auto; }
                    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
                    td, th { border: 1px solid #ddd; padding: 8px; }
                    h1, h2, h3 { color: #2d3748; }
                    pre { background: #f7fafc; padding: 16px; border-radius: 8px; overflow-x: auto; }
                    blockquote { border-left: 4px solid #667eea; margin: 16px 0; padding-left: 16px; color: #4a5568; }
                </style>
            </head>
            <body>
                ${content || '<p><em>Empty document</em></p>'}
                <hr>
                <p><small>Generated by OmeBox on ${date}</small></p>
            </body>
            </html>
        `;
    }
    
    function downloadAsPDF() {
        showToast('Generating PDF...', 'info');
        announceToScreenReader('Generating PDF file');
        const element = document.createElement('div');
        element.innerHTML = getDocumentHTML();
        element.style.padding = '20px';
        
        const opt = {
            margin: [0.5, 0.5, 0.5, 0.5],
            filename: `omebox_note_${new Date().toISOString().slice(0,19)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, letterRendering: true },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
        };
        
        html2pdf().set(opt).from(element).save()
            .then(() => {
                setStatus('PDF downloaded');
                showToast('PDF downloaded successfully!', 'success');
                announceToScreenReader('PDF downloaded successfully');
            })
            .catch(err => {
                console.error('PDF Error:', err);
                showToast('PDF generation failed. Trying alternative method...', 'warning');
                announceToScreenReader('PDF generation failed, opening print dialog');
                // Fallback: Print to PDF
                const printWindow = window.open('', '_blank');
                printWindow.document.write(getDocumentHTML());
                printWindow.document.close();
                printWindow.print();
            });
    }
    
    function downloadAsWord() {
        const content = getDocumentHTML();
        const blob = new Blob([content], { type: 'application/msword' });
        const fileName = `omebox_note_${new Date().toISOString().slice(0,19)}.doc`;
        saveAs(blob, fileName);
        setStatus('Word document downloaded');
        showToast('Word document downloaded!', 'success');
        announceToScreenReader('Word document downloaded');
    }
    
    function downloadAsHTML() {
        const content = getDocumentHTML();
        const blob = new Blob([content], { type: 'text/html' });
        const fileName = `omebox_note_${new Date().toISOString().slice(0,19)}.html`;
        saveAs(blob, fileName);
        setStatus('HTML file downloaded');
        showToast('HTML file downloaded!', 'success');
        announceToScreenReader('HTML file downloaded');
    }
    
    function downloadAsTXT() {
        const text = editor.innerText || '';
        const blob = new Blob([text], { type: 'text/plain' });
        const fileName = `omebox_note_${new Date().toISOString().slice(0,19)}.txt`;
        saveAs(blob, fileName);
        setStatus('Text file downloaded');
        showToast('Text file downloaded!', 'success');
        announceToScreenReader('Text file downloaded');
    }
    
    function downloadAsMarkdown() {
        let content = editor.innerHTML;
        let markdown = content
            .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
            .replace(/<b>(.*?)<\/b>/g, '**$1**')
            .replace(/<em>(.*?)<\/em>/g, '*$1*')
            .replace(/<i>(.*?)<\/i>/g, '*$1*')
            .replace(/<h1>(.*?)<\/h1>/g, '# $1\n\n')
            .replace(/<h2>(.*?)<\/h2>/g, '## $1\n\n')
            .replace(/<h3>(.*?)<\/h3>/g, '### $1\n\n')
            .replace(/<ul>(.*?)<\/ul>/gs, (match, content) => {
                return content.replace(/<li>(.*?)<\/li>/g, '- $1\n');
            })
            .replace(/<ol>(.*?)<\/ol>/gs, (match, content) => {
                let i = 1;
                return content.replace(/<li>(.*?)<\/li>/g, () => `${i++}. $1\n`);
            })
            .replace(/<br>/g, '\n')
            .replace(/<p>(.*?)<\/p>/g, '$1\n\n')
            .replace(/<[^>]*>/g, '');
        
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const fileName = `omebox_note_${new Date().toISOString().slice(0,19)}.md`;
        saveAs(blob, fileName);
        setStatus('Markdown file downloaded');
        showToast('Markdown file downloaded!', 'success');
        announceToScreenReader('Markdown file downloaded');
    }
    
    function downloadAsJSON() {
        const data = {
            title: document.getElementById('noteName').value || 'Untitled',
            content: editor.innerHTML,
            plainText: editor.innerText,
            stats: {
                characters: document.getElementById('charCount').innerText,
                words: document.getElementById('wordCount').innerText,
                lines: document.getElementById('lineCount').innerText,
                paragraphs: document.getElementById('paragraphCount').innerText
            },
            exportedAt: new Date().toISOString(),
            version: '2.0'
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const fileName = `omebox_note_${new Date().toISOString().slice(0,19)}.json`;
        saveAs(blob, fileName);
        setStatus('JSON file downloaded');
        showToast('JSON file downloaded!', 'success');
        announceToScreenReader('JSON file downloaded');
    }
    
    // ==================== SAVE & LOAD FUNCTIONS ====================
    
    function saveToLocal() {
        const content = editor.innerHTML;
        const saveData = {
            content: content,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem('omebox_last_note', JSON.stringify(saveData));
        document.getElementById('lastSaved').innerHTML = `Saved at ${new Date().toLocaleTimeString()}`;
        setStatus('Draft saved to browser');
        showToast('Draft saved!', 'success');
        announceToScreenReader('Draft saved');
    }
    
    function loadLastNote() {
        const saved = localStorage.getItem('omebox_last_note');
        if (saved) {
            const data = JSON.parse(saved);
            editor.innerHTML = data.content;
            setStatus('Last draft loaded');
            updateStats();
            showToast('Draft loaded', 'success');
            announceToScreenReader('Last draft loaded');
        }
    }
    
    function saveAsNewNote() {
        const noteName = document.getElementById('noteName').value.trim();
        if (!noteName) {
            showToast('Please enter a note name', 'warning');
            announceToScreenReader('Please enter a note name');
            document.getElementById('noteName').focus();
            return;
        }
        
        const notes = getSavedNotes();
        notes[noteName] = {
            content: editor.innerHTML,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem('omebox_notes', JSON.stringify(notes));
        displaySavedNotes();
        document.getElementById('noteName').value = '';
        setStatus(`Note "${noteName}" saved`);
        showToast(`Note "${noteName}" saved!`, 'success');
        announceToScreenReader(`Note ${noteName} saved`);
    }
    
    function getSavedNotes() {
        const notes = localStorage.getItem('omebox_notes');
        return notes ? JSON.parse(notes) : {};
    }
    
    function displaySavedNotes() {
        const notes = getSavedNotes();
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '';
        
        const sortedNotes = Object.keys(notes).sort().reverse();
        
        if (sortedNotes.length === 0) {
            fileList.innerHTML = '<p class="text-muted text-center small">No saved notes yet</p>';
            return;
        }
        
        sortedNotes.forEach(name => {
            const note = notes[name];
            const div = document.createElement('div');
            div.className = 'file-item';
            div.setAttribute('role', 'listitem');
            div.innerHTML = `
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1" onclick="loadNote('${escapeHtml(name)}')" onkeypress="if(event.key==='Enter') loadNote('${escapeHtml(name)}')" role="button" tabindex="0" aria-label="Load note: ${escapeHtml(name)}" style="cursor: pointer;">
                        <i class="fas fa-file-alt text-primary me-2" aria-hidden="true"></i>
                        <strong>${escapeHtml(name)}</strong><br>
                        <small class="text-muted">${new Date(note.timestamp).toLocaleString()}</small>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteNote('${escapeHtml(name)}')" aria-label="Delete note: ${escapeHtml(name)}">
                            <i class="fas fa-trash" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
            `;
            fileList.appendChild(div);
        });
    }
    
    function loadNote(name) {
        const notes = getSavedNotes();
        if (notes[name]) {
            editor.innerHTML = notes[name].content;
            setStatus(`Loaded: ${name}`);
            updateStats();
            showToast(`Note "${name}" loaded`, 'success');
            announceToScreenReader(`Note ${name} loaded`);
            editor.focus();
        }
    }
    
    function deleteNote(name) {
        if (confirm(`Delete note "${name}"?`)) {
            const notes = getSavedNotes();
            delete notes[name];
            localStorage.setItem('omebox_notes', JSON.stringify(notes));
            displaySavedNotes();
            setStatus(`Note "${name}" deleted`);
            showToast(`Note "${name}" deleted`, 'info');
            announceToScreenReader(`Note ${name} deleted`);
        }
    }
    
    function printDocument() {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(getDocumentHTML());
        printWindow.document.close();
        printWindow.print();
        setStatus('Print dialog opened');
        announceToScreenReader('Print dialog opened');
    }
    
    // ==================== UTILITY FUNCTIONS ====================
    
    function updateStats() {
        const text = editor.innerText || '';
        const chars = text.length;
        const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
        const lines = editor.innerHTML.split('<br>').length;
        const paragraphs = editor.innerHTML.split('</p>').length - 1;
        
        document.getElementById('charCount').innerText = chars.toLocaleString();
        document.getElementById('wordCount').innerText = words.toLocaleString();
        document.getElementById('lineCount').innerText = lines;
        document.getElementById('paragraphCount').innerText = paragraphs || 0;
        
        // Announce stats periodically (only on significant changes)
        if (window.lastStatsAnnounce && (Date.now() - window.lastStatsAnnounce) > 5000) {
            announceToScreenReader(`${words} words, ${chars} characters`);
            window.lastStatsAnnounce = Date.now();
        }
    }
    
    function setStatus(msg) {
        const statusSpan = document.getElementById('statusMsg');
        statusSpan.innerHTML = `<i class="fas fa-info-circle" aria-hidden="true"></i> ${msg}`;
        setTimeout(() => {
            if (statusSpan.innerHTML.includes(msg)) {
                statusSpan.innerHTML = '<i class="fas fa-check-circle text-success" aria-hidden="true"></i> Ready';
            }
        }, 2000);
    }
    
    function showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        toast.innerHTML = `
            <div style="background: ${colors[type]}; color: white; padding: 12px 20px; border-radius: 12px; 
                        box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); margin-bottom: 10px; animation: slideIn 0.3s ease-out;">
                <i class="fas ${icons[type]} me-2" aria-hidden="true"></i> ${message}
            </div>
        `;
        setTimeout(() => {
            toast.innerHTML = '';
        }, 3000);
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Keyboard shortcuts
    function handleKeyboard(e) {
        if (e.ctrlKey) {
            switch(e.key) {
                case 'b':
                    e.preventDefault();
                    formatText('bold');
                    break;
                case 'i':
                    e.preventDefault();
                    formatText('italic');
                    break;
                case 'u':
                    e.preventDefault();
                    formatText('underline');
                    break;
                case 's':
                    e.preventDefault();
                    saveToLocal();
                    break;
                case 'p':
                    e.preventDefault();
                    printDocument();
                    break;
                case 'a':
                    e.preventDefault();
                    selectAllText();
                    break;
            }
        }
    }
    
    // Auto-save every 30 seconds
    let autoSaveInterval;
    function startAutoSave() {
        autoSaveInterval = setInterval(() => {
            const content = editor.innerHTML;
            if (content.trim()) {
                saveToLocal();
            }
        }, 30000);
    }
    
    // ==================== INITIALIZATION ====================
    
    document.addEventListener('DOMContentLoaded', () => {
        editor.addEventListener('input', updateStats);
        editor.addEventListener('keyup', updateStats);
        
        document.addEventListener('keydown', handleKeyboard);
        
        loadLastNote();
        displaySavedNotes();
        updateStats();
        
        startAutoSave();
        
        setStatus('Ready');
        showToast('Welcome to OmeBox Pro Editor!', 'success');
        announceToScreenReader('Welcome to OmeBox Pro Editor. Press Ctrl plus B for bold, Ctrl plus I for italic, Ctrl plus S to save');
        
        // Set focus to editor for keyboard users
        editor.focus();
    });
    
    window.addEventListener('beforeunload', () => {
        const content = editor.innerHTML;
        if (content.trim()) {
            saveToLocal();
        }
    });

