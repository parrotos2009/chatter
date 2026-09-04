const COLORS = ['#00a884', '#25d366', '#128c7e', '#34b7f1', '#a991f7', '#fdc800', '#e74c3c', '#9b59b6', '#e67e22', '#1abc9c'];
const STORE_KEY = 'chatter.profile';
const SESSION_KEY = 'chatter.session';

let me = null;
let rooms = [];
let activeRoom = null;
let activeRoomMeta = null;
let messagesByRoom = new Map();
let membersByRoom = new Map();
let presence = new Map();
let socket = null;
let lastTypingSent = 0;
let localStream = null;
let peerConn = null;
let activeCall = null;
let callKind = 'voice';
let callTimer = null;
let callStartTime = 0;
let rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const fmtTime = (ts) => {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
};
const fmtDay = (ts) => {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yest)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
};
const fmtLastTime = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return fmtTime(ts);
  const diff = (today - d) / 86400000;
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const fmtCallTime = (ms) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (msg) => {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._to);
  t._to = setTimeout(() => t.classList.remove('show'), 2400);
};

const avatarOf = (user) => {
  if (user?.avatar) return { url: user.avatar, initial: '' };
  const initial = (user?.name || '?')[0]?.toUpperCase() || '?';
  return { url: null, initial, color: user?.color || '#00a884' };
};
const renderAvatar = (el, user) => {
  const a = avatarOf(user);
  if (a.url) {
    el.style.backgroundImage = `url(${a.url})`;
    el.textContent = '';
    el.style.background = `center/cover url(${a.url})`;
  } else {
    el.style.backgroundImage = '';
    el.style.background = user?.color || '#00a884';
    el.textContent = a.initial;
  }
};

function initColorRows() {
  ['#color-row', '#profile-color-row'].forEach((sel) => {
    const row = $(sel);
    if (!row) return;
    row.innerHTML = '';
    COLORS.forEach((c, i) => {
      const sw = document.createElement('div');
      sw.className = 'swatch' + (i === 0 ? ' selected' : '');
      sw.style.background = c;
      sw.dataset.color = c;
      sw.addEventListener('click', () => {
        row.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'));
        sw.classList.add('selected');
      });
      row.appendChild(sw);
    });
  });
}

function loadProfile() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
}
function saveProfile(p) { localStorage.setItem(STORE_KEY, JSON.stringify(p)); }
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function saveSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }

async function uploadAvatar(file) {
  const fd = new FormData();
  fd.append('avatar', file);
  const res = await fetch('/api/upload-avatar', { method: 'POST', body: fd });
  if (!res.ok) throw new Error('upload failed');
  return (await res.json()).url;
}

function setLoginAvatarPreview(url) {
  const drop = $('#avatar-drop');
  const img = $('#avatar-preview');
  if (url) { drop.classList.add('has-image'); img.src = url; }
  else { drop.classList.remove('has-image'); img.src = ''; }
}
function setProfileAvatarPreview(url) {
  const drop = $('#profile-avatar-drop');
  const img = $('#profile-avatar-preview');
  if (url) { drop.classList.add('has-image'); img.src = url; }
  else { drop.classList.remove('has-image'); img.src = ''; }
}

function renderMe() {
  if (!me) return;
  renderAvatar($('#me-avatar'), me);
  $('#me-name').textContent = me.name;
}

function renderRooms(filter = '') {
  const list = $('#room-list');
  list.innerHTML = '';
  const f = filter.trim().toLowerCase();
  const filtered = rooms.filter((r) => {
    if (!f) return true;
    if (r.name && r.name.toLowerCase().includes(f)) return true;
    if (r.id.toLowerCase().includes(f)) return true;
    return false;
  });
  if (filtered.length === 0) {
    list.innerHTML = `<div style="padding:20px;color:var(--muted);text-align:center;font-size:13px">No chats found</div>`;
    return;
  }
  filtered.forEach((r) => {
    const isPublic = r.type === 'public';
    const isGroup = r.type === 'group';
    const isDM = r.type === 'dm';
    let displayName = r.name || 'Chat';
    let avatarUser = { name: r.name || '?', avatar: r.avatar, color: '#00a884' };
    if (isDM) {
      const other = (membersByRoom.get(r.id) || []).find((m) => m.id !== me.id);
      if (other) {
        displayName = other.name;
        avatarUser = other;
      } else {
        displayName = r.name || 'Chat';
      }
    }
    const initials = displayName.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    const lastText = r.last_text ? (isDM ? '' : '') + r.last_text : (isPublic ? 'Public channel' : isGroup ? 'Group created' : 'Say hi!');
    const sub = r.last_text
      ? `${isDM && (membersByRoom.get(r.id) || []).find((m) => m.id !== me.id)?.id === r.last_user_id ? '' : ''}${lastText.length > 50 ? lastText.slice(0, 50) + '…' : lastText}`
      : (isPublic ? 'Public channel' : isGroup ? 'Group created' : 'Say hi!');
    const el = document.createElement('div');
    el.className = 'room-item' + (activeRoom === r.id ? ' active' : '');
    const av = document.createElement('div');
    av.className = 'avatar lg';
    if (avatarUser.avatar) {
      av.style.background = `center/cover url(${avatarUser.avatar})`;
    } else {
      av.style.background = avatarUser.color || '#00a884';
      av.textContent = initials;
    }
    el.appendChild(av);
    const meta = document.createElement('div');
    meta.className = 'room-meta';
    const time = r.last_at ? `<span class="room-time">${fmtLastTime(r.last_at)}</span>` : '';
    meta.innerHTML = `
      <div class="room-row">
        <div class="room-name">${escapeHtml(isGroup ? '👥 ' : isDM ? '' : '#')}${escapeHtml(displayName)}</div>
        ${time}
      </div>
      <div class="room-sub">
        <span>${escapeHtml(sub)}</span>
        <span class="room-badge ${r.unread > 0 ? 'show' : ''}">${r.unread > 0 ? (r.unread > 99 ? '99+' : r.unread) : ''}</span>
      </div>
    `;
    el.appendChild(meta);
    el.addEventListener('click', () => joinRoom(r.id));
    list.appendChild(el);
  });
}

function renderMessages() {
  const box = $('#messages');
  if (!activeRoom) {
    box.innerHTML = '';
    box.appendChild($('#empty-state'));
    return;
  }
  const msgs = messagesByRoom.get(activeRoom) || [];
  box.innerHTML = '';
  let lastDay = '';
  let lastUser = null;
  let lastTime = 0;
  msgs.forEach((m) => {
    const day = fmtDay(m.created_at);
    if (day !== lastDay) {
      const sep = document.createElement('div');
      sep.className = 'day-sep';
      sep.textContent = day;
      box.appendChild(sep);
      lastDay = day;
      lastUser = null;
    }
    const isOut = me && m.user_id === me.id;
    const grouped = lastUser === m.user_id && (m.created_at - lastTime) < 60_000;
    const row = document.createElement('div');
    row.className = 'msg-row ' + (isOut ? 'out' : 'in') + (grouped ? ' same-author' : '');
    if (grouped) {
      const sp = document.createElement('div');
      sp.className = 'msg-avatar-spacer';
      row.appendChild(sp);
    } else {
      const av = document.createElement('div');
      av.className = 'avatar msg-avatar';
      if (m.user_avatar) {
        av.style.background = `center/cover url(${m.user_avatar})`;
      } else {
        av.style.background = m.user_color || '#00a884';
        av.textContent = (m.user_name || '?')[0].toUpperCase();
      }
      row.appendChild(av);
    }
    const el = document.createElement('div');
    el.className = 'msg ' + (isOut ? 'out' : 'in');
    const showSender = !isOut && !grouped && activeRoomMeta?.type !== 'dm';
    el.innerHTML = `
      ${showSender ? `<div class="sender" style="color:${m.user_color}">${escapeHtml(m.user_name)}</div>` : ''}
      <div class="text">${escapeHtml(m.text)}</div>
      <div class="time">${fmtTime(m.created_at)}</div>
    `;
    row.appendChild(el);
    box.appendChild(row);
    lastUser = m.user_id;
    lastTime = m.created_at;
  });
  box.scrollTop = box.scrollHeight;
}

function renderTyping(roomId) {
  const el = $('#typing');
  if (!roomId) { el.innerHTML = ''; return; }
  const tState = (window._typing || {})[roomId] || {};
  const names = Object.values(tState).filter((u) => !me || u.id !== me.id).map((u) => u.name);
  if (names.length === 0) { el.innerHTML = ''; return; }
  let label;
  if (names.length === 1) label = `${names[0]} is typing`;
  else if (names.length === 2) label = `${names[0]} and ${names[1]} are typing`;
  else label = `${names.length} people are typing`;
  el.innerHTML = `${label} <span class="dot-anim"><span></span><span></span><span></span></span>`;
}

function renderPresence() {
  $('#presence-count').textContent = `${presence.size} online`;
}

function setConnStatus(state) {
  const el = $('#conn-status');
  if (state === 'online') { el.textContent = 'online'; el.classList.add('online'); }
  else if (state === 'connecting') { el.textContent = 'connecting…'; el.classList.remove('online'); }
  else { el.textContent = 'reconnecting…'; el.classList.remove('online'); }
}

function renderChatHead() {
  if (!activeRoomMeta) {
    $('#chat-title').textContent = 'Select a chat';
    $('#chat-sub').textContent = '—';
    $('#call-voice-btn').disabled = true;
    $('#call-video-btn').disabled = true;
    return;
  }
  const r = activeRoomMeta;
  let displayName = r.name || 'Chat';
  let sub = '';
  if (r.type === 'public') {
    displayName = `# ${r.name}`;
    sub = 'Public channel';
  } else if (r.type === 'dm') {
    const other = (membersByRoom.get(r.id) || []).find((m) => m.id !== me?.id);
    if (other) {
      displayName = other.name;
      sub = presence.get(other.id) ? 'online' : (other.bio || 'last seen recently');
    }
  } else if (r.type === 'group') {
    const mem = membersByRoom.get(r.id) || [];
    sub = `${mem.length} member${mem.length === 1 ? '' : 's'}`;
  }
  $('#chat-title').textContent = displayName;
  $('#chat-sub').textContent = sub;
  const canCall = r.type === 'dm' || r.type === 'group';
  $('#call-voice-btn').disabled = !canCall;
  $('#call-video-btn').disabled = !canCall;
  const av = $('#chat-avatar');
  let avUser = null;
  if (r.type === 'dm') avUser = (membersByRoom.get(r.id) || []).find((m) => m.id !== me?.id);
  else if (r.type === 'group') avUser = { name: r.name, color: '#00a884', avatar: r.avatar };
  else avUser = { name: r.name, color: '#00a884' };
  renderAvatar(av, avUser);
}

function renderRightPanel() {
  if (!activeRoomMeta) return;
  const r = activeRoomMeta;
  const body = $('#rp-body');
  body.innerHTML = '';
  const members = membersByRoom.get(r.id) || [];
  const headerSection = document.createElement('div');
  headerSection.className = 'rp-section';
  headerSection.style.textAlign = 'center';
  let avUser = { name: r.name, color: '#00a884' };
  if (r.type === 'dm') avUser = members.find((m) => m.id !== me?.id) || avUser;
  const av = document.createElement('div');
  av.className = 'avatar xl';
  av.style.margin = '0 auto 12px';
  renderAvatar(av, avUser);
  headerSection.appendChild(av);
  const nameDiv = document.createElement('div');
  nameDiv.style.fontWeight = '600';
  nameDiv.style.fontSize = '18px';
  nameDiv.textContent = r.type === 'dm' ? (avUser.name || 'Chat') : r.name;
  headerSection.appendChild(nameDiv);
  const subDiv = document.createElement('div');
  subDiv.style.color = 'var(--muted)';
  subDiv.style.fontSize = '13px';
  subDiv.style.marginTop = '4px';
  if (r.type === 'dm') subDiv.textContent = presence.get(avUser.id) ? 'online' : 'offline';
  else if (r.type === 'group') subDiv.textContent = `${members.length} members · created ${fmtLastTime(r.created_at)}`;
  else subDiv.textContent = 'Public channel';
  headerSection.appendChild(subDiv);
  if (r.type === 'dm' && avUser.bio) {
    const bio = document.createElement('div');
    bio.style.marginTop = '12px';
    bio.style.padding = '10px';
    bio.style.background = 'var(--panel-2)';
    bio.style.borderRadius = '8px';
    bio.style.fontSize = '13px';
    bio.textContent = avUser.bio;
    headerSection.appendChild(bio);
  }
  body.appendChild(headerSection);

  if (r.type === 'group' || r.type === 'dm') {
    const sec = document.createElement('div');
    sec.className = 'rp-section';
    const head = document.createElement('div');
    head.style.display = 'flex';
    head.style.justifyContent = 'space-between';
    head.style.alignItems = 'center';
    head.style.marginBottom = '8px';
    const h4 = document.createElement('h4');
    h4.textContent = `${members.length} member${members.length === 1 ? '' : 's'}`;
    h4.style.margin = '0';
    head.appendChild(h4);
    if (r.type === 'group') {
      const add = document.createElement('button');
      add.className = 'btn-ghost';
      add.textContent = '+ Add';
      add.style.padding = '4px 10px';
      add.style.fontSize = '12px';
      add.style.border = '1px solid var(--border)';
      add.style.borderRadius = '6px';
      add.addEventListener('click', () => openAddMember());
      head.appendChild(add);
    }
    sec.appendChild(head);
    members.forEach((m) => {
      const row = document.createElement('div');
      row.className = 'rp-member';
      const av2 = document.createElement('div');
      av2.className = 'avatar';
      renderAvatar(av2, m);
      row.appendChild(av2);
      const meta = document.createElement('div');
      meta.className = 'meta';
      const nm = document.createElement('div');
      nm.className = 'name';
      nm.textContent = m.name + (m.id === me?.id ? ' (you)' : '');
      meta.appendChild(nm);
      const sub = document.createElement('div');
      sub.className = 'sub';
      sub.textContent = presence.get(m.id) ? 'online' : (m.bio || 'offline');
      meta.appendChild(sub);
      row.appendChild(meta);
      sec.appendChild(row);
    });
    body.appendChild(sec);
  }
}

function joinRoom(id) {
  if (!me) return;
  if (activeRoom === id) return;
  activeRoom = id;
  activeRoomMeta = rooms.find((r) => r.id === id) || null;
  $('#msg-input').disabled = false;
  $('#send-btn').disabled = false;
  $('#msg-input').placeholder = activeRoomMeta?.type === 'dm' ? 'Message' : 'Type a message';
  socket.emit('room:join', id, (res) => {
    if (res && res.ok) {
      activeRoomMeta = res.room || activeRoomMeta;
      membersByRoom.set(id, res.members || []);
      renderRooms($('#search-input').value);
      renderMessages();
      renderChatHead();
      renderRightPanel();
      $('#msg-input').focus();
    }
  });
  if (window.innerWidth <= 900) $('.sidebar').classList.remove('show');
  $('#rightpanel') && $('.app').classList.remove('rp-open');
}

function openProfileDialog() {
  if (!me) return;
  $('#profile-name').value = me.name;
  $('#profile-bio').value = me.bio || '';
  setProfileAvatarPreview(me.avatar);
  $$('#profile-color-row .swatch').forEach((s) => s.classList.toggle('selected', s.dataset.color === me.color));
  $('#profile-dialog').showModal();
}

async function uploadAndSetAvatar(file, target) {
  if (!file) return;
  try {
    const url = await uploadAvatar(file);
    if (target === 'login') setLoginAvatarPreview(url);
    else setProfileAvatarPreview(url);
    return url;
  } catch (e) {
    toast('Upload failed');
  }
}

function startCall(kind, targetId) {
  if (activeCall) return;
  callKind = kind;
  socket.emit('call:start', { to: targetId, kind }, (res) => {
    if (!res.ok) { toast(res.error || 'Cannot call'); return; }
    activeCall = { callId: res.callId, with: targetId, outgoing: true, kind };
    showCallOverlay();
    $('#call-name').textContent = presence.get(targetId)?.name || 'Calling…';
    $('#call-status').textContent = 'ringing…';
  });
}

async function ensureMedia(kind) {
  const constraints = { audio: true, video: kind === 'video' };
  localStream = await navigator.mediaDevices.getUserMedia(constraints);
  $('#local-video').srcObject = localStream;
  $('#local-video').classList.toggle('hidden', kind !== 'video');
}

function showCallOverlay() {
  $('#call-overlay').classList.remove('hidden');
  $('#remote-video').classList.add('empty');
}
function hideCallOverlay() {
  $('#call-overlay').classList.add('hidden');
  $('#remote-video').srcObject = null;
  $('#local-video').srcObject = null;
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  if (peerConn) { peerConn.close(); peerConn = null; }
  activeCall = null;
  callStartTime = 0;
  if (callTimer) { clearInterval(callTimer); callTimer = null; }
  $('#call-status').textContent = '';
}

function createPeer(toId, kind) {
  peerConn = new RTCPeerConnection(rtcConfig);
  if (localStream) localStream.getTracks().forEach((t) => peerConn.addTrack(t, localStream));
  peerConn.ontrack = (e) => {
    if (e.streams[0]) {
      if (e.track.kind === 'video') {
        $('#remote-video').srcObject = e.streams[0];
        $('#remote-video').classList.remove('empty');
      } else {
        $('#remote-audio').srcObject = e.streams[0];
      }
    }
  };
  peerConn.onicecandidate = (e) => {
    if (e.candidate && activeCall) {
      socket.emit('call:signal', { callId: activeCall.callId, to: toId, data: { candidate: e.candidate } });
    }
  };
}

function login(profile) {
  socket = io({ transports: ['websocket', 'polling'] });
  setConnStatus('connecting');
  window._typing = {};

  socket.on('connect', () => {
    setConnStatus('online');
    socket.emit('user:join', profile, (res) => {
      if (!res.ok) return;
      me = res.user;
      saveSession({ id: me.id });
      saveProfile(profile);
      rooms = res.rooms;
      setMeAvatar();
      renderRooms();
      renderPresence();
      $('#login').style.display = 'none';
    });
  });

  socket.on('disconnect', () => setConnStatus('reconnecting'));
  socket.on('reconnect', () => setConnStatus('online'));

  socket.on('room:list', (list) => {
    rooms = list;
    renderRooms($('#search-input').value);
  });

  socket.on('room:added', (room) => {
    if (!rooms.find((r) => r.id === room.id)) {
      rooms.unshift(room);
      renderRooms($('#search-input').value);
      socket.emit('room:join', room.id);
    }
  });

  socket.on('room:members', ({ roomId, members }) => {
    membersByRoom.set(roomId, members);
    if (roomId === activeRoom) renderRightPanel();
    renderRooms($('#search-input').value);
  });

  socket.on('room:history', ({ roomId, messages }) => {
    messagesByRoom.set(roomId, messages);
    if (roomId === activeRoom) renderMessages();
  });

  socket.on('message:new', (m) => {
    const list = messagesByRoom.get(m.room_id) || [];
    list.push(m);
    messagesByRoom.set(m.room_id, list);
    if (m.room_id === activeRoom) renderMessages();
    else toast(`${presence.get(m.user_id)?.name || m.user_name}: ${m.text.slice(0, 40)}`);
    // Update last text locally
    const r = rooms.find((x) => x.id === m.room_id);
    if (r) { r.last_text = m.text; r.last_at = m.created_at; }
    renderRooms($('#search-input').value);
  });

  socket.on('typing:update', ({ roomId, user, typing }) => {
    if (!window._typing[roomId]) window._typing[roomId] = {};
    if (typing) window._typing[roomId][user.id] = user;
    else delete window._typing[roomId][user.id];
    if (roomId === activeRoom) renderTyping(roomId);
  });

  socket.on('presence:update', (list) => {
    presence = new Map(list.map((u) => [u.id, u]));
    renderPresence();
    if (activeRoomMeta) renderChatHead();
    renderRightPanel();
  });

  // --- Call events ---
  socket.on('call:incoming', ({ callId, from, kind }) => {
    if (activeCall) { socket.emit('call:reject', { callId }); return; }
    activeCall = { callId, with: from.id, outgoing: false, kind };
    callKind = kind;
    $('#ic-name').textContent = from.name;
    $('#ic-sub').textContent = `incoming ${kind} call…`;
    renderAvatar($('#ic-avatar'), from);
    $('#incoming-call').classList.remove('hidden');
  });

  socket.on('call:accepted', async ({ callId }) => {
    if (!activeCall || activeCall.callId !== callId) return;
    try {
      await ensureMedia(callKind);
      createPeer(activeCall.with, callKind);
      const offer = await peerConn.createOffer();
      await peerConn.setLocalDescription(offer);
      socket.emit('call:signal', { callId, to: activeCall.with, data: { sdp: offer } });
      $('#call-status').textContent = 'connecting…';
    } catch (e) { toast('Mic/camera permission denied'); endCall(); }
  });

  socket.on('call:rejected', () => {
    toast('Call declined');
    hideCallOverlay();
  });

  socket.on('call:signal', async ({ callId, from, data }) => {
    if (!activeCall || activeCall.callId !== callId) return;
    if (data.sdp) {
      try {
        if (!peerConn) {
          await ensureMedia(callKind);
          createPeer(from, callKind);
        }
        await peerConn.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === 'offer') {
          const answer = await peerConn.createAnswer();
          await peerConn.setLocalDescription(answer);
          socket.emit('call:signal', { callId, to: from, data: { sdp: answer } });
        }
        if (!callStartTime) { callStartTime = Date.now(); $('#call-status').textContent = '00:00'; callTimer = setInterval(() => $('#call-status').textContent = fmtCallTime(Date.now() - callStartTime), 1000); }
      } catch (e) { console.error(e); }
    } else if (data.candidate && peerConn) {
      try { await peerConn.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch {}
    }
  });

  socket.on('call:ended', () => {
    toast('Call ended');
    hideCallOverlay();
  });
}

function endCall() {
  if (activeCall) socket.emit('call:end', { callId: activeCall.callId });
  hideCallOverlay();
}

function openAddMember() {
  if (!activeRoom || activeRoomMeta?.type !== 'group') return;
  $('#addmember-search').value = '';
  renderAddMemberList('');
  $('#addmember-dialog').showModal();
}

function renderAddMemberList(filter) {
  const list = $('#addmember-list');
  list.innerHTML = '';
  const current = new Set((membersByRoom.get(activeRoom) || []).map((m) => m.id));
  const f = filter.trim().toLowerCase();
  const candidates = Array.from(presence.values())
    .filter((u) => !current.has(u.id))
    .filter((u) => !f || u.name.toLowerCase().includes(f));
  if (candidates.length === 0) {
    list.innerHTML = `<div style="padding:20px;color:var(--muted);text-align:center;font-size:13px">No one to add</div>`;
    return;
  }
  candidates.forEach((u) => {
    const row = document.createElement('div');
    row.className = 'user-list-item';
    const av = document.createElement('div');
    av.className = 'avatar';
    renderAvatar(av, u);
    row.appendChild(av);
    const meta = document.createElement('div');
    meta.style.flex = '1';
    meta.innerHTML = `<div>${escapeHtml(u.name)}</div><div style="font-size:12px;color:var(--muted)">online</div>`;
    row.appendChild(meta);
    row.addEventListener('click', () => {
      socket.emit('room:add-member', { roomId: activeRoom, userId: u.id }, (res) => {
        if (res?.ok) { toast(`Added ${u.name}`); $('#addmember-dialog').close(); }
      });
    });
    list.appendChild(row);
  });
}

function openNewDM() {
  $('#dm-search').value = '';
  renderDMList('');
  $('#dm-dialog').showModal();
}
function renderDMList(filter) {
  const list = $('#dm-list');
  list.innerHTML = '';
  const f = filter.trim().toLowerCase();
  const candidates = Array.from(presence.values())
    .filter((u) => !me || u.id !== me.id)
    .filter((u) => !f || u.name.toLowerCase().includes(f));
  if (candidates.length === 0) {
    list.innerHTML = `<div style="padding:20px;color:var(--muted);text-align:center;font-size:13px">No one online</div>`;
    return;
  }
  candidates.forEach((u) => {
    const row = document.createElement('div');
    row.className = 'user-list-item';
    const av = document.createElement('div');
    av.className = 'avatar';
    renderAvatar(av, u);
    row.appendChild(av);
    const meta = document.createElement('div');
    meta.style.flex = '1';
    meta.innerHTML = `<div>${escapeHtml(u.name)}</div><div style="font-size:12px;color:var(--muted)">${u.bio || 'online'}</div>`;
    row.appendChild(meta);
    row.addEventListener('click', () => {
      socket.emit('room:create-dm', { otherId: u.id }, (res) => {
        if (res?.ok) { $('#dm-dialog').close(); joinRoom(res.roomId); }
      });
    });
    list.appendChild(row);
  });
}

function openNewGroup() {
  $('#group-name').value = '';
  $('#group-search').value = '';
  window._groupSelected = new Set();
  renderGroupList('');
  $('#group-dialog').showModal();
}
function renderGroupList(filter) {
  const list = $('#group-list');
  list.innerHTML = '';
  const f = filter.trim().toLowerCase();
  const candidates = Array.from(presence.values())
    .filter((u) => !me || u.id !== me.id)
    .filter((u) => !f || u.name.toLowerCase().includes(f));
  if (candidates.length === 0) {
    list.innerHTML = `<div style="padding:20px;color:var(--muted);text-align:center;font-size:13px">No one online</div>`;
    return;
  }
  candidates.forEach((u) => {
    const sel = window._groupSelected.has(u.id);
    const row = document.createElement('div');
    row.className = 'user-list-item' + (sel ? ' selected' : '');
    const av = document.createElement('div');
    av.className = 'avatar';
    renderAvatar(av, u);
    row.appendChild(av);
    const meta = document.createElement('div');
    meta.style.flex = '1';
    meta.innerHTML = `<div>${escapeHtml(u.name)}</div><div style="font-size:12px;color:var(--muted)">online</div>`;
    row.appendChild(meta);
    const check = document.createElement('div');
    check.className = 'check';
    check.textContent = sel ? '✓' : '';
    row.appendChild(check);
    row.addEventListener('click', () => {
      if (sel) window._groupSelected.delete(u.id); else window._groupSelected.add(u.id);
      renderGroupList($('#group-search').value);
    });
    list.appendChild(row);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initColorRows();
  let pendingAvatar = null;

  $('#avatar-drop').addEventListener('click', () => $('#avatar-file').click());
  $('#avatar-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const url = await uploadAndSetAvatar(f, 'login');
    if (url) pendingAvatar = url;
  });
  $('#profile-avatar-drop').addEventListener('click', () => $('#profile-avatar-file').click());
  $('#profile-avatar-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const url = await uploadAndSetAvatar(f, 'profile');
    if (url) pendingAvatar = url;
  });

  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#login-name').value.trim();
    const color = document.querySelector('#color-row .swatch.selected')?.dataset.color || COLORS[0];
    const bio = $('#login-bio').value.trim();
    if (!name) return;
    const session = loadSession();
    login({ id: session?.id, name, avatar: pendingAvatar, color, bio });
  });

  $('#search-input').addEventListener('input', (e) => renderRooms(e.target.value));
  $('#dm-search').addEventListener('input', (e) => renderDMList(e.target.value));
  $('#group-search').addEventListener('input', (e) => renderGroupList(e.target.value));
  $('#addmember-search').addEventListener('input', (e) => renderAddMemberList(e.target.value));

  $('#me-chip').addEventListener('click', openProfileDialog);
  $('#logout-btn').addEventListener('click', () => {
    localStorage.removeItem(SESSION_KEY);
    location.reload();
  });
  $('#new-dm-btn').addEventListener('click', openNewDM);
  $('#new-group-btn').addEventListener('click', openNewGroup);

  $('#chat-info-btn').addEventListener('click', () => $('.app').classList.toggle('rp-open'));
  $('#rp-close').addEventListener('click', () => $('.app').classList.remove('rp-open'));
  $('#chat-head-left').addEventListener('click', () => {
    if (window.innerWidth <= 900) $('.sidebar').classList.toggle('show');
  });

  $('#profile-form').addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'confirm') return;
    e.preventDefault();
    const name = $('#profile-name').value.trim();
    const color = document.querySelector('#profile-color-row .swatch.selected')?.dataset.color || me.color;
    const bio = $('#profile-bio').value.trim();
    const avatar = pendingAvatar !== undefined ? pendingAvatar : me.avatar;
    socket.emit('user:update', { name, color, bio, avatar }, (res) => {
      if (res?.ok) {
        me = res.user;
        saveProfile({ name, color, bio, avatar: me.avatar });
        renderMe();
        renderRooms($('#search-input').value);
        if (activeRoom) renderChatHead();
        $('#profile-dialog').close();
        pendingAvatar = undefined;
      }
    });
  });

  $('#call-voice-btn').addEventListener('click', () => {
    if (!activeRoomMeta) return;
    if (activeRoomMeta.type === 'dm') {
      const other = (membersByRoom.get(activeRoom) || []).find((m) => m.id !== me.id);
      if (other) startCall('voice', other.id);
    } else {
      toast('Open a 1-on-1 chat to call');
    }
  });
  $('#call-video-btn').addEventListener('click', () => {
    if (!activeRoomMeta) return;
    if (activeRoomMeta.type === 'dm') {
      const other = (membersByRoom.get(activeRoom) || []).find((m) => m.id !== me.id);
      if (other) startCall('video', other.id);
    } else {
      toast('Open a 1-on-1 chat to video call');
    }
  });
  $('#ic-accept').addEventListener('click', () => {
    if (!activeCall) return;
    $('#incoming-call').classList.add('hidden');
    showCallOverlay();
    $('#call-name').textContent = presence.get(activeCall.with)?.name || 'In call';
    socket.emit('call:accept', { callId: activeCall.callId });
  });
  $('#ic-reject').addEventListener('click', () => {
    if (activeCall) socket.emit('call:reject', { callId: activeCall.callId });
    $('#incoming-call').classList.add('hidden');
    activeCall = null;
  });
  $('#cc-end').addEventListener('click', endCall);
  $('#cc-mute').addEventListener('click', () => {
    if (!localStream) return;
    const track = localStream.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; $('#cc-mute').classList.toggle('muted', !track.enabled); }
  });
  $('#cc-cam').addEventListener('click', () => {
    if (!localStream) return;
    const track = localStream.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; $('#cc-cam').classList.toggle('off', !track.enabled); }
  });

  $('#group-form').addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'confirm') return;
    const name = $('#group-name').value.trim();
    if (!name) { e.preventDefault(); return; }
    const memberIds = Array.from(window._groupSelected || []);
    socket.emit('room:create-group', { name, memberIds }, (res) => {
      if (res?.ok) { $('#group-dialog').close(); joinRoom(res.roomId); }
    });
  });

  $('#composer').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!activeRoom) return;
    const input = $('#msg-input');
    const text = input.value.trim();
    if (!text) return;
    socket.emit('message:send', { roomId: activeRoom, text });
    socket.emit('typing:stop', { roomId: activeRoom });
    input.value = '';
  });

  $('#msg-input').addEventListener('input', () => {
    if (!activeRoom) return;
    const now = Date.now();
    if (now - lastTypingSent > 1500) {
      socket.emit('typing:start', { roomId: activeRoom });
      lastTypingSent = now;
    }
    clearTimeout(window._typingTO);
    window._typingTO = setTimeout(() => socket.emit('typing:stop', { roomId: activeRoom }), 1500);
  });

  $('#emoji-btn').addEventListener('click', () => {
    const input = $('#msg-input');
    const emojis = ['😀','😂','😍','🥰','😎','🤔','👍','🙏','🎉','❤️','🔥','✨','👀','💯','🚀','🍕','☕','🌹','😴','🤗'];
    const e = emojis[Math.floor(Math.random() * emojis.length)];
    input.value += e;
    input.focus();
  });

  // Auto-resume session
  const sess = loadSession();
  if (sess?.id) {
    const profile = loadProfile() || {};
    login({ id: sess.id, name: profile.name || 'You', avatar: profile.avatar, color: profile.color || COLORS[0], bio: profile.bio });
  }
});
