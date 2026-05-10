import youtubedl from 'youtube-dl-exec';

async function test() {
    try {
        const info = await youtubedl('https://www.youtube.com/watch?v=6aTNBCqm3zE', {
            dumpJson: true,
            noWarnings: true,
            noCheckCertificates: true
        });
        console.log(JSON.stringify(info.formats, null, 2));
    } catch (e) {
        console.error(e.message);
    }
}
test();
