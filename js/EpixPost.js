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
      // The Merger permission is no longer requested automatically on boot:
      // the onboarding card on the feed asks for it as its first step.
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

    updateSiteInfo(cb) {
      if (cb == null) cb = null;
      var on_site_info = new Deferred();
      // query_site_info=true so every consumer (hub pills, filter menu,
      // composer) can resolve hub titles from one cache. Values are truthy
      // either way, so the seeded-checks all keep working.
      this.cmd("mergerSiteList", true, (merged_sites) => {
        this.merged_sites = merged_sites;
        on_site_info.then(() => {
          if (this.site_info.settings.permissions.indexOf("Merger:EpixPost") >= 0) {
            var default_hubs = (this.site_info.content != null ? (this.site_info.content.settings != null ? this.site_info.content.settings.default_hubs : void 0) : void 0) || {};
            // Auto-add waits for local storage: hubs the user explicitly
            // removed (Stop seeding / Leave hub on the Hubs page) are
            // remembered in settings.removed_hubs and not re-added.
            this.on_local_storage.then(() => {
              var removed_hubs = this.local_storage.settings.removed_hubs || {};
              for (var address in default_hubs) {
                if (!this.merged_sites[address] && !removed_hubs[address]) {
                  this.log("Auto-adding default hub", address);
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

    needSite(address, cb) {
      this.setHubRemoved(address, false);
      if (this.merged_sites[address]) {
        if (typeof cb === "function") cb(true);
      } else {
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
          });
        } else {
          this.user = new AnonUser();
          this.user.updateInfo();
          if (this.site_info.cert_user_id != null ? this.site_info.cert_user_id.match(/@xid$/) : void 0) {
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

    setSiteInfo(site_info) {
      if (site_info.address === this.address) {
        var had_permission = this.site_info == null || this.site_info.settings.permissions.indexOf("Merger:EpixPost") >= 0;
        if (!this.site_info) {
          this.site_info = site_info;
          this.on_site_info.resolve();
        }
        this.site_info = site_info;
        var has_permission = site_info.settings != null ? site_info.settings.permissions.indexOf("Merger:EpixPost") >= 0 : false;
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
            if (Page.site_info.cert_user_id && !found && !Page.site_info.cert_user_id.match(/@xid$/)) {
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
