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
│   └── all.css            # Bundled stylesheet
├── js/
│   ├── EpixPost.js        # Main app (extends EpixFrame)
│   ├── Post.js            # Post component
│   ├── PostCreate.js      # Post creation
│   ├── PostList.js        # Post feed
│   ├── PostMeta.js        # Post metadata
│   ├── User.js            # User profiles and auth
│   ├── UserList.js        # User directory
│   ├── Head.js            # Navigation header
│   ├── ContentFeed.js     # Feed view
│   ├── ContentProfile.js  # Profile view
│   ├── ContentCreateProfile.js
│   ├── ContentUsers.js    # Users browse
│   ├── ActivityList.js    # Activity feed
│   ├── AnonUser.js        # Anonymous user fallback
│   ├── Trigger.js         # Notifications
│   ├── lib/               # Maquette, EpixFrame, marked, anime, clone
│   └── utils/             # Animation, Deferred, Text, Time, Menu, etc.
├── languages/             # da, fa, fr, hu, it, nl, pt-br, sk, tr, zh, zh-tw
└── data-default/
    └── users/
        └── content-default.json
```

## Hub

- **Address:** `epix12fdtj0j77kltvdw2eqfzw392mr34r2al22mqrf`
- **Merged type:** `EpixPost`

## Database

- **File:** `merged-EpixPost/EpixPost.db`
- **Tables:** `post`, `post_like`, `comment`, `follow`, `user`, `json`

## Tech Stack

- Vanilla ES6 JavaScript (no build step)
- Maquette virtual DOM
- EpixFrame WebSocket bridge
- marked.js + anime.js
- All JS wrapped in IIFEs

## License

MIT
