# Epix Post

A decentralized social network on [EpixNet](https://epixnet.io).

## Features

- Post feed with markdown support
- User profiles with avatar and bio
- Follow system with activity feed
- Comments and likes on posts
- xID identity integration
- Image uploads
- Merger site architecture (multi-hub)
- Maquette virtual DOM for fast rendering
- 11 language translations

## Structure

```
epix1p0stmcza0xjkvv0vnjlk0ypr7xsunt4lxkhgcm/
├── index.html
├── content.json
├── dbschema.json          # EpixPost DB (v3, merger)
├── LICENSE                # MIT
├── css/
│   └── all.css            # Stylesheet (flat theme, light/dark)
├── img/                   # Logo, favicon, default avatar
├── js/
│   ├── EpixPost.js        # Main app (extends EpixFrame)
│   ├── Shell.js           # App shell: navigation, account menu
│   ├── Onboarding.js      # First-run steps
│   ├── Post.js            # Post component
│   ├── PostCreate.js      # Composer teaser on the feed
│   ├── PostList.js        # Post feed
│   ├── PostMeta.js        # Post images
│   ├── ComposerModal.js   # Shared post composer
│   ├── User.js            # User profiles and auth
│   ├── UserList.js        # User directory
│   ├── ContentFeed.js     # Feed view
│   ├── ContentThread.js   # Post thread view
│   ├── ContentProfile.js  # Profile view
│   ├── ContentCreateProfile.js
│   ├── ContentUsers.js    # Users browse
│   ├── ContentHubs.js     # Hub management
│   ├── ContentSettings.js # Settings
│   ├── ActivityList.js    # Activity feed
│   ├── AnonUser.js        # Anonymous user fallback
│   ├── lib/               # Maquette, EpixFrame, marked, anime, clone
│   └── utils/             # Animation, Deferred, Text, Time, Menu, etc.
└── languages/             # da, fa, fr, hu, it, nl, pt-br, sk, tr, zh, zh-tw
```

## Hub

- **Address:** `epix12fdtj0j77kltvdw2eqfzw392mr34r2al22mqrf`
- **Merged type:** `EpixPost`

## Database

- **File:** `merged-EpixPost/EpixPost.db`
- **Tables:** `post`, `post_like`, `comment`, `follow`, `json`

## Tech Stack

- Vanilla ES6 JavaScript (no build step)
- Maquette virtual DOM
- EpixFrame WebSocket bridge
- marked.js + anime.js
- All JS wrapped in IIFEs

## License

MIT
