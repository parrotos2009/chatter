import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Link2,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Settings2,
  Smile,
  Sparkles,
  Star,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Contact = {
  id: string;
  name: string;
  handle: string;
  initials: string;
  tone: string;
  status: string;
  preview: string;
  time: string;
  unread?: number;
  online?: boolean;
  pinned?: boolean;
};

type ChatMessage = {
  id: number;
  text: string;
  time: string;
  mine?: boolean;
  attachment?: { type: "image" | "file"; label: string };
};

const initialContacts: Contact[] = [
  { id: "maya", name: "Maya Chen", handle: "@mayachen", initials: "MC", tone: "coral", status: "online now", preview: "The launch notes look great ✨", time: "10:42", unread: 2, online: true, pinned: true },
  { id: "studio", name: "Chatter Studio", handle: "@chatterstudio", initials: "CS", tone: "violet", status: "3 members", preview: "Jordan shared a file", time: "09:18", unread: 5, pinned: true },
  { id: "sam", name: "Sam Rivera", handle: "@samrivera", initials: "SR", tone: "blue", status: "last seen today at 08:42", preview: "Voice note · 0:18", time: "Yesterday" },
  { id: "nora", name: "Nora Okafor", handle: "@norao", initials: "NO", tone: "gold", status: "online now", preview: "See you at the studio", time: "Mon", online: true },
  { id: "ideas", name: "Ideas & Inspiration", handle: "@ideas", initials: "I&", tone: "mint", status: "8 people", preview: "You: saved that link", time: "Sun" },
];

const seedMessages: Record<string, ChatMessage[]> = {
  maya: [
    { id: 1, text: "Hey! I pulled together the launch notes for tomorrow.", time: "10:37" },
    { id: 2, text: "The launch notes look great ✨", time: "10:42", mine: true },
    { id: 3, text: "Especially the bit about keeping the first release focused. That feels very us.", time: "10:43" },
  ],
  studio: [
    { id: 4, text: "Welcome to the new Chatter Studio space. Drop anything here — links, files, voice notes, ideas.", time: "09:08" },
    { id: 5, text: "Jordan shared a file", time: "09:18", attachment: { type: "file", label: "launch-notes-v3.pdf" } },
  ],
  sam: [{ id: 6, text: "Voice note · 0:18", time: "08:42", attachment: { type: "file", label: "voice-note.m4a" } }],
  nora: [{ id: 7, text: "See you at the studio", time: "11:12" }],
  ideas: [{ id: 8, text: "You: saved that link", time: "18:22" }],
};

const quickReplies = ["Sounds good", "Send me the link", "I’ll check it now"];

export default function Home() {
  const [contacts, setContacts] = useState(initialContacts);
  const [selectedId, setSelectedId] = useState("maya");
  const [messages, setMessages] = useState(seedMessages);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [activeNav, setActiveNav] = useState<"chats" | "saved" | "profile">("chats");
  const [showDetails, setShowDetails] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showMobileList, setShowMobileList] = useState(true);
  const [profileName, setProfileName] = useState(() => localStorage.getItem("chatter-profile-name") || "Alex Morgan");
  const [profileHandle, setProfileHandle] = useState(() => localStorage.getItem("chatter-profile-handle") || "@alexmorgan");
  const [profileOpen, setProfileOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const askAI = trpc.ai.ask.useMutation();

  const selected = contacts.find((contact) => contact.id === selectedId) ?? contacts[0];
  const visibleContacts = useMemo(
    () => contacts.filter((contact) => `${contact.name} ${contact.handle} ${contact.preview}`.toLowerCase().includes(query.toLowerCase())),
    [contacts, query],
  );
  const selectedMessages = messages[selected.id] ?? [];

  useEffect(() => {
    localStorage.setItem("chatter-messages", JSON.stringify(messages));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedId]);

  useEffect(() => {
    const stored = localStorage.getItem("chatter-messages");
    if (stored) {
      try { setMessages(JSON.parse(stored)); } catch { /* keep seed state */ }
    }
  }, []);

  function selectContact(id: string) {
    setSelectedId(id);
    setShowMobileList(false);
    setContacts((current) => current.map((contact) => contact.id === id ? { ...contact, unread: 0 } : contact));
  }

  function sendMessage(text = draft) {
    const value = text.trim();
    if (!value) return;
    const next: ChatMessage = { id: Date.now(), text: value, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), mine: true };
    setMessages((current) => ({ ...current, [selected.id]: [...(current[selected.id] ?? []), next] }));
    setContacts((current) => current.map((contact) => contact.id === selected.id ? { ...contact, preview: value, time: "now" } : contact));
    setDraft("");
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    const type = file.type.startsWith("image/") ? "image" : "file";
    const next: ChatMessage = { id: Date.now(), text: type === "image" ? "Shared an image" : "Shared a file", time: "now", mine: true, attachment: { type, label: file.name } };
    setMessages((current) => ({ ...current, [selected.id]: [...(current[selected.id] ?? []), next] }));
    toast.success(`${file.name} ready to share`);
  }

  async function askSmartAI(prompt: string) {
    setShowAI(true);
    try {
      const result = await askAI.mutateAsync({ prompt, context: selectedMessages.slice(-6).map((message) => `${message.mine ? "Me" : selected.name}: ${message.text}`).join("\n") });
      setMessages((current) => ({ ...current, [selected.id]: [...(current[selected.id] ?? []), { id: Date.now(), text: result.text, time: "now" }] }));
    } catch {
      toast.error("AI is taking a breather — try again in a moment.");
    }
  }

  function saveProfile() {
    localStorage.setItem("chatter-profile-name", profileName);
    localStorage.setItem("chatter-profile-handle", profileHandle);
    setProfileOpen(false);
    toast.success("Profile saved locally");
  }

  return (
    <div className="chatter-app">
      <a className="skip-link" href="#conversation">Skip to conversation</a>
      <header className="topbar">
        <div className="brand-lockup"><div className="brand-mark"><MessageCircle size={17} strokeWidth={2.5} /></div><span>CHATTER</span><span className="brand-beta">BETA</span></div>
        <div className="topbar-actions">
          <button className="icon-button top-action" aria-label="Open AI assistant" onClick={() => setShowAI(true)}><Sparkles size={18} /></button>
          <button className="profile-chip" onClick={() => setProfileOpen(true)} aria-label="Edit your profile"><span className="avatar avatar-sm avatar-coral">AM</span><span className="profile-chip-copy"><strong>{profileName}</strong><small>{profileHandle}</small></span><ChevronDown size={14} /></button>
        </div>
      </header>

      <main className="app-body">
        <nav className="rail" aria-label="Primary navigation">
          <button className={`rail-button ${activeNav === "chats" ? "active" : ""}`} onClick={() => { setActiveNav("chats"); setShowMobileList(true); }} aria-label="Chats"><MessageCircle size={20} /><span>Chats</span><em>{contacts.reduce((sum, contact) => sum + (contact.unread ?? 0), 0)}</em></button>
          <button className={`rail-button ${activeNav === "saved" ? "active" : ""}`} onClick={() => { setActiveNav("saved"); toast("Saved items are coming next"); }} aria-label="Saved items"><Star size={20} /><span>Saved</span></button>
          <div className="rail-spacer" />
          <button className="rail-button" onClick={() => setProfileOpen(true)} aria-label="Open profile settings"><Settings2 size={20} /><span>Settings</span></button>
        </nav>

        <aside className={`conversation-list ${showMobileList ? "mobile-visible" : ""}`} aria-label="Your conversations">
          <div className="list-heading"><div><p className="eyebrow">Your space</p><h1>Conversations</h1></div><button className="new-chat-button" aria-label="Start a new chat" onClick={() => toast("New chat flow is ready for the next pass")}><Plus size={18} /></button></div>
          <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" aria-label="Search conversations" /></label>
          <div className="list-filter"><span>All chats</span><button aria-label="Filter conversations"><MoreHorizontal size={17} /></button></div>
          <div className="contact-list">
            {visibleContacts.map((contact) => <button key={contact.id} className={`contact-row ${selected.id === contact.id ? "selected" : ""}`} onClick={() => selectContact(contact.id)}>
              <span className={`avatar avatar-md avatar-${contact.tone}`}>{contact.initials}</span>
              <span className="contact-copy"><span className="contact-topline"><strong>{contact.name}</strong><time>{contact.time}</time></span><span className="contact-bottomline"><span>{contact.preview}</span>{contact.unread ? <b>{contact.unread}</b> : null}</span></span>
            </button>)}
            {!visibleContacts.length && <div className="empty-search"><Search size={20} /><p>No chats found</p><span>Try a different name or phrase.</span></div>}
          </div>
          <div className="list-footer"><span className="status-dot" /> <span>End-to-end ready</span><span className="footer-divider" /> <span>Local preview</span></div>
        </aside>

        <section className={`chat-panel ${showMobileList ? "mobile-hidden" : ""}`} id="conversation">
          <header className="chat-header">
            <button className="mobile-back" onClick={() => setShowMobileList(true)} aria-label="Back to conversations"><ArrowLeft size={20} /></button>
            <button className="chat-person" onClick={() => setShowDetails((value) => !value)}><span className={`avatar avatar-md avatar-${selected.tone}`}>{selected.initials}</span><span><strong>{selected.name}</strong><small><span className="online-pulse" /> {selected.status}</small></span></button>
            <div className="chat-actions"><button className="icon-button" aria-label="Start video call" onClick={() => toast("Video calls are coming next")}><Video size={19} /></button><button className="icon-button" aria-label="Start voice call" onClick={() => toast("Voice calls are coming next")}><Phone size={19} /></button><button className="icon-button" aria-label="Open chat details" onClick={() => setShowDetails((value) => !value)}><MoreHorizontal size={20} /></button></div>
          </header>

          <div className="chat-canvas">
            <div className="day-divider"><span>Today</span></div>
            <div className="message-stream">
              {selectedMessages.map((message) => <div key={message.id} className={`message-row ${message.mine ? "mine" : "theirs"}`}><div className={`message-bubble ${message.attachment ? "has-attachment" : ""}`}>{message.attachment && <div className={`attachment-card attachment-${message.attachment.type}`}><span className="attachment-icon">{message.attachment.type === "image" ? <ImageIcon size={18} /> : <FileText size={18} />}</span><span><strong>{message.attachment.label}</strong><small>{message.attachment.type === "image" ? "Image" : "Tap to preview"}</small></span><button aria-label={`Open ${message.attachment.label}`} onClick={() => toast("Preview is ready for the sharing pass")}><ArrowLeft size={16} /></button></div>}<p>{message.text}</p><span className="message-meta">{message.time}{message.mine && <CheckCheck size={14} />}</span></div></div>)}
              <div className="typing-row"><span className="typing-avatar avatar avatar-xs avatar-coral">MC</span><span className="typing-pill"><i /><i /><i /></span><span className="typing-label">Maya is typing</span></div>
              <div ref={endRef} />
            </div>
            <div className="chat-note"><Link2 size={14} /> <span>Links, files, photos, and voice notes stay together in your chat memory.</span></div>
          </div>

          <div className="composer-wrap">
            <div className="quick-replies">{quickReplies.map((reply) => <button key={reply} onClick={() => sendMessage(reply)}>{reply}</button>)}</div>
            <form className="composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
              <label className="attach-button" aria-label="Share a file"><Paperclip size={20} /><input type="file" onChange={(event) => handleFile(event.target.files?.[0])} /></label>
              <button className="icon-button composer-emoji" type="button" aria-label="Add emoji" onClick={() => setDraft((value) => `${value} ✨`)}><Smile size={20} /></button>
              <input className="composer-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Message ${selected.name.split(" ")[0]}`} aria-label={`Message ${selected.name}`} />
              <button className="send-button" type="submit" aria-label="Send message"><Send size={18} /></button>
            </form>
            <div className="composer-hint"><span><span className="keyboard-key">⌘</span> + <span className="keyboard-key">K</span> to search</span><span>Private by default <span className="privacy-dot" /></span></div>
          </div>
        </section>

        {showDetails && <aside className="details-panel"><div className="details-header"><span>Chat details</span><button className="icon-button" onClick={() => setShowDetails(false)} aria-label="Close chat details"><X size={18} /></button></div><div className="details-profile"><span className={`avatar avatar-lg avatar-${selected.tone}`}>{selected.initials}</span><h2>{selected.name}</h2><p>{selected.handle}</p><span className="detail-status"><span className="status-dot" /> {selected.status}</span></div><div className="detail-section"><p className="eyebrow">Shared space</p><div className="detail-stat"><strong>24</strong><span>messages saved</span></div><div className="detail-stat"><strong>08</strong><span>shared files</span></div></div><button className="detail-action" onClick={() => toast("Chat search is coming next")}><Search size={17} /> Search in conversation</button><button className="detail-action" onClick={() => toast("Notifications muted for this preview")}><Archive size={17} /> Mute notifications</button></aside>}
      </main>

      {showAI && <div className="ai-drawer"><div className="ai-heading"><div><span className="ai-kicker"><Sparkles size={13} /> Chatter intelligence</span><h2>Your smart sidekick</h2></div><button className="icon-button" onClick={() => setShowAI(false)} aria-label="Close smart assistant"><X size={18} /></button></div><div className="ai-card"><div className="ai-orb"><Bot size={22} /></div><div><strong>Ask anything about this chat</strong><p>Summarize, find a detail, or draft a reply without leaving the conversation.</p></div></div><div className="ai-prompts"><button onClick={() => askSmartAI("Summarize the latest conversation in three short bullets.")}>Summarize this chat <ArrowLeft size={15} /></button><button onClick={() => askSmartAI("Draft a warm, concise reply to the last message.")}>Draft a reply <ArrowLeft size={15} /></button><button onClick={() => askSmartAI("What are the action items in this conversation?")}>Find action items <ArrowLeft size={15} /></button></div>{askAI.isPending && <div className="ai-thinking"><span className="typing-pill"><i /><i /><i /></span>Thinking with context…</div>}<div className="ai-footnote"><Bot size={14} /> AI is optional, private, and can be turned off.</div></div>}

      {profileOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setProfileOpen(false)}><section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title"><div className="modal-top"><div><p className="eyebrow">Your profile</p><h2 id="profile-title">Make it yours.</h2></div><button className="icon-button" onClick={() => setProfileOpen(false)} aria-label="Close profile"><X size={18} /></button></div><div className="profile-preview"><span className="avatar avatar-xl avatar-coral">{profileName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><div><strong>{profileName || "Your name"}</strong><span>{profileHandle || "@yourhandle"}</span></div></div><label className="form-label">Display name<input value={profileName} onChange={(event) => setProfileName(event.target.value)} /></label><label className="form-label">Handle<input value={profileHandle} onChange={(event) => setProfileHandle(event.target.value)} /></label><p className="modal-note"><Check size={15} /> This preview remembers your profile on this device.</p><button className="primary-button" onClick={saveProfile}>Save profile</button></section></div>}
    </div>
  );
}
