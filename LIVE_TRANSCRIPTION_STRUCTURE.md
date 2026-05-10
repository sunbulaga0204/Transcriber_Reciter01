# Live Transcription Architecture Design

This document outlines the technical and business logic for the Live Transcription feature, as decided during the architecture "grill" session.

## 1. Technical Stack
- **Server:** Node.js (Express) hosted on **Railway**.
- **Real-time:** WebSockets (`ws` or `socket.io`) attached to the existing HTTP server.
- **Database:** **Supabase (Postgres)** (Migrating from `database.json`).
- **Audio Encoding:** **Client-Side (Browser)**. The browser must encode audio to raw 16-bit PCM (16kHz/24kHz) to offload CPU from the server.
- **STT Engine:** Gemini Multimodal Live API (Bidi Stream) as the primary provider.

## 2. Session & State Management
- **In-Memory Ledger:** Active point tracking and session state are held in server RAM during the stream.
- **DB Sync:** Points are only permanently deducted in Supabase at the end of the session or upon disconnect (to minimize DB load).
- **Session ID:** Client-generated or Server-provided `session_id` allows for a 60-second "grace period" for reconnections (Wi-Fi blips) without breaking the transcript.
- **Heartbeat:** 30-second server-side timeout. If no data/ping is received, the session is terminated and points are finalized.

## 3. Pricing & Billing Logic
- **Unlock Fee:** $20 USD (One-time service fee to enable the feature).
- **Point Consumption:** 10 points per hour of transcription.
- **Real-time Deduction:** 
    - 1 point deducted every 6 minutes.
    - **Warning:** A `CREDITS_LOW` event is pushed via WebSocket when < 2 minutes of points remain.
    - **Cut-off:** Session is forcefully closed if points reach 0.

## 4. Delivery & Retention
- **Output Formats:** `.srt` and `.txt`.
- **Retention Policy:** Files are available for download for **30 minutes** only, then automatically deleted.
- **Notification:** Automatic email (via Resend/SendGrid) is triggered immediately when the session ends and the file is ready.
- **Security:** Download links require **JWT Authentication**. No public/unauthenticated access.

## 5. Scalability & Maintenance
- **Concurrency Limit:** Fixed number of simultaneous WebSocket slots. Once full, new users are placed on a waitlist/queue.
- **Updates:** Zero-downtime deployments are avoided for simplicity; instead, 2-day advance notice for maintenance windows.
- **Multi-Provider Fallback:** (Planned for v2) Automatic failover to Deepgram or AssemblyAI if Gemini quotas are hit.
- **BYOK (Bring Your Own Key):** Future infrastructure option for enterprise users.

## 6. Marketing
- **Hard Gate:** No free trials for live transcription.
- **Demo:** A manual video demonstration will be available on the landing page to showcase the feature.
