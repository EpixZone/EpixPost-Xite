(function() {

  class User {
    constructor(row, item_list) {
      this.item_list = item_list;
      this.triggerCertXid = this.triggerCertXid.bind(this);
      this.resolveMyXidName = this.resolveMyXidName.bind(this);
      this.resolveXidName = this.resolveXidName.bind(this);
      this.renderList = this.renderList.bind(this);
      this.handleMuteClick = this.handleMuteClick.bind(this);
      this.handleDownloadClick = this.handleDownloadClick.bind(this);
      this.download = this.download.bind(this);
      this.handleFollowClick = this.handleFollowClick.bind(this);
      this.renderAvatar = this.renderAvatar.bind(this);
      this.hasHelp = this.hasHelp.bind(this);
      this.updateInfo = this.updateInfo.bind(this);
      this.getDirectory = this.getDirectory.bind(this);
      this.getDisplayIntro = this.getDisplayIntro.bind(this);
      this.getDisplayName = this.getDisplayName.bind(this);
      if (row) {
        this.setRow(row);
      }
      this.likes = {};
      this.followed_users = {};
      this.submitting_follow = false;
    }

    setRow(row) {
      var ref;
      this.row = row;
      this.hub = row.hub;
      this.auth_address = row.auth_address;
      if ((ref = Page.xid_profiles) != null ? ref[this.auth_address] : void 0) {
        return this.xid_profile = Page.xid_profiles[this.auth_address];
      }
    }

    getDisplayName() {
      var ref, ref1, ref2;
      if ((ref = this.xid_profile) != null ? ref.name : void 0) {
        return this.xid_profile.name + "." + this.xid_profile.tld;
      }
      if (this.auth_address && this.auth_address.indexOf(".") > 0) {
        return this.auth_address;
      }
      if ((ref1 = this.row) != null ? ref1.user_name : void 0) {
        return this.row.user_name;
      }
      if ((ref2 = this.row) != null ? ref2.cert_user_id : void 0) {
        return this.row.cert_user_id;
      }
      if (this.auth_address) {
        return this.auth_address.slice(0, 16) + "...";
      }
      return "Unknown";
    }

    getDisplayIntro() {
      var ref, ref1;
      if ((ref = this.xid_profile) != null ? ref.bio : void 0) {
        return this.xid_profile.bio;
      }
      if ((ref1 = this.row) != null ? ref1.intro : void 0) {
        return this.row.intro;
      }
      return "";
    }

    getDirectory() {
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

    get(site, auth_address, cb) {
      var params, user_dir;
      if (cb == null) {
        cb = null;
      }
      user_dir = this.getDirectory();
      params = {
        site: site,
        directory: "data/users/" + user_dir
      };
      return Page.cmd("dbQuery", ["SELECT * FROM json WHERE site = :site AND directory = :directory LIMIT 1", params], (res) => {
        var params2, row;
        row = res[0];
        if (row) {
          if (row.user_name === "") {
            row.user_name = row.cert_user_id;
          }
          row.auth_address = auth_address;
          this.setRow(row);
          return typeof cb === "function" ? cb(row) : void 0;
        } else if (user_dir !== auth_address) {
          params2 = {
            site: site,
            directory: "data/users/" + auth_address
          };
          return Page.cmd("dbQuery", ["SELECT * FROM json WHERE site = :site AND directory = :directory LIMIT 1", params2], (res2) => {
            var row2;
            row2 = res2[0];
            if (row2) {
              if (row2.user_name === "") {
                row2.user_name = row2.cert_user_id;
              }
              row2.auth_address = auth_address;
              this.setRow(row2);
              return typeof cb === "function" ? cb(row2) : void 0;
            } else {
              return cb(false);
            }
          });
        } else {
          return cb(false);
        }
      });
    }

    updateInfo(cb) {
      var p_followed_users, p_likes, user_dir;
      if (cb == null) {
        cb = null;
      }
      this.logStart("Info loaded");
      p_likes = new Deferred();
      p_followed_users = new Deferred();
      Page.cmd("dbQuery", ["SELECT * FROM follow WHERE json_id = " + this.row.json_id], (res) => {
        var j, len, row;
        this.followed_users = {};
        for (j = 0, len = res.length; j < len; j++) {
          row = res[j];
          this.followed_users[row.hub + "/" + row.auth_address] = row;
        }
        return p_followed_users.resolve();
      });
      user_dir = this.getDirectory();
      Page.cmd("dbQuery", ["SELECT post_like.* FROM json LEFT JOIN post_like USING (json_id) WHERE directory = 'data/users/" + user_dir + "' AND post_uri IS NOT NULL"], (res) => {
        var j, len, row;
        this.likes = {};
        for (j = 0, len = res.length; j < len; j++) {
          row = res[j];
          this.likes[row.post_uri] = true;
        }
        return p_likes.resolve();
      });
      return Deferred.join(p_followed_users, p_likes).then((res1, res2) => {
        this.logEnd("Info loaded");
        return typeof cb === "function" ? cb(true) : void 0;
      });
    }

    isFollowed() {
      return Page.user.followed_users[this.hub + "/" + this.auth_address];
    }

    isSeeding() {
      return Page.merged_sites[this.hub];
    }

    hasHelp(cb) {
      return Page.cmd("OptionalHelpList", [this.hub], (helps) => {
        return cb(helps["data/users/" + (this.getDirectory())]);
      });
    }

    getPath(site) {
      var user_dir;
      if (site == null) {
        site = this.hub;
      }
      user_dir = this.getDirectory();
      if (site === Page.userdb) {
        return "merged-EpixPost/" + site + "/data/userdb/" + user_dir;
      } else {
        return "merged-EpixPost/" + site + "/data/users/" + user_dir;
      }
    }

    getLink() {
      return "?Profile/" + this.hub + "/" + this.auth_address + "/" + (this.row.cert_user_id || '');
    }

    getAvatarLink() {
      var cache_invalidation, ref, user_dir;
      if (this.row.avatar && this.row.avatar.match(/^https?:\/\//)) {
        return this.row.avatar;
      }
      cache_invalidation = "";
      if (this.auth_address === ((ref = Page.user) != null ? ref.auth_address : void 0)) {
        cache_invalidation = "?" + Page.cache_time;
      }
      user_dir = this.getDirectory();
      return "merged-EpixPost/" + this.hub + "/data/users/" + user_dir + "/avatar." + this.row.avatar + cache_invalidation;
    }

    getDefaultData() {
      return {
        "next_post_id": 1,
        "next_comment_id": 1,
        "next_follow_id": 1,
        "hub": this.hub,
        "post": [],
        "post_like": {},
        "comment": [],
        "follow": []
      };
    }

    getData(site, cb) {
      return Page.cmd("fileGet", [this.getPath(site) + "/data.json", false], (data) => {
        data = JSON.parse(data);
        if (data == null) {
          data = {
            "next_comment_id": 1,
            "hub": this.hub,
            "post_like": {},
            "comment": []
          };
        }
        return cb(data);
      });
    }

    renderAvatar(attrs) {
      var avatar_url, ref, ref1, ref2, ref3, ref4, ref5;
      if (attrs == null) {
        attrs = {};
      }
      avatar_url = ((ref = this.xid_profile) != null ? ref.avatar : void 0) || ((ref1 = Page.xid_profiles) != null ? (ref2 = ref1[this.auth_address]) != null ? ref2.avatar : void 0 : void 0);
      if (avatar_url) {
        attrs.style = "background-image: url('" + avatar_url + "')";
      } else if (((ref3 = this.row) != null ? ref3.avatar : void 0) && this.row.avatar.match(/^https?:\/\//)) {
        attrs.style = "background-image: url('" + this.row.avatar + "')";
      } else if (this.isSeeding() && (((ref4 = this.row) != null ? ref4.avatar : void 0) === "png" || ((ref5 = this.row) != null ? ref5.avatar : void 0) === "jpg")) {
        attrs.style = "background-image: url('" + (this.getAvatarLink()) + "')";
      } else {
        attrs.style = "background: linear-gradient(" + Text.toColor(this.auth_address) + "," + Text.toColor(this.auth_address.slice(-5)) + ")";
      }
      return h("a.avatar", attrs);
    }

    save(data, site, cb) {
      if (site == null) {
        site = this.hub;
      }
      if (cb == null) {
        cb = null;
      }
      return Page.cmd("fileWrite", [this.getPath(site) + "/data.json", Text.fileEncode(data)], (res_write) => {
        if (Page.server_info.rev > 1400) {
          Page.content.update();
        }
        if (typeof cb === "function") {
          cb(res_write);
        }
        return Page.cmd("sitePublish", {
          "inner_path": this.getPath(site) + "/data.json"
        }, (res_sign) => {
          return this.log("Save result", res_write, res_sign);
        });
      });
    }

    like(site, post_uri, cb) {
      if (cb == null) {
        cb = null;
      }
      this.log("Like", site, post_uri);
      this.likes[post_uri] = true;
      return this.getData(site, (data) => {
        data.post_like[post_uri] = Time.timestamp();
        return this.save(data, site, (res) => {
          if (cb) {
            return cb(res);
          }
        });
      });
    }

    dislike(site, post_uri, cb) {
      if (cb == null) {
        cb = null;
      }
      this.log("Dislike", site, post_uri);
      delete this.likes[post_uri];
      return this.getData(site, (data) => {
        delete data.post_like[post_uri];
        return this.save(data, site, (res) => {
          if (cb) {
            return cb(res);
          }
        });
      });
    }

    comment(site, post_uri, body, cb) {
      if (cb == null) {
        cb = null;
      }
      return this.getData(site, (data) => {
        data.comment.push({
          "comment_id": data.next_comment_id,
          "body": body,
          "post_uri": post_uri,
          "date_added": Time.timestamp()
        });
        data.next_comment_id += 1;
        return this.save(data, site, (res) => {
          if (cb) {
            return cb(res);
          }
        });
      });
    }

    checkContentJson(cb) {
      if (cb == null) {
        cb = null;
      }
      return Page.cmd("fileGet", [this.getPath(this.hub) + "/content.json", false], (res) => {
        var content_json;
        content_json = JSON.parse(res);
        if (content_json.optional) {
          return cb(true);
        }
        content_json.optional = "(?!avatar).*jpg";
        return Page.cmd("fileWrite", [this.getPath(this.hub) + "/content.json", Text.fileEncode(content_json)], (res_write) => {
          return cb(res_write);
        });
      });
    }

    fileWrite(file_name, content_base64, cb) {
      if (cb == null) {
        cb = null;
      }
      if (!content_base64) {
        return typeof cb === "function" ? cb(null) : void 0;
      }
      return this.checkContentJson(() => {
        return Page.cmd("fileWrite", [this.getPath(this.hub) + "/" + file_name, content_base64], (res_write) => {
          return typeof cb === "function" ? cb(res_write) : void 0;
        });
      });
    }

    post(body, meta, image_base64, cb) {
      if (meta == null) {
        meta = null;
      }
      if (image_base64 == null) {
        image_base64 = null;
      }
      if (cb == null) {
        cb = null;
      }
      return this.getData(this.hub, (data) => {
        var post;
        post = {
          "post_id": Time.timestamp() + data.next_post_id,
          "body": body,
          "date_added": Time.timestamp()
        };
        if (meta) {
          post["meta"] = Text.jsonEncode(meta);
        }
        data.post.push(post);
        data.next_post_id += 1;
        return this.fileWrite(post.post_id + ".jpg", image_base64, (res) => {
          return this.save(data, this.hub, (res) => {
            if (cb) {
              return cb(res);
            }
          });
        });
      });
    }

    followUser(hub, auth_address, user_name, cb) {
      if (cb == null) {
        cb = null;
      }
      this.log("Following", hub, auth_address);
      this.download();
      return this.getData(this.hub, (data) => {
        var follow_row;
        follow_row = {
          "follow_id": data.next_follow_id,
          "hub": hub,
          "auth_address": auth_address,
          "user_name": user_name,
          "date_added": Time.timestamp()
        };
        data.follow.push(follow_row);
        this.followed_users[hub + "/" + auth_address] = true;
        data.next_follow_id += 1;
        this.save(data, this.hub, (res) => {
          if (cb) {
            return cb(res);
          }
        });
        return Page.needSite(hub);
      });
    }

    unfollowUser(hub, auth_address, cb) {
      if (cb == null) {
        cb = null;
      }
      this.log("UnFollowing", hub, auth_address);
      delete this.followed_users[hub + "/" + auth_address];
      return this.getData(this.hub, (data) => {
        var follow, follow_index, i, j, len, ref;
        ref = data.follow;
        for (i = j = 0, len = ref.length; j < len; i = ++j) {
          follow = ref[i];
          if (follow.hub === hub && follow.auth_address === auth_address) {
            follow_index = i;
          }
        }
        data.follow.splice(follow_index, 1);
        return this.save(data, this.hub, (res) => {
          if (cb) {
            return cb(res);
          }
        });
      });
    }

    handleFollowClick(e) {
      this.submitting_follow = true;
      if (!this.isFollowed()) {
        Animation.flashIn(e.target);
        Page.user.followUser(this.hub, this.auth_address, this.row.user_name, (res) => {
          this.submitting_follow = false;
          return Page.projector.scheduleRender();
        });
      } else {
        Animation.flashOut(e.target);
        Page.user.unfollowUser(this.hub, this.auth_address, (res) => {
          this.submitting_follow = false;
          return Page.projector.scheduleRender();
        });
      }
      return false;
    }

    download() {
      if (!Page.merged_sites[this.hub]) {
        return Page.cmd("mergerSiteAdd", this.hub, () => {
          return Page.updateSiteInfo();
        });
      }
    }

    handleDownloadClick(e) {
      this.download();
      return false;
    }

    handleMuteClick(e) {
      if (Page.server_info.rev < 1880) {
        Page.cmd("wrapperNotification", ["info", "You need EpixNet 0.5.2 to use this feature."]);
        return false;
      }
      Page.cmd("muteAdd", [this.auth_address, this.row.cert_user_id, "Muted from [page](/" + Page.address + "/?" + Page.history_state.url + ")"]);
      return false;
    }

    renderList(type) {
      var classname, enterAnimation, exitAnimation, followed, link, seeding, title;
      if (type == null) {
        type = "normal";
      }
      classname = "";
      if (type === "card") {
        classname = ".card";
      }
      link = this.getLink();
      followed = this.isFollowed();
      seeding = this.isSeeding();
      if (followed) {
        title = "Unfollow";
      } else {
        title = "Follow";
      }
      if (type !== "card") {
        enterAnimation = Animation.slideDown;
        exitAnimation = Animation.slideUp;
      } else {
        enterAnimation = null;
        exitAnimation = null;
      }
      return h("div.user" + classname, {
        key: this.hub + "/" + this.auth_address,
        classes: {
          followed: followed,
          notseeding: !seeding
        },
        enterAnimation: enterAnimation,
        exitAnimation: exitAnimation
      }, [
        h("a.button.button-follow", {
          href: link,
          onclick: this.handleFollowClick,
          title: title,
          classes: {
            loading: this.submitting_follow
          }
        }, "+"), h("a", {
          href: link,
          onclick: Page.handleLinkClick
        }, this.renderAvatar()), h("div.nameline", [
          h("a.name.link", {
            href: link,
            onclick: Page.handleLinkClick
          }, this.getDisplayName()), type === "card" ? h("span.added", Time.since(this.row.date_added)) : void 0
        ]), this.row.followed_by ? h("div.intro.followedby", [
          "Followed by ", h("a.name.link", {
            href: "?ProfileName/" + this.row.followed_by,
            onclick: Page.handleLinkClick
          }, this.row.followed_by)
        ]) : h("div.intro", this.getDisplayIntro())
      ]);
    }

    resolveXidName(name, cb) {
      if (cb == null) {
        cb = null;
      }
      return Page.cmd("xidResolveName", [name], (result) => {
        if (result != null ? result.address : void 0) {
          return typeof cb === "function" ? cb(result.address) : void 0;
        } else {
          return typeof cb === "function" ? cb(false) : void 0;
        }
      });
    }

    resolveMyXidName(cb) {
      if (cb == null) {
        cb = null;
      }
      if (!this.auth_address) {
        if (typeof cb === "function") {
          cb(false);
        }
        return;
      }
      return Page.cmd("xidResolveIdentity", [this.auth_address], (result) => {
        if (result != null ? result.name : void 0) {
          return typeof cb === "function" ? cb(result.name) : void 0;
        } else {
          return typeof cb === "function" ? cb(false) : void 0;
        }
      });
    }

    triggerCertXid() {
      Page.cmd("certXid", {}, (res) => {
        return this.log("certXid result", res);
      });
      return false;
    }
  }

  Object.assign(User.prototype, LogMixin);
  window.User = User;

})();
