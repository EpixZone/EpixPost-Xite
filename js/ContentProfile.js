(function() {

  class ContentProfile {
    constructor() {
      this.update = this.update.bind(this);
      this.render = this.render.bind(this);
      this.queryProfileStats = this.queryProfileStats.bind(this);
      this.resolveAndFinish = this.resolveAndFinish.bind(this);
      this.hasUserIdentity = this.hasUserIdentity.bind(this);
      this.handleEditProfileClick = this.handleEditProfileClick.bind(this);
      this.handleProfileMenuClick = this.handleProfileMenuClick.bind(this);
      this.handleMessageClick = this.handleMessageClick.bind(this);
      this.filter = this.filter.bind(this);
      this.findUser = this.findUser.bind(this);
      this.setUser = this.setUser.bind(this);
      this.getUserDir = this.getUserDir.bind(this);
      this.renderNotSeeded = this.renderNotSeeded.bind(this);
      this.post_list = null;
      this.activity_list = null;
      this.user_list = null;
      this.auth_address = null;
      this.user = new User();
      this.activity_list = new ActivityList();
      this.menu = new Menu();
      this.owned = false;
      this.need_update = true;
      this.noanim = false;
      this.filter_post_id = null;
      this.loaded = false;
      this.follower_count = 0;
      this.following_count = 0;
      this.post_count = 0;
    }

    renderNotSeeded() {
      return h("div#Content.center." + this.auth_address, [
        h("div.col-left", [
          h("div.users", [
            h("div.user.card.profile", [
              this.user.renderAvatar(), h("a.name.link", {
                href: this.user.getLink(),
                onclick: Page.handleLinkClick
              }, this.user.getDisplayName()), h("div.intro-full", this.user.getDisplayIntro()), h("div.follow-container", [
                h("a.button.button-follow-big", {
                  href: "#",
                  onclick: this.user.handleFollowClick,
                  classes: {
                    loading: this.user.submitting_follow
                  }
                }, h("span.icon-follow", "+"), this.user.isFollowed() ? _("Unfollow") : _("Follow")), this.canMessage() ? h("a.button.button-message", {
                  key: "message",
                  href: "#Message",
                  onclick: this.handleMessageClick
                }, [h("span.icon.icon-mail"), _("Message")]) : void 0
              ])
            ])
          ])
        ]), h("div.col-center", [
          h("div.post-list-empty.thread-notseeded", [
            h("h2", _("This user's profile is on a hub you don't seed yet")),
            h("p", _("Download the hub to see their posts.")),
            h("a.button.button-submit", {
              href: "#Add+site",
              onclick: this.user.handleDownloadClick
            }, _("Download hub"))
          ])
        ])
      ]);
    }

    // Short second line under the display name: the cert id, or a truncated
    // address when there is no cert.
    getHandle() {
      var ref;
      var cert = (ref = this.user.row) != null ? ref.cert_user_id : void 0;
      if (cert) {
        return cert;
      }
      if (this.auth_address && this.auth_address.length > 24) {
        return this.auth_address.slice(0, 14) + "..." + this.auth_address.slice(-6);
      }
      return this.auth_address || "";
    }

    // One stable handler for the profile card kebab; items are decided at
    // click time.
    handleProfileMenuClick() {
      this.menu.items = [];
      if (!this.owned) {
        this.menu.items.push([_("Mute user"), this.user.handleMuteClick]);
      }
      this.menu.items.push([
        _("Copy profile link"), (() => {
          this.copyProfileLink();
          return false;
        })
      ]);
      this.menu.toggle();
      return false;
    }

    copyProfileLink() {
      var link = "/" + Page.address + "/" + this.user.getLink();
      var notify = function() {
        Page.cmd("wrapperNotification", ["done", _("Link copied"), 3000]);
      };
      var fallback = function() {
        var field = document.createElement("textarea");
        field.value = link;
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
        navigator.clipboard.writeText(link).then(notify, fallback);
      } else {
        fallback();
      }
    }

    getUserDir() {
      var profile, ref, ref1;
      if (this.auth_address === ((ref = Page.site_info) != null ? ref.auth_address : void 0)) {
        return Page.site_info.xid_directory || this.auth_address;
      }
      profile = (ref1 = Page.xid_profiles) != null ? ref1[this.auth_address] : void 0;
      if ((profile != null ? profile.name : void 0) && (profile != null ? profile.tld : void 0)) {
        return profile.name + "." + profile.tld;
      }
      return this.auth_address;
    }

    setUser(hub, auth_address) {
      var user_dir;
      this.hub = hub;
      this.auth_address = auth_address;
      this.loaded = false;
      this.log("setUser", this.hub, this.auth_address);
      user_dir = this.getUserDir();
      if (!this.post_list || this.post_list.directories[0] !== "data/users/" + user_dir) {
        this.post_list = new PostList();
        this.activity_list = new ActivityList();
        this.user_list = new UserList();
        this.user = new User();
        this.post_list.directories = ["data/users/" + user_dir];
        this.user_list.followed_by = this.user;
        this.user_list.limit = 50;
        this.need_update = true;
        this.follower_count = 0;
        this.following_count = 0;
        this.post_count = 0;
      }
      return this;
    }

    findUser(user_name, cb) {
      var query;
      query = "SELECT\n json.cert_user_id,\n REPLACE(json.directory, 'data/users/', '') AS auth_address,\n COALESCE(json.hub, json.site) AS hub,\n json.user_name,\n json.avatar,\n json.intro\nFROM\n json\nWHERE json.user_name = :user_name AND json.directory LIKE 'data/users/%'\nORDER BY json.json_id DESC LIMIT 1";
      return Page.cmd("dbQuery", [
        query, {
          user_name: user_name
        }
      ], (res) => {
        var user;
        user = new User();
        user.setRow(res[0]);
        return cb(user);
      });
    }

    filter(post_id) {
      this.log("Filter", post_id);
      this.filter_post_id = post_id;
      return this.need_update = true;
    }

    handleEditProfileClick() {
      Page.cmd("wrapperOpenWindow", ["/" + Page.xid_site + "/"]);
      return false;
    }

    // The Message button needs a bare xid name to deep-link into EpixMail;
    // profiles without a resolved xid (or our own) get no button.
    canMessage() {
      var xid = this.user != null ? this.user.xid_profile : void 0;
      return !this.owned && !!(xid != null ? xid.name : void 0);
    }

    handleMessageClick() {
      Page.cmd("wrapperOpenWindow", ["/epix1pvta40a8d944w3npr9ztqrfh3wec53hh2je4fa/?to=" + encodeURIComponent(this.user.xid_profile.name)]);
      return false;
    }

    hasUserIdentity() {
      var row = (this.user != null ? this.user.row : void 0) || {};
      var xid = this.user != null ? this.user.xid_profile : void 0;
      // A data.json row can land before its content.json (no cert columns
      // yet); any real db row (json_id) is enough to render the page. The
      // not-found fallback synthesizes a row without one.
      return !!(row.cert_user_id || row.user_name || row.json_id || (xid != null ? xid.name : void 0));
    }

    resolveAndFinish() {
      return Page.resolveXidProfiles([this.auth_address], () => {
        this.user.xid_profile = Page.xid_profiles[this.auth_address];
        Page.projector.scheduleRender();
        return this.loaded = true;
      });
    }

    queryProfileStats() {
      var user_dir;
      Page.cmd("dbQuery", [
        "SELECT COUNT(*) AS cnt FROM follow WHERE auth_address = :addr", {
          addr: this.auth_address
        }
      ], (res) => {
        var ref;
        this.follower_count = (res != null ? (ref = res[0]) != null ? ref.cnt : void 0 : void 0) || 0;
        return Page.projector.scheduleRender();
      });
      user_dir = this.getUserDir();
      Page.cmd("dbQuery", [
        "SELECT COUNT(*) AS cnt FROM follow LEFT JOIN json USING (json_id) WHERE json.directory = :dir", {
          dir: "data/users/" + user_dir
        }
      ], (res) => {
        var ref;
        this.following_count = (res != null ? (ref = res[0]) != null ? ref.cnt : void 0 : void 0) || 0;
        return Page.projector.scheduleRender();
      });
      return Page.cmd("dbQuery", [
        "SELECT COUNT(*) AS cnt FROM post LEFT JOIN json USING (json_id) WHERE json.directory = :dir", {
          dir: "data/users/" + user_dir
        }
      ], (res) => {
        var ref;
        this.post_count = (res != null ? (ref = res[0]) != null ? ref.cnt : void 0 : void 0) || 0;
        return Page.projector.scheduleRender();
      });
    }

    render() {
      var hub_address, hub_title, ref, ref1, ref2, user_dir;
      if (this.need_update) {
        this.log("Updating");
        this.need_update = false;
        this.post_list.noanim = this.noanim;
        this.activity_list.noanim = this.noanim;
        this.post_list.filter_post_ids = this.filter_post_id ? [this.filter_post_id] : null;
        if ((ref = this.post_list) != null) {
          ref.need_update = true;
        }
        if ((ref1 = this.user_list) != null) {
          ref1.need_update = true;
        }
        if ((ref2 = this.activity_list) != null) {
          ref2.need_update = true;
        }
        user_dir = this.getUserDir();
        this.activity_list.directories = ["data/users/" + user_dir];
        this.queryProfileStats();
        this.user.auth_address = this.auth_address;
        this.user.hub = this.hub;
        this.user.get(this.hub, this.auth_address, (res) => {
          var base, ref3;
          if (res) {
            this.owned = this.user.auth_address === ((ref3 = Page.user) != null ? ref3.auth_address : void 0);
            if (this.owned && !this.post_create) {
              this.post_create = new PostCreate();
            }
          } else {
            // No profile row in the db: keep a minimal row so the not-seeded
            // card can render, or fall through to "User not found or muted".
            if ((base = this.user).row == null) {
              base.row = {};
            }
            this.user.row.auth_address = this.auth_address;
            this.user.row.hub = this.hub;
            this.owned = this.auth_address === ((ref3 = Page.user) != null ? ref3.auth_address : void 0);
            if (this.owned && !this.post_create) {
              this.post_create = new PostCreate();
            }
          }
          return this.resolveAndFinish();
        });
      }
      if (!this.hasUserIdentity()) {
        if (this.loaded) {
          return h("div#Content.center." + this.auth_address, [h("div.user-notfound", _("User not found or muted"))]);
        } else {
          return h("div#Content.center." + this.auth_address, []);
        }
      }
      if (!Page.merged_sites[this.hub]) {
        return this.renderNotSeeded();
      }
      if (this.post_list.loaded && !Page.on_loaded.resolved) {
        Page.on_loaded.resolve();
      }
      return h("div#Content.center." + this.auth_address, [
        h("div.col-left", {
          classes: {
            faded: this.filter_post_id
          }
        }, [
          h("div.users", [
            h("div.user.card.profile", {
              classes: {
                followed: this.user.isFollowed()
              }
            }, [
              h("a.icon.icon-kebab.profile-kebab", {
                href: "#Menu",
                title: _("More"),
                onclick: Page.returnFalse,
                onmousedown: this.handleProfileMenuClick
              }), this.menu.render(".menu-right.menu-profile"),
              this.user.renderAvatar(), h("span.name.link", h("a", {
                href: this.user.getLink(),
                onclick: Page.handleLinkClick
              }, this.user.getDisplayName())), h("div.intro-full", {
                innerHTML: Text.renderMarked(this.user.getDisplayIntro())
              }), h("div.profile-stats", [h("div.stat", [h("span.stat-value", "" + this.post_count), h("span.stat-label", _("Posts"))]), h("div.stat", [h("span.stat-value", "" + this.follower_count), h("span.stat-label", _("Followers"))]), h("div.stat", [h("span.stat-value", "" + this.following_count), h("span.stat-label", _("Following"))])]), !this.owned ? h("div.follow-container", [
                h("a.button.button-follow-big", {
                  href: "#",
                  onclick: this.user.handleFollowClick,
                  classes: {
                    loading: this.user.submitting_follow
                  }
                }, h("span.icon-follow", "+"), this.user.isFollowed() ? _("Unfollow") : _("Follow")), this.canMessage() ? h("a.button.button-message", {
                  key: "message",
                  href: "#Message",
                  onclick: this.handleMessageClick
                }, [h("span.icon.icon-mail"), _("Message")]) : void 0
              ]) : void 0, this.owned ? h("a.button.button-edit-profile", {
                href: "#",
                onclick: this.handleEditProfileClick
              }, _("Edit profile on xID")) : void 0, this.owned && Page.user_hubs ? h("div.hub-management", [
                h("h3.hub-management-title", _("Linked Hubs")), (() => {
                  var i, len, ref3, ref4, ref5, ref6, ref7, results;
                  ref3 = Object.keys(Page.user_hubs);
                  results = [];
                  for (i = 0, len = ref3.length; i < len; i++) {
                    hub_address = ref3[i];
                    hub_title = ((ref4 = Page.site_info.content) != null ? (ref5 = ref4.settings) != null ? (ref6 = ref5.default_hubs) != null ? (ref7 = ref6[hub_address]) != null ? ref7.title : void 0 : void 0 : void 0 : void 0) || hub_address.slice(0, 16) + "...";
                    results.push(h("div.hub-item", {
                      key: hub_address
                    }, [h("span.hub-name", hub_title), h("span.hub-status", _("Connected"))]));
                  }
                  return results;
                })()
              ]) : void 0
            ])
          ]), this.activity_list.render(), this.user_list.users.length > 0 ? h("h2.sep", {
            afterCreate: Animation.show
          }, [_("Following")]) : void 0, this.user_list.render(".gray")
        ]), h("div.col-center", [
          this.owned && !this.filter_post_id ? h("div.post-create-container", {
            enterAnimation: Animation.slideDown,
            exitAnimation: Animation.slideUp
          }, this.post_create.render()) : void 0, this.post_list.render()
        ])
      ]);
    }

    update(mode) {
      if (!this.auth_address) {
        return;
      }
      this.noanim = mode === "noanim";
      this.need_update = true;
      return Page.projector.scheduleRender();
    }
  }

  Object.assign(ContentProfile.prototype, LogMixin);
  window.ContentProfile = ContentProfile;

})();
