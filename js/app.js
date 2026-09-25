import { recordingManager } from './audio-recorder.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- State & Selectors ---
    const viewTranscriber = document.getElementById('view-transcriber');
    const viewDashboard = document.getElementById('view-dashboard');
    const viewAdmin = document.getElementById('view-admin');
    const btnDashboardNav = document.getElementById('btn-dashboard-nav');
    const btnAdminNav = document.getElementById('btn-admin-nav');
    const btnLogout = document.getElementById('btn-logout');
    const btnTopupNav = document.getElementById('btn-topup-nav');
    const fileInput = document.getElementById('stt-file');
    const fileNameDisplay = document.getElementById('selected-file-name');
    const modal = document.getElementById('summary-modal');
    const closeBtn = document.getElementById('close-modal');
    const logoLink = document.getElementById('logo-link');

    // Link input UI elements
    const btnPasteLink = document.getElementById('btn-paste-link');
    const linkInputSection = document.getElementById('link-input-section');
    const sttLink = document.getElementById('stt-link');
    const btnCancelLink = document.getElementById('btn-cancel-link');
    const uploadZone = document.getElementById('upload-zone');

    // Recorder Elements
    const recorderCard = document.getElementById('recorder-card');
    const recTimer = document.getElementById('rec-timer');
    const recStatusText = document.getElementById('rec-status-text');
    const btnRecordStart = document.getElementById('btn-record-start');
    const btnRecordPause = document.getElementById('btn-record-pause');
    const btnRecordResume = document.getElementById('btn-record-resume');
    const btnRecordStop = document.getElementById('btn-record-stop');
    const recorderFinishedBox = document.getElementById('recorder-finished-box');
    const recordedFileMeta = document.getElementById('recorded-file-meta');
    const recordedAudioPreview = document.getElementById('recorded-audio-preview');
    const btnDownloadWav = document.getElementById('btn-download-wav');
    const btnTranscribeRecording = document.getElementById('btn-transcribe-recording');

    let activeRecordingSessionId = null;
    let recordedWavBlob = null;
    let recordedDurationSec = 0;

    // Full transcription result cached for 100% download
    let fullTranscriptData = null;

    let isProcessing = false;
    let allUsersData = {};

    // --- Auth Helpers ---
    function getToken() {
        return localStorage.getItem('aurelius_token');
    }

    function authHeaders(extra = {}) {
        const token = getToken();
        return token
            ? { 'Authorization': `Bearer ${token}`, ...extra }
            : { ...extra };
    }

    // --- XSS Mitigation: Simple Sanitizer ---
    function safeHTML(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const allowedTags = ['P', 'STRONG', 'SPAN', 'BR'];
        const allowedClasses = ['timestamp'];

        function sanitize(node) {
            for (let i = node.childNodes.length - 1; i >= 0; i--) {
                const child = node.childNodes[i];
                if (child.nodeType === 1) {
                    if (!allowedTags.includes(child.tagName)) {
                        node.removeChild(child);
                    } else {
                        const attrs = child.attributes;
                        for (let j = attrs.length - 1; j >= 0; j--) {
                            const attr = attrs[j];
                            if (attr.name !== 'class' || !allowedClasses.includes(attr.value)) {
                                child.removeAttribute(attr.name);
                            }
                        }
                        sanitize(child);
                    }
                } else if (child.nodeType !== 3) {
                    node.removeChild(child);
                }
            }
        }
        sanitize(doc.body);
        return doc.body.innerHTML;
    }

    // --- View Navigation ---
    const switchView = (targetView, scrollToCredits = false) => {
        [viewTranscriber, viewDashboard, viewAdmin].forEach(view => {
            if (view) view.classList.add('hidden');
        });
        if (targetView) targetView.classList.remove('hidden');

        const isDashOrAdmin = targetView === viewDashboard || targetView === viewAdmin;

        if (btnDashboardNav) {
            btnDashboardNav.textContent = isDashOrAdmin ? '← Back' : 'Dashboard';
            btnDashboardNav.classList.toggle('active-nav', targetView === viewDashboard);
        }
        if (btnAdminNav) {
            btnAdminNav.classList.toggle('active-nav', targetView === viewAdmin);
        }

        if (scrollToCredits && targetView === viewDashboard) {
            setTimeout(() => {
                document.getElementById('pricing-tiers')?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        }
    };

    function updatePointsDisplay(points) {
        const el1 = document.getElementById('point-count');
        const el2 = document.getElementById('dashboard-point-count');
        if (el1) el1.textContent = points;
        if (el2) el2.textContent = points;
    }

    async function refreshPoints() {
        try {
            const res = await fetch('/api/points', { headers: authHeaders() });
            if (!res.ok) return;
            const data = await res.json();
            updatePointsDisplay(data.points);
            
            const pName = document.getElementById('profile-name');
            const pEmail = document.getElementById('profile-email');
            if (pName && data.email) pName.textContent = data.email.split('@')[0];
            if (pEmail && data.email) pEmail.textContent = data.email;
        } catch (e) {
            console.error('Points refresh error:', e);
        }
    }

    function updateUserUI(user) {
        const greeting = document.getElementById('user-greeting');
        const nameSpan = document.getElementById('header-user-name');
        const googleBtnContainer = document.getElementById('google-signin-btn');
        const btnMockLogin = document.getElementById('btn-mock-login');
        
        if (user) {
            if (nameSpan) nameSpan.textContent = user.name || user.email.split('@')[0];
            if (greeting) greeting.classList.remove('hidden');
            if (btnLogout) btnLogout.classList.remove('hidden');
            if (btnDashboardNav) btnDashboardNav.classList.remove('hidden');
            if (googleBtnContainer) googleBtnContainer.classList.add('hidden');
            if (btnMockLogin) btnMockLogin.classList.add('hidden');
            
            const isAdmin = user.roles && user.roles.includes('admin');
            if (btnAdminNav) btnAdminNav.classList.toggle('hidden', !isAdmin);
            
            refreshPoints();
            fetchExchangeRates();
        } else {
            if (greeting) greeting.classList.add('hidden');
            if (btnLogout) btnLogout.classList.add('hidden');
            if (btnDashboardNav) btnDashboardNav.classList.add('hidden');
            if (btnAdminNav) btnAdminNav.classList.add('hidden');
            if (googleBtnContainer) googleBtnContainer.classList.remove('hidden');
            if (btnMockLogin) btnMockLogin.classList.remove('hidden');
            updatePointsDisplay(3);
        }
    }

    document.getElementById('btn-mock-login')?.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/auth/mock', { method: 'POST' });
            const data = await res.json();
            localStorage.setItem('aurelius_token', data.token);
            localStorage.setItem('aurelius_user', JSON.stringify(data.user));
            updateUserUI(data.user);
        } catch (e) {
            alert('Mock login error: ' + e.message);
        }
    });

    async function loadAdminUsers() {
        const tbody = document.querySelector('.admin-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5">Loading users...</td></tr>';
        
        try {
            const res = await fetch('/api/admin/users', { headers: authHeaders() });
            if (!res.ok) throw new Error('Admin access denied');
            const users = await res.json();
            allUsersData = users;
            renderAdminTable(users);
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="5" style="color: #ff4757;">Failed to load users: ${e.message}</td></tr>`;
        }
    }

    function renderAdminTable(users) {
        const tbody = document.querySelector('.admin-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const userKeys = Object.keys(users);
        const countUsers = document.getElementById('admin-stat-users');
        const countPoints = document.getElementById('admin-stat-points');
        if (countUsers) countUsers.textContent = userKeys.length;
        
        let totalPts = 0;
        userKeys.forEach(k => totalPts += (users[k].points || 0));
        if (countPoints) countPoints.textContent = totalPts;

        if (userKeys.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">No users found.</td></tr>';
            return;
        }

        userKeys.forEach(userId => {
            const u = users[userId];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="font-weight: 600;">${u.email || 'Anonymous'}</div>
                    <div style="font-size: 0.75rem; color: #777;">ID: ${userId}</div>
                </td>
                <td><span class="badge ${u.tier === 'pro' ? 'pro' : 'standard'}">${u.tier || 'Standard'}</span></td>
                <td>
                    <input type="number" class="cyber-input" style="width: 70px; padding: 4px;" value="${u.points || 0}" data-user="${userId}">
                </td>
                <td>Active</td>
                <td>
                    <button class="cyber-button secondary small btn-save-user" data-user="${userId}">Save</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        document.querySelectorAll('.btn-save-user').forEach(b => {
            b.addEventListener('click', async (e) => {
                const uid = e.target.dataset.user;
                const input = document.querySelector(`input[data-user="${uid}"]`);
                const pts = parseInt(input.value, 10);
                try {
                    const res = await fetch('/api/admin/update-points', {
                        method: 'POST',
                        headers: authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ userId: uid, points: pts })
                    });
                    if (res.ok) alert('Points updated successfully!');
                    else alert('Update failed');
                } catch (err) {
                    alert('Network error: ' + err.message);
                }
            });
        });
    }

    // --- Google Auth ---
    function initGoogleAuth() {
        if (!window.google) return;
        const clientId = window.AURELIUS_CONFIG?.googleClientId || "754704383182-4fhn8t99e909a31qf7l7d9vsqfeglqj4.apps.googleusercontent.com";
        window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCredential
        });
        window.google.accounts.id.renderButton(
            document.getElementById('google-signin-btn'),
            { theme: 'outline', size: 'medium', shape: 'pill', text: 'signin_with' }
        );
    }

    async function handleGoogleCredential(response) {
        try {
            const res = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: response.credential })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Login failed');
            
            localStorage.setItem('aurelius_token', data.token);
            localStorage.setItem('aurelius_user', JSON.stringify(data.user));
            updateUserUI(data.user);
        } catch (e) {
            alert('Authentication Error: ' + e.message);
        }
    }

    // --- Built-in Recorder Implementation ---
    if (btnRecordStart) {
        btnRecordStart.addEventListener('click', async () => {
            if (!getToken()) return alert('Please log in before recording audio.');

            try {
                btnRecordStart.classList.add('hidden');
                btnRecordPause.classList.remove('hidden');
                btnRecordStop.classList.remove('hidden');
                recorderCard.classList.add('recording');
                recStatusText.textContent = 'Recording live microphone audio (High Quality)...';

                activeRecordingSessionId = await recordingManager.startRecording(
                    (formattedTime) => {
                        recTimer.textContent = formattedTime;
                    },
                    () => {
                        alert('Maximum 120-minute limit reached. Recording automatically saved.');
                    }
                );
            } catch (err) {
                recorderCard.classList.remove('recording');
                btnRecordStart.classList.remove('hidden');
                btnRecordPause.classList.add('hidden');
                btnRecordStop.classList.add('hidden');
                alert('Microphone access failed: ' + err.message);
            }
        });
    }

    if (btnRecordPause) {
        btnRecordPause.addEventListener('click', () => {
            recordingManager.pauseRecording();
            recorderCard.classList.remove('recording');
            btnRecordPause.classList.add('hidden');
            btnRecordResume.classList.remove('hidden');
            recStatusText.textContent = 'Recording paused.';
        });
    }

    if (btnRecordResume) {
        btnRecordResume.addEventListener('click', () => {
            recordingManager.resumeRecording();
            recorderCard.classList.add('recording');
            btnRecordResume.classList.add('hidden');
            btnRecordPause.classList.remove('hidden');
            recStatusText.textContent = 'Recording resumed...';
        });
    }

    if (btnRecordStop) {
        btnRecordStop.addEventListener('click', async () => {
            recStatusText.textContent = 'Processing and caching audio recording...';
            btnRecordPause.classList.add('hidden');
            btnRecordResume.classList.add('hidden');
            btnRecordStop.classList.add('hidden');
            recorderCard.classList.remove('recording');

            try {
                const { sessionId, durationSec } = await recordingManager.stopRecording();
                recordedDurationSec = durationSec;

                // Export WAV
                recStatusText.textContent = 'Encoding lossless WAV file...';
                recordedWavBlob = await recordingManager.exportWavBlob(sessionId);

                const mins = Math.floor(durationSec / 60);
                const secs = durationSec % 60;
                const timeStr = `${mins}m ${secs}s`;
                const sizeMb = (recordedWavBlob.size / (1024 * 1024)).toFixed(1);

                recordedFileMeta.textContent = `${timeStr} (${sizeMb} MB) • 16-bit PCM WAV (Cached locally)`;
                
                const audioUrl = URL.createObjectURL(recordedWavBlob);
                recordedAudioPreview.src = audioUrl;

                recorderFinishedBox.classList.remove('hidden');
                recStatusText.textContent = 'Recording complete and cached in IndexedDB!';
                btnRecordStart.classList.remove('hidden');
                btnRecordStart.innerHTML = '<span class="btn-rec-icon">⏺</span> Record New Audio';
            } catch (err) {
                alert('Error completing recording: ' + err.message);
                btnRecordStart.classList.remove('hidden');
                recStatusText.textContent = 'Recording error: ' + err.message;
            }
        });
    }

    if (btnDownloadWav) {
        btnDownloadWav.addEventListener('click', () => {
            if (!recordedWavBlob) return alert('No recorded audio available.');
            const url = URL.createObjectURL(recordedWavBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `recording_${new Date().toISOString().replace(/[:.]/g, '-')}.wav`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    if (btnTranscribeRecording) {
        btnTranscribeRecording.addEventListener('click', async () => {
            if (!recordedWavBlob) return alert('No recorded audio available.');
            await executeTranscription(recordedWavBlob, recordedDurationSec, 'recording.wav');
        });
    }

    // --- File Upload & Link Interactions ---
    if (uploadZone) {
        uploadZone.addEventListener('click', (e) => {
            if (e.target.tagName !== 'A') fileInput.click();
        });
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = '#1DB954';
        });
        uploadZone.addEventListener('dragleave', () => {
            uploadZone.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        });
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            if (e.dataTransfer.files.length > 0) {
                fileInput.files = e.dataTransfer.files;
                fileNameDisplay.textContent = `Selected: ${fileInput.files[0].name} (${(fileInput.files[0].size / (1024*1024)).toFixed(1)} MB)`;
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                fileNameDisplay.textContent = `Selected: ${fileInput.files[0].name} (${(fileInput.files[0].size / (1024*1024)).toFixed(1)} MB)`;
            }
        });
    }

    if (btnPasteLink) {
        btnPasteLink.addEventListener('click', (e) => {
            e.preventDefault();
            uploadZone.classList.add('hidden');
            linkInputSection.classList.remove('hidden');
            if (sttLink) sttLink.focus();
        });
    }

    if (btnCancelLink) {
        btnCancelLink.addEventListener('click', () => {
            linkInputSection.classList.add('hidden');
            uploadZone.classList.remove('hidden');
            if (sttLink) sttLink.value = '';
        });
    }

    // --- STT Transcription Action ---
    document.getElementById('btn-transcribe')?.addEventListener('click', async () => {
        const linkVal = sttLink ? sttLink.value.trim() : '';
        const hasFile = fileInput.files.length > 0;
        const usingLink = linkInputSection && !linkInputSection.classList.contains('hidden') && linkVal;

        if (!hasFile && !usingLink) {
            return alert('Please record microphone audio, upload an audio file, or paste a link first.');
        }

        if (usingLink) {
            await executeTranscription(null, 0, null, linkVal);
        } else {
            const file = fileInput.files[0];
            const getDuration = () => new Promise(resolve => {
                const audio = new Audio();
                audio.src = URL.createObjectURL(file);
                audio.onloadedmetadata = () => { URL.revokeObjectURL(audio.src); resolve(audio.duration); };
                audio.onerror = () => resolve(0);
            });
            const duration = await getDuration();
            await executeTranscription(file, duration, file.name);
        }
    });

    async function executeTranscription(audioBlobOrFile, durationSec = 0, fileName = '', linkUrl = '') {
        if (!getToken()) return alert('Please log in to transcribe audio.');

        const btn = document.getElementById('btn-transcribe');
        const lang = document.getElementById('stt-lang').value;
        const diarize = document.getElementById('speaker-diarization').checked;

        isProcessing = true;
        btn.textContent = 'Transcribing with Gemini Multimodal Model...';
        btn.disabled = true;

        const formData = new FormData();
        if (linkUrl) {
            formData.append('linkUrl', linkUrl);
        } else if (audioBlobOrFile) {
            formData.append('audio', audioBlobOrFile, fileName || 'recording.wav');
        }
        formData.append('lang', lang);
        formData.append('diarize', diarize.toString());
        formData.append('duration', durationSec.toString());

        const isMockMode = document.getElementById('toggle-mock-mode')?.checked ?? false;

        try {
            const res = await fetch('/api/stt', {
                method: 'POST',
                headers: authHeaders(isMockMode ? { 'x-mock-mode': 'true' } : {}),
                body: formData
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);

            fullTranscriptData = data;

            // Render 35% on-screen display truncation
            renderTranscriptPreview(data);

            document.getElementById('stt-results').classList.remove('hidden');
            document.getElementById('btn-summarize').classList.remove('hidden');
            document.getElementById('stt-results').scrollIntoView({ behavior: 'smooth' });

            if (data.pointsRemaining !== undefined) {
                updatePointsDisplay(data.pointsRemaining);
            }
        } catch (err) {
            alert('Transcription Failed: ' + err.message);
        } finally {
            isProcessing = false;
            btn.textContent = 'Process Transcription';
            btn.disabled = false;
        }
    }

    /**
     * Requirement #3: The display only shows maximum 35% of the total transcription output
     */
    function renderTranscriptPreview(data) {
        const transcriptContainer = document.getElementById('transcript-text');
        const cutoffFade = document.getElementById('transcript-fade');

        // Parse paragraphs
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = data.transcript;
        const paragraphs = Array.from(tempDiv.querySelectorAll('p'));

        if (paragraphs.length <= 2) {
            // Very short text: display as is without truncation
            transcriptContainer.innerHTML = safeHTML(data.transcript);
            if (cutoffFade) cutoffFade.classList.add('hidden');
            return;
        }

        // Show max 35% of total paragraphs (at least 1 paragraph)
        const visibleCount = Math.max(1, Math.floor(paragraphs.length * 0.35));
        const visibleParagraphs = paragraphs.slice(0, visibleCount);

        transcriptContainer.innerHTML = visibleParagraphs.map(p => p.outerHTML).join('');
        if (cutoffFade) cutoffFade.classList.remove('hidden');
    }

    // --- Full Downloads (100% of Content) ---
    document.getElementById('btn-download-transcript')?.addEventListener('click', () => {
        if (!fullTranscriptData) return alert('No transcript available to download.');
        
        // Export 100% full raw transcript text
        const textToSave = fullTranscriptData.rawTranscript || fullTranscriptData.transcript.replace(/<[^>]*>/g, '');
        const blob = new Blob([textToSave], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aurelius_full_transcript_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('btn-download-srt')?.addEventListener('click', () => {
        if (!fullTranscriptData) return alert('No transcript available for SRT generation.');

        const srtText = generateSRTFromData(fullTranscriptData);
        if (!srtText) return alert('No timestamp segments found to construct SRT subtitles.');

        const blob = new Blob([srtText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `aurelius_subtitles_${Date.now()}.srt`;
        a.click();
        URL.revokeObjectURL(url);
    });

    function generateSRTFromData(data) {
        let srtContent = '';
        let index = 1;

        // If backend passed parsed segments, use them
        if (data.segments && data.segments.length > 0) {
            data.segments.forEach(seg => {
                const startStr = formatSrtTimestamp(seg.startSec);
                const endStr = formatSrtTimestamp(seg.endSec);
                const speakerLabel = seg.speaker ? `${seg.speaker}: ` : '';
                srtContent += `${index}\n${startStr} --> ${endStr}\n${speakerLabel}${seg.text}\n\n`;
                index++;
            });
            return srtContent;
        }

        // Fallback: parse raw transcript for [mm:ss - mm:ss]
        const rawLines = (data.rawTranscript || '').split('\n');
        rawLines.forEach(line => {
            const timeMatch = line.match(/\[(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?)\]/);
            if (timeMatch) {
                const parseSec = (str) => {
                    const p = str.split(':').map(Number);
                    if (p.length === 3) return p[0]*3600 + p[1]*60 + p[2];
                    if (p.length === 2) return p[0]*60 + p[1];
                    return 0;
                };
                const startSec = parseSec(timeMatch[1]);
                const endSec = parseSec(timeMatch[2]);
                const content = line.replace(/\[.*?\]\s*/, '').trim();

                srtContent += `${index}\n${formatSrtTimestamp(startSec)} --> ${formatSrtTimestamp(endSec)}\n${content}\n\n`;
                index++;
            }
        });

        return srtContent;
    }

    function formatSrtTimestamp(totalSeconds) {
        const sec = Math.max(0, totalSeconds || 0);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},000`;
    }

    // --- Summary Modal ---
    document.getElementById('btn-summarize')?.addEventListener('click', () => {
        if (!fullTranscriptData) return;
        modal.classList.remove('hidden');
        document.getElementById('summary-content').innerHTML = safeHTML(`<p>${fullTranscriptData.summary}</p>`);
    });

    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

    // --- Navigation Links ---
    if (logoLink) {
        logoLink.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(viewTranscriber);
        });
    }

    if (btnDashboardNav) {
        btnDashboardNav.addEventListener('click', () => {
            if (viewDashboard.classList.contains('hidden')) {
                switchView(viewDashboard);
            } else {
                switchView(viewTranscriber);
            }
        });
    }

    if (btnTopupNav) {
        btnTopupNav.addEventListener('click', () => {
            switchView(viewDashboard, true);
        });
    }

    if (btnAdminNav) {
        btnAdminNav.addEventListener('click', () => {
            if (viewAdmin.classList.contains('hidden')) {
                switchView(viewAdmin);
                loadAdminUsers();
            } else {
                switchView(viewTranscriber);
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            localStorage.removeItem('aurelius_token');
            localStorage.removeItem('aurelius_user');
            updateUserUI(null);
            switchView(viewTranscriber);
        });
    }

    // WhatsApp Buy Trigger
    document.querySelectorAll('.btn-buy-wa').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tier = e.target.dataset.tier;
            const points = e.target.dataset.points;
            const currency = document.getElementById('currency-selector').value;
            const price = document.querySelector(`.pricing-tier-card${tier === 'Pro' ? '.pro' : ''} .price-val`).textContent;
            
            const user = JSON.parse(localStorage.getItem('aurelius_user') || '{}');
            const msg = encodeURIComponent(`Hi, I'd like to top up my Aurelius account.\n\nTier: ${tier}\nPoints: ${points}\nPrice: ${currency} ${price}\nUser: ${user.email || 'Not logged in'}`);
            window.open(`https://wa.me/6282168501686?text=${msg}`, '_blank');
        });
    });

    // --- Pricing & Exchange Rates ---
    let currentRates = { IDR: 15500, MYR: 4.7, SAR: 3.75, USD: 1 };
    const currencySelector = document.getElementById('currency-selector');

    async function fetchExchangeRates() {
        try {
            const res = await fetch('/api/pricing');
            if (res.ok) {
                const data = await res.json();
                if (data.rates) currentRates = data.rates;
            }
        } catch (e) { console.error('Pricing error:', e); }
        updatePrices();
    }

    function updatePrices() {
        if (!currencySelector) return;
        const currency = currencySelector.value;
        const rate = currentRates[currency] || 1;
        document.querySelectorAll('.price-val').forEach(el => {
            const baseUsd = parseFloat(el.dataset.usd);
            el.textContent = (baseUsd * rate).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        });
        document.querySelectorAll('.currency-code').forEach(el => el.textContent = currency);
    }
    currencySelector?.addEventListener('change', updatePrices);

    // --- Profile update ---
    const profileForm = document.getElementById('edit-profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const newName = document.getElementById('input-name').value;
            const savedUserStr = localStorage.getItem('aurelius_user');
            if (!savedUserStr) return;
            try {
                const user = JSON.parse(savedUserStr);
                user.name = newName;
                localStorage.setItem('aurelius_user', JSON.stringify(user));
                const pName = document.getElementById('profile-name');
                const hName = document.getElementById('header-user-name');
                if (pName) pName.textContent = newName;
                if (hName) hName.textContent = newName;
                alert('Profile display name updated!');
            } catch (err) {
                alert('Update failed: ' + err.message);
            }
        });
    }

    // --- Init ---
    const savedUser = localStorage.getItem('aurelius_user');
    if (savedUser) {
        try { updateUserUI(JSON.parse(savedUser)); } 
        catch (e) { localStorage.removeItem('aurelius_user'); }
    }

    window.onload = () => { initGoogleAuth(); };

    // Prevent accidental close during processing
    window.addEventListener('beforeunload', (e) => {
        if (isProcessing) {
            e.preventDefault();
            e.returnValue = 'A transcription is in progress. Closing the tab will lose your result. Are you sure?';
        }
    });
});
