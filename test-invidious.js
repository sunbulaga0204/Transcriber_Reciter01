async function testInvidious() {
    try {
        const response = await fetch('https://vid.puffyan.us/api/v1/videos/6aTNBCqm3zE');
        const data = await response.json();
        console.log("Title: " + data.title);
        console.log("Duration: " + data.lengthSeconds);
        console.log(data.adaptiveFormats.filter(f => f.type.startsWith('audio')).map(f => f.url.substring(0, 50) + '...'));
    } catch (e) {
        console.error(e);
    }
}
testInvidious();
