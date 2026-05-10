import ytdl from '@distube/ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export async function processYoutubeLink(url: string): Promise<{ buffer: Buffer, duration: number, mimeType: string }> {
    return new Promise(async (resolve, reject) => {
        try {
            const info = await ytdl.getInfo(url);
            const durationSeconds = parseInt(info.videoDetails.lengthSeconds, 10);
            
            // Hard limit: 20 minutes (1200 seconds)
            if (durationSeconds > 1200) {
                return reject(new Error('Video duration exceeds the 20-minute limit for the free tier.'));
            }

            const tmpFileId = crypto.randomBytes(8).toString('hex');
            const tmpFilePath = path.join('/tmp', `aurelius_audio_${tmpFileId}.mp3`);

            const audioStream = ytdl(url, { filter: 'audioonly' });

            ffmpeg(audioStream)
                .audioFrequency(16000)
                .audioChannels(1)
                .format('mp3')
                .on('error', (err) => {
                    if (fs.existsSync(tmpFilePath)) fs.unlinkSync(tmpFilePath);
                    reject(new Error(`FFmpeg error: ${err.message}`));
                })
                .on('end', () => {
                    try {
                        const buffer = fs.readFileSync(tmpFilePath);
                        fs.unlinkSync(tmpFilePath); // cleanup immediately
                        resolve({
                            buffer,
                            duration: durationSeconds,
                            mimeType: 'audio/mp3'
                        });
                    } catch (err: any) {
                        reject(new Error(`Failed to read processed file: ${err.message}`));
                    }
                })
                .save(tmpFilePath);
        } catch (error: any) {
            reject(new Error(`YouTube download failed: ${error.message}`));
        }
    });
}
