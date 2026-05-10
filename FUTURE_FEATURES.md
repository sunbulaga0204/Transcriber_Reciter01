# Future Roadmap: High-Performance Link Handling
**Concept:** Implement a robust architecture for YouTube/URL processing using temporary disk storage and audio-only extraction to respect free-tier constraints.

## 1. Technical Stack (Proposed)
- **Engine:** `fluent-ffmpeg` (Spawned as isolated child processes)
- **Stream Handling:** Node.js `fs.createWriteStream` to `/tmp`
- **Link Fetching:** `ytdl-core` (Strictly using `filter: 'audioonly'` to save bandwidth)

## 2. The "/tmp Disk Chunking" Architecture
To avoid Railway "Out of Memory" (OOM) crashes and Event Loop blocking:
1.  **Audio-Only Extraction:** Use `ytdl(url, { filter: 'audioonly' })`. This prevents downloading heavy 1080p video data and only pulls the M4A/WebM audio track.
2.  **Disk Spooling:** Pipe the incoming audio stream through FFmpeg (resampling to 16kHz Mono) and write it directly to the `/tmp` directory on the server. Do **not** collect buffers in RAM.
3.  **Sequential Chunking:** Read the saved file from `/tmp` in manageable chunks (e.g., 5-minute segments) and send them sequentially to the Gemini Multimodal API.
4.  **Cleanup:** Once the transcription is complete and merged, explicitly delete the `/tmp` file to free up the 5GB disk limit.

## 3. Optimizations for Cost & Stability (Railway Compute)
- **20-Minute Hard Limit:** We will enforce a strict 20-minute maximum duration for any pasted link. This ensures the CPU isn't hogged for hours and aligns with Gemini's rate limits.
- **Child Process Isolation:** Run FFmpeg as a separated child process. Node.js is single-threaded; if we run heavy processing on the main thread, it will freeze the server for everyone else.
- **Concurrency Control:** Limit to 1 simultaneous URL conversion per server instance. If a second user requests a link transcription, they are placed in a queue.

---
*Status: Architecture Defined. Pending Implementation.*
