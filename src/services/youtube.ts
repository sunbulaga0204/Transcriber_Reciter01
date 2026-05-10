import youtubedlLib from 'youtube-dl-exec';
const youtubedl: any = youtubedlLib;
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export async function getYoutubeInfo(url: string): Promise<{ duration: number, title: string }> {
    try {
        const info: any = await youtubedl(url, { 
            dumpJson: true, 
            noCheckCertificates: true, 
            noWarnings: true 
        });
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

        // Download directly to m4a format (bypasses ffmpeg dependency)
        await youtubedl(url, {
            extractAudio: true,
            format: 'bestaudio[ext=m4a]/bestaudio',
            output: tmpFilePath,
            noCheckCertificates: true,
            noWarnings: true
        });

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
