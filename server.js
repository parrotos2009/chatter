import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import multer from 'multer';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 10e6 });

const uploadDir = path.join(__dirname, 'public', 'uploads');
const avatarDir = path.join(uploadDir, 'avatars');
fs.mkdirSync(avatarDir, { recursive: true });

const db = new Database(path.join(__dirname, 'chatter.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT,
    color TEXT NOT NULL,
    bio TEXT,
    last_seen INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT NOT NULL,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    avatar TEXT
  );
  CREATE TABLE IF NOT EXISTS room_members (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (room_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_avatar TEXT,
    user_color TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_msg_room ON messages(room_id, id);
`);

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = (file.mimetype.split('/')[1] || 'png').replace('jpeg', 'jpg');
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
  },
});
const upload = multer({
  storage: avatarStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image uploads are allowed'));
  },
});

const insertMessage = db.prepare(
  'INSERT INTO messages (room_id, user_id, user_name, user_avatar, user_color, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
const upsertUser = db.prepare(
  `INSERT INTO users (id, name, avatar, color, bio, last_seen)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET name=excluded.name, avatar=excluded.avatar, color=excluded.color, bio=excluded.bio`
);
const updateUser = db.prepare(
  'UPDATE users SET name=?, avatar=?, color=?, bio=? WHERE id=?'
);
const getUser = db.prepare('SELECT * FROM users WHERE id=?');
const getUsers = db.prepare('SELECT * FROM users ORDER BY name');
const insertRoomStmt = db.prepare(
  'INSERT OR IGNORE INTO rooms (id, name, type, created_by, created_at, avatar) VALUES (?, ?, ?, ?, ?, ?)'
);
const getRoomsForUser = db.prepare(`
  SELECT r.*, rm.role,
    (SELECT text FROM messages WHERE room_id = r.id ORDER BY id DESC LIMIT 1) AS last_text,
    (SELECT created_at FROM messages WHERE room_id = r.id ORDER BY id DESC LIMIT 1) AS last_at,
    (SELECT COUNT(*) FROM messages m WHERE m.room_id = r.id AND m.user_id != ?) AS unread
  FROM rooms r
  JOIN room_members rm ON rm.room_id = r.id
  WHERE rm.user_id = ?
  ORDER BY COALESCE((SELECT created_at FROM messages WHERE room_id = r.id ORDER BY id DESC LIMIT 1), r.created_at) DESC
`);
const getRoom = db.prepare('SELECT * FROM rooms WHERE id=?');
const addMember = db.prepare(
  'INSERT OR IGNORE INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)'
);
const getMembers = db.prepare(`
  SELECT u.id, u.name, u.avatar, u.color, rm.role, rm.joined_at
  FROM room_members rm
  JOIN users u ON u.id = rm.user_id
  WHERE rm.room_id = ?
  ORDER BY rm.joined_at ASC
`);
const getMessages = db.prepare(
  'SELECT * FROM messages WHERE room_id = ? ORDER BY id ASC LIMIT 300'
);

insertRoomStmt.run('general', 'General', 'public', null, Date.now(), null);
insertRoomStmt.run('random', 'Random', 'public', null, Date.now() + 1, null);
insertRoomStmt.run('tech', 'Tech Talk', 'public', null, Date.now() + 2, null);
db.exec(`
  INSERT OR IGNORE INTO room_members (room_id, user_id, role, joined_at) SELECT id, '*', 'public', ${Date.now()} FROM rooms WHERE type='public';
`);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));
app.use(express.json({ limit: '1mb' }));

app.get('/api/me/:id', (req, res) => {
  const u = getUser.get(req.params.id);
  if (!u) return res.status(404).json({ error: 'not found' });
  res.json(u);
});

app.get('/api/users', (req, res) => {
  res.json(getUsers.all());
});

app.get('/api/rooms/:id/messages', (req, res) => {
  res.json(getMessages.all(req.params.id));
});

app.get('/api/rooms/:id/members', (req, res) => {
  res.json(getMembers.all(req.params.id));
});

app.post('/api/upload-avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  res.json({ url: `/uploads/avatars/${req.file.filename}` });
});

const onlineUsers = new Map();
const typingByRoom = new Map();
const calls = new Map();

function userPublic(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, avatar: u.avatar || null, color: u.color, bio: u.bio || '' };
}

function broadcastPresence() {
  const list = Array.from(onlineUsers.values()).map(userPublic);
  io.emit('presence:update', list);
}

function emitRoomList(userId) {
  const list = getRoomsForUser.all(userId, userId);
  io.to(userId).emit('room:list', list);
}

function emitMemberUpdate(roomId) {
  const members = getMembers.all(roomId);
  io.to(roomId).emit('room:members', { roomId, members });
}

function isMember(roomId, userId) {
  const r = getRoom.get(roomId);
  if (!r) return false;
  if (r.type === 'public') return true;
  return !!db.prepare('SELECT 1 FROM room_members WHERE room_id=? AND user_id=?').get(roomId, userId);
}

function findExistingDM(a, b) {
  return db.prepare(`
    SELECT r.id FROM rooms r
    WHERE r.type='dm'
      AND EXISTS (SELECT 1 FROM room_members WHERE room_id=r.id AND user_id=?)
      AND EXISTS (SELECT 1 FROM room_members WHERE room_id=r.id AND user_id=?)
      AND (SELECT COUNT(*) FROM room_members WHERE room_id=r.id) = 2
  `).get(a, b);
}

io.on('connection', (socket) => {
  let me = null;

  socket.on('user:join', ({ id, name, avatar, color, bio }, ack) => {
    if (!name || typeof name !== 'string') return;
    const safeName = name.trim().slice(0, 32) || 'Guest';
    const safeColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#00a884';
    const userId = (id && typeof id === 'string') ? id : 'u_' + Math.random().toString(36).slice(2, 10);
    me = {
      id: userId,
      name: safeName,
      avatar: typeof avatar === 'string' ? avatar.slice(0, 500) : null,
      color: safeColor,
      bio: typeof bio === 'string' ? bio.slice(0, 140) : '',
      joinedAt: Date.now(),
    };
    upsertUser.run(me.id, me.name, me.avatar, me.color, me.bio, Date.now());
    onlineUsers.set(socket.id, me);
    socket.join(me.id);
    // Auto-join all public channels
    const publicRooms = db.prepare("SELECT id FROM rooms WHERE type='public'").all();
    for (const r of publicRooms) {
      addMember.run(r.id, me.id, 'member', Date.now());
      socket.join(r.id);
    }
    broadcastPresence();
    if (typeof ack === 'function') ack({ ok: true, user: userPublic(me), rooms: getRoomsForUser.all(me.id, me.id) });
  });

  socket.on('user:update', (patch, ack) => {
    if (!me) return;
    if (typeof patch.name === 'string') me.name = patch.name.trim().slice(0, 32) || me.name;
    if (typeof patch.avatar === 'string' || patch.avatar === null) me.avatar = patch.avatar;
    if (typeof patch.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(patch.color)) me.color = patch.color;
    if (typeof patch.bio === 'string') me.bio = patch.bio.slice(0, 140);
    updateUser.run(me.name, me.avatar, me.color, me.bio, me.id);
    onlineUsers.set(socket.id, me);
    broadcastPresence();
    if (typeof ack === 'function') ack({ ok: true, user: userPublic(me) });
  });

  socket.on('room:join', (roomId, ack) => {
    if (!me) return;
    if (!isMember(roomId, me.id)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'not a member' });
      return;
    }
    socket.join(roomId);
    typingByRoom.delete(socket.id);
    const messages = getMessages.all(roomId);
    socket.emit('room:history', { roomId, messages });
    const members = getMembers.all(roomId);
    socket.emit('room:members', { roomId, members });
    if (typeof ack === 'function') ack({ ok: true, room: getRoom.get(roomId), members });
  });

  socket.on('room:create-group', ({ name, memberIds }, ack) => {
    if (!me) return;
    const safeName = String(name || '').trim().slice(0, 50);
    if (!safeName) return;
    const ids = Array.from(new Set([me.id, ...(memberIds || []).filter((x) => typeof x === 'string' && x !== me.id)]));
    const id = 'g_' + Math.random().toString(36).slice(2, 10);
    insertRoomStmt.run(id, safeName, 'group', me.id, Date.now(), null);
    ids.forEach((uid) => addMember.run(id, uid, uid === me.id ? 'owner' : 'member', Date.now()));
    ids.forEach((uid) => io.to(uid).emit('room:added', getRoom.get(id)));
    emitMemberUpdate(id);
    if (typeof ack === 'function') ack({ ok: true, roomId: id });
  });

  socket.on('room:create-dm', ({ otherId }, ack) => {
    if (!me) return;
    if (!otherId || otherId === me.id) return;
    const existing = findExistingDM(me.id, otherId);
    let roomId;
    if (existing) {
      roomId = existing.id;
    } else {
      roomId = 'd_' + Math.random().toString(36).slice(2, 10);
      const other = onlineUsers.get([...onlineUsers.keys()].find((k) => onlineUsers.get(k).id === otherId)?.());
      const otherUser = getUser.get(otherId);
      const name = otherUser ? otherUser.name : 'Chat';
      insertRoomStmt.run(roomId, name, 'dm', me.id, Date.now(), otherUser?.avatar || null);
      addMember.run(roomId, me.id, 'member', Date.now());
      addMember.run(roomId, otherId, 'member', Date.now());
    }
    const room = getRoom.get(roomId);
    io.to(me.id).emit('room:added', room);
    io.to(otherId).emit('room:added', room);
    if (typeof ack === 'function') ack({ ok: true, roomId });
  });

  socket.on('room:add-member', ({ roomId, userId }, ack) => {
    if (!me) return;
    const room = getRoom.get(roomId);
    if (!room || room.type !== 'group') return;
    addMember.run(roomId, userId, 'member', Date.now());
    io.to(userId).emit('room:added', room);
    emitMemberUpdate(roomId);
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('message:send', ({ roomId, text }, ack) => {
    if (!me || !roomId || !text) return;
    if (!isMember(roomId, me.id)) return;
    const clean = String(text).trim().slice(0, 4000);
    if (!clean) return;
    const created_at = Date.now();
    const result = insertMessage.run(
      roomId, me.id, me.name, me.avatar, me.color, clean, created_at
    );
    const message = {
      id: result.lastInsertRowid,
      room_id: roomId,
      user_id: me.id,
      user_name: me.name,
      user_avatar: me.avatar,
      user_color: me.color,
      text: clean,
      created_at,
    };
    io.to(roomId).emit('message:new', message);
    if (typeof ack === 'function') ack({ ok: true, message });
  });

  socket.on('typing:start', ({ roomId }) => {
    if (!me || !roomId) return;
    socket.to(roomId).emit('typing:update', { roomId, user: userPublic(me), typing: true });
  });

  socket.on('typing:stop', ({ roomId }) => {
    if (!me || !roomId) return;
    socket.to(roomId).emit('typing:update', { roomId, user: userPublic(me), typing: false });
  });

  // ---- Calls (WebRTC signaling) ----
  socket.on('call:start', ({ to, kind, roomId }, ack) => {
    if (!me) return;
    const calleeSocket = [...onlineUsers.entries()].find(([, u]) => u.id === to)?.[0];
    if (!calleeSocket) {
      if (typeof ack === 'function') ack({ ok: false, error: 'user offline' });
      return;
    }
    const callId = 'c_' + Math.random().toString(36).slice(2, 10);
    calls.set(callId, { from: me.id, to, kind, roomId: roomId || null });
    io.to(calleeSocket).emit('call:incoming', {
      callId,
      from: userPublic(me),
      kind: kind === 'video' ? 'video' : 'voice',
    });
    if (typeof ack === 'function') ack({ ok: true, callId });
  });

  socket.on('call:accept', ({ callId }, ack) => {
    const call = calls.get(callId);
    if (!call || call.to !== me.id) return;
    const callerSocket = [...onlineUsers.entries()].find(([, u]) => u.id === call.from)?.[0];
    if (callerSocket) io.to(callerSocket).emit('call:accepted', { callId });
    if (typeof ack === 'function') ack({ ok: true });
  });

  socket.on('call:reject', ({ callId }) => {
    const call = calls.get(callId);
    if (!call) return;
    const callerSocket = [...onlineUsers.entries()].find(([, u]) => u.id === call.from)?.[0];
    if (callerSocket) io.to(callerSocket).emit('call:rejected', { callId });
    calls.delete(callId);
  });

  socket.on('call:signal', ({ callId, to, data }) => {
    const target = [...onlineUsers.entries()].find(([, u]) => u.id === to)?.[0];
    if (target) io.to(target).emit('call:signal', { callId, from: me.id, data });
  });

  socket.on('call:end', ({ callId }) => {
    const call = calls.get(callId);
    if (!call) return;
    const otherId = call.from === me.id ? call.to : call.from;
    const otherSocket = [...onlineUsers.entries()].find(([, u]) => u.id === otherId)?.[0];
    if (otherSocket) io.to(otherSocket).emit('call:ended', { callId });
    calls.delete(callId);
  });

  socket.on('disconnect', () => {
    if (me) {
      onlineUsers.delete(socket.id);
      for (const [callId, call] of calls.entries()) {
        if (call.from === me.id || call.to === me.id) {
          const otherId = call.from === me.id ? call.to : call.from;
          const otherSocket = [...onlineUsers.entries()].find(([, u]) => u.id === otherId)?.[0];
          if (otherSocket) io.to(otherSocket).emit('call:ended', { callId, reason: 'offline' });
          calls.delete(callId);
        }
      }
      broadcastPresence();
    }
  });
});

setInterval(() => {
  // Cleanup typing > 5s
  for (const [, sock] of io.of('/').sockets) {
    sock.rooms.forEach((r) => {
      if (r === sock.id) return;
    });
  }
}, 5000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Chatter v2 running on http://0.0.0.0:${PORT}`);
});
