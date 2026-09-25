import youtubedlLib from 'youtube-dl-exec';
const youtubedl: any = youtubedlLib;
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Resolves cookie path from env var or local file.
 */
function resolveCookiesPath(): string | null {
    const tmpCookies = path.join('/tmp', 'cookies.txt');
    if (process.env.YT_COOKIES) {
        fs.writeFileSync(tmpCookies, process.env.YT_COOKIES);
        return tmpCookies;
    }
    if (fs.existsSync(tmpCookies)) return tmpCookies;
    const localCookies = path.join(process.cwd(), 'cookies.txt');
    if (fs.existsSync(localCookies)) return localCookies;
    return null;
}

export async function getYoutubeInfo(url: string): Promise<{ duration: number, title: string }> {
    try {
        const cookiesPath = resolveCookiesPath();
        const options: any = {
            dumpJson: true,
            noCheckCertificates: true,
            noWarnings: true
        };
        if (cookiesPath) options.cookies = cookiesPath;

        const info: any = await youtubedl(url, options);
        return { duration: info.duration, title: info.title };
    } catch (error: any) {
        throw new Error(`YouTube info fetch failed: ${error.message}`);
    }
}

export async function processYoutubeLink(url: string): Promise<{ buffer: Buffer, duration: number, mimeType: string }> {
    try {
        const cookiesPath = resolveCookiesPath();

        // Step 1: Fetch full JSON to get available formats and duration
        const infoOptions: any = {
            dumpJson: true,
            noCheckCertificates: true,
            noWarnings: true
        };
        if (cookiesPath) infoOptions.cookies = cookiesPath;
        const info: any = await youtubedl(url, infoOptions);

        if (info.duration > 7200) {
            throw new Error('Video duration exceeds the 120-minute limit.');
        }

        // Step 2: Pick the best available audio-only format ID from the metadata
        // We pick the format ID first so yt-dlp doesn't have to do format negotiation on download
        const audioFormats: any[] = (info.formats || []).filter((f: any) =>
            f.vcodec === 'none' && f.acodec !== 'none' && f.url
        );
        if (audioFormats.length === 0) {
            throw new Error('No audio-only streams found for this video.');
        }
        audioFormats.sort((a: any, b: any) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));
        const bestFormat = audioFormats[0];
        const formatId: string = bestFormat.format_id;
        const ext: string = bestFormat.ext || 'webm';
        const mimeType: string = (ext === 'm4a' || ext === 'mp4') ? 'audio/mp4' : 'audio/webm';

        // Step 3: Download using the specific format ID - no format negotiation needed
        const tmpFileId = crypto.randomBytes(8).toString('hex');
        const tmpFilePath = path.join('/tmp', `aurelius_audio_${tmpFileId}.${ext}`);

        const dlOptions: any = {
            format: formatId, // Use exact format ID, not a selector string
            output: tmpFilePath,
            noCheckCertificates: true,
            noWarnings: true
        };
        if (cookiesPath) dlOptions.cookies = cookiesPath;

        await youtubedl(url, dlOptions);

        if (!fs.existsSync(tmpFilePath)) {
            throw new Error('Failed to download audio stream to disk.');
        }

        const buffer = fs.readFileSync(tmpFilePath);
        fs.unlinkSync(tmpFilePath);

        return { buffer, duration: info.duration, mimeType };
    } catch (error: any) {
        throw new Error(`YouTube processing failed: ${error.message}`);
    }
}
