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

1. Push the `chatter/` folder to a new GitHub repo
2. Sign up at https://render.com and click **New + Web Service**
3. Connect your repo — Render auto-detects `render.yaml`
4. Click **Deploy** — your app gets a URL like `https://chatter.onrender.com`

Or click the button below after connecting the repo to Render:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

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
