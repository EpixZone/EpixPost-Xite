(function() {

  class ContentHubs {
    constructor() {
      this.update = this.update.bind(this);
      this.render = this.render.bind(this);
      this.renderHub = this.renderHub.bind(this);
      this.renderAddHub = this.renderAddHub.bind(this);
      this.updateHubs = this.updateHubs.bind(this);
      this.handleDownloadClick = this.handleDownloadClick.bind(this);
      this.handleJoinClick = this.handleJoinClick.bind(this);
      this.handleMenuClick = this.handleMenuClick.bind(this);
      this.handleCopyClick = this.handleCopyClick.bind(this);
      this.handleAddInput = this.handleAddInput.bind(this);
      this.handleAddKeydown = this.handleAddKeydown.bind(this);
      this.handleAddClick = this.handleAddClick.bind(this);
      this.renderCreateModal = this.renderCreateModal.bind(this);
      this.renderDiscoverHub = this.renderDiscoverHub.bind(this);
      this.handleCreateHubClick = this.handleCreateHubClick.bind(this);
      this.handleCreateCloseClick = this.handleCreateCloseClick.bind(this);
      this.handleCreateScrimClick = this.handleCreateScrimClick.bind(this);
      this.handleCreateTitleInput = this.handleCreateTitleInput.bind(this);
      this.handleCreateTitleKeydown = this.handleCreateTitleKeydown.bind(this);
      this.handleCreateDescriptionInput = this.handleCreateDescriptionInput.bind(this);
      this.handleCreateSubmit = this.handleCreateSubmit.bind(this);
      this.handleFinishSetupClick = this.handleFinishSetupClick.bind(this);
      this.checkPendingHub = this.checkPendingHub.bind(this);
      this.hubs = [];
      this.default_hubs = [];
      this.discover = [];
      this.need_update = true;
      this.loaded = false;
      this.downloading = {};
      this.joining = {};
      this.menus = {};
      this.add_value = "";
      this.adding = false;
      this.create_visible = false;
      this.create_title = "";
      this.create_description = "";
      this.creating = false;
      this.create_status = null;
      // admin_xids: hub address -> admin_xid from the hub's content.json
      // ("" = declared empty). Cached on the component; filled from the
      // mergerSiteList content summary or a lazy fileGet.
      this.admin_xids = {};
      this.admin_fetching = {};
      // Addresses this session already tried to auto-resume, so a failing
      // finishHubSetup does not loop.
      this.resume_attempted = {};
      // Resume check at app boot: a pending hub creation may have been
      // interrupted by the post-clone wrapper redirect reloading the page.
      Page.on_user_info.then(() => {
        this.checkPendingHub();
      });
    }

    isJoined(address) {
      return !!(Page.user_hubs && Page.user_hubs[address]);
    }

    isActive(address) {
      var ref;
      return ((ref = Page.user) != null ? ref.hub : void 0) === address;
    }

    isDefault(address) {
      var ref, ref1;
      var default_hubs = ((ref = Page.site_info.content) != null ? (ref1 = ref.settings) != null ? ref1.default_hubs : void 0 : void 0) || {};
      return !!default_hubs[address];
    }

    getHubTitle(address) {
      for (var i = 0; i < this.hubs.length; i++) {
        var hub = this.hubs[i];
        if (hub.address === address && hub.content && hub.content.title) {
          return hub.content.title;
        }
      }
      return Page.getHubTitle(address);
    }

    handleDownloadClick(e) {
      var hub = e.currentTarget.attributes.address.value;
      this.downloading[hub] = true;
      Page.needSite(hub, () => {
        this.update();
      });
      Page.projector.scheduleRender();
      return false;
    }

    handleJoinClick(e) {
      var hub = e.currentTarget.attributes.address.value;
      if (!(Page.site_info != null ? Page.site_info.cert_user_id : void 0)) {
        return Page.shell.handleSelectUserClick();
      }
      if (Page.user != null ? Page.user.hub : void 0) {
        Page.cmd("wrapperConfirm", [
          _("You already have a profile on hub") + " <b>" + this.getHubTitle(Page.user.hub) + "</b>.<br>" + _("Are you sure you want to create a new one?"),
          _("Create new profile")
        ], () => {
          this.joinHub(hub);
        });
      } else {
        this.joinHub(hub);
      }
      return false;
    }

    joinHub(hub) {
      this.joining[hub] = true;
      Page.projector.scheduleRender();
      HubActions.joinHub(hub, null, (ok) => {
        delete this.joining[hub];
        this.update();
      });
    }

    // One stable handler for every hub kebab (maquette handler identity rule);
    // the menu items are decided at click time from the hub's state.
    handleMenuClick(e) {
      var hub = e.currentTarget.attributes.address.value;
      var menu = this.menus[hub];
      if (!menu) {
        menu = this.menus[hub] = new Menu();
      }
      menu.items = [];
      if (this.isJoined(hub)) {
        menu.items.push([
          _("Leave hub"), (() => {
            HubActions.leaveHub(hub, () => {
              this.update();
            });
            return false;
          })
        ]);
      } else {
        menu.items.push([
          _("Stop seeding"), (() => {
            HubActions.stopSeeding(hub, () => {
              this.update();
            });
            return false;
          })
        ]);
      }
      menu.toggle();
      return false;
    }

    handleCopyClick(e) {
      var address = e.currentTarget.attributes.address.value;
      var notify = function() {
        Page.cmd("wrapperNotification", ["done", _("Address copied"), 3000]);
      };
      var fallback = function() {
        var field = document.createElement("textarea");
        field.value = address;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.focus();
        field.select();
        try {
          document.execCommand("copy");
          notify();
        } catch (err) {
          Page.cmd("wrapperNotification", ["error", _("Copy failed")]);
        }
        field.remove();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(address).then(notify, fallback);
      } else {
        fallback();
      }
      return false;
    }

    handleAddInput(e) {
      this.add_value = e.target.value;
    }

    handleAddKeydown(e) {
      if (e.keyCode === 13) {
        return this.handleAddClick();
      }
      return true;
    }

    handleAddClick() {
      var address = (this.add_value || "").trim();
      if (this.adding) {
        return false;
      }
      if (!address.startsWith("epix1") || address.length <= 20) {
        Page.cmd("wrapperNotification", ["error", _("Invalid hub address (should start with epix1)")]);
        return false;
      }
      if (Page.merged_sites[address]) {
        Page.cmd("wrapperNotification", ["info", _("You already seed this hub")]);
        return false;
      }
      // The loading state starts in the callback: mergerSiteAdd prompts the
      // user first and never calls back if the prompt is dismissed.
      Page.cmd("mergerSiteAdd", address, (res) => {
        if (res && res.error) {
          Page.cmd("wrapperNotification", ["error", res.error]);
          return;
        }
        this.adding = true;
        Page.projector.scheduleRender();
        this.checkAdded(address, 0);
      });
      return false;
    }

    // Right after mergerSiteAdd the hub's content.json may not be downloaded
    // yet, so poll mergerSiteList a few times before declaring the site not
    // an Epix Post hub.
    checkAdded(address, attempt) {
      Page.cmd("mergerSiteList", {}, (sites) => {
        if (sites[address]) {
          this.adding = false;
          this.add_value = "";
          Page.setHubRemoved(address, false);
          Page.updateSiteInfo(() => {
            this.update();
          });
        } else if (attempt < 5) {
          setTimeout((() => {
            this.checkAdded(address, attempt + 1);
          }), 2000);
        } else {
          this.adding = false;
          Page.cmd("wrapperNotification", ["error", _("Not an Epix Post hub")]);
          Page.projector.scheduleRender();
        }
      });
    }

    // ---- Create Hub ----

    canCreateHub() {
      var ref;
      return !!((Page.site_info != null ? Page.site_info.cert_user_id : void 0) && ((ref = Page.user) != null ? ref.hub : void 0));
    }

    getDefaultHubAddress() {
      var ref, ref1;
      var default_hubs = ((ref = Page.site_info.content) != null ? (ref1 = ref.settings) != null ? ref1.default_hubs : void 0 : void 0) || {};
      for (var address in default_hubs) {
        return address;
      }
      return null;
    }

    handleCreateHubClick() {
      if (!this.canCreateHub()) {
        Page.cmd("wrapperNotification", ["info", _("You need a profile for this feature")]);
        return false;
      }
      this.create_visible = true;
      Page.projector.scheduleRender();
      return false;
    }

    handleCreateCloseClick() {
      if (!this.creating) {
        this.create_visible = false;
        Page.projector.scheduleRender();
      }
      return false;
    }

    handleCreateScrimClick(e) {
      if (e.target === e.currentTarget) {
        return this.handleCreateCloseClick();
      }
      return true;
    }

    handleCreateTitleInput(e) {
      this.create_title = e.target.value;
    }

    handleCreateTitleKeydown(e) {
      if (e.keyCode === 13) {
        return this.handleCreateSubmit();
      }
      return true;
    }

    handleCreateDescriptionInput(e) {
      this.create_description = e.target.value;
    }

    setCreateStatus(text) {
      this.create_status = text;
      Page.projector.scheduleRender();
    }

    handleCreateSubmit() {
      if (this.creating) {
        return false;
      }
      var title = (this.create_title || "").trim();
      var description = (this.create_description || "").trim();
      if (!title) {
        Page.cmd("wrapperNotification", ["error", _("Hub name is required")]);
        return false;
      }
      var default_hub = this.getDefaultHubAddress();
      if (!default_hub) {
        Page.cmd("wrapperNotification", ["error", _("No default hub available to clone")]);
        return false;
      }
      this.creating = true;
      this.setCreateStatus(_("Creating your hub..."));
      // Persist the intent BEFORE cloning: the node pushes a wrapper redirect
      // to the new site after the clone, which may reload the page before the
      // WS response arrives. checkPendingHub() resumes from this state.
      Page.local_storage.pending_hub = {
        title: title,
        description: description,
        ts: Time.timestamp()
      };
      Page.saveLocalStorage(() => {
        Page.cmd("siteClone", [default_hub], (res) => {
          if (!res || res.error || !res.address) {
            delete Page.local_storage.pending_hub;
            Page.saveLocalStorage();
            this.failHubSetup((res != null ? res.error : void 0));
            return;
          }
          this.finishHubSetup(res.address);
        });
      });
      return false;
    }

    failHubSetup(error) {
      this.creating = false;
      this.setCreateStatus(null);
      Page.cmd("wrapperNotification", ["error", _("Hub creation failed") + (error ? ": " + error : "")]);
    }

    // Configure a freshly cloned hub: register it as a merged site, write
    // title/description/admin_xid into its content.json, sign + publish it
    // with the stored key, create the user's profile there and announce it.
    // Idempotent, so an interrupted run can be resumed on the same address.
    finishHubSetup(address) {
      var ref;
      var pending = (((ref = Page.local_storage) != null ? ref.pending_hub : void 0)) || {};
      this.creating = true;
      this.setCreateStatus(_("Configuring your new hub..."));
      var inner_path = "merged-EpixPost/" + address + "/content.json";
      // Idempotent: registers the (already served) clone as a merged site and
      // triggers the merger db rebuild + siteInfo push.
      Page.cmd("mergerSiteAdd", [address], () => {
        this.getMergedContent(address, 0, (content) => {
          if (!content) {
            this.failHubSetup(_("Not an Epix Post hub"));
            return;
          }
          if (pending.title) {
            content.title = pending.title;
          }
          if (pending.description) {
            content.description = pending.description;
          }
          content.admin_xid = Page.user.getDirectory();
          Page.cmd("fileWrite", [inner_path, Text.fileEncode(content)], (res_write) => {
            if (res_write !== "ok") {
              this.failHubSetup((res_write != null ? res_write.error : void 0) || res_write);
              return;
            }
            Page.cmd("siteSign", {inner_path: inner_path, privatekey: "stored"}, (res_sign) => {
              if (res_sign !== "ok") {
                this.failHubSetup((res_sign != null ? res_sign.error : void 0) || res_sign);
                return;
              }
              Page.cmd("sitePublish", {inner_path: inner_path}, () => {
                this.admin_xids[address] = content.admin_xid;
                this.setCreateStatus(_("Creating your profile on the new hub..."));
                this.joinNewHub(address, () => {
                  this.setCreateStatus(_("Announcing your hub..."));
                  Page.user.announceHub(address, content.title, content.description || "", () => {
                    delete Page.local_storage.pending_hub;
                    Page.saveLocalStorage();
                    this.creating = false;
                    this.create_visible = false;
                    this.create_title = "";
                    this.create_description = "";
                    this.setCreateStatus(null);
                    Page.cmd("wrapperNotification", ["done", _("Your hub is ready!"), 8000]);
                    Page.updateSiteInfo(() => {
                      this.update();
                    });
                  });
                });
              });
            });
          });
        });
      });
    }

    // The clone lives on this node, but right after mergerSiteAdd the merged
    // path may not resolve yet: retry the fileGet a few times.
    getMergedContent(address, attempt, cb) {
      Page.cmd("fileGet", {
        "inner_path": "merged-EpixPost/" + address + "/content.json",
        "required": false
      }, (res) => {
        var content = null;
        if (res) {
          try {
            content = JSON.parse(res);
          } catch (err) {
            content = null;
          }
        }
        if (content) {
          cb(content);
        } else if (attempt < 5) {
          setTimeout((() => {
            this.getMergedContent(address, attempt + 1, cb);
          }), 1000);
        } else {
          cb(null);
        }
      });
    }

    // Create the user's profile on the new hub, skipping the join when it
    // already exists (resumed setup) to avoid HubActions' error notification.
    joinNewHub(address, cb) {
      if (Page.user_hubs && Page.user_hubs[address]) {
        cb(true);
        return;
      }
      Page.cmd("fileGet", {
        "inner_path": "merged-EpixPost/" + address + "/data/users/" + Page.user.getDirectory() + "/content.json",
        "required": false
      }, (found) => {
        if (found) {
          Page.checkUser(() => {
            cb(true);
          });
          return;
        }
        HubActions.joinHub(address, null, (ok) => {
          cb(ok);
        });
      });
    }

    // Resume an interrupted hub creation. Called once at app boot and on
    // every Hubs page refresh: when local_storage.pending_hub is fresh
    // (< 30 min), look for an owned, seeded EpixPost hub whose content still
    // has an empty admin_xid and continue finishHubSetup on it. When none is
    // found the pending state is kept: renderHub shows a "Finish hub setup"
    // button on owned cards with an empty admin_xid instead.
    checkPendingHub(sites) {
      var ref;
      var pending = (ref = Page.local_storage) != null ? ref.pending_hub : void 0;
      if (!pending || this.creating) {
        return;
      }
      if (!this.canCreateHub()) {
        return;
      }
      if (Time.timestamp() - (pending.ts || 0) > 30 * 60) {
        return;
      }
      var check = (sites) => {
        var candidates = [];
        for (var address in sites) {
          var site = sites[address];
          if (!site || !site.settings || !site.settings.own) {
            continue;
          }
          if (this.isDefault(address) || this.resume_attempted[address]) {
            continue;
          }
          candidates.push(site);
        }
        var tryNext = () => {
          if (this.creating || !candidates.length) {
            return;
          }
          var site = candidates.shift();
          this.getAdminXidAsync(site, (admin) => {
            if (admin === "") {
              this.resume_attempted[site.address] = true;
              this.log("Resuming pending hub setup on", site.address);
              Page.cmd("wrapperNotification", ["info", _("Resuming hub setup..."), 5000]);
              this.finishHubSetup(site.address);
            } else {
              tryNext();
            }
          });
        };
        tryNext();
      };
      if (sites) {
        check(sites);
      } else {
        Page.cmd("mergerSiteList", true, check);
      }
    }

    // The admin_xid of a merged site, from the siteInfo content summary when
    // it carries the key, else from the hub's own content.json.
    getAdminXidAsync(site, cb) {
      if (site.content && typeof site.content.admin_xid === "string") {
        this.admin_xids[site.address] = site.content.admin_xid;
        cb(site.content.admin_xid);
        return;
      }
      Page.cmd("fileGet", {
        "inner_path": "merged-EpixPost/" + site.address + "/content.json",
        "required": false
      }, (res) => {
        var admin = null;
        if (res) {
          try {
            var content = JSON.parse(res);
            admin = typeof content.admin_xid === "string" ? content.admin_xid : null;
          } catch (err) {
            admin = null;
          }
        }
        if (admin != null) {
          this.admin_xids[site.address] = admin;
        }
        cb(admin);
      });
    }

    // Cached admin_xid for a hub card: the mergerSiteList content summary
    // usually carries it; fall back to a lazy fileGet of the hub's merged
    // content.json (seeded hubs only). Returns null while unknown.
    getAdminXid(hub) {
      var address = hub.address;
      if (this.admin_xids[address] != null) {
        return this.admin_xids[address];
      }
      if (hub.content && typeof hub.content.admin_xid === "string") {
        this.admin_xids[address] = hub.content.admin_xid;
        return this.admin_xids[address];
      }
      if (hub.type !== "seeded") {
        return null;
      }
      if (!this.admin_fetching[address]) {
        this.admin_fetching[address] = true;
        Page.cmd("fileGet", {
          "inner_path": "merged-EpixPost/" + address + "/content.json",
          "required": false
        }, (res) => {
          var admin = "";
          if (res) {
            try {
              var content = JSON.parse(res);
              admin = typeof content.admin_xid === "string" ? content.admin_xid : "";
            } catch (err) {
              admin = "";
            }
          }
          this.admin_xids[address] = admin;
          Page.projector.scheduleRender();
        });
      }
      return null;
    }

    handleFinishSetupClick(e) {
      var hub = e.currentTarget.attributes.address.value;
      if (!this.canCreateHub()) {
        Page.cmd("wrapperNotification", ["info", _("You need a profile for this feature")]);
        return false;
      }
      if (!this.creating) {
        this.finishHubSetup(hub);
      }
      return false;
    }

    updateHubs() {
      Page.cmd("mergerSiteList", true, (sites) => {
        Page.cmd("dbQuery", "SELECT * FROM json WHERE directory LIKE 'data/users/%' AND file_name = 'data.json'", (users) => {
          var site_users = {};
          for (var i = 0, len = users.length; i < len; i++) {
            var user = users[i];
            if (site_users[user.hub] == null) {
              site_users[user.hub] = [];
            }
            site_users[user.hub].push(user);
          }
          var hubs = [];
          for (var address in sites) {
            var site = sites[address];
            site["users"] = site_users[site.address] || [];
            site["type"] = "seeded";
            hubs.push(site);
          }
          this.hubs = hubs;
          this.loaded = true;
          Page.projector.scheduleRender();
        });
        this.default_hubs = [];
        var ref = ((Page.site_info.content != null ? Page.site_info.content.settings : void 0) || {}).default_hubs || {};
        for (var address in ref) {
          var content = ref[address];
          if (!sites[address] && !this.downloading[address]) {
            this.default_hubs.push({
              users: [],
              address: address,
              content: content,
              type: "available"
            });
          }
        }
        this.updateDiscover(sites);
        this.checkPendingHub(sites);
      });
    }

    // Hubs announced by users in their data.json (hub_announce rows): newest
    // announce per address, hubs the node already seeds are left out.
    updateDiscover(sites) {
      Page.cmd("dbQuery", "SELECT hub_announce.*, json.directory, json.cert_user_id FROM hub_announce LEFT JOIN json USING (json_id) ORDER BY date_added DESC", (rows) => {
        var discover = [];
        var seen = {};
        if (rows && !rows.error) {
          for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row.address || seen[row.address]) {
              continue;
            }
            seen[row.address] = true;
            if (sites[row.address] || row.address === Page.address) {
              continue;
            }
            discover.push(row);
          }
        }
        this.discover = discover;
        Page.projector.scheduleRender();
      });
    }

    renderHub(hub) {
      var rendered = 0;
      var address = hub.address;
      var seeded = hub.type === "seeded";
      var joined = this.isJoined(address);
      var active = this.isActive(address);
      var menu = this.menus[address];
      var title = (hub.content != null ? hub.content.title : void 0) || address.slice(0, 16) + "...";
      var admin = this.getAdminXid(hub);
      // An owned hub whose content still has an empty admin_xid is a clone
      // whose setup never finished (e.g. the page reloaded mid-creation).
      var setup_unfinished = seeded && admin === "" && (hub.settings != null ? hub.settings.own : void 0) && !this.isDefault(address);
      return h("div.hub.card.hub-detail", {
        key: address + hub.type,
        enterAnimation: Animation.slideDown,
        exitAnimation: Animation.slideUp
      }, [
        h("div.hub-head", [
          h("div.hub-headmain", [
            h("div.name", title),
            // Badge labels: "Featured" = listed in the app's
            // settings.default_hubs, "Default" = where new posts go
            // (the user's posting hub, Page.user.hub)
            h("div.hub-badges", [
              this.isDefault(address) ? h("span.hub-badge.badge-default", _("Featured")) : void 0,
              seeded ? h("span.hub-badge.badge-seeding", _("Seeding")) : void 0,
              joined && !active ? h("span.hub-badge.badge-joined", _("Joined")) : void 0,
              active ? h("span.hub-badge.badge-active", _("Default")) : void 0
            ])
          ]),
          h("div.hub-actions", [
            !seeded ? h("a.button.button-small.button-submit", {
              href: "#Download:" + address,
              address: address,
              onclick: this.handleDownloadClick,
              classes: {loading: this.downloading[address]}
            }, _("Download")) : void 0,
            setup_unfinished ? h("a.button.button-small.button-submit", {
              href: "#Finish:" + address,
              address: address,
              onclick: this.handleFinishSetupClick,
              classes: {loading: this.creating}
            }, _("Finish hub setup")) : void 0,
            seeded && !joined ? h("a.button.button-small", {
              href: "#Join:" + address,
              address: address,
              onclick: this.handleJoinClick,
              classes: {loading: this.joining[address]}
            }, _("Join")) : void 0,
            seeded ? h("a.icon.icon-kebab.hub-kebab", {
              href: "#Menu:" + address,
              title: _("More"),
              address: address,
              onclick: Page.returnFalse,
              onmousedown: this.handleMenuClick
            }) : void 0,
            menu ? menu.render(".menu-right" + (joined ? ".menu-danger" : "")) : void 0
          ])
        ]),
        hub.content && hub.content.description ? h("div.intro", hub.content.description) : void 0,
        h("a.hub-address", {
          href: "#Copy:" + address,
          title: _("Copy address"),
          address: address,
          onclick: this.handleCopyClick
        }, address.slice(0, 14) + "..." + address.slice(-6)),
        hub.users.length ? h("div.avatars", [
          hub.users.map((user) => {
            if ((user.avatar !== "jpg" && user.avatar !== "png") || rendered >= 4) {
              return "";
            }
            var avatar = "merged-EpixPost/" + hub.address + "/" + user.directory + "/avatar." + user.avatar;
            rendered += 1;
            return h("a.avatar", {
              key: user.user_name,
              title: user.user_name,
              style: "background-image: url('" + avatar + "')"
            });
          }),
          hub.users.length - rendered > 0 ? h("a.avatar.empty", "+" + (hub.users.length - rendered)) : void 0
        ]) : void 0,
        h("div.hub-stats", [
          h("span.hub-stat", hub.users.length + " " + _("users")),
          seeded && hub.peers != null ? h("span.hub-stat", hub.peers + " " + _("peers")) : void 0,
          admin ? h("span.hub-stat.hub-admin", _("Admin:") + " " + Text.formatUsername(admin)) : void 0
        ])
      ]);
    }

    // A hub announced by another user: not seeded yet, so its content.json
    // (and admin_xid) is unknown until the visitor downloads it. Verified =
    // the announcer's directory matches the hub's declared admin_xid.
    renderDiscoverHub(row) {
      var address = row.address;
      var announcer = (row.directory || "").replace(/^data\/users\//, "");
      var admin = this.admin_xids[address];
      var verified = admin != null && admin !== "" && admin === announcer;
      return h("div.hub.card.hub-detail.hub-discover", {
        key: "discover-" + address,
        enterAnimation: Animation.slideDown,
        exitAnimation: Animation.slideUp
      }, [
        h("div.hub-head", [
          h("div.hub-headmain", [
            h("div.name", row.title || address.slice(0, 16) + "..."),
            verified ? h("div.hub-badges", [
              h("span.hub-badge.badge-verified", _("Verified"))
            ]) : void 0
          ]),
          h("div.hub-actions", [
            h("a.button.button-small.button-submit", {
              href: "#Download:" + address,
              address: address,
              onclick: this.handleDownloadClick,
              classes: {loading: this.downloading[address]}
            }, _("Download"))
          ])
        ]),
        row.description ? h("div.intro", row.description) : void 0,
        h("a.hub-address", {
          href: "#Copy:" + address,
          title: _("Copy address"),
          address: address,
          onclick: this.handleCopyClick
        }, address.slice(0, 14) + "..." + address.slice(-6)),
        h("div.hub-stats", [
          h("span.hub-stat", _("Announced by") + " " + Text.formatUsername(announcer) + (verified ? "" : " " + _("(unverified)"))),
          row.date_added ? h("span.hub-stat", Time.since(row.date_added)) : void 0
        ])
      ]);
    }

    renderCreateHubButton() {
      var enabled = this.canCreateHub();
      return h("div.hub-create-row", [
        h("a.button.button-submit.button-create-hub", {
          href: "#Create+hub",
          title: enabled ? _("Create Hub") : _("You need a profile for this feature"),
          onclick: this.handleCreateHubClick,
          classes: {disabled: !enabled, loading: this.creating && !this.create_visible}
        }, _("Create Hub"))
      ]);
    }

    renderCreateModal() {
      if (!this.create_visible) {
        return void 0;
      }
      return h("div.composer-scrim", {
        key: "hub-create",
        onclick: this.handleCreateScrimClick
      }, [
        h("div.composer-modal.hub-create-modal", [
          h("div.composer-head", [
            h("a.icon.icon-close.composer-close", {
              href: "#Close",
              title: _("Close"),
              onclick: this.handleCreateCloseClick
            }),
            h("h2.hub-create-title", _("Create your own hub"))
          ]),
          h("p.hub-create-note", _("A hub stores profiles and posts. Your account becomes its admin.")),
          h("input.text.hub-create-name", {
            placeholder: _("Hub name"),
            value: this.create_title,
            oninput: this.handleCreateTitleInput,
            onkeydown: this.handleCreateTitleKeydown
          }),
          h("textarea.hub-create-description", {
            placeholder: _("Description"),
            value: this.create_description,
            oninput: this.handleCreateDescriptionInput
          }),
          h("div.hub-create-actions", [
            this.create_status ? h("span.hub-create-status", [
              h("span.spinner"),
              h("span.hub-create-status-text", this.create_status)
            ]) : void 0,
            h("a.button.button-submit", {
              href: "#Create",
              onclick: this.handleCreateSubmit,
              classes: {loading: this.creating}
            }, _("Create"))
          ])
        ])
      ]);
    }

    renderAddHub() {
      return h("div.hub-add", [
        h("h2.sep", _("Add hub by address")),
        h("div.hub-add-row", [
          h("input.text", {
            placeholder: _("Hub address (epix1...)"),
            value: this.add_value,
            oninput: this.handleAddInput,
            onkeydown: this.handleAddKeydown
          }),
          h("a.button.button-submit", {
            href: "#Add+hub",
            onclick: this.handleAddClick,
            classes: {loading: this.adding}
          }, _("Add"))
        ])
      ]);
    }

    render() {
      if (this.loaded && !Page.on_loaded.resolved) {
        Page.on_loaded.resolve();
      }
      if (this.need_update) {
        this.log("Updating");
        this.need_update = false;
        this.updateHubs();
      }
      return h("div#Content.center.content-hubs", [
        h("h1", _("Hubs")),
        h("div.hubs-note", _("Hubs store the user profiles of Epix Post. Seed more hubs to see more people.")),
        this.renderCreateHubButton(),
        h("div.hubs.hubs-seeded", this.hubs.map(this.renderHub)),
        this.default_hubs.length ? h("h2.sep", _("Available hubs")) : void 0,
        h("div.hubs.hubs-default", this.default_hubs.map(this.renderHub)),
        this.discover.length ? h("h2.sep", _("Discover hubs")) : void 0,
        this.discover.length ? h("div.hubs.hubs-discover", this.discover.map(this.renderDiscoverHub)) : void 0,
        this.renderAddHub(),
        this.renderCreateModal()
      ]);
    }

    update() {
      this.need_update = true;
      Page.projector.scheduleRender();
    }
  }

  Object.assign(ContentHubs.prototype, LogMixin);
  window.ContentHubs = ContentHubs;

})();
