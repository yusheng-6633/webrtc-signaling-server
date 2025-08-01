// server.js
const express = require('express');
const https = require('https'); // 引入 https 模組
const fs = require('fs');       // 引入 fs 模組來讀取檔案
const socketIo = require('socket.io');

const app = express();

// --- HTTPS 設定 ---
// 您需要提供自己的 SSL 憑證檔案。
// 對於本地開發，您可以產生一個自簽名憑證。
// 對於正式環境，請使用由受信任的憑證頒發機構 (如 Let's Encrypt) 提供的憑證。
const options = {
  key: fs.readFileSync('./certs/private.key'),      // 將此路徑替換為您的私鑰檔案 (.key)
  cert: fs.readFileSync('./certs/certificate.pem') // 將此路徑替換為您的憑證檔案 (.pem 或 .crt)
};
// --------------------

const httpsServer = https.createServer(options, app); // 建立 HTTPS 伺服器
const io = socketIo(httpsServer, {                    // 將 Socket.IO 附加到 HTTPS 伺服器
  cors: {
    origin: "*", // 允許所有網域
    methods: ["GET", "POST"]
  }
});

const rooms = {}; // 用來存放房間資訊

io.on('connection', (socket) => {
  console.log('User connected via secure connection:', socket.id);

  socket.on('create or join', (roomName) => {
    console.log('Received request to create or join room ' + roomName);

    if (!rooms[roomName]) {
      rooms[roomName] = {
        participants: [],
      };
    }

    const numClients = rooms[roomName].participants.length;

    console.log(roomName + ' now has ' + numClients + ' client(s)');

    if (numClients === 0) {
      socket.join(roomName);
      rooms[roomName].participants.push(socket.id);
      socket.emit('created', roomName, socket.id);
      console.log('User ' + socket.id + ' created room ' + roomName);
    } else if (numClients === 1) {
      socket.join(roomName);
      rooms[roomName].participants.push(socket.id);
      socket.emit('joined', roomName, socket.id);
      io.sockets.in(roomName).emit('ready', roomName);  //通知雙方可以開始連線
      console.log('User ' + socket.id + ' joined room ' + roomName);
    } else { // max two clients
      socket.emit('full', roomName);
    }
  });

  // Signaling messages
  socket.on('message', (message) => {
    console.log('Received message:', message);
    socket.broadcast.to(message.room).emit('message', message); // 廣播給房間內的其他使用者
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    // 清理房間資訊 (重要)
    for (const roomName in rooms) {
      if (rooms[roomName].participants.includes(socket.id)) {
        rooms[roomName].participants = rooms[roomName].participants.filter(id => id !== socket.id);
        if (rooms[roomName].participants.length === 0) {
          delete rooms[roomName];
        } else {
          io.sockets.in(roomName).emit('user disconnected', socket.id); // 通知其他使用者
        }
        break;
      }
    }
  });

});

const port = process.env.PORT || 3000;
httpsServer.listen(port, () => {
  console.log(`✅ Secure Signaling server listening on port ${port}`);
});

