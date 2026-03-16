(function() {

  class ContentCreateProfile {
    constructor() {
      this.update = this.update.bind(this);
      this.render = this.render.bind(this);
      this.renderDefaultHubs = this.renderDefaultHubs.bind(this);
      this.renderSeededHubs = this.renderSeededHubs.bind(this);
      this.renderHub = this.renderHub.bind(this);
      this.updateHubs = this.updateHubs.bind(this);
      this.joinHub = this.joinHub.bind(this);
      this.handleJoinClick = this.handleJoinClick.bind(this);
      this.handleDownloadClick = this.handleDownloadClick.bind(this);
      this.loaded = true;
      this.hubs = [];
      this.default_hubs = [];
      this.need_update = true;
      this.creation_status = [];
      this.downloading = {};
    }

    handleDownloadClick(e) {
      var hub = e.target.attributes.address.value;
      this.downloading[hub] = true;
      Page.needSite(hub, () => {
        return this.update();
      });
      return false;
    }

    handleJoinClick(e) {
      var hub_address = e.target.attributes.address.value;
      if (Page.user != null ? Page.user.hub : void 0) {
        var hub_name;
        var ref1 = (() => {
          var results = [];
          for (var i = 0, len = this.hubs.length; i < len; i++) {
            var hub = this.hubs[i];
            if (hub.address === Page.user.hub) {
              results.push(hub.content.title);
            }
          }
          return results;
        })();
        hub_name = ref1 != null ? ref1[0] : void 0;
        if (hub_name == null) {
          hub_name = Page.user.hub;
        }
        return Page.cmd("wrapperConfirm", ["You already have profile on hub <b>" + hub_name + "</b>,<br>are you sure you want to create a new one?", "Create new profile"], () => {
          return this.joinHub(hub_address);
        });
      } else {
        return this.joinHub(hub_address);
      }
    }

    joinHub(hub) {
      var user = new User({
        hub: hub,
        auth_address: Page.site_info.auth_address
      });
      this.creation_status.push("Checking user on selected hub...");
      Page.cmd("fileGet", {
        "inner_path": user.getPath() + "/content.json",
        "required": false
      }, (found) => {
        if (found) {
          Page.cmd("wrapperNotification", ["error", "User " + Page.site_info.cert_user_id + " already exists on this hub"]);
          this.creation_status = [];
          return;
        }
        var data = user.getDefaultData();
        data.hub = hub;
        this.creation_status.push("Creating new profile...");
        return user.save(data, hub, () => {
          this.creation_status = [];
          Page.checkUser();
          return Page.setUrl("?Home");
        });
      });
      return false;
    }

    updateHubs() {
      return Page.cmd("mergerSiteList", true, (sites) => {
        Page.cmd("dbQuery", "SELECT * FROM json", (users) => {
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
            if (address === Page.userdb) {
              continue;
            }
            site["users"] = site_users[site.address] || [];
            hubs.push(site);
          }
          this.hubs = hubs;
          return Page.projector.scheduleRender();
        });
        this.default_hubs = [];
        var ref = Page.site_info.content.settings.default_hubs;
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
      });
    }

    renderHub(hub) {
      var rendered = 0;
      return h("div.hub.card", {
        key: hub.address + hub.type,
        enterAnimation: Animation.slideDown,
        exitAnimation: Animation.slideUp
      }, [
        hub.type === "available" ? h("a.button.button-join", {
          href: "#Download:" + hub.address,
          address: hub.address,
          onclick: this.handleDownloadClick
        }, "Download") : h("a.button.button-join", {
          href: "#Join:" + hub.address,
          address: hub.address,
          onclick: this.handleJoinClick
        }, "Join!"), h("div.avatars", [
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
          }), hub.users.length - rendered > 0 ? h("a.avatar.empty", "+" + (hub.users.length - rendered)) : void 0
        ]), h("div.name", hub.content.title), h("div.intro", hub.content.description)
      ]);
    }

    renderSeededHubs() {
      return h("div.hubs.hubs-seeded", this.hubs.map(this.renderHub));
    }

    renderDefaultHubs() {
      return h("div.hubs.hubs-default", this.default_hubs.map(this.renderHub));
    }

    handleSelectUserClick() {
      Page.cmd("certXid", {});
      return false;
    }

    render() {
      if (this.loaded && !Page.on_loaded.resolved) {
        Page.on_loaded.resolve();
      }
      if (this.need_update) {
        this.updateHubs();
        this.need_update = false;
      }
      return h("div#Content.center.content-signup", [
        h("h1", "Create new profile"), h("a.button.button-submit.button-certselect.certselect", {
          href: "#Select+user",
          onclick: this.handleSelectUserClick
        }, [h("div.icon.icon-profile"), (Page.site_info != null ? Page.site_info.cert_user_id : void 0) ? "As: " + Page.site_info.cert_user_id : "Select ID..."]), this.creation_status.length > 0 ? h("div.creation-status", {
          enterAnimation: Animation.slideDown,
          exitAnimation: Animation.slideUp
        }, [
          this.creation_status.map((creation_status) => {
            return h("h3", {
              key: creation_status,
              enterAnimation: Animation.slideDown,
              exitAnimation: Animation.slideUp
            }, creation_status);
          })
        ]) : Page.site_info.cert_user_id ? h("div.hubs", {
          enterAnimation: Animation.slideDown,
          exitAnimation: Animation.slideUp
        }, [
          this.hubs.length ? h("div.hubselect.seeded", {
            enterAnimation: Animation.slideDown,
            exitAnimation: Animation.slideUp
          }, [h("h2", "Seeded HUBs"), this.renderSeededHubs()]) : void 0, this.default_hubs.length ? h("div.hubselect.default", {
            enterAnimation: Animation.slideDown,
            exitAnimation: Animation.slideUp
          }, [h("h2", "Available HUBs"), this.renderDefaultHubs()]) : void 0, h("h5", "(With this you choose where is your profile stored. There is no difference on content and you will able to reach all users from any hub)")
        ]) : void 0
      ]);
    }

    update() {
      this.need_update = true;
      return Page.projector.scheduleRender();
    }
  }

  Object.assign(ContentCreateProfile.prototype, LogMixin);
  window.ContentCreateProfile = ContentCreateProfile;

})();
