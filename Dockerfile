# 使用 Node.js 官方映像檔
FROM node:16

# 設定工作目錄
WORKDIR /app

# 複製 package.json 和 package-lock.json (如果有的話)
COPY package*.json ./

# 安裝相依套件
RUN npm install

# 複製專案程式碼
COPY . .

# 設定要執行的指令
CMD ["npm", "start"]

# 設定對外公開的埠號
EXPOSE 3000
