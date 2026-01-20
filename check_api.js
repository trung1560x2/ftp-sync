
import http from 'http';

const options = {
    hostname: '127.0.0.1',
    port: 3001,
    path: '/api/files/diff/2?path=/app',
    method: 'GET'
};

const req = http.request(options, res => {
    let data = '';
    res.on('data', chunk => {
        data += chunk;
    });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log('--- API Debug Info ---');
            if (json.debug) {
                console.log('Local Dir:', json.debug.localDir);
                console.log('Local Error:', json.debug.localError);
            } else {
                console.log('No debug info found in response');
            }
            console.log('Diff items count:', json.diffs ? json.diffs.length : 0);
            if (json.diffs) {
                const exceptions = json.diffs.find(d => d.name === 'Exceptions');
                console.log('Exceptions item:', exceptions);
            }
        } catch (e) {
            console.log('Failed to parse JSON:', e.message);
            console.log('Raw data:', data);
        }
    });
});

req.on('error', error => {
    console.error('Request failed:', error);
});

req.end();
