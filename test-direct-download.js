import youtubedl from 'youtube-dl-exec';
import fs from 'fs';
import https from 'https';

const TEST_URL = 'https://www.youtube.com/watch?v=6aTNBCqm3zE';

async function downloadUrl(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        const req = https.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close(); fs.unlinkSync(destPath);
                return downloadUrl(res.headers.location, destPath).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) { file.close(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
            res.pipe(file);
            file.on('finish', () => file.close(() => resolve()));
            file.on('error', reject);
        });
        req.on('error', reject);
    });
}

async function test() {
    console.log('Fetching full JSON info...');
    const info = await youtubedl(TEST_URL, { dumpJson: true, noCheckCertificates: true, noWarnings: true });
    console.log(`Title: ${info.title}, Duration: ${info.duration}s`);

    const audioFormats = info.formats.filter(f => f.vcodec === 'none' && f.acodec !== 'none' && f.url);
    audioFormats.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));
    const best = audioFormats[0];
    console.log(`Best audio format: ${best.ext}, codec: ${best.acodec}, bitrate: ${best.abr || best.tbr}`);
    console.log(`Stream URL: ${best.url.substring(0, 80)}...`);

    console.log('Downloading...');
    await downloadUrl(best.url, `test_direct.${best.ext}`);
    console.log(`Downloaded! File: test_direct.${best.ext}, size: ${fs.statSync(`test_direct.${best.ext}`).size} bytes`);
    fs.unlinkSync(`test_direct.${best.ext}`);
    console.log('Cleanup done. Test PASSED!');
}

test().catch(e => console.error('FAILED:', e.message));
