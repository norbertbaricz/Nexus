const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Suport pentru fișiere multiple
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, "_"));
    }
});
const upload = multer({ storage: storage });

const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT, avatarUrl TEXT, status TEXT, joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP)");
    db.run("CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, senderId TEXT, receiverId TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, isEdited BOOLEAN, fileUrl TEXT, fileName TEXT, fileType TEXT)");
});

app.use(express.static(path.join(__dirname, 'public')));

// Upload modificat pentru a accepta array de fișiere
app.post('/upload', upload.array('files', 15), (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).send('Upload failed.');
    const filesData = req.files.map(f => ({
        fileUrl: '/uploads/' + f.filename,
        fileName: f.originalname,
        mimeType: f.mimetype
    }));
    res.json(filesData);
});

app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

io.on('connection', (socket) => {
    
    socket.on('identify', (data) => {
        socket.uid = data.uid;
        socket.join(data.uid); // Creează camera privată unică a user-ului
        
        db.run("UPDATE users SET status = ? WHERE id = ?", [data.status, data.uid], function() {
            db.get("SELECT * FROM users WHERE id = ?", [data.uid], (err, user) => {
                if (user) io.emit('user_updated', user);
            });
        });
    });

    socket.on('disconnect', () => {
        if (socket.uid) {
            db.run("UPDATE users SET status = 'offline' WHERE id = ? AND status != 'invisible'", [socket.uid], function() {
                if (this.changes > 0) {
                    db.get("SELECT * FROM users WHERE id = ?", [socket.uid], (err, user) => {
                        if (user) io.emit('user_updated', user);
                    });
                }
            });
        }
    });

    db.all("SELECT * FROM users", [], (err, users) => socket.emit('init_users', users));
    db.all("SELECT * FROM messages ORDER BY timestamp ASC", [], (err, msgs) => socket.emit('init_messages', msgs));

    socket.on('update_profile', (user) => {
        db.get("SELECT id FROM users WHERE username = ? AND id != ?", [user.username, user.id], (err, row) => {
            if (row) socket.emit('profile_error', 'This username is already taken!');
            else {
                socket.uid = user.id;
                socket.join(user.id);
                db.run("INSERT OR REPLACE INTO users (id, username, avatarUrl, status) VALUES (?, ?, ?, ?)",
                    [user.id, user.username, user.avatarUrl, user.status],
                    () => io.emit('user_updated', user)
                );
            }
        });
    });

    socket.on('send_message', (msg) => {
        db.run("INSERT INTO messages (text, senderId, receiverId, isEdited, fileUrl, fileName, fileType) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [msg.text, msg.senderId, msg.receiverId, 0, msg.fileUrl || null, msg.fileName || null, msg.fileType || null],
            function(err) {
                const newMsg = {
                    id: this.lastID, text: msg.text, senderId: msg.senderId, 
                    receiverId: msg.receiverId, timestamp: new Date().toISOString(), isEdited: 0,
                    fileUrl: msg.fileUrl || null, fileName: msg.fileName || null, fileType: msg.fileType || null
                };
                
                // RUTARE PRIVATĂ: Trimitem doar cui trebuie
                if (msg.receiverId === 'global') {
                    io.emit('new_message', newMsg);
                } else {
                    io.to(msg.senderId).to(msg.receiverId).emit('new_message', newMsg);
                }
            }
        );
    });

    socket.on('edit_message', (data) => {
        db.get("SELECT receiverId, senderId FROM messages WHERE id = ?", [data.id], (err, row) => {
            if(!row) return;
            db.run("UPDATE messages SET text = ?, isEdited = 1 WHERE id = ?", [data.text, data.id], () => {
                const updatedData = { id: data.id, text: data.text };
                if (row.receiverId === 'global') io.emit('message_edited', updatedData);
                else io.to(row.senderId).to(row.receiverId).emit('message_edited', updatedData);
            });
        });
    });

    socket.on('delete_message', (id) => {
        db.get("SELECT receiverId, senderId FROM messages WHERE id = ?", [id], (err, row) => {
            if(!row) return;
            db.run("DELETE FROM messages WHERE id = ?", [id], () => {
                if (row.receiverId === 'global') io.emit('message_deleted', id);
                else io.to(row.senderId).to(row.receiverId).emit('message_deleted', id);
            });
        });
    });

    // WebRTC Logic
    socket.on('call_user', (data) => {
        socket.to(data.userToCall).emit('incoming_call', { signal: data.signalData, from: data.from, type: data.type, callerData: data.callerData });
    });
    socket.on('answer_call', (data) => socket.to(data.to).emit('call_accepted', data.signal));
    socket.on('ice_candidate', (data) => socket.to(data.to).emit('ice_candidate', data.candidate));
    socket.on('end_call', (data) => socket.to(data.to).emit('call_ended'));
    socket.on('reject_call', (data) => socket.to(data.to).emit('call_rejected'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[Nexus Protocol] Server running on http://localhost:\${PORT}`));