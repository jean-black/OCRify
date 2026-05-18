// Global variables
let userPosition = null;
let selectedFiles = [];
let downloadUrl = null;
let downloadUrls = []; // For bulk downloads
let processingStartTime = null;
let timerInterval = null;
let currentFileId = null;
let currentOutputFileName = null;
let isLoggedIn = false;

// Create audio element for completion sound
const completionAudio = new Audio('../audio/goku.mp3');
let audioPlayCount = 0;

// Initialize user session
async function initUserSession() {
    try {
        const response = await fetch('/api/get-user-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (data.userPosition) {
            userPosition = data.userPosition;
            localStorage.setItem('userPosition', userPosition);
            loadUserHistory();
        }
    } catch (error) {
        console.error('Error creating user session:', error);
    }
}

// DOM elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const filePreview = document.getElementById('filePreview');
const fileName = document.getElementById('fileName');
const previewImage = document.getElementById('previewImage');
const removeFileBtn = document.getElementById('removeFileBtn');
const startBtn = document.getElementById('startBtn');
const outputFormat = document.getElementById('outputFormat');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultsSection = document.getElementById('resultsSection');
const extractedText = document.getElementById('extractedText');
const detectedLanguage = document.getElementById('detectedLanguage');
const processingTime = document.getElementById('processingTime');
const charCount = document.getElementById('charCount');
const downloadBtn = document.getElementById('downloadBtn');
const historySection = document.getElementById('historySection');
const historyList = document.getElementById('historyList');
const btnText = document.getElementById('btnText');
const spinner = document.getElementById('spinner');

// Event listeners
uploadBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener('change', handleFileSelect);
removeFileBtn.addEventListener('click', removeFile);
startBtn.addEventListener('click', startOCRProcess);
downloadBtn.addEventListener('click', downloadFile);

// Drag and drop functionality
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
        handleFiles(files);
    }
});

dropZone.addEventListener('click', () => {
    if (!selectedFiles.length) {
        fileInput.click();
    }
});

// Handle file selection
function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        handleFiles(files);
    }
}

// Handle files (single or multiple)
function handleFiles(files) {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff', 'application/pdf'];

    // Validate all files
    const validFiles = [];
    for (const file of files) {
        if (!validTypes.includes(file.type)) {
            alert(`File "${file.name}" is not a valid image file`);
            continue;
        }
        if (file.size > 10 * 1024 * 1024) {
            alert(`File "${file.name}" is too large (max 10MB)`);
            continue;
        }
        validFiles.push(file);
    }

    if (validFiles.length === 0) {
        return;
    }

    selectedFiles = validFiles;
    fileName.textContent = validFiles.length === 1 ? validFiles[0].name : `${validFiles.length} files selected`;
    filePreview.style.display = 'block';
    dropZone.style.display = 'none';
    startBtn.disabled = false;

    const combineOption = document.getElementById('combineOption');
    if (combineOption) combineOption.style.display = validFiles.length > 1 ? 'block' : 'none';

    // Show preview for first image
    if (validFiles[0].type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewImage.style.display = 'block';
        };
        reader.readAsDataURL(validFiles[0]);
    } else {
        previewImage.style.display = 'none';
    }
}

// Handle single file (for drag and drop)
function handleFile(file) {
    handleFiles([file]);
}

// Remove file
function removeFile() {
    selectedFiles = [];
    fileInput.value = '';
    fileName.textContent = 'No file selected';
    previewImage.src = '';
    previewImage.style.display = 'none';
    filePreview.style.display = 'none';
    dropZone.style.display = 'block';
    startBtn.disabled = true;
    resultsSection.style.display = 'none';
    progressSection.style.display = 'none';
    currentFileId = null;
    currentOutputFileName = null;
    updateSendBtn();
    const combineOption = document.getElementById('combineOption');
    if (combineOption) combineOption.style.display = 'none';
}

// Start OCR process
async function startOCRProcess() {
    if (!selectedFiles.length || !userPosition) {
        alert('Please select at least one file first');
        return;
    }

    processingStartTime = Date.now();

    // Disable button and show spinner
    startBtn.disabled = true;
    btnText.textContent = 'Processing...';
    spinner.style.display = 'inline-block';

    // Show progress section
    progressSection.style.display = 'block';
    progressFill.style.width = '30%';
    const fileCountText = selectedFiles.length === 1 ? 'file' : `${selectedFiles.length} files`;
    progressText.textContent = `Uploading ${fileCountText}... (0.0s)`;

    // Start real-time timer
    startTimer();

    // Create form data
    const formData = new FormData();
    formData.append('userPosition', userPosition);
    formData.append('outputFormat', outputFormat.value);

    // Add files to form data
    const combineChecked = selectedFiles.length > 1 &&
        (document.getElementById('combineFiles') || {}).checked !== false;

    if (selectedFiles.length === 1) {
        formData.append('file', selectedFiles[0]);
    } else {
        selectedFiles.forEach(file => formData.append('files', file));
    }

    try {
        // Update progress
        progressFill.style.width = '60%';
        updateProgressText('Extracting text from images...');

        let endpoint;
        if (selectedFiles.length === 1) {
            endpoint = '/api/upload';
        } else if (combineChecked) {
            endpoint = '/api/upload-combined';
        } else {
            endpoint = '/api/upload-bulk';
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        // Stop timer
        stopTimer();

        if (data.success) {
            // Update progress
            progressFill.style.width = '100%';
            const processingTimeMs = Date.now() - processingStartTime;
            const processingTimeSec = (processingTimeMs / 1000).toFixed(2);
            progressText.textContent = `Complete! (${processingTimeSec}s)`;

            // Show results
            setTimeout(() => {
                if (selectedFiles.length === 1 || combineChecked) {
                    displayResults(data, processingTimeSec);
                } else {
                    displayBulkResults(data, processingTimeSec);
                }
                progressSection.style.display = 'none';
                progressFill.style.width = '0%';
            }, 500);

            // Reload history
            loadUserHistory();
        } else {
            throw new Error(data.error || 'Processing failed');
        }
    } catch (error) {
        console.error('OCR Error:', error);
        stopTimer();
        alert('OCR processing failed: ' + error.message);
        progressSection.style.display = 'none';
        progressFill.style.width = '0%';
    } finally {
        // Reset button
        startBtn.disabled = false;
        btnText.textContent = 'Start OCR Processing';
        spinner.style.display = 'none';
    }
}

// Start real-time timer
function startTimer() {
    timerInterval = setInterval(() => {
        const elapsed = (Date.now() - processingStartTime) / 1000;
        const currentText = progressText.textContent.split('(')[0].trim();
        progressText.textContent = `${currentText} (${elapsed.toFixed(1)}s)`;
    }, 100);
}

// Stop timer
function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

// Play completion sound 2 times
function playCompletionSound() {
    audioPlayCount = 0;

    // Reset audio to beginning
    completionAudio.currentTime = 0;

    // Play first time
    completionAudio.play().catch(err => console.log('Audio playback failed:', err));

    // When audio ends, check if we need to play again
    completionAudio.onended = function() {
        audioPlayCount++;
        if (audioPlayCount < 2) {
            completionAudio.currentTime = 0;
            completionAudio.play().catch(err => console.log('Audio playback failed:', err));
        }
    };
}

// Update progress text while maintaining timer
function updateProgressText(text) {
    const baseText = text;
    // The timer will update it with elapsed time
}

// Display results
function displayResults(data, processingTimeSec) {
    extractedText.value = data.extractedText || 'No text detected';
    detectedLanguage.textContent = data.detectedLanguage || 'Unknown';
    processingTime.textContent = processingTimeSec + ' seconds';
    charCount.textContent = (data.extractedText || '').length;
    downloadUrl = data.downloadUrl;
    downloadUrls = []; // Clear bulk downloads
    currentFileId = data.fileId || null;
    currentOutputFileName = data.outputFileName || null;

    // Reset download button
    downloadBtn.style.display = 'block';
    downloadBtn.textContent = 'Download File';
    const dd1 = document.getElementById('downloadDropdown');
    if (dd1) dd1.style.display = 'none';
    updateDownloadChevron();
    updateSendBtn();

    // Play completion sound
    playCompletionSound();

    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Display bulk results
function displayBulkResults(data, processingTimeSec) {
    currentFileId = null;
    currentOutputFileName = null;
    updateSendBtn();
    const successCount = data.results.filter(r => r.success).length;
    const failCount = data.results.length - successCount;

    // Store download URLs for bulk download
    downloadUrls = data.results
        .filter(r => r.success)
        .map(r => `/api/download/${userPosition}/${r.outputFileName}`);

    let summaryText = `Processed ${data.totalFiles} files:\n`;
    summaryText += `✓ ${successCount} successful\n`;
    if (failCount > 0) {
        summaryText += `✗ ${failCount} failed\n`;
    }
    summaryText += `\nResults:\n`;

    data.results.forEach((result, index) => {
        if (result.success) {
            summaryText += `\n${index + 1}. ${result.originalName}\n`;
            summaryText += `   Output: ${result.outputFileName}\n`;
            summaryText += `   Status: Success ✓\n`;
        } else {
            summaryText += `\n${index + 1}. ${result.originalName}\n`;
            summaryText += `   Status: Failed ✗\n`;
            summaryText += `   Error: ${result.error}\n`;
        }
    });

    summaryText += `\n\nClick "Download Files" button below to download each file.`;

    extractedText.value = summaryText;
    detectedLanguage.textContent = 'Multiple';
    processingTime.textContent = processingTimeSec + ' seconds';
    charCount.textContent = successCount + ' files processed';
    downloadUrl = null;

    // Show download button for bulk files
    downloadBtn.style.display = 'block';
    downloadBtn.textContent = successCount > 1 ? 'Download Files' : 'Download File';

    // Play completion sound
    playCompletionSound();

    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Download file(s) — shows dropdown if translation is available, else downloads directly
function downloadFile() {
    const transBlock  = document.getElementById('translationBlock');
    const transText   = document.getElementById('translatedText');
    const hasTranslation = transBlock &&
        transBlock.style.display !== 'none' &&
        transText && transText.value.trim();

    if (hasTranslation) {
        const dd      = document.getElementById('downloadDropdown');
        const chevron = document.getElementById('downloadChevron');
        const open    = dd.style.display !== 'none';
        dd.style.display      = open ? 'none' : 'block';
        if (chevron) chevron.style.transform = open ? '' : 'rotate(180deg)';
    } else {
        performExtractedDownload();
    }
}

function performExtractedDownload() {
    const dd = document.getElementById('downloadDropdown');
    if (dd) dd.style.display = 'none';
    const chevron = document.getElementById('downloadChevron');
    if (chevron) chevron.style.transform = '';

    if (downloadUrl) {
        window.location.href = downloadUrl;
    } else if (downloadUrls && downloadUrls.length > 0) {
        downloadUrls.forEach((url, index) => {
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = url;
                link.download = '';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, index * 500);
        });
    } else {
        alert('No files available for download');
    }
}

function performTranslatedDownload() {
    const dd = document.getElementById('downloadDropdown');
    if (dd) dd.style.display = 'none';
    const chevron = document.getElementById('downloadChevron');
    if (chevron) chevron.style.transform = '';

    const transText  = document.getElementById('translatedText');
    const langLabel  = document.getElementById('translationLangLabel');
    const text       = transText ? transText.value.trim() : '';
    if (!text) { alert('No translated text to download.'); return; }

    const lang     = (langLabel ? langLabel.textContent : 'translated').toLowerCase().replace(/\s+/g, '_');
    const filename = `translated_${lang}.txt`;
    const blob     = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    a.href         = url;
    a.download     = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Show chevron on download button whenever translation becomes available
function updateDownloadChevron() {
    const transBlock  = document.getElementById('translationBlock');
    const transText   = document.getElementById('translatedText');
    const chevron     = document.getElementById('downloadChevron');
    if (!chevron) return;
    const hasTranslation = transBlock &&
        transBlock.style.display !== 'none' &&
        transText && transText.value.trim();
    chevron.style.display = hasTranslation ? 'inline' : 'none';
}

// Load user history
async function loadUserHistory() {
    if (!userPosition) return;

    try {
        const response = await fetch(`/api/files/${userPosition}`);
        const data = await response.json();

        if (data.files && data.files.length > 0) {
            historySection.style.display = 'block';
            historyList.innerHTML = '';

            data.files.slice(0, 5).forEach(file => {
                const historyItem = document.createElement('div');
                historyItem.className = 'history-item';
                historyItem.style.cursor = 'pointer';
                historyItem.dataset.fileId = file.id;
                historyItem.innerHTML = `
                    <div>
                        <strong>${file.file_name}</strong><br>
                        <small>Status: ${file.extraction_state} | ${file.detected_language || 'Unknown language'}</small>
                    </div>
                    <div>
                        <small>${formatTimestamp(file.extraction_end_timestamp)}</small>
                    </div>
                `;
                historyItem.addEventListener('click', () => loadFileResult(file.id));
                historyList.appendChild(historyItem);
            });
        }
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

// Load and display a past OCR result
async function loadFileResult(fileId) {
    if (!userPosition) return;
    try {
        const res  = await fetch(`/api/files/${userPosition}/${fileId}/result`);
        const data = await res.json();
        if (!data.file) return;

        const file = data.file;
        const procSec = file.file_processing_time ? file.file_processing_time.toFixed(2) : '—';
        currentFileId = file.id;
        currentOutputFileName = file.output_file_name || null;
        updateSendBtn();

        detectedLanguage.textContent = file.detected_language || 'Unknown';
        processingTime.textContent   = procSec + ' seconds';

        if (data.extractedText) {
            extractedText.value       = data.extractedText;
            charCount.textContent     = data.extractedText.length;
            downloadUrl               = data.downloadUrl;
            downloadUrls              = [];
            downloadBtn.style.display = 'block';
            downloadBtn.textContent   = 'Download File';
        } else if (data.isPdf) {
            extractedText.value       = '(Result saved as PDF — click Download File to open it.)';
            charCount.textContent     = '—';
            downloadUrl               = data.downloadUrl;
            downloadUrls              = [];
            downloadBtn.style.display = 'block';
            downloadBtn.textContent   = 'Download File';
        } else {
            extractedText.value       = '(Output file no longer available on disk.)';
            charCount.textContent     = '—';
            downloadBtn.style.display = 'none';
        }

        resultsSection.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
        console.error('Error loading file result:', err);
    }
}

// Format timestamp
function formatTimestamp(timestamp) {
    if (!timestamp) return 'Processing...';
    const date = new Date(timestamp);
    return date.toLocaleString();
}

// ── Translation ───────────────────────────────────────────────────────────────
const LANG_LABELS = {
    en:'English', fr:'French', es:'Spanish', de:'German', it:'Italian',
    pt:'Portuguese', nl:'Dutch', ru:'Russian', ar:'Arabic', zh:'Chinese',
    ja:'Japanese', ko:'Korean', tr:'Turkish', hi:'Hindi', pl:'Polish',
    sv:'Swedish', uk:'Ukrainian'
};

document.addEventListener('DOMContentLoaded', () => {
    const translateBtn     = document.getElementById('translateBtn');
    const translateLang    = document.getElementById('translateLang');
    const translationBlock = document.getElementById('translationBlock');
    const translatedText   = document.getElementById('translatedText');
    const translateBtnText = document.getElementById('translateBtnText');
    const translateSpinner = document.getElementById('translateSpinner');
    const translateError   = document.getElementById('translateError');
    const langLabel        = document.getElementById('translationLangLabel');

    translateBtn.addEventListener('click', async () => {
        const targetCode = translateLang.value;
        const sourceText = document.getElementById('extractedText').value.trim();

        if (!targetCode) {
            translateLang.focus();
            return;
        }
        if (!sourceText) return;

        // Show spinner
        translateBtn.disabled = true;
        translateBtnText.textContent = 'Translating…';
        translateSpinner.style.display = 'inline-block';
        translateError.style.display = 'none';
        translationBlock.style.display = 'none';

        try {
            const res  = await fetch('/api/translate', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ text: sourceText, target: targetCode })
            });
            const data = await res.json();

            if (data.translatedText) {
                langLabel.textContent          = LANG_LABELS[targetCode] || targetCode;
                translatedText.value           = data.translatedText;
                translationBlock.style.display = 'block';
                updateDownloadChevron();
            } else {
                translateError.textContent  = data.error || 'Translation failed. Try again.';
                translateError.style.display = 'block';
                translationBlock.style.display = 'block';
            }
        } catch {
            translateError.textContent  = 'Could not reach the translation service.';
            translateError.style.display = 'block';
            translationBlock.style.display = 'block';
        } finally {
            translateBtn.disabled        = false;
            translateBtnText.textContent = 'Translate';
            translateSpinner.style.display = 'none';
        }
    });
});

// ── History quick-peek panel ──────────────────────────────────────────────────
const HISTORY_PANEL_TIMEOUT = 15000;
let historyPanelTimer = null;

function openHistoryPanel() {
    const panel = document.getElementById('historyQuickPanel');
    const btn   = document.getElementById('historyArrowBtn');
    panel.style.display = 'block';
    btn.classList.add('open');
    populateHistoryPanel();
    startHistoryPanelTimer();
}

function closeHistoryPanel() {
    const panel = document.getElementById('historyQuickPanel');
    const btn   = document.getElementById('historyArrowBtn');
    panel.style.display = 'none';
    btn.classList.remove('open');
    clearTimeout(historyPanelTimer);
    historyPanelTimer = null;
}

function startHistoryPanelTimer() {
    clearTimeout(historyPanelTimer);
    historyPanelTimer = setTimeout(closeHistoryPanel, HISTORY_PANEL_TIMEOUT);

    // Animate the timer bar depleting over 15s
    const fill = document.getElementById('hqpTimerFill');
    fill.style.transition = 'none';
    fill.style.width = '100%';
    requestAnimationFrame(() => requestAnimationFrame(() => {
        fill.style.transition = `width ${HISTORY_PANEL_TIMEOUT}ms linear`;
        fill.style.width = '0%';
    }));
}

async function populateHistoryPanel() {
    const list = document.getElementById('hqpList');
    if (!userPosition) {
        list.innerHTML = '<p class="hqp-empty">No session — upload a file first.</p>';
        return;
    }
    try {
        const res  = await fetch(`/api/files/${userPosition}`);
        const data = await res.json();
        if (data.files && data.files.length > 0) {
            list.innerHTML = data.files.slice(0, 8).map(f => {
                const stateClass = f.extraction_state === 'success' ? 'done' : 'pending';
                return `
                <div class="hqp-item" data-file-id="${f.id}" style="cursor:pointer">
                    <div class="hqp-item-name">${f.file_name}</div>
                    <div class="hqp-item-meta">
                        <span class="hqp-status ${stateClass}">${f.extraction_state}</span>
                        <span>${formatTimestamp(f.extraction_end_timestamp)}</span>
                    </div>
                </div>`;
            }).join('');

            list.querySelectorAll('.hqp-item[data-file-id]').forEach(item => {
                item.addEventListener('click', () => {
                    closeHistoryPanel();
                    loadFileResult(item.dataset.fileId);
                });
            });
        } else {
            list.innerHTML = '<p class="hqp-empty">No history yet.</p>';
        }
    } catch {
        list.innerHTML = '<p class="hqp-empty">Could not load history.</p>';
    }
}

function initHistoryArrow() {
    const btn   = document.getElementById('historyArrowBtn');
    const panel = document.getElementById('historyQuickPanel');

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.style.display === 'none' ? openHistoryPanel() : closeHistoryPanel();
    });

    // Activity inside panel resets the 15s timer
    panel.addEventListener('mousemove', startHistoryPanelTimer);
    panel.addEventListener('click', (e) => {
        e.stopPropagation();
        startHistoryPanelTimer();
    });

    // Close button
    document.getElementById('hqpClose').addEventListener('click', (e) => {
        e.stopPropagation();
        closeHistoryPanel();
    });

    // Click anywhere outside closes it
    document.addEventListener('click', () => closeHistoryPanel());
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initUserSession();
    initHeaderAuth();
    initHistoryArrow();

    const dlExtracted  = document.getElementById('dlExtracted');
    const dlTranslated = document.getElementById('dlTranslated');
    if (dlExtracted)  dlExtracted.addEventListener('click',  performExtractedDownload);
    if (dlTranslated) dlTranslated.addEventListener('click', performTranslatedDownload);

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const wrap = document.getElementById('downloadWrap');
        const dd   = document.getElementById('downloadDropdown');
        if (dd && wrap && !wrap.contains(e.target) && dd.style.display !== 'none') {
            dd.style.display = 'none';
            const chevron = document.getElementById('downloadChevron');
            if (chevron) chevron.style.transform = '';
        }
    });
});

// Check auth status and render header
async function initHeaderAuth() {
    const headerAuth = document.getElementById('headerAuth');
    if (!headerAuth) return;

    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();

        if (data.loggedIn) {
            isLoggedIn = true;
            updateSendBtn();
            headerAuth.innerHTML = `
                <div class="header-user" id="userMenu">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span class="header-username">${data.username}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                    <div class="header-dropdown" id="userDropdown">
                        <button class="logout-btn" id="logoutBtn">Logout</button>
                    </div>
                </div>`;

            document.getElementById('userMenu').addEventListener('click', (e) => {
                document.getElementById('userDropdown').classList.toggle('open');
                e.stopPropagation();
            });

            document.addEventListener('click', () => {
                const dd = document.getElementById('userDropdown');
                if (dd) dd.classList.remove('open');
            });

            document.getElementById('logoutBtn').addEventListener('click', async (e) => {
                e.stopPropagation();
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.reload();
            });

            // Show floating chat button and load unread count
            const chatFab = document.getElementById('chatFab');
            if (chatFab) {
                chatFab.style.display = 'flex';
                try {
                    const unreadRes = await fetch('/api/messages/unread');
                    if (unreadRes.ok) {
                        const unreadData = await unreadRes.json();
                        const badge = document.getElementById('chatFabBadge');
                        if (badge && unreadData.count > 0) {
                            badge.textContent = unreadData.count > 99 ? '99+' : unreadData.count;
                            badge.style.display = 'block';
                        }
                    }
                } catch {}
            }

        } else {
            headerAuth.innerHTML = `<a href="/login" class="header-login-btn">Login</a>`;
        }
    } catch {
        headerAuth.innerHTML = `<a href="/login" class="header-login-btn">Login</a>`;
    }
}

// ── Send to Friend ────────────────────────────────────────────────────────────

let stfFriends    = [];
let stfRecipients = []; // chips array

function updateSendBtn() {
    const btn = document.getElementById('sendToFriendBtn');
    if (!btn) return;
    btn.style.display = (isLoggedIn && currentFileId) ? 'block' : 'none';
}

// ── chip management ──

function stfAddRecipient(email) {
    email = email.trim().toLowerCase();
    if (!email || stfRecipients.includes(email)) return;
    stfRecipients.push(email);
    stfRenderChips();
}

function stfRemoveRecipient(email) {
    stfRecipients = stfRecipients.filter(e => e !== email);
    stfRenderChips();
}

function stfRenderChips() {
    const container = document.getElementById('stfChips');
    if (!container) return;
    container.innerHTML = stfRecipients.map(email =>
        `<span class="stf-chip">${email}<button type="button" class="stf-chip-x" data-email="${email}" tabindex="-1">&times;</button></span>`
    ).join('');
    container.querySelectorAll('.stf-chip-x').forEach(btn => {
        btn.addEventListener('mousedown', e => {
            e.preventDefault();
            stfRemoveRecipient(btn.dataset.email);
        });
    });
}

// ── modal open / close ──

function openSendModal() {
    stfRecipients = [];
    stfRenderChips();

    const attachRow = document.getElementById('stfAttachRow');
    const fileLabel = document.getElementById('stfFileName');
    if (currentOutputFileName) {
        fileLabel.textContent   = currentOutputFileName;
        attachRow.style.display = 'flex';
    } else {
        attachRow.style.display = 'none';
    }

    document.getElementById('stfTo').value      = '';
    document.getElementById('stfMessage').value = '';
    const errReset = document.getElementById('stfError');
    errReset.style.display     = 'none';
    errReset.style.color       = '';
    errReset.style.background  = '';
    errReset.style.borderColor = '';
    document.getElementById('stfSendBtn').textContent = 'Send';
    document.getElementById('stfSendBtn').onclick     = null;

    // Show version selector only when a translation is available
    const transBlock   = document.getElementById('translationBlock');
    const transText    = document.getElementById('translatedText');
    const hasTranslation = transBlock &&
        transBlock.style.display !== 'none' &&
        transText && transText.value.trim();
    const versionField = document.getElementById('stfVersionField');
    if (versionField) {
        versionField.style.display = hasTranslation ? 'block' : 'none';
        const originalRadio = document.querySelector('input[name="stfVersion"][value="original"]');
        if (originalRadio) originalRadio.checked = true;
    }

    hideSuggestions();

    document.getElementById('stfOverlay').style.display = 'block';
    document.getElementById('stfModal').style.display   = 'block';
    document.getElementById('stfTo').focus();
    loadStfFriends();
}

function closeStfModal() {
    document.getElementById('stfModal').style.display   = 'none';
    document.getElementById('stfOverlay').style.display = 'none';
    hideSuggestions();
}

// ── friends autocomplete ──

async function loadStfFriends() {
    try {
        const res = await fetch('/api/friends');
        if (!res.ok) return;
        const data = await res.json();
        stfFriends = (data.friends || []).map(f => f.friend_email).filter(Boolean);
    } catch {}
}

function showSuggestions(matches) {
    const list = document.getElementById('stfSuggestions');
    if (!matches.length) { hideSuggestions(); return; }
    list.innerHTML = matches.map(email =>
        `<li data-email="${email}">${email}</li>`
    ).join('');
    list.style.display = 'block';
    list.querySelectorAll('li').forEach(li => {
        li.addEventListener('mousedown', e => {
            e.preventDefault();
            stfAddRecipient(li.dataset.email);
            document.getElementById('stfTo').value = '';
            hideSuggestions();
        });
    });
}

function hideSuggestions() {
    const list = document.getElementById('stfSuggestions');
    if (list) { list.style.display = 'none'; list.innerHTML = ''; }
}

// ── send to all recipients ──

async function sendToFriend() {
    const toInput = document.getElementById('stfTo');
    const msgArea = document.getElementById('stfMessage');
    const errEl   = document.getElementById('stfError');
    const sendBtn = document.getElementById('stfSendBtn');

    // commit any still-typed email
    const typed = toInput.value.trim();
    if (typed) { stfAddRecipient(typed); toInput.value = ''; }

    const userMsg = msgArea.value.trim();

    errEl.style.display = 'none';
    if (!stfRecipients.length) {
        errEl.textContent   = 'Please add at least one recipient.';
        errEl.style.display = 'block';
        return;
    }
    if (!userMsg) {
        errEl.textContent   = 'Please add a message.';
        errEl.style.display = 'block';
        return;
    }

    // Determine what to send based on version selection
    const versionEl       = document.querySelector('input[name="stfVersion"]:checked');
    const version         = versionEl ? versionEl.value : 'original';
    const transTextEl     = document.getElementById('translatedText');
    const langLabelEl     = document.getElementById('translationLangLabel');
    const translatedContent = transTextEl ? transTextEl.value.trim() : '';
    const langName        = langLabelEl ? langLabelEl.textContent : 'translated';

    let sendBody     = userMsg;
    let sendFileId   = currentFileId;
    let sendFileName = currentOutputFileName;

    if (version === 'translated' && translatedContent) {
        sendBody     = userMsg + '\n\n— Translated (' + langName + ') —\n' + translatedContent;
        sendFileId   = null;
        sendFileName = null;
    } else if (version === 'both' && translatedContent) {
        sendBody     = userMsg + '\n\n— Translated (' + langName + ') —\n' + translatedContent;
        // keep sendFileId / sendFileName for the original attachment
    }

    sendBtn.disabled    = true;
    sendBtn.textContent = 'Sending…';

    const subject = sendFileName
        ? `Shared file: ${sendFileName}`
        : 'Shared OCR result';

    try {
        let res, data;
        if (stfRecipients.length === 1) {
            // Single recipient → regular private message
            res  = await fetch('/api/messages/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    toEmail:          stfRecipients[0],
                    subject,
                    body:             sendBody,
                    attachedFileId:   sendFileId,
                    attachedFileName: sendFileName
                })
            });
            data = await res.json();
        } else {
            // Multiple recipients → group conversation
            res  = await fetch('/api/groups/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    memberEmails:     stfRecipients,
                    body:             sendBody,
                    attachedFileId:   sendFileId,
                    attachedFileName: sendFileName
                })
            });
            data = await res.json();
        }

        if (res.ok && data.success) {
            if (data.notFound && data.notFound.length > 0) {
                // Sent successfully but some emails weren't registered
                errEl.textContent   = `Sent! But these emails are not registered on OCRify and were not added: ${data.notFound.join(', ')}`;
                errEl.style.color   = '#d97706';
                errEl.style.background = '#fffbeb';
                errEl.style.borderColor = '#fcd34d';
                errEl.style.display = 'block';
                sendBtn.textContent = 'Close';
                sendBtn.onclick     = closeStfModal;
            } else {
                closeStfModal();
            }
        } else {
            errEl.textContent   = data.error || 'Failed to send message.';
            errEl.style.display = 'block';
        }
    } catch {
        errEl.textContent   = 'Network error — please try again.';
        errEl.style.display = 'block';
    } finally {
        sendBtn.disabled    = false;
        sendBtn.textContent = 'Send';
    }
}

// ── wire up event listeners ──

document.addEventListener('DOMContentLoaded', () => {
    const openBtn   = document.getElementById('sendToFriendBtn');
    const stfSend   = document.getElementById('stfSendBtn');
    const stfCancel = document.getElementById('stfCancelBtn');
    const stfClose  = document.getElementById('stfClose');
    const overlay   = document.getElementById('stfOverlay');
    const toInput   = document.getElementById('stfTo');
    const chipsBox  = document.getElementById('stfChipsBox');

    if (openBtn)   openBtn.addEventListener('click', openSendModal);
    if (stfSend)   stfSend.addEventListener('click', sendToFriend);
    if (stfCancel) stfCancel.addEventListener('click', closeStfModal);
    if (stfClose)  stfClose.addEventListener('click', closeStfModal);
    if (overlay)   overlay.addEventListener('click', closeStfModal);

    // clicking anywhere in the chips box focuses the input
    if (chipsBox) chipsBox.addEventListener('click', () => toInput && toInput.focus());

    if (toInput) {
        toInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const val = toInput.value.trim().replace(/,$/, '');
                if (val) { stfAddRecipient(val); toInput.value = ''; hideSuggestions(); }
            } else if (e.key === 'Backspace' && !toInput.value && stfRecipients.length) {
                stfRemoveRecipient(stfRecipients[stfRecipients.length - 1]);
            }
        });
        toInput.addEventListener('input', () => {
            const q = toInput.value.trim().toLowerCase();
            if (!q) { hideSuggestions(); return; }
            const filtered = stfFriends
                .filter(e => !stfRecipients.includes(e) && e.toLowerCase().includes(q))
                .slice(0, 6);
            showSuggestions(filtered);
        });
        toInput.addEventListener('blur', () => setTimeout(hideSuggestions, 150));
    }
});
