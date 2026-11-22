const http = require('http');
http.get('http://localhost:5500/index1.html', res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Port 5500 length:', data.length, 'has nearbyCabsList:', data.indexOf('nearbyCabsList') !== -1));
});

