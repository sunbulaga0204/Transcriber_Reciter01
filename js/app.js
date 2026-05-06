document.addEventListener('DOMContentLoaded', () => {
    // --- State & Selectors ---
    const btnReader = document.getElementById('btn-reader');
    const btnTranscriber = document.getElementById('btn-transcriber');
    const viewReader = document.getElementById('view-reader');
    const viewTranscriber = document.getElementById('view-transcriber');
    const viewDashboard = document.getElementById('view-dashboard');
    const viewAdmin = document.getElementById('view-admin');
    const toggleTrack = document.querySelector('.toggle-track');
    const btnDashboardNav = document.getElementById('btn-dashboard-nav');
    const btnAdminNav = document.getElementById('btn-admin-nav');
    const btnLogout = document.getElementById('btn-logout');
    const btnTopupNav = document.getElementById('btn-topup-nav');
    const fileInput = document.getElementById('stt-file');
    const fileNameDisplay = document.getElementById('selected-file-name');
    const modal = document.getElementById('summary-modal');
    const closeBtn = document.getElementById('close-modal');

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

    // --- Core Logic Functions ---
    const switchView = (targetView, scrollToCredits = false) => {
        [viewReader, viewTranscriber, viewDashboard, viewAdmin].forEach(view => view.classList.add('hidden'));
        targetView.classList.remove('hidden');

        const isDashOrAdmin = targetView === viewDashboard || targetView === viewAdmin;
        const toggleContainer = document.querySelector('.mode-toggle-container');
        if (toggleContainer) toggleContainer.classList.toggle('hidden', isDashOrAdmin);

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
            
            // Also update dashboard fields
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
        
        if (user) {
            if (nameSpan) nameSpan.textContent = user.name || user.email.split('@')[0];
            if (greeting) greeting.classList.remove('hidden');
            if (btnLogout) btnLogout.classList.remove('hidden');
            if (btnDashboardNav) btnDashboardNav.classList.remove('hidden');
            if (googleBtnContainer) googleBtnContainer.classList.add('hidden');
            
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
            updatePointsDisplay(3);
        }
    }

    async function loadAdminUsers() {
        const tbody = document.querySelector('.admin-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5">Loading users...</td></tr>';
        
        try {
            const res = await fetch('/api/admin/users', { headers: authHeaders() });
            if (!res.ok) throw new Error('Admin access denied');
            const users = await res.json();
            
            tbody.innerHTML = '';
            Object.entries(users).forEach(([id, data]) => {
                const tr = document.createElement('tr');
                const displayName = data.email || `${id.substring(0, 8)}...`;
                tr.innerHTML = `
                    <td>${displayName}</td>
                    <td><span class="badge ${data.tier}">${data.tier}</span></td>
                    <td>${data.points}</td>
                    <td>Active</td>
                    <td><button class="cyber-button secondary small btn-edit-points" data-id="${id}" data-points="${data.points}" data-tier="${data.tier}">Edit</button></td>
                `;
                tbody.appendChild(tr);
            });

            document.querySelectorAll('.btn-edit-points').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.dataset.id;
                    const newPoints = prompt('Enter new points balance:', e.target.dataset.points);
                    if (newPoints === null) return;
                    
                    const res = await fetch('/api/admin/update-points', {
                        method: 'POST',
                        headers: authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ userId: id, points: parseInt(newPoints), tier: e.target.dataset.tier })
                    });
                    if (res.ok) {
                        alert('Points updated!');
                        loadAdminUsers();
                    }
                });
            });
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="5" style="color:red">Error: ${err.message}</td></tr>`;
        }
    }

    // --- Google Auth Integration ---
    window.handleGoogleCredential = async (response) => {
        try {
            const res = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: response.credential })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            localStorage.setItem('aurelius_token', data.token);
            localStorage.setItem('aurelius_user', JSON.stringify(data.user));
            updateUserUI(data.user);
        } catch (error) {
            console.error('[Google Auth Error]', error);
            alert('Failed to log in: ' + error.message);
        }
    };

    function initGoogleAuth() {
        const clientId = window.AURELIUS_CONFIG?.googleClientId;
        if (!clientId) {
            console.warn('Google Client ID not configured.');
            return;
        }

        google.accounts.id.initialize({
            client_id: clientId,
            callback: window.handleGoogleCredential,
            theme: 'filled_black'
        });

        google.accounts.id.renderButton(
            document.getElementById("google-signin-btn"),
            { theme: "filled_black", size: "large", shape: "pill" }
        );
    }

    // --- Event Listeners ---
    if (btnReader) btnReader.addEventListener('click', () => {
        btnReader.classList.add('active');
        btnTranscriber?.classList.remove('active');
        switchView(viewReader);
        toggleTrack?.classList.remove('transcriber-active');
    });

    if (btnTranscriber) btnTranscriber.addEventListener('click', () => {
        btnTranscriber.classList.add('active');
        btnReader?.classList.remove('active');
        switchView(viewTranscriber);
        toggleTrack?.classList.add('transcriber-active');
    });

    if (btnDashboardNav) btnDashboardNav.addEventListener('click', () => {
        if (viewDashboard.classList.contains('hidden') && viewAdmin.classList.contains('hidden')) {
            switchView(viewDashboard);
        } else {
            btnReader.click();
        }
    });

    if (btnAdminNav) btnAdminNav.addEventListener('click', () => {
        switchView(viewAdmin);
        loadAdminUsers();
    });

    if (btnTopupNav) btnTopupNav.addEventListener('click', () => switchView(viewDashboard, true));

    if (btnLogout) btnLogout.addEventListener('click', () => {
        localStorage.removeItem('aurelius_token');
        localStorage.removeItem('aurelius_user');
        updateUserUI(null);
        switchView(viewReader);
    });

    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

    // --- Profile Update ---
    const profileForm = document.getElementById('edit-profile-form');
    if (profileForm) profileForm.addEventListener('submit', (e) => {
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

    // --- STT Transcription ---
    document.getElementById('btn-transcribe')?.addEventListener('click', async () => {
        if (!fileInput.files.length) return alert('Please upload an audio file first.');
        if (!getToken()) return alert('Please log in to use the Transcriber.');

        const btn = document.getElementById('btn-transcribe');
        const lang = document.getElementById('stt-lang').value;
        const diarize = document.getElementById('speaker-diarization').checked;
        const file = fileInput.files[0];

        btn.textContent = 'Analyzing...';
        btn.disabled = true;

        const getDuration = () => new Promise(resolve => {
            const audio = new Audio();
            audio.src = URL.createObjectURL(file);
            audio.onloadedmetadata = () => { URL.revokeObjectURL(audio.src); resolve(audio.duration); };
            audio.onerror = () => resolve(0);
        });

        const duration = await getDuration();
        btn.textContent = 'Transcribing...';

        const formData = new FormData();
        formData.append('audio', file);
        formData.append('lang', lang);
        formData.append('diarize', diarize.toString());
        formData.append('duration', duration.toString());

        try {
            const res = await fetch('/api/stt', { method: 'POST', headers: authHeaders(), body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);

            document.getElementById('stt-results').classList.remove('hidden');
            document.getElementById('btn-summarize').classList.remove('hidden');
            document.getElementById('transcript-text').innerHTML = data.transcript;

            // Handle download
            const downloadBtn = document.getElementById('btn-download-transcript');
            downloadBtn.onclick = () => {
                const text = document.getElementById('transcript-text').innerText;
                const blob = new Blob([text], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `aurelius_transcript_${new Date().getTime()}.txt`;
                a.click();
                URL.revokeObjectURL(url);
            };

            document.getElementById('btn-summarize').onclick = () => {
                modal.classList.remove('hidden');
                document.getElementById('summary-content').innerHTML = `<p>${data.summary}</p>`;
            };
            if (data.pointsRemaining !== undefined) updatePointsDisplay(data.pointsRemaining);
        } catch (err) {
            alert('STT Error: ' + err.message);
        } finally {
            btn.textContent = 'Process Transcription';
            btn.disabled = false;
        }
    });

    // --- TTS Generation ---
    document.getElementById('btn-generate-tts')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-generate-tts');
        const text = document.getElementById('reader-text').value;
        const voice = document.getElementById('reader-voice').value;
        const speed = document.getElementById('reader-speed').value;
        const prompt = document.getElementById('reader-prompt').value;

        if (!text) return alert('Please enter text to synthesize.');
        if (!getToken()) return alert('Please log in to use the Reader.');

        btn.textContent = 'Generating...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/tts', {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ text, voice, speed, prompt })
            });
            
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || `Server error (${res.status})`);
            }

            // Handle binary audio blob
            const blob = await res.blob();
            const audioUrl = URL.createObjectURL(blob);
            
            document.getElementById('tts-audio').src = audioUrl;
            document.getElementById('tts-download').href = audioUrl;
            document.getElementById('tts-player-wrapper').classList.remove('hidden');

            const pointsRemaining = res.headers.get('x-points-remaining');
            if (pointsRemaining !== null) updatePointsDisplay(parseInt(pointsRemaining));
        } catch (err) {
            alert('TTS Error: ' + err.message);
        } finally {
            btn.textContent = 'Generate Audio (1 Pt / 400 words)';
            btn.disabled = false;
        }
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

    // --- Initialization ---
    const savedUser = localStorage.getItem('aurelius_user');
    if (savedUser) {
        try { updateUserUI(JSON.parse(savedUser)); } 
        catch (e) { localStorage.removeItem('aurelius_user'); }
    }

    window.onload = () => { initGoogleAuth(); };
});
