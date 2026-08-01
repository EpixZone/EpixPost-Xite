(function() {

  var EpixFrame = window.EpixFrame;

  window.h = maquette.h;

  class EpixPost extends EpixFrame {
    constructor() {
      super();
      this.signSiteContent = this.signSiteContent.bind(this);
      this.autoCreateXidProfile = this.autoCreateXidProfile.bind(this);
      this.checkUser = this.checkUser.bind(this);
      this.getXidDisplayBio = this.getXidDisplayBio.bind(this);
      this.getXidDisplayAvatar = this.getXidDisplayAvatar.bind(this);
      this.getXidDisplayName = this.getXidDisplayName.bind(this);
      this.getHubTitle = this.getHubTitle.bind(this);
      this.resolveXidProfiles = this.resolveXidProfiles.bind(this);
      this.needSite = this.needSite.bind(this);
      this.noteHubProgress = this.noteHubProgress.bind(this);
      this.hubSyncActive = this.hubSyncActive.bind(this);
      this.requestMergerPermission = this.requestMergerPermission.bind(this);
      this.updateSiteInfo = this.updateSiteInfo.bind(this);
      this.updateContentNoanim = this.updateContentNoanim.bind(this);
      this.onOpenWebsocket = this.onOpenWebsocket.bind(this);
      this.handleLinkClick = this.handleLinkClick.bind(this);
      this.navigate = this.navigate.bind(this);
      this.renderContent = this.renderContent.bind(this);
    }

    init() {
      this.params = {};
      this.merged_sites = {};
      // Live download of a hub we merged: see noteHubProgress. Cleared by
      // going quiet, so this is how long without an event counts as finished.
      this.HUB_SYNC_IDLE = 15000;
      // The longer window used while we KNOW more is coming but nothing has
      // landed yet: right after mergerSiteAdd (peers still being dialed) and
      // after a file_added marker (a fetch pass just started). Dialing a
      // fresh hub's peers over Tor is routinely 30-60s of dead air; with only
      // the short idle the bar flapped on and off through every pass.
      this.HUB_SYNC_WAIT = 120000;
      this.hub_sync = null;
      this.hub_sync_timer = null;
      this.site_info = null;
      this.server_info = null;
      this.address = null;
      this.user = false;
      this.user_hubs = {};
      this.user_loaded = false;
      this.xid_site = "epix1xauthduuyn63k6kj54jzgp4l8nnjlhrsyaku8c";
      this.cache_time = Time.timestamp();
      this.xid_profiles = {};
      // Image paths whose optional download timed out, with the fail time;
      // keeps the retry state across component re-creation (see PostMeta).
      this.failed_images = {};
      this.can_go_back = false;
      this.on_site_info = new Deferred();
      this.on_local_storage = new Deferred();
      this.on_user_info = new Deferred();
      this.on_loaded = new Deferred();
      this.local_storage = null;
      this.on_site_info.then(() => {
        this.setLoadingProgress(35, _("Loading your settings..."));
      });
      this.on_local_storage.then(() => {
        this.setLoadingProgress(55, _("Checking your account..."));
        this.checkUser(() => {
          this.on_user_info.resolve();
        });
      });
      this.on_user_info.then(() => {
        this.setLoadingProgress(75, _("Loading feed..."));
      });
      // Ask for the Merger permission as soon as site info lands, rather than
      // waiting for the onboarding card's button. Without it no hub can be
      // added, so the feed is empty and every later onboarding step is
      // blocked - a visitor who does not notice the card just sees a dead
      // app. The wrapper draws its own grant dialog and answers immediately
      // when the permission is already held, so this is a no-op on every
      // visit after the grant. The card stays as the way back for anyone who
      // dismisses the dialog.
      this.on_site_info.then(() => {
        if (this.sitePermissions().indexOf("Merger:EpixPost") < 0) {
          this.requestMergerPermission();
        }
      });
    }

    createProjector() {
      this.projector = maquette.createProjector();
      this.shell = new Shell();
      this.composer = this.shell.composer;
      this.overlay = new Overlay();
      this.content_feed = new ContentFeed();
      this.content_users = new ContentUsers();
      this.content_profile = new ContentProfile();
      this.content_thread = new ContentThread();
      this.content_create_profile = new ContentCreateProfile();
      this.content_hubs = new ContentHubs();
      this.content_settings = new ContentSettings();
      this.scrollwatcher = new Scrollwatcher();
      if (base.href.indexOf("?") === -1) {
        this.route("");
      } else {
        var url = base.href.replace(/.*?\?/, "");
        this.route(url);
        this.history_state["url"] = url;
      }
      this.markLoaded = () => {
        this.log("onloaded");
        this.setLoadingProgress(100, _("Ready!"));
        this.hideLoading();
        window.requestAnimationFrame(() => {
          document.body.classList.add("loaded");
        });
      };
      this.on_loaded.then(this.markLoaded);
      this.projector.replace($("#Shell"), this.shell.render);
      this.projector.replace($("#Overlay"), this.overlay.render);
      this.loadLocalStorage();
      setInterval(function() {
        Page.projector.scheduleRender();
      }, 60 * 1000);
    }

    setLoadingProgress(percent, label) {
      var bar = document.getElementById("loading-bar-fill");
      var step = document.getElementById("loading-step");
      if (bar) bar.style.width = percent + "%";
      if (step) step.textContent = label;
    }

    hideLoading() {
      var overlay = document.getElementById("loading-overlay");
      if (overlay) {
        overlay.classList.add("fade-out");
        setTimeout(function() {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 500);
      }
    }

    renderContent() {
      if (this.site_info) {
        return h("div#Content", this.content.render());
      } else {
        return h("div#Content");
      }
    }

    route(query) {
      var changed, content;
      this.params = Text.queryParse(query);
      if (!this.params.urls) {
        // Query with only key=val pairs (no path part): route to the feed
        this.params.urls = [""];
      }
      this.log("Route", this.params);
      if (this.shell) {
        this.shell.title = null;
      }
      if (this.params.urls[0] === "Create+profile") {
        content = this.content_create_profile;
      } else if (this.params.urls[0] === "Users" && (content = this.content_users)) {

      } else if (this.params.urls[0] === "Hubs") {
        content = this.content_hubs;
        this.content_hubs.need_update = true;
      } else if (this.params.urls[0] === "Settings") {
        content = this.content_settings;
        this.content_settings.need_update = true;
      } else if (this.params.urls[0] === "ProfileName") {
        this.content_profile.findUser(this.params.urls[1], (user) => {
          this.setUrl(user.getLink(), "replace");
        });
      } else if (this.params.urls[0] === "Profile") {
        content = this.content_profile;
        changed = this.content_profile.auth_address !== this.params.urls[2];
        this.content_profile.setUser(this.params.urls[1], this.params.urls[2]).filter(null);
      } else if (this.params.urls[0] === "Post") {
        content = this.content_thread;
        changed = this.content_thread.setPost(this.params.urls[1], this.params.urls[2], this.params.urls[3], this.params.urls[4]);
      } else {
        content = this.content_feed;
      }
      if (content && (this.content !== content || changed)) {
        if (this.content) {
          setTimeout(() => {
            this.content.update();
          }, 100);
          this.projector.detach(this.content.render);
        }
        this.content = content;
        this.on_user_info.then(() => {
          this.projector.replace($("#Content"), this.content.render);
        });
      }
    }

    setUrl(url, mode) {
      if (mode == null) mode = "push";
      url = url.replace(/.*?\?/, "");
      this.log("setUrl", this.history_state["url"], "->", url);
      if (this.history_state["url"] === url) {
        this.content.update();
        return false;
      }
      this.history_state["url"] = url;
      if (mode === "replace") {
        this.cmd("wrapperReplaceState", [this.history_state, "", url]);
      } else {
        this.cmd("wrapperPushState", [this.history_state, "", url]);
        this.can_go_back = true;
      }
      this.route(url);
      return false;
    }

    handleLinkClick(e) {
      if (e.which === 2) {
        return true;
      } else {
        return this.navigate(e.currentTarget.search);
      }
    }

    // In-app navigation with the scroll/loaded bookkeeping links need; used
    // by handleLinkClick and by non-anchor click targets (e.g. user cards).
    navigate(url) {
      this.log("save scrollTop", window.pageYOffset);
      this.history_state["scrollTop"] = window.pageYOffset;
      this.cmd("wrapperReplaceState", [this.history_state, null]);
      window.scroll(window.pageXOffset, 0);
      this.history_state["scrollTop"] = 0;
      this.on_loaded.resolved = false;
      // resolve() consumes the callback list, so re-arm it or body.loaded
      // (and scrolling) never comes back after an in-app navigation.
      this.on_loaded.then(this.markLoaded);
      document.body.classList.remove("loaded");
      this.setUrl(url);
      return false;
    }

    createUrl(key, val) {
      var params, k;
      params = JSON.parse(JSON.stringify(this.params));
      if (typeof key === "object") {
        for (k in key) {
          params[k] = key[k];
        }
      } else {
        params[key] = val;
      }
      return "?" + Text.queryEncode(params);
    }

    loadLocalStorage() {
      this.on_site_info.then(() => {
        this.logStart("Loaded localstorage");
        this.cmd("wrapperGetLocalStorage", [], (local_storage) => {
          this.local_storage = local_storage;
          this.logEnd("Loaded localstorage");
          if (this.local_storage == null) {
            this.local_storage = {};
          }
          if (this.local_storage.followed_users == null) {
            this.local_storage.followed_users = {};
          }
          if (this.local_storage.settings == null) {
            this.local_storage.settings = {};
          }
          this.on_local_storage.resolve(this.local_storage);
        });
      });
    }

    saveLocalStorage(cb) {
      if (cb == null) cb = null;
      this.logStart("Saved localstorage");
      if (this.local_storage) {
        this.cmd("wrapperSetLocalStorage", this.local_storage, (res) => {
          this.logEnd("Saved localstorage");
          if (typeof cb === "function") cb(res);
        });
      }
    }

    onOpenWebsocket(e) {
      this.cmd("wrapperSetViewport", "width=device-width, initial-scale=1");
      this.setLoadingProgress(15, _("Loading site info..."));
      this.updateSiteInfo();
      this.cmd("serverInfo", {}, (server_info) => {
        this.setServerInfo(server_info);
        var lang = server_info != null ? (server_info.user_settings != null ? server_info.user_settings.language : void 0) : void 0;
        loadLanguage(lang, () => {
          this.projector.scheduleRender();
        });
      });
    }

    // The granted permission list, [] until a full siteInfo has landed. The
    // node also pushes MINIMAL setSiteInfo events (a mid-clone progress shape
    // whose settings is just {size: 0}); reading .permissions off those threw
    // and killed whatever handler did it - notably the boot-time permission
    // prompt, which then never appeared.
    sitePermissions() {
      var settings = (this.site_info != null ? this.site_info.settings : void 0) || {};
      return settings.permissions || [];
    }

    updateSiteInfo(cb) {
      if (cb == null) cb = null;
      var on_site_info = new Deferred();
      // query_site_info=true so every consumer (hub pills, filter menu,
      // composer) can resolve hub titles from one cache. Values are truthy
      // either way, so the seeded-checks all keep working.
      this.cmd("mergerSiteList", true, (merged_sites) => {
        this.merged_sites = merged_sites;
        on_site_info.then(() => {
          if (this.sitePermissions().indexOf("Merger:EpixPost") >= 0) {
            var default_hubs = (this.site_info.content != null ? (this.site_info.content.settings != null ? this.site_info.content.settings.default_hubs : void 0) : void 0) || {};
            // Auto-add waits for local storage: hubs the user explicitly
            // removed (Stop seeding / Leave hub on the Hubs page) are
            // remembered in settings.removed_hubs and not re-added.
            this.on_local_storage.then(() => {
              var removed_hubs = this.local_storage.settings.removed_hubs || {};
              for (var address in default_hubs) {
                if (!this.merged_sites[address] && !removed_hubs[address]) {
                  this.log("Auto-adding default hub", address);
                  this.beginHubSync(address);
                  this.cmd("mergerSiteAdd", address);
                }
              }
            });
          }
          if (typeof cb === "function") cb(true);
        });
      });
      this.cmd("siteInfo", {}, (site_info) => {
        this.address = site_info.address;
        this.setSiteInfo(site_info);
        on_site_info.resolve();
      });
    }

    // Stable callback for RateLimit (it dedupes on function identity):
    // refresh the current content without enter/exit animations.
    updateContentNoanim() {
      if (this.content) {
        this.content.update("noanim");
      }
    }

    // Ask the wrapper for the Merger permission and pick the feed back up
    // once it is granted. Shared by the boot prompt and the onboarding card's
    // button so the two paths cannot drift apart.
    requestMergerPermission(cb) {
      this.cmd("wrapperPermissionAdd", "Merger:EpixPost", () => {
        // Always re-query: older nodes do not push siteInfo on grant.
        this.updateSiteInfo(() => {
          if (this.site_info.cert_user_id && !(this.user != null ? this.user.hub : void 0)) {
            // A certificate was selected before the grant: re-run the user
            // check so xID profiles get auto-created on the fresh hub data.
            this.checkUser(() => {
              if (this.content) {
                this.content.update();
              }
            });
          } else if (this.content) {
            this.content.update();
          }
          if (typeof cb === "function") {
            cb();
          }
        });
      });
    }

    needSite(address, cb) {
      this.setHubRemoved(address, false);
      if (this.merged_sites[address]) {
        if (typeof cb === "function") cb(true);
      } else {
        this.beginHubSync(address);
        Page.cmd("mergerSiteAdd", address, cb);
      }
    }

    // Remember (or forget) that the user explicitly removed a hub, so
    // updateSiteInfo does not auto re-add removed default hubs on the next
    // refresh. Stored in local storage as settings.removed_hubs.
    setHubRemoved(address, removed) {
      if (!this.local_storage) {
        return;
      }
      var removed_hubs = this.local_storage.settings.removed_hubs;
      if (removed) {
        if (!removed_hubs) {
          removed_hubs = this.local_storage.settings.removed_hubs = {};
        }
        if (removed_hubs[address]) {
          return;
        }
        removed_hubs[address] = true;
        this.saveLocalStorage();
      } else {
        if (!removed_hubs || !removed_hubs[address]) {
          return;
        }
        delete removed_hubs[address];
        this.saveLocalStorage();
      }
    }

    resolveXidProfiles(addresses, cb) {
      var missing = [];
      for (var i = 0; i < addresses.length; i++) {
        var addr = addresses[i];
        if (addr && !this.xid_profiles[addr]) {
          missing.push(addr);
        }
      }
      if (missing.length === 0) {
        if (typeof cb === "function") cb();
        return;
      }
      var unique = [];
      var seen = {};
      for (var j = 0; j < missing.length; j++) {
        addr = missing[j];
        if (!seen[addr]) {
          seen[addr] = true;
          unique.push(addr);
        }
      }
      Page.cmd("xidResolveBatch", [unique], (results) => {
        if (results) {
          for (addr in results) {
            var profile = results[addr];
            if (profile) {
              this.xid_profiles[addr] = profile;
            } else {
              this.xid_profiles[addr] = {};
            }
          }
        }
        if (typeof cb === "function") cb();
      });
    }

    // Canonical hub title: the seeded hub's own signed title, else the
    // featured-hub entry in our content.json, else a truncated address.
    getHubTitle(address) {
      var ref, ref1, ref2, ref3;
      var site = this.merged_sites != null ? this.merged_sites[address] : void 0;
      if (site && site.content && site.content.title) {
        return site.content.title;
      }
      var title = (ref = this.site_info) != null ? (ref1 = ref.content) != null ? (ref2 = ref1.settings) != null ? (ref3 = ref2.default_hubs) != null ? (ref3[address] != null ? ref3[address].title : void 0) : void 0 : void 0 : void 0 : void 0;
      return title || address.slice(0, 16) + "...";
    }

    getXidDisplayName(auth_address, fallback) {
      if (fallback == null) fallback = "";
      var profile = this.xid_profiles[auth_address];
      if (profile != null ? profile.name : void 0) {
        return profile.name + "." + profile.tld;
      }
      if (auth_address && auth_address.indexOf(".") > 0) {
        return auth_address;
      }
      return fallback;
    }

    getXidDisplayAvatar(auth_address) {
      var profile = this.xid_profiles[auth_address];
      return (profile != null ? profile.avatar : void 0) || "";
    }

    getXidDisplayBio(auth_address, fallback) {
      if (fallback == null) fallback = "";
      var profile = this.xid_profiles[auth_address];
      return (profile != null ? profile.bio : void 0) || fallback;
    }

    checkUser(cb) {
      if (cb == null) cb = null;
      this.log("Find hub for user", this.site_info.cert_user_id);
      if (!this.site_info.cert_user_id) {
        this.user = new AnonUser();
        this.user.updateInfo(cb);
        return false;
      }
      var user_dir = this.site_info.xid_directory || this.site_info.auth_address;
      Page.cmd("dbQuery", [
        "SELECT * FROM json WHERE directory = :directory AND file_name = 'data.json'", {
          directory: "data/users/" + user_dir
        }
      ], (res) => {
        if ((res != null ? res.length : void 0) > 0) {
          this.user_hubs = {};
          var user_row;
          for (var i = 0; i < res.length; i++) {
            var row = res[i];
            this.log("Possible site for user", row.site);
            this.user_hubs[row.site] = row;
            if (row.site === row.hub) {
              user_row = row;
            }
          }
          var settings_hub = this.local_storage != null ? (this.local_storage.settings != null ? this.local_storage.settings.hub : void 0) : void 0;
          if (settings_hub && this.user_hubs[settings_hub]) {
            row = this.user_hubs[settings_hub];
            this.log("Force hub", row.site);
            user_row = row;
            user_row.hub = row.site;
          }
          if (!user_row) {
            user_row = res[0];
            user_row.hub = user_row.site;
            this.log("No exact hub match, using first result", user_row.site);
          }
          this.log("Choosen site for user", user_row.site, user_row);
          this.user = new User({
            hub: user_row.hub,
            auth_address: this.site_info.xid_directory || this.site_info.auth_address
          });
          this.user.row = user_row;
          this.resolveXidProfiles([this.site_info.auth_address], () => {
            this.user.xid_profile = this.xid_profiles[this.site_info.auth_address];
            this.user.updateInfo(cb);
            // Additive, idempotent migration of any legacy data.json posts into
            // posts.json. Background; per-post guarded so it converges as data
            // syncs and never strips the legacy array.
            this.user.migratePosts();
          });
        } else {
          this.user = new AnonUser();
          this.user.updateInfo();
          if (this.site_info.cert_user_id != null ? this.site_info.cert_user_id.match(/@xid(\.epix)?$/) : void 0) {
            this.autoCreateXidProfile(cb);
          } else {
            if (typeof cb === "function") cb(false);
          }
        }
        Page.projector.scheduleRender();
      });
    }

    autoCreateXidProfile(cb) {
      if (cb == null) cb = null;
      this.log("Auto-creating hub data for xID user...");
      var default_hub = null;
      var ref = this.site_info.content.settings.default_hubs;
      for (var address in ref) {
        default_hub = address;
        break;
      }
      if (!default_hub) {
        this.log("No default hub configured");
        if (typeof cb === "function") cb(false);
        return;
      }
      var ensureHub = () => {
        if (!this.merged_sites[default_hub]) {
          this.log("Seeding default hub", default_hub);
          Page.cmd("mergerSiteAdd", default_hub, () => {
            this.updateSiteInfo(() => {
              createProfile();
            });
          });
        } else {
          createProfile();
        }
      };
      var createProfile = () => {
        var user = new User({
          hub: default_hub,
          auth_address: this.site_info.auth_address
        });
        var data = user.getDefaultData();
        data.hub = default_hub;
        this.log("Creating hub data for xID user");
        user.save(data, default_hub, () => {
          this.log("Hub data created, re-checking user...");
          this.checkUser(cb);
        });
      };
      ensureHub();
    }

    signSiteContent(cb) {
      if (cb == null) cb = null;
      this.log("Signing site root content.json with stored key...");
      this.cmd("siteSign", {
        privatekey: "stored",
        inner_path: "content.json",
        update_changed_files: true
      }, (res) => {
        this.log("Site sign result:", res);
        if (res === "ok") {
          this.cmd("sitePublish", {
            inner_path: "content.json"
          }, (pub_res) => {
            this.log("Site publish result:", pub_res);
            if (typeof cb === "function") cb(pub_res);
          });
        } else {
          this.cmd("wrapperNotification", ["error", _("Site signing failed:") + " " + ((res != null ? res.error : void 0) || res)]);
          if (typeof cb === "function") cb(false);
        }
      });
    }

    onRequest(cmd, message) {
      var params = message.params;
      if (cmd === "setSiteInfo") {
        this.setSiteInfo(params);
      } else if (cmd === "wrapperPopState") {
        if (params.state) {
          if (!params.state.url) {
            params.state.url = params.href.replace(/.*\?/, "");
          }
          this.on_loaded.resolved = false;
          this.on_loaded.then(this.markLoaded);
          document.body.classList.remove("loaded");
          window.scroll(window.pageXOffset, params.state.scrollTop || 0);
          this.route(params.state.url || "");
        }
      } else {
        this.log("Unknown command", cmd, params);
      }
    }

    // A hub the node is downloading for us. The node pushes a merged site's
    // events to its merger's page, so these arrive here for an address that is
    // not ours - the only signal a merger gets that a hub it just added is
    // still coming down. Without it the feed is simply empty for the whole
    // download and reads as broken.
    //
    // `tasks`/`started_task_num` are only meaningful while the hub's own file
    // set is downloading; the per-user content and the post records that
    // follow have no denominator, so the bar falls back to indeterminate and
    // the honest numbers (files landed, peers serving) carry the message.
    noteHubProgress(site_info) {
      if (site_info.address === this.address || !site_info.event) {
        return;
      }
      var kind = site_info.event[0];
      var is_file = kind === "file_done" || kind === "file_added" || kind === "file_failed";
      var sync = this.hub_sync;
      // Only file traffic is download activity. The announce loop pushes
      // peers_added for a merged site every few seconds indefinitely; letting
      // those re-arm the idle timer kept the bar up forever, frozen on the
      // last file name. They may refresh the peer count of a LIVE download,
      // nothing more.
      if (!is_file) {
        if (sync && sync.address === site_info.address && this.hubSyncActive()) {
          sync.peers = site_info.peers_serving || site_info.peers || sync.peers;
        }
        return;
      }
      if (!sync || sync.address !== site_info.address) {
        sync = this.hub_sync = { address: site_info.address, files: 0 };
      }
      sync.at = Date.now();
      sync.peers = site_info.peers_serving || site_info.peers || 0;
      if (site_info.started_task_num > 0) {
        sync.tasks = site_info.tasks;
        sync.total = site_info.started_task_num;
      } else {
        sync.total = 0;
      }
      if (kind === "file_done") {
        sync.files += 1;
        sync.last = site_info.event[1];
        sync.dialing = false;
      } else if (kind === "file_added") {
        // A fetch pass just started: more files are coming, but dialing the
        // peers first can be a long silence. Hold the bar through it, and say
        // "connecting" rather than leaving the previous file's name up - a
        // stale name sitting there is what reads as a stuck download.
        sync.dialing = true;
      }
      this.armHubSyncTimer();
      RateLimit(500, this.updateContentNoanim);
    }

    // The bar has to take itself down when the events stop; one pending
    // timer, re-armed on every event, does it.
    armHubSyncTimer() {
      if (this.hub_sync_timer) {
        clearTimeout(this.hub_sync_timer);
      }
      this.hub_sync_timer = setTimeout(() => {
        this.hub_sync_timer = null;
        this.projector.scheduleRender();
      }, this.hubSyncWindow() + 500);
    }

    // How long after the last event the download still counts as live: the
    // short idle normally, the long wait while we know more is coming
    // (connecting after mergerSiteAdd, or a just-announced fetch pass).
    hubSyncWindow() {
      var sync = this.hub_sync;
      if (sync && sync.dialing) {
        return this.HUB_SYNC_WAIT;
      }
      return this.HUB_SYNC_IDLE;
    }

    // A hub download starts with mergerSiteAdd, not with its first file
    // event: the node dials the hub's peers first, which over Tor is tens of
    // seconds with no events at all. Showing nothing for that stretch made
    // the app read as broken (and the empty feed as "no posts").
    beginHubSync(address) {
      if (address === this.address) {
        return;
      }
      this.hub_sync = { address: address, files: 0, dialing: true, at: Date.now() };
      this.armHubSyncTimer();
      this.projector.scheduleRender();
    }

    // Whether a hub download is still live: events stopped arriving less
    // than the active window ago. There is no "clone finished" event to key
    // off, so going quiet is the signal.
    hubSyncActive() {
      var sync = this.hub_sync;
      return !!(sync && Date.now() - sync.at < this.hubSyncWindow());
    }

    setSiteInfo(site_info) {
      this.noteHubProgress(site_info);
      if (site_info.address === this.address) {
        // Minimal progress events (settings without a permissions list) must
        // not become this.site_info: they would erase the granted permissions
        // for every later read. Only a full payload is stored or resolves the
        // boot deferred; the events on it below still process either way.
        var full = site_info.settings != null && site_info.settings.permissions != null;
        var had_permission = this.site_info == null || this.sitePermissions().indexOf("Merger:EpixPost") >= 0;
        if (!this.site_info && full) {
          this.site_info = site_info;
          this.on_site_info.resolve();
        }
        if (full) {
          this.site_info = site_info;
        }
        var has_permission = full ? site_info.settings.permissions.indexOf("Merger:EpixPost") >= 0 : false;
        if (!had_permission && has_permission) {
          // Merger permission just got granted (patched nodes push siteInfo on
          // grant): reload merged sites so the feed populates without a reload.
          this.log("Merger permission granted, reloading merged sites");
          this.updateSiteInfo(() => {
            if (this.content) {
              this.content.update();
            }
          });
        }
        if (site_info.event != null ? site_info.event[0] === "cert_changed" : void 0) {
          this.checkUser((found) => {
            if (Page.site_info.cert_user_id && !found && !Page.site_info.cert_user_id.match(/@xid(\.epix)?$/)) {
              this.setUrl("?Create+profile");
            }
            if (Page.site_info.cert_user_id) {
              Page.shell.follows["Mentions"] = true;
              Page.shell.follows["Comments on your posts"] = true;
              Page.shell.saveFollows();
            }
            this.content.update();
          });
        }
      }
      if (site_info.event != null ? site_info.event[0] === "file_done" : void 0) {
        var file_name = site_info.event[1];
        if (file_name.indexOf(site_info.auth_address) !== -1 && (Page.user != null ? Page.user.auth_address : void 0) !== site_info.auth_address) {
          this.checkUser(() => {
            this.content.update();
          });
        } else if (!this.merged_sites[site_info.address] && site_info.address !== this.address) {
          this.log("New site added:", site_info.address);
          this.updateSiteInfo(() => {
            this.content.update();
          });
        } else if (file_name.indexOf(site_info.auth_address) !== -1) {
          this.content.update();
        } else if (!file_name.endsWith("content.json")) {
          // Background sync refresh: no per-row animations (each slide-down
          // reads as flicker when many files arrive) and a slower cadence
          // while the initial download is still fetching files.
          RateLimit(site_info.bad_files > 0 ? 2000 : 500, this.updateContentNoanim);
        }
      }
    }

    setServerInfo(server_info) {
      this.server_info = server_info;
      this.projector.scheduleRender();
    }

    returnFalse() {
      return false;
    }
  }

  window.Page = new EpixPost();

  window.Page.createProjector();

})();
