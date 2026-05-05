document.addEventListener('DOMContentLoaded', () => {
    // Mode Toggle Logic
    const btnReader = document.getElementById('btn-reader');
    const btnTranscriber = document.getElementById('btn-transcriber');
    const viewReader = document.getElementById('view-reader');
    const viewTranscriber = document.getElementById('view-transcriber');
    const viewDashboard = document.getElementById('view-dashboard');
    const toggleTrack = document.querySelector('.toggle-track');
    const btnDashboardNav = document.getElementById('btn-dashboard-nav');
    const btnLogin = document.getElementById('btn-login');
    const btnSignup = document.getElementById('btn-signup');
    const btnLogout = document.getElementById('btn-logout');

    btnLogin.addEventListener('click', () => window.netlifyIdentity.open('login'));
    btnSignup.addEventListener('click', () => window.netlifyIdentity.open('signup'));
    btnLogout.addEventListener('click', () => window.netlifyIdentity.logout());

    const switchView = (targetView) => {
        [viewReader, viewTranscriber, viewDashboard].forEach(view => view.classList.add('hidden'));
        targetView.classList.remove('hidden');
        
        // Handle toggle visibility
        if (targetView === viewDashboard) {
            document.querySelector('.mode-toggle-container').classList.add('hidden');
            btnDashboardNav.textContent = "← Back to Tools";
        } else {
            document.querySelector('.mode-toggle-container').classList.remove('hidden');
            btnDashboardNav.textContent = "Dashboard";
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

    // Speed Slider Value Update
    const speedSlider = document.getElementById('reader-speed');
    const speedVal = document.getElementById('speed-val');
    speedSlider.addEventListener('input', (e) => {
        speedVal.textContent = parseFloat(e.target.value).toFixed(1) + 'x';
    });

    // File Upload Display
    const fileInput = document.getElementById('stt-file');
    const fileNameDisplay = document.getElementById('selected-file-name');
    fileInput.addEventListener('change', (e) => {
        if(e.target.files.length > 0) {
            fileNameDisplay.textContent = e.target.files[0].name;
        } else {
            fileNameDisplay.textContent = '';
        }
    });

    // Modal Logic
    const btnSummarize = document.getElementById('btn-summarize');
    const modal = document.getElementById('summary-modal');
    const closeBtn = document.getElementById('close-modal');

    btnSummarize.addEventListener('click', () => {
        modal.classList.remove('hidden');
        // TODO: Call summarization API here
        document.getElementById('summary-content').innerHTML = '<p>Generating intelligent summary...</p>';
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Netlify Identity Logic
    if (window.netlifyIdentity) {
        window.netlifyIdentity.on("init", user => {
            updateUserUI(user);
        });
        window.netlifyIdentity.on("login", user => {
            updateUserUI(user);
            window.netlifyIdentity.close();
        });
        window.netlifyIdentity.on("logout", () => {
            updateUserUI(null);
            switchView(viewReader);
        });
    }

    function updateUserUI(user) {
        if (user) {
            btnDashboardNav.classList.remove('hidden');
            btnLogin.classList.add('hidden');
            btnSignup.classList.add('hidden');
            btnLogout.classList.remove('hidden');
            
            document.getElementById('profile-name').textContent = user.user_metadata.full_name || 'User';
            document.getElementById('profile-email').textContent = user.email;
            document.getElementById('input-name').value = user.user_metadata.full_name || '';
            // Load mock exchange rates
            fetchExchangeRates();
        } else {
            btnDashboardNav.classList.add('hidden');
            btnLogin.classList.remove('hidden');
            btnSignup.classList.remove('hidden');
            btnLogout.classList.add('hidden');
        }
    }

    // Mock Profile Update
    document.getElementById('edit-profile-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const newName = document.getElementById('input-name').value;
        alert(`Profile name updated to: ${newName} (Mock API call)`);
        document.getElementById('profile-name').textContent = newName;
    });

    // Real Pricing & Exchange Rates
    async function fetchExchangeRates() {
        try {
            const res = await fetch('/api/pricing');
            const data = await res.json();
            const rates = data.rates;
            const basicUSD = 5;
            const proUSD = 20;

            document.getElementById('price-basic-local').textContent = `~ Rp ${(basicUSD * rates.IDR).toLocaleString()}`;
            document.getElementById('price-pro-local').textContent = `~ Rp ${(proUSD * rates.IDR).toLocaleString()}`;
        } catch (e) {
            console.error("Pricing error:", e);
        }
    }

    // Top-up Action
    document.querySelectorAll('.btn-buy').forEach(btn => {
        btn.addEventListener('click', () => {
            const tier = btn.dataset.tier;
            alert(`Redirecting to payment gateway for ${tier.toUpperCase()} tier...`);
        });
    });

    // TTS Generation
    document.getElementById('btn-generate-tts').addEventListener('click', async () => {
        const btn = document.getElementById('btn-generate-tts');
        const text = document.getElementById('reader-text').value;
        const voice = document.getElementById('reader-voice').value;
        const speed = document.getElementById('reader-speed').value;
        const prompt = document.getElementById('reader-prompt').value;

        if (!text) return alert("Please enter text");
        
        btn.textContent = "Generating...";
        btn.disabled = true;

        try {
            const res = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice, speed, prompt })
            });
            const data = await res.json();
            
            if (data.error) throw new Error(data.error);

            const audioUrl = data.audioUrl || (data.audioBase64 ? `data:audio/mp3;base64,${data.audioBase64}` : null);
            if (audioUrl) {
                const audioPlayer = document.getElementById('tts-audio');
                audioPlayer.src = audioUrl;
                document.getElementById('tts-download').href = audioUrl;
                document.getElementById('tts-player-wrapper').classList.remove('hidden');
            }
        } catch (err) {
            alert("TTS Error: " + err.message);
        } finally {
            btn.textContent = "Generate Audio (1 Credit)";
            btn.disabled = false;
        }
    });

    // STT Transcription
    document.getElementById('btn-transcribe').addEventListener('click', async () => {
        const fileInput = document.getElementById('stt-file');
        if(!fileInput.files.length) return alert("Please upload an audio file first.");
        
        const btn = document.getElementById('btn-transcribe');
        const lang = document.getElementById('stt-lang').value;
        
        btn.textContent = "Transcribing...";
        btn.disabled = true;

        const formData = new FormData();
        formData.append('audio', fileInput.files[0]);
        formData.append('lang', lang);

        try {
            const res = await fetch('/api/stt', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            document.getElementById('stt-results').classList.remove('hidden');
            document.getElementById('btn-summarize').classList.remove('hidden');
            document.getElementById('transcript-text').innerHTML = data.transcript;
            
            // Set summary for modal
            document.getElementById('btn-summarize').onclick = () => {
                document.getElementById('summary-modal').classList.remove('hidden');
                document.getElementById('summary-content').innerHTML = `<p>${data.summary}</p>`;
            };
        } catch (err) {
            alert("STT Error: " + err.message);
        } finally {
            btn.textContent = "Transcribe (1 Credit / min)";
            btn.disabled = false;
        }
    });
});
