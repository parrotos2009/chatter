import { useEffect, useMemo, useState } from "react";
import { CheckCheck, FileText, Image as ImageIcon, Link2, MessageCircle, MoreHorizontal, Paperclip, Phone, Search, Send, Settings2, Smile, Users, Video, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Message = { id: number; clientId: string; displayName: string; text: string | null; attachmentUrl: string | null; attachmentName: string | null; attachmentType: string | null; createdAt: Date | string };
const roomId = "lobby";
const colors = ["coral", "violet", "blue", "gold", "mint"];

function initials(name: string) { return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function colorFor(id: string) { return colors[Array.from(id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length]; }
function timeOf(value: Date | string) { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

export default function Home() {
  const [clientId] = useState(() => { const saved = localStorage.getItem("chatter-client-id"); if (saved) return saved; const id = crypto.randomUUID(); localStorage.setItem("chatter-client-id", id); return id; });
  const [displayName, setDisplayName] = useState(() => localStorage.getItem("chatter-display-name") || "Alex Morgan");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesQuery = trpc.chat.recent.useQuery({ roomId }, { refetchInterval: 1800, staleTime: 900 });
  const presenceQuery = trpc.chat.activePresence.useQuery({ roomId }, { refetchInterval: 2500, staleTime: 1000 });
  const sendMessage = trpc.chat.send.useMutation({ onSuccess: () => messagesQuery.refetch() });
  const updatePresence = trpc.chat.presence.useMutation();
  const uploadFile = trpc.chat.upload.useMutation();
  const messages = (messagesQuery.data ?? []) as Message[];
  const people = presenceQuery.data ?? [];
  const visibleMessages = useMemo(() => search.trim() ? messages.filter((message) => `${message.displayName} ${message.text ?? ""} ${message.attachmentName ?? ""}`.toLowerCase().includes(search.toLowerCase())) : messages, [messages, search]);

  useEffect(() => {
    const heartbeat = window.setInterval(() => updatePresence.mutate({ roomId, clientId, displayName, isTyping }), 3000);
    updatePresence.mutate({ roomId, clientId, displayName, isTyping: false });
    return () => window.clearInterval(heartbeat);
  }, [clientId, displayName]);

  useEffect(() => {
    const idle = window.setTimeout(() => setIsTyping(false), 1800);
    return () => window.clearTimeout(idle);
  }, [draft]);

  function saveProfile() { localStorage.setItem("chatter-display-name", displayName.trim() || "Anonymous"); setDisplayName(displayName.trim() || "Anonymous"); setProfileOpen(false); toast.success("Profile saved"); }
  function submit(event?: React.FormEvent) { event?.preventDefault(); const text = draft.trim(); if (!text) return; sendMessage.mutate({ roomId, clientId, displayName, text }); setDraft(""); setIsTyping(false); }
  function onDraft(value: string) { setDraft(value); setIsTyping(Boolean(value)); updatePresence.mutate({ roomId, clientId, displayName, isTyping: Boolean(value) }); }
  function shareFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => { try { const base64 = String(reader.result).split(",")[1] || ""; const uploaded = await uploadFile.mutateAsync({ clientId, fileName: file.name, mimeType: file.type, base64 }); await sendMessage.mutateAsync({ roomId, clientId, displayName, attachmentUrl: uploaded.url, attachmentName: uploaded.fileName, attachmentType: uploaded.mimeType, text: "Shared a file" }); toast.success("File shared with the room"); messagesQuery.refetch(); } catch { toast.error("That file could not be shared"); } };
    reader.readAsDataURL(file);
  }

  return <div className="chatter-app dark-mode">
    <a className="skip-link" href="#room">Skip to chat room</a>
    <header className="topbar"><div className="brand-lockup"><div className="brand-mark"><MessageCircle size={17} /></div><span>CHATTER</span><span className="brand-beta">LIVE ROOM</span></div><div className="topbar-actions"><div className="live-pill"><i /> {people.length || 1} online</div><button className="profile-chip" onClick={() => setProfileOpen(true)} aria-label="Edit profile"><span className="avatar avatar-sm avatar-coral">{initials(displayName)}</span><span className="profile-chip-copy"><strong>{displayName}</strong><small>guest profile</small></span><MoreHorizontal size={16} /></button></div></header>
    <main className="app-body">
      <nav className="rail" aria-label="Primary navigation"><button className="rail-button active" aria-label="Open chat room"><MessageCircle size={20} /><span>Room</span></button><button className="rail-button" onClick={() => toast("This room is the shared space for everyone online")} aria-label="View members"><Users size={20} /><span>People</span><em>{people.length}</em></button><div className="rail-spacer" /><button className="rail-button" onClick={() => setProfileOpen(true)} aria-label="Open profile settings"><Settings2 size={20} /><span>Profile</span></button></nav>
      <aside className="room-sidebar"><div className="list-heading"><div><p className="eyebrow">Open community</p><h1>Chat room</h1></div><span className="room-live"><i /> live</span></div><div className="room-card"><div className="room-icon"><MessageCircle size={20} /></div><div><strong>Lobby</strong><span>Anyone with the link can join</span></div><button onClick={() => { navigator.clipboard?.writeText(window.location.href); toast.success("Room link copied"); }} aria-label="Copy room link"><Link2 size={16} /></button></div><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this room" aria-label="Search this room" /></label><div className="member-heading"><span>People here</span><b>{people.length}</b></div><div className="member-list">{people.map((person) => <div className="member-row" key={person.clientId}><span className="member-avatar-wrap"><span className={`avatar avatar-sm avatar-${colorFor(person.clientId)}`}>{initials(person.displayName)}</span><i className="presence-dot" /></span><span><strong>{person.displayName}{person.clientId === clientId ? " (you)" : ""}</strong><small>{person.isTyping ? "typing…" : "online now"}</small></span></div>)}{!people.length && <p className="muted-copy">You’re the first one here.</p>}</div><div className="sidebar-note"><span className="status-dot" /> Messages are shared live with everyone in this room.</div></aside>
      <section className="chat-panel" id="room"><header className="chat-header"><div className="room-title"><span className="room-icon small"><MessageCircle size={18} /></span><span><strong>Lobby</strong><small><span className="online-pulse" /> {people.length > 1 ? `${people.length} people chatting` : "Waiting for people to join"}</small></span></div><div className="chat-actions"><button className="icon-button" aria-label="Start video call" onClick={() => toast("Calls are coming next")}><Video size={18} /></button><button className="icon-button" aria-label="Start voice call" onClick={() => toast("Calls are coming next")}><Phone size={18} /></button><button className="icon-button" aria-label="Open room details" onClick={() => setDetailsOpen(true)}><MoreHorizontal size={19} /></button></div></header><div className="chat-canvas"><div className="day-divider"><span>Shared room</span></div><div className="message-stream">{visibleMessages.map((message) => { const mine = message.clientId === clientId; return <div className={`message-row ${mine ? "mine" : "theirs"}`} key={message.id}><div className="message-author"><span className={`avatar avatar-xs avatar-${colorFor(message.clientId)}`}>{initials(message.displayName)}</span><strong>{mine ? "You" : message.displayName}</strong><time>{timeOf(message.createdAt)}</time></div><div className="message-bubble">{message.attachmentUrl && <a className="attachment-card" href={message.attachmentUrl} target="_blank" rel="noreferrer"><span className="attachment-icon">{message.attachmentType?.startsWith("image/") ? <ImageIcon size={17} /> : <FileText size={17} />}</span><span><strong>{message.attachmentName || "Shared file"}</strong><small>Open shared file</small></span></a>}<p>{message.text}</p>{mine && <span className="message-meta"><CheckCheck size={13} /></span>}</div></div>})}{isTyping && <div className="typing-row"><span className="typing-pill"><i /><i /><i /></span><span className="typing-label">You are typing</span></div>}{people.filter((person) => person.clientId !== clientId && person.isTyping).map((person) => <div className="typing-row" key={`typing-${person.clientId}`}><span className="typing-pill"><i /><i /><i /></span><span className="typing-label">{person.displayName} is typing</span></div>)}{!visibleMessages.length && <div className="empty-room"><Users size={24} /><strong>Start the conversation</strong><span>Say hi — everyone in the room will see it.</span></div>}</div><div className="chat-note"><Link2 size={14} /> Files and messages are shared with everyone in Lobby.</div></div><div className="composer-wrap"><form className="composer" onSubmit={submit}><label className="attach-button" aria-label="Share a file"><Paperclip size={19} /><input type="file" onChange={(event) => shareFile(event.target.files?.[0])} /></label><button className="icon-button" type="button" aria-label="Add emoji" onClick={() => onDraft(`${draft} ✨`)}><Smile size={19} /></button><input className="composer-input" value={draft} onChange={(event) => onDraft(event.target.value)} placeholder="Message everyone" aria-label="Message everyone" /><button className="send-button" type="submit" disabled={sendMessage.isPending} aria-label="Send message"><Send size={17} /></button></form><div className="composer-hint"><span>Press Enter to send</span><span>Open room · no login needed</span></div></div></section>
    </main>
    {detailsOpen && <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && setDetailsOpen(false)}><section className="details-modal"><div className="modal-top"><div><p className="eyebrow">Room details</p><h2>Lobby</h2></div><button className="icon-button" onClick={() => setDetailsOpen(false)} aria-label="Close room details"><X size={18} /></button></div><div className="room-detail-hero"><div className="room-icon"><MessageCircle size={22} /></div><strong>Chat with anyone online</strong><span>Share the room link and start talking instantly.</span></div><div className="detail-line"><Users size={16} /><span>{people.length} people online right now</span></div><div className="detail-line"><Paperclip size={16} /><span>Files up to 8 MB can be shared</span></div><button className="primary-button" onClick={() => { navigator.clipboard?.writeText(window.location.href); toast.success("Room link copied"); }}>Copy room link</button></section></div>}
    {profileOpen && <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && setProfileOpen(false)}><section className="profile-modal"><div className="modal-top"><div><p className="eyebrow">Guest profile</p><h2>How should people see you?</h2></div><button className="icon-button" onClick={() => setProfileOpen(false)} aria-label="Close profile"><X size={18} /></button></div><div className="profile-preview"><span className="avatar avatar-xl avatar-coral">{initials(displayName)}</span><div><strong>{displayName || "Anonymous"}</strong><span>Visible in Lobby</span></div></div><label className="form-label">Display name<input value={displayName} maxLength={120} onChange={(event) => setDisplayName(event.target.value)} /></label><p className="modal-note">Your name is saved on this device. No login is required.</p><button className="primary-button" onClick={saveProfile}>Save profile</button></section></div>}
  </div>;
}
