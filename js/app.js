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
    const logoLink = document.getElementById('logo-link');

    // New link input UI elements
    const btnPasteLink = document.getElementById('btn-paste-link');
    const linkInputSection = document.getElementById('link-input-section');
    const sttLink = document.getElementById('stt-link');
    const btnCancelLink = document.getElementById('btn-cancel-link');
    const uploadZone = document.getElementById('upload-zone');

    let isProcessing = false;
    let allUsersData = {}; // Cache for admin search

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
                if (child.nodeType === 1) { // Element
                    if (!allowedTags.includes(child.tagName)) {
                        node.removeChild(child);
                    } else {
                        // Strip all attributes except allowed classes
                        const attrs = child.attributes;
                        for (let j = attrs.length - 1; j >= 0; j--) {
                            const attr = attrs[j];
                            if (attr.name !== 'class' || !allowedClasses.includes(attr.value)) {
                                child.removeAttribute(attr.name);
                            }
                        }
                        sanitize(child);
                    }
                } else if (child.nodeType !== 3) { // Not text
                    node.removeChild(child);
                }
            }
        }
        sanitize(doc.body);
        return doc.body.innerHTML;
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
            allUsersData = users;
            
            renderAdminTable(users);
            updateAdminStats(users);

            // Setup search listener once
            const searchInput = document.getElementById('admin-user-search');
            searchInput.oninput = (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = Object.fromEntries(
                    Object.entries(allUsersData).filter(([id, data]) => 
                        id.toLowerCase().includes(term) || (data.email && data.email.toLowerCase().includes(term))
                    )
                );
                renderAdminTable(filtered);
            };
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="5" style="color:red">Error: ${err.message}</td></tr>`;
        }
    }

    function renderAdminTable(users) {
        const tbody = document.querySelector('.admin-table tbody');
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
            btn.onclick = async (e) => {
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
            };
        });
    }

    function updateAdminStats(users) {
        const totalUsers = Object.keys(users).length;
        const totalPoints = Object.values(users).reduce((sum, u) => sum + (u.points || 0), 0);
        
        const elUsers = document.getElementById('admin-stat-users');
        const elPoints = document.getElementById('admin-stat-points');
        if (elUsers) elUsers.textContent = totalUsers;
        if (elPoints) elPoints.textContent = totalPoints;
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

    if (logoLink) logoLink.addEventListener('click', (e) => {
        e.preventDefault();
        btnReader.click();
    });

    if (btnTopupNav) btnTopupNav.addEventListener('click', () => switchView(viewDashboard, true));

    // --- WhatsApp Purchase Logic ---
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

    if (btnLogout) btnLogout.addEventListener('click', () => {
        localStorage.removeItem('aurelius_token');
        localStorage.removeItem('aurelius_user');
        updateUserUI(null);
        switchView(viewReader);
    });

    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

    // --- Link Input Handlers ---
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
        const linkVal = sttLink ? sttLink.value.trim() : '';
        const hasFile = fileInput.files.length > 0;
        const usingLink = linkInputSection && !linkInputSection.classList.contains('hidden') && linkVal;

        if (!hasFile && !usingLink) return alert('Please upload an audio file or provide a valid link first.');
        if (!getToken()) return alert('Please log in to use the Transcriber.');

        const btn = document.getElementById('btn-transcribe');
        const lang = document.getElementById('stt-lang').value;
        const diarize = document.getElementById('speaker-diarization').checked;
        const file = hasFile ? fileInput.files[0] : null;

        isProcessing = true;
        btn.textContent = 'Analyzing...';
        btn.disabled = true;

        let duration = 0;
        let linkTitle = '';
        if (usingLink) {
            try {
                const infoRes = await fetch('/api/yt-info', {
                    method: 'POST',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ linkUrl: linkVal })
                });
                const infoData = await infoRes.json();
                if (!infoRes.ok) throw new Error(infoData.error || 'Failed to fetch YouTube info');
                duration = infoData.duration;
                linkTitle = infoData.title;
            } catch (err) {
                btn.textContent = 'Process Transcription';
                btn.disabled = false;
                isProcessing = false;
                return alert('Link Error: ' + err.message);
            }
        } else if (hasFile) {
            const getDuration = () => new Promise(resolve => {
                const audio = new Audio();
                audio.src = URL.createObjectURL(file);
                audio.onloadedmetadata = () => { URL.revokeObjectURL(audio.src); resolve(audio.duration); };
                audio.onerror = () => resolve(0);
            });
            duration = await getDuration();
        }

        const cost = Math.max(1, Math.ceil(duration / 120)); // Example: 1 pt per 2 mins
        const promptMsg = usingLink 
            ? `Transcription for "${linkTitle}" (~${Math.ceil(duration/60)} mins) will cost ${cost} points. Proceed?`
            : `Transcription for this file will cost ${cost} points. Proceed?`;

        if (!confirm(promptMsg)) {
            btn.textContent = 'Process Transcription';
            btn.disabled = false;
            isProcessing = false;
            return;
        }

        btn.textContent = 'Transcribing...';

        const formData = new FormData();
        if (usingLink) {
            formData.append('linkUrl', linkVal);
        } else {
            formData.append('audio', file);
        }
        formData.append('lang', lang);
        formData.append('diarize', diarize.toString());
        formData.append('duration', duration.toString());

        try {
            const res = await fetch('/api/stt', { method: 'POST', headers: authHeaders(), body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);

            document.getElementById('stt-results').classList.remove('hidden');
            document.getElementById('btn-summarize').classList.remove('hidden');
            document.getElementById('transcript-text').innerHTML = safeHTML(data.transcript);

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
            
            // Handle SRT download
            const srtBtn = document.getElementById('btn-download-srt');
            srtBtn.onclick = () => {
                const transcriptHtml = document.getElementById('transcript-text').innerHTML;
                const temp = document.createElement('div');
                temp.innerHTML = transcriptHtml; // This is already sanitized from above
                const paragraphs = temp.querySelectorAll('p');
                
                let srtContent = '';
                let index = 1;
                
                paragraphs.forEach(p => {
                    const text = p.innerText;
                    // Regex to find [MM:SS - MM:SS]
                    const timeMatch = text.match(/\[(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\]/);
                    if (timeMatch) {
                        const start = timeMatch[1];
                        const end = timeMatch[2];
                        const content = text.replace(/\[\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\]/, '').trim();
                        
                        srtContent += `${index}\n`;
                        srtContent += `00:${start},000 --> 00:${end},000\n`;
                        srtContent += `${content}\n\n`;
                        index++;
                    }
                });
                
                if (!srtContent) return alert('No valid timestamps found for SRT generation.');

                const blob = new Blob([srtContent], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `aurelius_subtitles_${new Date().getTime()}.srt`;
                a.click();
                URL.revokeObjectURL(url);
            };

            document.getElementById('btn-summarize').onclick = () => {
                modal.classList.remove('hidden');
                document.getElementById('summary-content').innerHTML = safeHTML(`<p>${data.summary}</p>`);
            };
            if (data.pointsRemaining !== undefined) updatePointsDisplay(data.pointsRemaining);
        } catch (err) {
            alert('STT Error: ' + err.message);
        } finally {
            isProcessing = false;
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
    
    // --- TTS Recovery ---
    document.getElementById('btn-recover-tts')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-recover-tts');
        if (!getToken()) return alert('Please log in first.');

        btn.textContent = 'Recovering...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/tts/recover', {
                method: 'GET',
                headers: authHeaders()
            });
            
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || `No audio available for recovery.`);
            }

            const blob = await res.blob();
            const audioUrl = URL.createObjectURL(blob);
            
            document.getElementById('tts-audio').src = audioUrl;
            document.getElementById('tts-download').href = audioUrl;
            document.getElementById('tts-player-wrapper').classList.remove('hidden');
            
            alert('Last generation successfully recovered!');
        } catch (err) {
            alert('Recovery failed: ' + err.message);
        } finally {
            btn.textContent = 'Recover Last Audio (Free)';
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

    // Speed slider display update
    document.getElementById('reader-speed')?.addEventListener('input', (e) => {
        document.getElementById('speed-val').textContent = e.target.value + 'x';
    });

    // Prevent accidental close during processing
    window.addEventListener('beforeunload', (e) => {
        if (isProcessing) {
            e.preventDefault();
            e.returnValue = 'A transcription is in progress. Closing the tab will lose your result. Are you sure?';
        }
    });
});
