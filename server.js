const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const START_PORT = 3000;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
};

// In-memory active public rooms registry for local multiplayer discovery
const _activeRooms = new Map();

// Periodically clean up rooms with expired heartbeats (> 16s)
setInterval(() => {
  const now = Date.now();
  for (const [id, r] of _activeRooms) {
    if (now - (r.time || 0) > 16000) _activeRooms.delete(id);
  }
}, 5000);

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const reqPath = decodeURI(parsedUrl.pathname);

  // Local Lobby Rooms API
  if (reqPath === '/api/rooms') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET') {
      const rooms = Array.from(_activeRooms.values());
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(rooms));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.closed && data.id) {
            _activeRooms.delete(data.id);
          } else if (data.id) {
            data.time = Date.now();
            _activeRooms.set(data.id, data);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch(e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }
  }

  // Static files
  let targetPath = (reqPath === '/' || reqPath === '') ? '/index.html' : reqPath;
  const filePath = path.join(__dirname, targetPath);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
    } else {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

function listen(port) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      listen(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  server.listen(port, '0.0.0.0', () => {
    const localIp = getLocalIp();
    console.log(`\n========================================`);
    console.log(`🏁 Finger Racer Server running!`);
    console.log(`💻 PC / Local:    http://localhost:${port}`);
    console.log(`📱 Phone / WiFi:  http://${localIp}:${port}`);
    console.log(`========================================\n`);
  });
}

listen(START_PORT);
