(function() {

  var EpixFrame = window.EpixFrame;

  window.h = maquette.h;

  class EpixPost extends EpixFrame {
    constructor() {
      super();
      this.signSiteContent = this.signSiteContent.bind(this);
      this.queryUserdb = this.queryUserdb.bind(this);
      this.autoCreateXidProfile = this.autoCreateXidProfile.bind(this);
      this.checkUser = this.checkUser.bind(this);
      this.getXidDisplayBio = this.getXidDisplayBio.bind(this);
      this.getXidDisplayAvatar = this.getXidDisplayAvatar.bind(this);
      this.getXidDisplayName = this.getXidDisplayName.bind(this);
      this.resolveXidProfiles = this.resolveXidProfiles.bind(this);
      this.needSite = this.needSite.bind(this);
      this.updateSiteInfo = this.updateSiteInfo.bind(this);
      this.onOpenWebsocket = this.onOpenWebsocket.bind(this);
      this.handleLinkClick = this.handleLinkClick.bind(this);
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
      this.userdb = "1UDbADib99KE9d3qZ87NqJF2QLTHmMkoV";
      this.cache_time = Time.timestamp();
      this.xid_profiles = {};
      this.on_site_info = new Deferred();
      this.on_local_storage = new Deferred();
      this.on_user_info = new Deferred();
      this.on_loaded = new Deferred();
      this.local_storage = null;
      this.on_local_storage.then(() => {
        this.checkUser(() => {
          this.on_user_info.resolve();
        });
      });
      this.on_site_info.then(() => {
        if (this.site_info.settings.permissions.indexOf("Merger:EpixPost") < 0) {
          this.cmd("wrapperPermissionAdd", "Merger:EpixPost", () => {
            this.updateSiteInfo(() => {
              this.content.update();
            });
          });
        }
      });
    }

    createProjector() {
      this.projector = maquette.createProjector();
      this.head = new Head();
      this.overlay = new Overlay();
      this.content_feed = new ContentFeed();
      this.content_users = new ContentUsers();
      this.content_profile = new ContentProfile();
      this.content_create_profile = new ContentCreateProfile();
      this.scrollwatcher = new Scrollwatcher();
      this.trigger = new Trigger();
      if (base.href.indexOf("?") === -1) {
        this.route("");
      } else {
        var url = base.href.replace(/.*?\?/, "");
        this.route(url);
        this.history_state["url"] = url;
      }
      this.on_loaded.then(() => {
        this.log("onloaded");
        window.requestAnimationFrame(() => {
          document.body.classList.add("loaded");
        });
      });
      this.projector.replace($("#Head"), this.head.render);
      this.projector.replace($("#Overlay"), this.overlay.render);
      this.projector.merge($("#Trigger"), this.trigger.render);
      this.loadLocalStorage();
      setInterval(function() {
        Page.projector.scheduleRender();
      }, 60 * 1000);
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
      this.log("Route", this.params);
      if (this.params.urls[0] === "Create+profile") {
        content = this.content_create_profile;
      } else if (this.params.urls[0] === "Users" && (content = this.content_users)) {

      } else if (this.params.urls[0] === "ProfileName") {
        this.content_profile.findUser(this.params.urls[1], (user) => {
          this.setUrl(user.getLink(), "replace");
        });
      } else if (this.params.urls[0] === "Profile") {
        content = this.content_profile;
        changed = this.content_profile.auth_address !== this.params.urls[2];
        this.content_profile.setUser(this.params.urls[1], this.params.urls[2]).filter(null);
      } else if (this.params.urls[0] === "Post") {
        content = this.content_profile;
        changed = this.content_profile.auth_address !== this.params.urls[2] || this.content_profile.filter_post_id !== this.params.urls[3];
        this.content_profile.setUser(this.params.urls[1], this.params.urls[2]).filter(this.params.urls[3]);
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
      }
      this.route(url);
      return false;
    }

    handleLinkClick(e) {
      if (e.which === 2) {
        return true;
      } else {
        this.log("save scrollTop", window.pageYOffset);
        this.history_state["scrollTop"] = window.pageYOffset;
        this.cmd("wrapperReplaceState", [this.history_state, null]);
        window.scroll(window.pageXOffset, 0);
        this.history_state["scrollTop"] = 0;
        this.on_loaded.resolved = false;
        document.body.classList.remove("loaded");
        this.setUrl(e.currentTarget.search);
        return false;
      }
    }

    createUrl(key, val) {
      var params, vals;
      params = JSON.parse(JSON.stringify(this.params));
      if (typeof key === "Object") {
        vals = key;
        for (key in keys) {
          val = keys[key];
          params[key] = val;
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
      this.cmd("mergerSiteList", {}, (merged_sites) => {
        this.merged_sites = merged_sites;
        on_site_info.then(() => {
          if (this.site_info.settings.permissions.indexOf("Merger:EpixPost") >= 0) {
            if (!this.merged_sites[this.userdb] && this.userdb.startsWith("epix1")) {
              this.cmd("mergerSiteAdd", this.userdb);
            }
            var default_hubs = (this.site_info.content != null ? (this.site_info.content.settings != null ? this.site_info.content.settings.default_hubs : void 0) : void 0) || {};
            for (var address in default_hubs) {
              if (!this.merged_sites[address]) {
                this.log("Auto-adding default hub", address);
                this.cmd("mergerSiteAdd", address);
              }
            }
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

    needSite(address, cb) {
      if (this.merged_sites[address]) {
        if (typeof cb === "function") cb(true);
      } else {
        Page.cmd("mergerSiteAdd", address, cb);
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
          if (this.user_hubs[this.local_storage.settings.hub]) {
            row = this.user_hubs[this.local_storage.settings.hub];
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
            this.queryUserdb(this.site_info.auth_address, (user) => {
              if (user) {
                if (!this.merged_sites[user.hub]) {
                  this.log("Profile not seeded, but found in the userdb", user);
                  Page.cmd("mergerSiteAdd", user.hub, () => {
                    if (typeof cb === "function") cb(true);
                  });
                } else {
                  if (typeof cb === "function") cb(true);
                }
              } else {
                if (typeof cb === "function") cb(false);
              }
            });
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

    queryUserdb(auth_address, cb) {
      var query = "SELECT\n CASE WHEN user.auth_address IS NULL THEN REPLACE(json.directory, \"data/userdb/\", \"\") ELSE user.auth_address END AS auth_address,\n CASE WHEN user.cert_user_id IS NULL THEN json.cert_user_id ELSE user.cert_user_id END AS cert_user_id,\n *\nFROM user\nLEFT JOIN json USING (json_id)\nWHERE\n user.auth_address = :auth_address OR\n json.directory = :directory\nLIMIT 1";
      Page.cmd("dbQuery", [
        query, {
          auth_address: auth_address,
          directory: "data/userdb/" + auth_address
        }
      ], (res) => {
        if ((res != null ? res.length : void 0) > 0) {
          if (typeof cb === "function") cb(res[0]);
        } else {
          if (typeof cb === "function") cb(false);
        }
      });
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
          this.cmd("wrapperNotification", ["error", "Site signing failed: " + ((res != null ? res.error : void 0) || res)]);
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
        if (!this.site_info) {
          this.site_info = site_info;
          this.on_site_info.resolve();
        }
        this.site_info = site_info;
        if (site_info.event != null ? site_info.event[0] === "cert_changed" : void 0) {
          this.checkUser((found) => {
            if (Page.site_info.cert_user_id && !found && !Page.site_info.cert_user_id.match(/@xid$/)) {
              this.setUrl("?Create+profile");
            }
            if (Page.site_info.cert_user_id) {
              Page.head.follows["Mentions"] = true;
              Page.head.follows["Comments on your posts"] = true;
              Page.head.saveFollows();
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
        } else if (!file_name.endsWith("content.json") || file_name.indexOf(this.userdb) !== -1) {
          if (site_info.tasks > 100) {
            RateLimit(3000, this.content.update);
          } else if (site_info.tasks > 20) {
            RateLimit(1000, this.content.update);
          } else {
            RateLimit(500, this.content.update);
          }
        }
      }
    }

    setServerInfo(server_info) {
      this.server_info = server_info;
      if (this.server_info.rev < 1400) {
        this.cmd("wrapperNotification", ["error", "This site requries EpixNet 0.4.0+<br>Please delete the site from your current client, update it, then add again!"]);
      }
      this.projector.scheduleRender();
    }

    returnFalse() {
      return false;
    }
  }

  window.Page = new EpixPost();

  window.Page.createProjector();

})();
