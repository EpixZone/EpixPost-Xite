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
│   ├── HubCommunityView.js # Hub filters, evidence and reviews
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
- **Tables:** `post`, `post_like`, `comment`, `follow`, `hub_review`, `json`

## Tech Stack

- Vanilla ES6 JavaScript (no build step)
- Maquette virtual DOM
- EpixFrame WebSocket bridge
- marked.js + anime.js
- All JS wrapped in IIFEs

## License

MIT

## Hub discovery and community reviews

The Hubs page shows community information before a hub is downloaded. A review
can include a General, Mature, or Adult content rating; topic labels; an
availability observation; a problem report; and a short public note. Reviewers
can update or withdraw their own review. Availability observations older than
30 days remain visible as evidence but no longer affect discovery filters.
Conflicting observations are shown together.

Adult and recently reported unavailable hubs are hidden from discovery by
default. Readers can change these filters, exclude topics or problem reports,
hide individual hubs, or inspect filtered metadata and explicitly download a
hub anyway. These preferences are local. Hiding a hub does not delete files
already downloaded or stop seeding an existing hub. Seeded hubs remain visible
for management.

Featured hubs are suggestions, not automatic downloads. New visitors choose a
hub, download it, and select their xID or create a profile. Entering a hub address
creates a preview first. A download acknowledgement is separate from completion:
failed, incomplete, or timed-out attempts offer a retry.

Reviews are stored in `data/users/<xid>/hub_reviews.json` on an already joined
hub, preferring a featured hub where the reviewer has a profile. Reading or
reporting a target hub does not download that target. Readers see reviews from
hubs they already seed; someone with no hubs has no community evidence yet.
No reports does not establish that a hub is safe or available. Reports cannot
recover content when no peer has a copy.

The client counts one latest review per canonical xID and target address across
source hubs. Each review and withdrawal carries an independent author signature
over its identity, target, fields, and timestamp. The client checks this signature
against the xID's active keys from the node's proof-verified name resolution,
along with the source certificate rules. A hub owner's signature alone cannot
impersonate a reviewer. Invalid reviews are excluded with a visible warning;
verification service failures keep new downloads gated until reports reload.
If RPC attestations briefly lag behind the node's validator pin (`HeightBeforePin`),
the client waits six seconds and requests a fresh verified proof once. Other
verification errors remain visible, and an unsuccessful retry never permits signing
or writing a review.
The policy uses reported classifications as personal filtering signals, not a
claim of community consensus or protection against coordinated identities.

The dedicated review file uses the existing signed-file format so current hub
operators do not need new merge-file permissions. Writes from one page are
serialized and withdrawals retain tombstones. Concurrent edits from different
devices still follow the node's whole-file last-writer-wins behavior. Review
writes and publication failures are surfaced; a timed-out publication may have
succeeded, so reload before retrying.

### Development checks

No build step or additional packages are required:

```sh
node --test tests/*.test.cjs
```

Tests cover community identity and provenance, duplicate reports, withdrawals,
expiry, write failures, account changes, download lifecycle and retries, filters,
explicit hub selection, and existing feed/profile behavior.

For browser regression checks, serve the repository over local HTTP:

- `tests/editor-layout.html` checks editor sizing, Save/Cancel behavior and
  composer layering. Add `?touch=1` to apply the stylesheet's coarse-pointer
  rules on a desktop browser, or `?preview=buttons&touch=1` to keep the editor
  open for inspection. Check both desktop and mobile viewport widths.
- `tests/navigation-history.html` uses the real router and frame message
  dispatcher with native browser history and local view fixtures. Follow its
  Back/Forward steps and check that the view, stored route and loaded state
  agree. No node or account is required.
- `tests/startup-recovery.html` recreates the real app startup inside an iframe
  while its local wrapper remains connected. Check that it reaches Ready with
  one server-info request and one language load, including when the wrapper
  sends no open notification. Its reconnect button should refresh data without
  loading the language again. No node or account is required.

To compare navigation or startup with the original source, extract commit `b4df249` into
an `EpixPost-before` directory next to this repository, serve their parent
directory, and open the corresponding fixture with `?source=before` or
`?source=after`.

### Publishing this update

A GitHub merge alone does not update `post.epix`. The app owner must install the
updated source, regenerate and sign the app manifest with its own key, publish,
and seed the app. Include the new JavaScript files and `dbschema.json` when
signing. Keep database schema `version` at `3`, which selects merger semantics.
The new `hub_review` table is added on rebuild; existing posts, profiles, follows,
and hub announcements use their existing tables. No production signing keys or
user content belong in this repository.
