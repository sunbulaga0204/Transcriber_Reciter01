# Future Roadmap: High-Performance Link Handling
**Concept:** Implement a "Stacked" architecture for real-time video/audio URL processing using Memory Streams.

## 1. Technical Stack (Proposed)
- **Engine:** `fluent-ffmpeg`
- **Stream Handling:** Node.js `stream.Pipeline`
- **Link Fetching:** `axios` (for direct files) or `ytdl-core` (for streaming sites)

## 2. The "Memory Stream" Architecture
To avoid Railway "Out of Memory" (OOM) crashes, we will bypass the disk entirely:
1.  **Incoming Stream:** Pipe the download URL directly into the server memory.
2.  **FFmpeg Filter:** Pipe the incoming stream through FFmpeg with `anull` (audio only) and `resample` (to 16kHz Mono) filters.
3.  **Buffer Collector:** Collect the processed audio chunks into a single 16-bit PCM Buffer.
4.  **Gemini Dispatch:** Send the final optimized Buffer to the Gemini Multimodal API.

## 3. Optimizations for Cost (Railway Compute)
- **Downsampling:** Reducing bitrate to 64kbps Mono before sending to Gemini to save bandwidth.
- **Resource Limits:** Set a 5-minute timeout on conversion to prevent "zombie" FFmpeg processes from consuming CPU.
- **Concurrency Control:** Limit to 1 simultaneous URL conversion per server instance to prevent CPU spikes.

## 4. Handling Oversized Results
- **Chunking Logic:** If the URL points to a >1hr file, the server will "slice" the stream every 30 minutes and perform parallel Gemini requests, merging the final `.srt` output.

---
*Status: Architecture Defined. Pending Implementation.*
