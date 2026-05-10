import youtubedl from 'youtube-dl-exec';
import fs from 'fs';
import path from 'path';

async function test() {
    try {
        const options = { 
            dumpJson: true, 
            noCheckCertificates: true, 
            noWarnings: true,
            format: 'bestaudio/best'
        };
        console.log('Running getYoutubeInfo...');
        const info = await youtubedl('https://www.youtube.com/watch?v=6aTNBCqm3zE', options);
        console.log(`Duration: ${info.duration}, Title: ${info.title}`);
    } catch (error) {
        console.error(`getYoutubeInfo failed: ${error.message}`);
    }

    try {
        console.log('Running download...');
        const tmpFilePath = 'test_audio_download.m4a';
        const options = {
            extractAudio: true,
            format: 'bestaudio/best',
            output: tmpFilePath,
            noCheckCertificates: true,
            noWarnings: true
        };
        await youtubedl('https://www.youtube.com/watch?v=6aTNBCqm3zE', options);
        if (fs.existsSync(tmpFilePath)) {
            console.log('Download succeeded!');
            fs.unlinkSync(tmpFilePath);
        } else {
            console.log('Download failed - no file.');
        }
    } catch (error) {
        console.error(`processYoutubeLink failed: ${error.message}`);
    }
}

test();
