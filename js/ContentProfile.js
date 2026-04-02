(function() {

  class ContentProfile {
    constructor() {
      this.update = this.update.bind(this);
      this.render = this.render.bind(this);
      this.queryProfileStats = this.queryProfileStats.bind(this);
      this.resolveAndFinish = this.resolveAndFinish.bind(this);
      this.hasUserIdentity = this.hasUserIdentity.bind(this);
      this.handleEditProfileClick = this.handleEditProfileClick.bind(this);
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
      this.owned = false;
      this.need_update = true;
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
                style: "color: " + (Text.toColor(this.user.row.auth_address)),
                onclick: Page.handleLinkClick
              }, this.user.getDisplayName()), h("div.cert_user_id", this.user.getDisplayName()), h("div.intro-full", this.user.getDisplayIntro()), h("div.follow-container", [
                h("a.button.button-follow-big", {
                  href: "#",
                  onclick: this.user.handleFollowClick,
                  classes: {
                    loading: this.user.submitting_follow
                  }
                }, h("span.icon-follow", "+"), this.user.isFollowed() ? "Unfollow" : "Follow")
              ])
            ])
          ])
        ]), h("div.col-center", {
          style: "padding-top: 30px; text-align: center"
        }, [
          h("h1", "Download profile site"), h("h2", "User's profile site not loaded to your client yet."), h("a.button.submit", {
            href: "#Add+site",
            onclick: this.user.handleDownloadClick
          }, "Download user's site")
        ])
      ]);
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
      query = "SELECT\n json.cert_user_id,\n REPLACE(REPLACE(json.directory, 'data/userdb/', ''), 'data/users/', '') AS auth_address,\n COALESCE(json.hub, json.site) AS hub,\n json.user_name,\n json.avatar,\n json.intro\nFROM\n json\nWHERE json.user_name = :user_name AND json.directory LIKE 'data/users/%'\nORDER BY json.json_id DESC LIMIT 1";
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
      var xid_site;
      xid_site = "epix1xauthduuyn63k6kj54jzgp4l8nnjlhrsyaku8c";
      Page.cmd("wrapperOpenWindow", ["/" + xid_site + "/"]);
      return false;
    }

    hasUserIdentity() {
      var ref, ref1, ref2, ref3;
      return ((ref = this.user) != null ? (ref1 = ref.row) != null ? ref1.cert_user_id : void 0 : void 0) || ((ref2 = this.user) != null ? (ref3 = ref2.xid_profile) != null ? ref3.name : void 0 : void 0);
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
          var ref3;
          if (res) {
            this.owned = this.user.auth_address === ((ref3 = Page.user) != null ? ref3.auth_address : void 0);
            if (this.owned && !this.post_create) {
              this.post_create = new PostCreate();
            }
            return this.resolveAndFinish();
          } else {
            return Page.queryUserdb(this.auth_address, (row) => {
              var base, ref4;
              this.log("UserDb row", row);
              if (row) {
                this.user.setRow(row);
              } else {
                if ((base = this.user).row == null) {
                  base.row = {};
                }
                this.user.row.auth_address = this.auth_address;
                this.user.row.hub = this.hub;
                this.owned = this.auth_address === ((ref4 = Page.user) != null ? ref4.auth_address : void 0);
                if (this.owned && !this.post_create) {
                  this.post_create = new PostCreate();
                }
              }
              return this.resolveAndFinish();
            });
          }
        });
        if (!Page.merged_sites[this.hub]) {
          Page.queryUserdb(this.auth_address, (row) => {
            this.user.setRow(row);
            Page.projector.scheduleRender();
            return this.loaded = true;
          });
        }
      }
      if (!this.hasUserIdentity()) {
        if (this.loaded) {
          return h("div#Content.center." + this.auth_address, [h("div.user-notfound", "User not found or muted")]);
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
              this.user.renderAvatar(), h("span.name.link", {
                style: "color: " + (Text.toColor(this.user.row.auth_address))
              }, h("a", {
                href: this.user.getLink(),
                style: "color: " + (Text.toColor(this.user.row.auth_address)),
                onclick: Page.handleLinkClick
              }, this.user.getDisplayName())), h("div.cert_user_id", this.user.getDisplayName()), h("div.intro-full", {
                innerHTML: Text.renderMarked(this.user.getDisplayIntro())
              }), h("div.profile-stats", [h("div.stat", [h("span.stat-value", "" + this.post_count), h("span.stat-label", "Posts")]), h("div.stat", [h("span.stat-value", "" + this.follower_count), h("span.stat-label", "Followers")]), h("div.stat", [h("span.stat-value", "" + this.following_count), h("span.stat-label", "Following")])]), h("div.follow-container", [
                h("a.button.button-follow-big", {
                  href: "#",
                  onclick: this.user.handleFollowClick
                }, h("span.icon-follow", "+"), this.user.isFollowed() ? "Unfollow" : "Follow")
              ]), this.owned ? h("a.button.button-edit-profile", {
                href: "#",
                onclick: this.handleEditProfileClick
              }, "Edit profile on xID") : void 0, this.owned && Page.user_hubs ? h("div.hub-management", [
                h("h3.hub-management-title", "Linked Hubs"), (() => {
                  var i, len, ref3, ref4, ref5, ref6, ref7, results;
                  ref3 = Object.keys(Page.user_hubs);
                  results = [];
                  for (i = 0, len = ref3.length; i < len; i++) {
                    hub_address = ref3[i];
                    hub_title = ((ref4 = Page.site_info.content) != null ? (ref5 = ref4.settings) != null ? (ref6 = ref5.default_hubs) != null ? (ref7 = ref6[hub_address]) != null ? ref7.title : void 0 : void 0 : void 0 : void 0) || hub_address.slice(0, 16) + "...";
                    results.push(h("div.hub-item", {
                      key: hub_address
                    }, [h("span.hub-name", hub_title), h("span.hub-status", "Connected")]));
                  }
                  return results;
                })()
              ]) : void 0
            ])
          ]), h("a.user-mute", {
            href: "#Mute",
            onclick: this.user.handleMuteClick
          }, h("div.icon.icon-mute"), "Mute " + (this.user.getDisplayName())), this.activity_list.render(), this.user_list.users.length > 0 ? h("h2.sep", {
            afterCreate: Animation.show
          }, ["Following"]) : void 0, this.user_list.render(".gray")
        ]), h("div.col-center", [
          this.owned && !this.filter_post_id ? h("div.post-create-container", {
            enterAnimation: Animation.slideDown,
            exitAnimation: Animation.slideUp
          }, this.post_create.render()) : void 0, this.post_list.render()
        ])
      ]);
    }

    update() {
      if (!this.auth_address) {
        return;
      }
      this.need_update = true;
      return Page.projector.scheduleRender();
    }
  }

  Object.assign(ContentProfile.prototype, LogMixin);
  window.ContentProfile = ContentProfile;

})();
