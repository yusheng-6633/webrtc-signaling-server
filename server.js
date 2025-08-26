<!DOCTYPE html>
<html>
<head>
    <title>WebRTC 接收端</title>
    <style>
        body { font-family: sans-serif; padding: 1em; }
        .container { max-width: 800px; margin: auto; }
        .chat-container { flex: 1; }
        #chatBox { height: 150px; border: 1px solid #ccc; overflow-y: scroll; padding: 5px; margin-bottom: 5px; background-color: #f9f9f9; }
        #chatInput { width: calc(100% - 80px); padding: 5px; }
        #sendBtn { padding: 5px 10px; }
        #file-transfer-container { margin-top: 1em; }
        #progress-bar { width: 100%; background-color: #f0f0f0; border-radius: 5px; height: 20px; margin-top: 5px; }
    </style>
</head>
<body>
    <h1>WebRTC P2P 接收端 (Receiver)</h1>
    <label for="signalingServerUrl">信令伺服器 URL:</label>
    <input type="text" id="signalingServerUrl" placeholder="例如: https://your-app.onrender.com" value="https://webrtc-signaling-server-v1c9.onrender.com" style="width: 300px;" />
    <input type="text" id="roomName" placeholder="輸入房間名稱" />
    <button id="checkRoomBtn">檢查房間</button>
    <button id="joinRoomBtn">加入房間</button>
    <hr>
    <div class="container">
        <div class="chat-container">
            <h2>P2P 聊天室</h2>
            <div id="chatBox"></div>
            <input type="text" id="chatInput" placeholder="輸入訊息..." disabled />
            <button id="sendBtn" disabled>傳送</button>
            <div id="file-transfer-container">
                <input type="file" id="fileInput" disabled>
                <div id="download-area"></div>
                <div id="progress-bar"><div id="progress" style="background-color: #4CAF50; height: 100%; width: 0; border-radius: 5px;"></div></div>
            </div>
        </div>
    </div>

    <!-- 引入 Socket.IO 客戶端庫 -->
    <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
    <script>
        let socket; // 將 socket 宣告為 let，以便後續重新賦值
        const signalingServerUrlInput = document.getElementById('signalingServerUrl');
        const checkRoomBtn = document.getElementById('checkRoomBtn');
        const joinRoomBtn = document.getElementById('joinRoomBtn');
        const roomNameInput = document.getElementById('roomName');
        const chatBox = document.getElementById('chatBox');
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendBtn');
        const fileInput = document.getElementById('fileInput');

        let peerConnection;
        let dataChannel;
        let roomName;

        // STUN 伺服器設定，用於 NAT 穿透
        const iceServers = {
            'iceServers': [
                {'urls': 'stun:stun.l.google.com:19302'}
            ]
        };

        // 點擊 "檢查房間" 按鈕
        checkRoomBtn.onclick = () => {
            const roomToCheck = roomNameInput.value;
            if (roomToCheck === '') {
                alert('請輸入要檢查的房間名稱');
                return;
            }

            // 如果 socket 尚未連線，則建立連線
            if (!socket || !socket.connected) {
                socket = io(signalingServerUrlInput.value);
                setupSocketListeners(socket);
            }

            // 等待連線成功後再發送事件
            if (socket.connected) {
                socket.emit('check room', roomToCheck);
            } else {
                socket.once('connect', () => {
                    socket.emit('check room', roomToCheck);
                });
            }
        };

        // 點擊 "加入房間" 按鈕
        joinRoomBtn.onclick = async () => {
            roomName = roomNameInput.value;
            if (roomName === '') {
                alert('請輸入房間名稱');
                return;
            }
            joinRoomBtn.disabled = true;
            roomNameInput.disabled = true;

            // 如果 socket 已經存在且已連線，先斷開它
            if (socket && socket.connected) {
                socket.disconnect();
            }
            // 使用輸入框中的最新 URL 建立新的 socket 連線
            socket = io(signalingServerUrlInput.value);
            setupSocketListeners(socket); // 設定所有事件監聽器

            // 向伺服器發送 'create or join' 事件
            socket.emit('create or join', roomName);
        };

        // 將所有 Socket.IO 事件監聽器封裝在一個函數中
        function setupSocketListeners(socketInstance) {
            socketInstance.on('joined', (room, id) => {
                console.log(`已加入房間 ${room}。我的 ID 是 ${id}`);
            });

            socketInstance.on('full', (room) => {
                console.log(`房間 ${room} 已滿。`);
                alert(`房間 ${room} 已滿。`);
            });

            socketInstance.on('room status', (status) => {
                // 假設伺服器回傳的 status 物件格式為 { room: 'roomName', exists: true, clientCount: 1 }
                if (status.exists) {
                    alert(`房間 '${status.room}' 已存在，目前有 ${status.clientCount} 人。`);
                } else {
                    alert(`房間 '${status.room}' 不存在，您可以建立它。`);
                }
            });

            socketInstance.on('message', async (message) => {
                console.log('收到訊息:', message);
                if (message.type === 'offer') {
                    // 收到 Offer
                    // 3. 建立 RTCPeerConnection
                    if (!peerConnection) {
                        peerConnection = new RTCPeerConnection(iceServers);
                        peerConnection.onicecandidate = handleIceCandidate;
                        // 3a. 監聽 Data Channel (由接收方監聽)
                        peerConnection.ondatachannel = (event) => {
                            dataChannel = event.channel;
                            setupDataChannel();
                        };
                    }

                    // 5. 設定遠端描述 (Offer)
                    try {
                        const offer = new RTCSessionDescription({ type: 'offer', sdp: message.sdp });
                        await peerConnection.setRemoteDescription(offer);

                        // 6. 建立 Answer
                        const answer = await peerConnection.createAnswer();
                        await peerConnection.setLocalDescription(answer);

                        // 7. 將 Answer 發送給房間中的另一個對等端
                        console.log('正在發送 Answer:', answer);
                        socketInstance.emit('message', { room: roomName, type: 'answer', sdp: answer.sdp });
                    } catch (error) {
                        console.error('處理 Offer 時發生錯誤:', error);
                    }

                } else if (message.type === 'candidate') {
                    // 收到 ICE Candidate
                    if (!peerConnection) return;
                    try {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
                    } catch (error) {
                        console.error('加入收到的 ICE Candidate 時發生錯誤', error);
                    }
                }
            });
        }

        // 當 PeerConnection 產生 ICE Candidate 時觸發
        function handleIceCandidate(event) {
            if (event.candidate) socket.emit('message', { room: roomName, type: 'candidate', candidate: event.candidate });
        }

        // --- Data Channel 功能 ---

        function setupDataChannel() {
            dataChannel.onopen = () => {
                console.log("Data Channel 已開啟");
                appendMessage('系統', 'P2P 連線已建立！');
                enableChatAndFileTransfer();
            };
            dataChannel.onclose = () => {
                console.log("Data Channel 已關閉");
                appendMessage('系統', 'P2P 連線已中斷。');
                disableChatAndFileTransfer();
            };

            let receivedBuffers = [];
            let fileMeta;
            const progressBar = document.getElementById('progress');

            dataChannel.onmessage = (event) => {
                // 檔案傳輸是 ArrayBuffer，文字是 string
                if (typeof event.data === 'string') {
                    try {
                        const message = JSON.parse(event.data);
                        if (message.type === 'chat') {
                            appendMessage('對方', message.text);
                        } else if (message.type === 'file-meta') {
                            fileMeta = message;
                            receivedBuffers = [];
                            appendMessage('系統', `正在接收檔案: ${fileMeta.name} (${Math.round(fileMeta.size / 1024)} KB)`);
                            progressBar.style.width = '0%';
                        } else if (message.type === 'file-end') {
                            const receivedFile = new Blob(receivedBuffers);
                            appendMessage('系統', `檔案 ${fileMeta.name} 接收完成！`);
                            createDownloadLink(receivedFile, fileMeta.name);
                            receivedBuffers = [];
                            progressBar.style.width = '100%';
                        }
                    } catch (e) { // Fallback for simple text
                        appendMessage('對方', event.data);
                    }
                } else { // ArrayBuffer (file chunk)
                    receivedBuffers.push(event.data);
                    if (fileMeta && fileMeta.size) {
                        const receivedSize = receivedBuffers.reduce((acc, buffer) => acc + buffer.byteLength, 0);
                        const progress = Math.round((receivedSize / fileMeta.size) * 100);
                        progressBar.style.width = progress + '%';
                    } else {
                        // 如果 fileMeta 不存在，重置進度條
                        progressBar.style.width = '0%';
                    }

                }
            };
        }

        function appendMessage(sender, text) {
            const messageElement = document.createElement('div');
            messageElement.textContent = `${sender}: ${text}`;
            chatBox.appendChild(messageElement);
            chatBox.scrollTop = chatBox.scrollHeight;
        }

        sendBtn.onclick = () => {
            const text = chatInput.value;
            if (text && dataChannel && dataChannel.readyState === 'open') {
                const message = { type: 'chat', text: text };
                dataChannel.send(JSON.stringify(message));
                appendMessage('你', text);
                chatInput.value = '';
            }
        };

        // 檔案傳輸邏輯與 sender 端完全相同
        fileInput.onchange = () => {
            const file = fileInput.files[0];
            if (!file || !dataChannel || dataChannel.readyState !== 'open') return;

            appendMessage('系統', `開始傳送檔案: ${file.name}`);
            dataChannel.send(JSON.stringify({ type: 'file-meta', name: file.name, size: file.size }));

            const chunkSize = 16384; // 16KB
            let offset = 0;

            const sendChunk = () => {
                // 檢查緩衝區是否已滿。設定一個 1MB 的安全閾值。
                const bufferFullThreshold = 1024 * 1024;
                if (dataChannel.bufferedAmount > bufferFullThreshold) {
                    // 等待緩衝區排空。
                    dataChannel.onbufferedamountlow = () => {
                        dataChannel.onbufferedamountlow = null; // 使用一次性監聽器
                        sendChunk();
                    };
                    return; // 暫停傳送
                }

                if (offset >= file.size) {
                    dataChannel.send(JSON.stringify({ type: 'file-end' }));
                    appendMessage('系統', `檔案 ${file.name} 傳送完成。`);
                    return;
                }

                const slice = file.slice(offset, offset + chunkSize);
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        dataChannel.send(e.target.result);
                        offset += e.target.result.byteLength;
                        sendChunk(); // 繼續傳送下一個區塊
                    } catch (error) {
                        console.error('Failed to send file chunk:', error);
                        appendMessage('系統', `檔案傳送失敗: ${error.message}`);
                    }
                };
                reader.readAsArrayBuffer(slice);
            };

            // 開始傳送流程
            sendChunk();
        };

        function createDownloadLink(blob, fileName) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.textContent = `下載 ${fileName}`;
            document.getElementById('download-area').appendChild(a);
        }
        function enableChatAndFileTransfer() {
            chatInput.disabled = false;
            sendBtn.disabled = false;
            fileInput.disabled = false;
        }

        function disableChatAndFileTransfer() {
            chatInput.disabled = true;
            sendBtn.disabled = true;
            fileInput.disabled = true;
        }

    </script>
</body>
</html>

