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

  // 處理 'create' 事件：使用者想要建立一個新房間
  socket.on('create', (roomName) => {
    console.log(`Received request to create room '${roomName}' from ${socket.id}`);

    if (rooms[roomName]) {
      // 房間已存在
      socket.emit('exists', roomName);
      console.log(`Room '${roomName}' already exists. Notifying ${socket.id}.`);
    } else {
      // 建立新房間
      rooms[roomName] = {
        participants: [socket.id],
      };
      socket.join(roomName);
      socket.emit('created', roomName, socket.id);
      console.log(`User ${socket.id} created and joined room '${roomName}'`);
    }
  });

  // 處理 'join' 事件：使用者想要加入一個已存在的房間
  socket.on('join', (roomName) => {
    console.log(`Received request to join room '${roomName}' from ${socket.id}`);

    const room = rooms[roomName];
    if (!room) {
      // 房間不存在
      socket.emit('absence', roomName);
      console.log(`Room '${roomName}' not found. Notifying ${socket.id}.`);
      return;
    }

    const numClients = room.participants.length;

    if (numClients === 1) {
      // 房間內已有一個人，可以加入
      socket.join(roomName);
      room.participants.push(socket.id);
      socket.emit('joined', roomName, socket.id);
      // 通知房間內的所有人，可以開始連線
      io.sockets.in(roomName).emit('ready', roomName);
      console.log(`User ${socket.id} joined room '${roomName}'. Room now has 2 participants.`);
    } else {
      // 房間已滿 (已有兩人)
      socket.emit('full', roomName);
      console.log(`Room '${roomName}' is full. Notifying ${socket.id}.`);
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


