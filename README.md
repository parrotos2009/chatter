# Chatter v2

A real-time chat web app inspired by WhatsApp Web. Built with Node.js, Express, Socket.IO, SQLite, and WebRTC.

## Features

- 🟢 **Profile pictures** — upload a custom avatar (or pick a color + initial)
- 💬 **Public channels** — `#general`, `#random`, `#tech` ready to go
- 👤 **1-on-1 DMs** — start a private chat with anyone online
- 👥 **Groups** — create a group, add members, manage from the info panel
- 📞 **Voice calls** — peer-to-peer WebRTC, with mute / end
- 📹 **Video calls** — full P2P video with mute / camera off / end
- 🟢 **Live presence** — see who's online in real time
- ⌨️ **Typing indicators** with animated dots
- 📅 **Day separators** + message grouping + read-style timestamps
- 📝 **Persistent history** — messages saved in SQLite
- 🟫 **WhatsApp Web-style UI** — dark theme, chat bubbles, sidebar
- 📱 **Responsive** — works on phone, tablet, and desktop
- 💾 **Profile saved locally** — your name & avatar persist across sessions

## Run locally

```bash
cd chatter
npm install
npm start
# open http://localhost:3000
```

## Deploy to Render (free, permanent URL)

Click this button — it will create a Render account if you don't have one, then deploy this repo:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/parrotos2009-dotcom/chatter)

After clicking:
1. Sign in with GitHub (one click — Render needs access to your repos to deploy)
2. Give the service a name (e.g. `chatter`) — this becomes your subdomain
3. Click **Apply** / **Deploy**
4. Wait ~2 minutes for the first build
5. Your live URL will be `https://chatter.onrender.com` (or whatever name you chose)

The `render.yaml` file in this repo is auto-detected and configures everything (Node 20, free plan, build & start commands).

## Deploy to Railway

```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

## Notes

- `render.yaml` is provided for one-click Render deploys
- The free tier on Render/Railway will sleep after inactivity; the first request may take ~30s
- For calls to work between users on different networks, the WebRTC STUN servers (Google) are used; TURN is not included (would need a paid service for restrictive NATs)
- All data is stored in a local SQLite file (`chatter.db`) — for production use, switch to a hosted DB
