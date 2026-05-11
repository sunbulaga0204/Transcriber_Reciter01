async function testCobalt() {
    try {
        const response = await fetch('https://api.cobalt.tools/api/json', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: 'https://www.youtube.com/watch?v=6aTNBCqm3zE',
                isAudioOnly: true
            })
        });
        const data = await response.json();
        console.log(data);
    } catch (e) {
        console.error(e);
    }
}
testCobalt();
