// NoteCode - Advanced Notepad Application

// Global Variables
let notes = {};
let currentNoteId = null;
let darkMode = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    loadNotesFromStorage();
    initializeEventListeners();
    applyDarkMode(localStorage.getItem('darkMode') === 'true');
    
    if (Object.keys(notes).length === 0) {
        createNewNote();
    } else {
        const firstNoteId = Object.keys(notes)[0];
        switchToNote(firstNoteId);
    }
});

// Event Listeners
function initializeEventListeners() {
    document.getElementById('newNoteBtn').addEventListener('click', createNewNote);
    document.getElementById('deleteNoteBtn').addEventListener('click', deleteCurrentNote);
    document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);
    document.getElementById('exportBtn').addEventListener('click', exportNote);
    document.getElementById('runBtn').addEventListener('click', runCode);
    document.getElementById('closeOutputBtn').addEventListener('click', closeOutput);
    document.getElementById('noteEditor').addEventListener('input', saveCurrentNote);
    document.getElementById('textColor').addEventListener('change', updateTextColor);
    document.getElementById('bgColor').addEventListener('change', updateBgColor);
}

// Create a new note
function createNewNote() {
    const noteId = 'note_' + Date.now();
    notes[noteId] = {
        id: noteId,
        title: `Note ${Object.keys(notes).length + 1}`,
        content: '',
        textColor: '#000000',
        bgColor: '#ffffff',
        createdAt: new Date().toLocaleString()
    };
    
    saveNotesToStorage();
    switchToNote(noteId);
    renderTabs();
}

// Delete current note
function deleteCurrentNote() {
    if (Object.keys(notes).length <= 1) {
        alert('You must have at least one note!');
        return;
    }
    
    if (confirm(`Delete \