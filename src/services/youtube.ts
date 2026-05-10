import youtubedlLib from 'youtube-dl-exec';
const youtubedl: any = youtubedlLib;
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export async function getYoutubeInfo(url: string): Promise<{ duration: number, title: string }> {
    try {
        const cookiesPath = path.join('/tmp', 'cookies.txt');
        
        // If cookies are provided via environment variable (Railway style), write them to /tmp
        if (process.env.YT_COOKIES) {
            fs.writeFileSync(cookiesPath, process.env.YT_COOKIES);
        }

        const options: any = { 
            dumpJson: true, 
            noCheckCertificates: true, 
            noWarnings: true,
            format: 'bestaudio/best' // Prevent format resolution errors on info fetch
        };

        // Check for /tmp/cookies.txt (env var source) or local cookies.txt
        if (fs.existsSync(cookiesPath)) {
            options.cookies = cookiesPath;
        } else if (fs.existsSync(path.join(process.cwd(), 'cookies.txt'))) {
            options.cookies = path.join(process.cwd(), 'cookies.txt');
        }

        const info: any = await youtubedl(url, options);
        return { duration: info.duration, title: info.title };
    } catch (error: any) {
        throw new Error(`YouTube info fetch failed: ${error.message}`);
    }
}

export async function processYoutubeLink(url: string): Promise<{ buffer: Buffer, duration: number, mimeType: string }> {
    try {
        // Fetch info to check duration limit
        const info = await getYoutubeInfo(url);
        
        // Hard limit: 20 minutes (1200 seconds)
        if (info.duration > 1200) {
            throw new Error('Video duration exceeds the 20-minute limit for the free tier.');
        }

        const tmpFileId = crypto.randomBytes(8).toString('hex');
        const tmpFilePath = path.join('/tmp', `aurelius_audio_${tmpFileId}.m4a`);
        const cookiesPath = path.join('/tmp', 'cookies.txt');

        const options: any = {
            extractAudio: true,
            format: 'bestaudio/best', // Simplified format to prevent availability errors
            output: tmpFilePath,
            noCheckCertificates: true,
            noWarnings: true
        };

        // Reuse /tmp cookies or local cookies
        if (fs.existsSync(cookiesPath)) {
            options.cookies = cookiesPath;
        } else if (fs.existsSync(path.join(process.cwd(), 'cookies.txt'))) {
            options.cookies = path.join(process.cwd(), 'cookies.txt');
        }

        await youtubedl(url, options);

        if (!fs.existsSync(tmpFilePath)) {
            throw new Error('Failed to download audio file.');
        }

        const buffer = fs.readFileSync(tmpFilePath);
        fs.unlinkSync(tmpFilePath); // cleanup immediately

        return {
            buffer,
            duration: info.duration,
            mimeType: 'audio/mp4' // m4a is audio/mp4
        };
    } catch (error: any) {
        throw new Error(`YouTube processing failed: ${error.message}`);
    }
}
