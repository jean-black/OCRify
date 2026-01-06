// Global variables
let userPosition = null;
let selectedFiles = [];
let downloadUrl = null;
let downloadUrls = []; // For bulk downloads
let processingStartTime = null;
let timerInterval = null;

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
            console.log('User session created:', userPosition);
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
uploadBtn.addEventListener('click', () => fileInput.click());
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
    if (selectedFiles.length === 1) {
        formData.append('file', selectedFiles[0]);
    } else {
        selectedFiles.forEach(file => {
            formData.append('files', file);
        });
    }

    try {
        // Update progress
        progressFill.style.width = '60%';
        updateProgressText('Extracting text from images...');

        const endpoint = selectedFiles.length === 1 ? '/api/upload' : '/api/upload-bulk';
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
                if (selectedFiles.length === 1) {
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

    // Show AI filename if available
    if (data.aiFileName) {
        console.log('AI-generated filename:', data.aiFileName);
    }

    // Reset download button
    downloadBtn.style.display = 'block';
    downloadBtn.textContent = 'Download File';

    // Play completion sound
    playCompletionSound();

    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Display bulk results
function displayBulkResults(data, processingTimeSec) {
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
            summaryText += `   AI Name: ${result.aiFileName}\n`;
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

// Download file(s)
function downloadFile() {
    if (downloadUrl) {
        // Single file download
        window.location.href = downloadUrl;
    } else if (downloadUrls && downloadUrls.length > 0) {
        // Bulk file downloads
        downloadUrls.forEach((url, index) => {
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = url;
                link.download = '';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, index * 500); // Stagger downloads by 500ms
        });
    } else {
        alert('No files available for download');
    }
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
                historyItem.innerHTML = `
                    <div>
                        <strong>${file.file_name}</strong><br>
                        <small>Status: ${file.extraction_state} | ${file.detected_language || 'Unknown language'}</small>
                    </div>
                    <div>
                        <small>${formatTimestamp(file.extraction_end_timestamp)}</small>
                    </div>
                `;
                historyList.appendChild(historyItem);
            });
        }
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

// Format timestamp
function formatTimestamp(timestamp) {
    if (!timestamp) return 'Processing...';
    const date = new Date(timestamp);
    return date.toLocaleString();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initUserSession();
});
