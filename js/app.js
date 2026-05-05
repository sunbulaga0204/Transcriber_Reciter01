document.addEventListener('DOMContentLoaded', () => {
    // Mode Toggle Logic
    const btnReader = document.getElementById('btn-reader');
    const btnTranscriber = document.getElementById('btn-transcriber');
    const viewReader = document.getElementById('view-reader');
    const viewTranscriber = document.getElementById('view-transcriber');
    const viewDashboard = document.getElementById('view-dashboard');
    const viewAdmin = document.getElementById('view-admin');
    const toggleTrack = document.querySelector('.toggle-track');
    const btnDashboardNav = document.getElementById('btn-dashboard-nav');
    const btnAdminNav = document.getElementById('btn-admin-nav');
    const btnLogin = document.getElementById('btn-login');
    const btnSignup = document.getElementById('btn-signup');
    const btnLogout = document.getElementById('btn-logout');
    const btnTopupNav = document.getElementById('btn-topup-nav');

    // --- Auth helpers ---
    function getToken() {
        const user = window.netlifyIdentity?.currentUser();
        return user?.token?.access_token || null;
    }

    function authHeaders(extra = {}) {
        const token = getToken();
        return token
            ? { 'Authorization': `Bearer ${token}`, ...extra }
            : { ...extra };
    }

    // --- Auth button listeners ---
    btnLogin.addEventListener('click', () => window.netlifyIdentity.open('login'));
    btnSignup.addEventListener('click', () => window.netlifyIdentity.open('signup'));
    btnLogout.addEventListener('click', () => window.netlifyIdentity.logout());

    // --- View switcher ---
    const switchView = (targetView, scrollToCredits = false) => {
        [viewReader, viewTranscriber, viewDashboard, viewAdmin].forEach(view => view.classList.add('hidden'));
        targetView.classList.remove('hidden');

        const isDashOrAdmin = targetView === viewDashboard || targetView === viewAdmin;
        document.querySelector('.mode-toggle-container').classList.toggle('hidden', isDashOrAdmin);

        btnDashboardNav.textContent = isDashOrAdmin ? '← Back' : 'Dashboard';
        btnDashboardNav.classList.toggle('active-nav', targetView === viewDashboard);
        btnAdminNav.classList.toggle('active-nav', targetView === viewAdmin);

        if (scrollToCredits && targetView === viewDashboard) {
            setTimeout(() => {
                document.querySelector('.credits-card')?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        }
    };

    btnReader.addEventListener('click', () => {
        btnReader.classList.add('active');
        btnTranscriber.classList.remove('active');
        switchView(viewReader);
        toggleTrack.classList.remove('transcriber-active');
    });

    btnTranscriber.addEventListener('click', () => {
        btnTranscriber.classList.add('active');
        btnReader.classList.remove('active');
        switchView(viewTranscriber);
        toggleTrack.classList.add('transcriber-active');
    });

    btnDashboardNav.addEventListener('click', () => {
        if (viewDashboard.classList.contains('hidden')) {
            switchView(viewDashboard);
        } else {
            switchView(viewReader);
            btnReader.classList.add('active');
            btnTranscriber.classList.remove('active');
            toggleTrack.classList.remove('transcriber-active');
        }
    });

    btnAdminNav.addEventListener('click', () => {
        // Admin is now a separate page
        window.location.href = '/admin';
    });

    // "Top Up" shortcut button in header — goes directly to credits section of Dashboard
    btnTopupNav.addEventListener('click', () => {
        switchView(viewDashboard, true);
    });

    // --- Speed Slider ---
    const speedSlider = document.getElementById('reader-speed');
    const speedVal = document.getElementById('speed-val');
    speedSlider.addEventListener('input', (e) => {
        speedVal.textContent = parseFloat(e.target.value).toFixed(1) + 'x';
    });

    // --- File Upload Display ---
    const fileInput = document.getElementById('stt-file');
    const fileNameDisplay = document.getElementById('selected-file-name');
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            const sizeMB = (file.size / 1024 / 1024).toFixed(1);
            if (file.size > 10 * 1024 * 1024) {
                fileNameDisplay.textContent = `⚠ File too large (${sizeMB}MB). Max is 10MB. Please split or compress.`;
                fileNameDisplay.style.color = '#ff6b6b';
                fileInput.value = '';
            } else {
                fileNameDisplay.textContent = `${file.name} (${sizeMB}MB)`;
                fileNameDisplay.style.color = '';
            }
        } else {
            fileNameDisplay.textContent = '';
        }
    });

    // --- Modal Logic ---
    const modal = document.getElementById('summary-modal');
    const closeBtn = document.getElementById('close-modal');
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

    // --- Netlify Identity ---
    if (window.netlifyIdentity) {
        window.netlifyIdentity.on('init', user => updateUserUI(user));
        window.netlifyIdentity.on('login', user => {
            updateUserUI(user);
            window.netlifyIdentity.close();
        });
        window.netlifyIdentity.on('logout', () => {
            updateUserUI(null);
            switchView(viewReader);
        });
    }

    function updatePointsDisplay(points) {
        document.getElementById('point-count').textContent = points;
        const el = document.getElementById('dashboard-point-count');
        if (el) el.textContent = points;
    }

    async function refreshPoints() {
        try {
            const res = await fetch('/api/points', { headers: authHeaders() });
            if (!res.ok) return;
            const data = await res.json();
            updatePointsDisplay(data.points);
        } catch (e) {
            console.error('Points refresh error:', e);
        }
    }

    function updateUserUI(user) {
        if (user) {
            document.getElementById('user-greeting').classList.remove('hidden');
            const userName = user.user_metadata?.full_name || user.email.split('@')[0];
            document.getElementById('header-user-name').textContent = userName;
            
            btnDashboardNav.classList.remove('hidden');
            btnTopupNav.classList.remove('hidden');
            btnLogin.classList.add('hidden');
            btnSignup.classList.add('hidden');
            btnLogout.classList.remove('hidden');

            const roles = user.app_metadata?.roles || [];
            btnAdminNav.classList.toggle('hidden', !roles.includes('admin'));

            document.getElementById('profile-name').textContent = userName;
            document.getElementById('profile-email').textContent = user.email;
            document.getElementById('input-name').value = user.user_metadata?.full_name || '';

            // Fetch real point balance from server
            refreshPoints();
            fetchExchangeRates();
        } else {
            document.getElementById('user-greeting').classList.add('hidden');
            btnDashboardNav.classList.add('hidden');
            btnTopupNav.classList.add('hidden');
            btnAdminNav.classList.add('hidden');
            btnLogin.classList.remove('hidden');
            btnSignup.classList.remove('hidden');
            btnLogout.classList.add('hidden');
            updatePointsDisplay(3);
        }
    }

    // --- Profile Update ---
    document.getElementById('edit-profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = document.getElementById('input-name').value;
        const user = window.netlifyIdentity.currentUser();
        if (!user) return;
        try {
            await window.netlifyIdentity.update({ data: { full_name: newName } });
            document.getElementById('profile-name').textContent = newName;
            alert('Profile updated!');
        } catch (err) {
            alert('Update failed: ' + err.message);
        }
    });

    // --- Real Exchange Rates ---
    async function fetchExchangeRates() {
        try {
            const res = await fetch('/api/pricing');
            const data = await res.json();
            const rates = data.rates;
            document.getElementById('price-basic-local').textContent = `~ Rp ${(5 * rates.IDR).toLocaleString()}`;
            document.getElementById('price-pro-local').textContent = `~ Rp ${(20 * rates.IDR).toLocaleString()}`;
        } catch (e) {
            console.error('Pricing error:', e);
        }
    }

    // --- WhatsApp Top-up Buttons ---
    document.querySelectorAll('.btn-buy-wa').forEach(btn => {
        btn.addEventListener('click', () => {
            const user = window.netlifyIdentity.currentUser();
            if (!user) return alert('Please log in first to top up.');
            
            const email = user.email;
            // The predefined WhatsApp message
            const msg = encodeURIComponent(`Saya mau top-up point untuk menggunakan Aurelius. Email akun saya: ${email}`);
            window.open(`https://wa.me/6282168501686?text=${msg}`, '_blank');
        });
    });

    // --- TTS Generation ---
    document.getElementById('btn-generate-tts').addEventListener('click', async () => {
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
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            const audioUrl = data.audioUrl || (data.audioBase64 ? `data:audio/mp3;base64,${data.audioBase64}` : null);
            if (audioUrl) {
                document.getElementById('tts-audio').src = audioUrl;
                document.getElementById('tts-download').href = audioUrl;
                document.getElementById('tts-player-wrapper').classList.remove('hidden');
            }
            if (data.pointsRemaining !== undefined) updatePointsDisplay(data.pointsRemaining);
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            btn.textContent = 'Generate Audio (1 Point)';
            btn.disabled = false;
        }
    });

    // --- STT Transcription ---
    document.getElementById('btn-transcribe').addEventListener('click', async () => {
        if (!fileInput.files.length) return alert('Please upload an audio file first.');
        if (!getToken()) return alert('Please log in to use the Transcriber.');

        const btn = document.getElementById('btn-transcribe');
        const lang = document.getElementById('stt-lang').value;

        btn.textContent = 'Transcribing...';
        btn.disabled = true;

        const formData = new FormData();
        formData.append('audio', fileInput.files[0]);
        formData.append('lang', lang);

        try {
            const res = await fetch('/api/stt', {
                method: 'POST',
                headers: authHeaders(),
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            document.getElementById('stt-results').classList.remove('hidden');
            document.getElementById('btn-summarize').classList.remove('hidden');
            document.getElementById('transcript-text').innerHTML = data.transcript;

            document.getElementById('btn-summarize').onclick = () => {
                modal.classList.remove('hidden');
                document.getElementById('summary-content').innerHTML = `<p>${data.summary}</p>`;
            };

            if (data.pointsRemaining !== undefined) updatePointsDisplay(data.pointsRemaining);
        } catch (err) {
            alert('Error: ' + err.message);
        } finally {
            btn.textContent = 'Transcribe (1 Point / min)';
            btn.disabled = false;
        }
    });

    // --- Netlify site URL fix for local dev ---
    const netlifySiteURL = localStorage.getItem('netlifySiteURL');
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        if (!netlifySiteURL) {
            const url = prompt('Enter your Netlify Site URL to enable local login (e.g., https://your-site.netlify.app):');
            if (url) localStorage.setItem('netlifySiteURL', url);
        }
        if (netlifySiteURL && window.netlifyIdentity) {
            window.netlifyIdentity.setAPIUrl(`${netlifySiteURL}/.netlify/identity`);
        }
    }
});
