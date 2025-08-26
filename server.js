// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // 允許所有網域
    methods: ["GET", "POST"]
  }
});

const rooms = {}; // 用來存放房間資訊

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create or join', (roomName) => {
    console.log('Received request to create or join room ' + roomName);

    if (!rooms[roomName]) {
      rooms[roomName] = {
        participants: [],
      };
    }

    const numClients = rooms[roomName].participants.length;

    console.log(roomName + ' now has ' + (numClients + 1) + ' client(s)');

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

  // 檢查房間是否存在
  socket.on('check room', (roomName) => {
    console.log(`Received request to check room '${roomName}' from ${socket.id}`);

    const room = rooms[roomName];
    const numClients = room ? room.participants.length : 0;

    const status = {
      room: roomName,
      exists: numClients > 0,
      clientCount: numClients
    };

    console.log(`Replying with room status:`, status);
    // 只將狀態回傳給發出請求的那個客戶端
    socket.emit('room status', status);
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
server.listen(port, () => {
  console.log(`Signaling server listening on port ${port}`);
});


