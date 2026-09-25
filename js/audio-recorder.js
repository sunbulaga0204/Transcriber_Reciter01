// audio-recorder.js - IndexedDB backed, memory-efficient browser audio recording
// Streams audio chunks directly into IndexedDB, supporting up to 120 minutes of recording

const DB_NAME = 'aurelius_audio_db';
const DB_VERSION = 1;
const STORE_CHUNKS = 'audio_chunks';
const STORE_META = 'recordings_meta';

class AudioRecordingManager {
    constructor() {
        this.db = null;
        this.mediaStream = null;
        this.mediaRecorder = null;
        this.audioContext = null;
        this.currentSessionId = null;
        this.chunkIndex = 0;
        this.startTime = 0;
        this.elapsedMs = 0;
        this.timerInterval = null;
        this.isRecording = false;
        this.isPaused = false;
        this.mimeType = 'audio/webm';
    }

    async initDB() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
                    const store = db.createObjectStore(STORE_CHUNKS, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('sessionId', 'sessionId', { unique: false });
                }
                if (!db.objectStoreNames.contains(STORE_META)) {
                    db.createObjectStore(STORE_META, { keyPath: 'sessionId' });
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };
            request.onerror = (e) => {
                reject(e.target.error);
            };
        });
    }

    async startRecording(onTimerTick, onMaxDurationReached) {
        await this.initDB();

        // 120 minute hard limit in ms
        const MAX_RECORDING_MS = 120 * 60 * 1000;

        // Request high quality microphone access
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1, // Mono for efficient STT
                sampleRate: 48000,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        // Determine best supported mime type
        const possibleTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4'
        ];
        this.mimeType = possibleTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';

        this.currentSessionId = 'rec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        this.chunkIndex = 0;
        this.elapsedMs = 0;
        this.startTime = Date.now();

        const options = this.mimeType ? { mimeType: this.mimeType } : {};
        this.mediaRecorder = new MediaRecorder(this.mediaStream, options);

        // Stream chunks every 3 seconds to IndexedDB to keep RAM footprint minimal
        this.mediaRecorder.ondataavailable = async (event) => {
            if (event.data && event.data.size > 0) {
                await this.storeChunk(this.currentSessionId, this.chunkIndex++, event.data);
            }
        };

        this.mediaRecorder.start(3000); // 3000ms slice
        this.isRecording = true;
        this.isPaused = false;

        this.timerInterval = setInterval(() => {
            if (!this.isPaused) {
                this.elapsedMs += 1000;
                if (onTimerTick) onTimerTick(this.formatTime(this.elapsedMs), this.elapsedMs);
                if (this.elapsedMs >= MAX_RECORDING_MS) {
                    if (onMaxDurationReached) onMaxDurationReached();
                    this.stopRecording();
                }
            }
        }, 1000);

        return this.currentSessionId;
    }

    pauseRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.pause();
            this.isPaused = true;
        }
    }

    resumeRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
            this.mediaRecorder.resume();
            this.isPaused = false;
        }
    }

    async stopRecording() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        const sessionId = this.currentSessionId;
        const totalDurationSec = Math.round(this.elapsedMs / 1000);

        return new Promise((resolve) => {
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.onstop = async () => {
                    this.isRecording = false;
                    this.isPaused = false;
                    await this.saveMeta(sessionId, {
                        durationSec: totalDurationSec,
                        mimeType: this.mimeType,
                        timestamp: Date.now()
                    });
                    resolve({ sessionId, durationSec: totalDurationSec });
                };
                this.mediaRecorder.stop();
            } else {
                this.isRecording = false;
                this.isPaused = false;
                resolve({ sessionId, durationSec: totalDurationSec });
            }
        });
    }

    async storeChunk(sessionId, index, blob) {
        if (!this.db) await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_CHUNKS, 'readwrite');
            const store = tx.objectStore(STORE_CHUNKS);
            store.add({ sessionId, index, blob });
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    async saveMeta(sessionId, meta) {
        if (!this.db) await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_META, 'readwrite');
            const store = tx.objectStore(STORE_META);
            store.put({ sessionId, ...meta });
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    async getRawBlob(sessionId) {
        if (!this.db) await this.initDB();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(STORE_CHUNKS, 'readonly');
            const store = tx.objectStore(STORE_CHUNKS);
            const index = store.index('sessionId');
            const req = index.getAll(IDBKeyRange.only(sessionId));

            req.onsuccess = () => {
                const chunks = req.result.sort((a, b) => a.index - b.index).map(c => c.blob);
                const fullBlob = new Blob(chunks, { type: this.mimeType || 'audio/webm' });
                resolve(fullBlob);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Converts the recorded chunks to a standard uncompressed 16-bit PCM WAV blob.
     * Uses AudioContext decoding to ensure 100% compliant .wav files.
     */
    async exportWavBlob(sessionId) {
        const rawBlob = await this.getRawBlob(sessionId);
        const arrayBuffer = await rawBlob.arrayBuffer();

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        const wavBlob = audioBufferToWav(audioBuffer);
        ctx.close();
        return wavBlob;
    }

    formatTime(ms) {
        const totalSec = Math.floor(ms / 1000);
        const hours = Math.floor(totalSec / 3600);
        const minutes = Math.floor((totalSec % 3600) / 60);
        const seconds = totalSec % 60;
        return [
            hours.toString().padStart(2, '0'),
            minutes.toString().padStart(2, '0'),
            seconds.toString().padStart(2, '0')
        ].join(':');
    }
}

/**
 * Standard AudioBuffer to RIFF/WAV binary converter
 */
function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    let result;
    if (numChannels === 2) {
        result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
    } else {
        result = buffer.getChannelData(0);
    }

    return encodeWAV(result, format, sampleRate, numChannels, bitDepth);
}

function interleave(inputL, inputR) {
    const length = inputL.length + inputR.length;
    const result = new Float32Array(length);

    let index = 0;
    let inputIndex = 0;

    while (index < length) {
        result[index++] = inputL[inputIndex];
        result[index++] = inputR[inputIndex];
        inputIndex++;
    }
    return result;
}

function encodeWAV(samples, format, sampleRate, numChannels, bitDepth) {
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
    const view = new DataView(buffer);

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* file length */
    view.setUint32(4, 36 + samples.length * bytesPerSample, true);
    /* RIFF type */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, format, true);
    /* channel count */
    view.setUint16(22, numChannels, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * blockAlign, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, blockAlign, true);
    /* bits per sample */
    view.setUint16(34, bitDepth, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, samples.length * bytesPerSample, true);

    // Write PCM samples
    floatTo16BitPCM(view, 44, samples);

    return new Blob([view], { type: 'audio/wav' });
}

function floatTo16BitPCM(output, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

export const recordingManager = new AudioRecordingManager();
