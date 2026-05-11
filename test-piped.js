async function testPiped() {
    try {
        const response = await fetch('https://pipedapi.kavin.rocks/streams/6aTNBCqm3zE');
        const data = await response.json();
        console.log(data.audioStreams.map(s => ({ format: s.format, url: s.url.substring(0, 50) + '...' })));
    } catch (e) {
        console.error(e);
    }
}
testPiped();
