import youtubedl from 'youtube-dl-exec';
import fs from 'fs';

const TEST_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // "Me at the zoo", short video

async function testYtDlp() {
    console.log('Testing info extraction...');
    try {
        const info = await youtubedl(TEST_URL, { dumpJson: true, noCheckCertificates: true, noWarnings: true, preferFreeFormats: true });
        console.log(`Success! Video Title: ${info.title}, Duration: ${info.duration}s`);
    } catch (err) {
        console.error('Info extraction failed:', err);
    }

    console.log('\nTesting audio download...');
    try {
        await youtubedl(TEST_URL, {
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: '0',
            output: 'test_output.mp3',
            noCheckCertificates: true,
            noWarnings: true
        });
        
        if (fs.existsSync('test_output.mp3')) {
            console.log('Success! Audio file test_output.mp3 was downloaded.');
            fs.unlinkSync('test_output.mp3');
        } else {
            console.log('Failed: File not found after execution.');
        }
    } catch (err) {
        console.error('Audio download failed:', err);
    }
}

testYtDlp();
