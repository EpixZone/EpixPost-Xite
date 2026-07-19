(function() {

  class User {
    constructor(row, item_list) {
      this.item_list = item_list;
      this.triggerCertXid = this.triggerCertXid.bind(this);
      this.resolveMyXidName = this.resolveMyXidName.bind(this);
      this.resolveXidName = this.resolveXidName.bind(this);
      this.renderList = this.renderList.bind(this);
      this.renderGridCard = this.renderGridCard.bind(this);
      this.handleCardClick = this.handleCardClick.bind(this);
      this.getHandle = this.getHandle.bind(this);
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
      // Fresh profiles carry no user_name and the db row's cert columns only
      // appear after a full rebuild; fall back to our own selected cert.
      if (this.auth_address && Page.site_info && Page.site_info.auth_address === this.auth_address && Page.site_info.cert_user_id) {
        return Page.site_info.cert_user_id.replace(/@.*/, "");
      }
      if (this.auth_address) {
        return this.auth_address.slice(0, 16) + "...";
      }
      return _("Unknown");
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

    // Short second line under the display name: the cert id, or a truncated
    // address when there is no cert.
    getHandle() {
      var ref;
      var cert = (ref = this.row) != null ? ref.cert_user_id : void 0;
      if (cert) {
        return cert;
      }
      if (this.auth_address && this.auth_address.length > 24) {
        return this.auth_address.slice(0, 14) + "..." + this.auth_address.slice(-6);
      }
      return this.auth_address || "";
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
        if (!helps || helps.error) {
          return cb(false);
        }
        return cb(helps["data/users/" + (this.getDirectory())]);
      });
    }

    getPath(site) {
      var user_dir;
      if (site == null) {
        site = this.hub;
      }
      user_dir = this.getDirectory();
      return "merged-EpixPost/" + site + "/data/users/" + user_dir;
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
      // Posts live in posts.json (a signed-CRDT merge file), NOT here - so a
      // profile seed can never overwrite them. data.json keeps profile-adjacent
      // state (comments/follows/likes) that is still last-writer-wins for now.
      return {
        "next_comment_id": 1,
        "next_follow_id": 1,
        "hub": this.hub,
        "post_like": {},
        "comment": [],
        "follow": []
      };
    }

    // A 128-bit random nonce (hex) - the entropy that makes a post_id unique.
    randNonce() {
      var a = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(a);
      return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    // Read this user's posts.json (all signed record versions).
    getPosts(site, cb) {
      return Page.cmd("fileGet", [this.getPath(site) + "/posts.json", false], (data) => {
        var container;
        container = data ? JSON.parse(data) : null;
        if (!container || !container.post) {
          container = { "record_format": "epix-orset-1", "post": [] };
        }
        return cb(container);
      });
    }

    // Write ONE signed record to posts.json and publish. The node union-merges
    // the record into the on-disk set (so this never overwrites other posts)
    // and signs+bumps the user content.json, which propagates the merge.
    savePost(record, site, cb) {
      if (site == null) site = this.hub;
      if (cb == null) cb = null;
      var container = { "record_format": "epix-orset-1", "post": [record] };
      return Page.cmd("fileWrite", [this.getPath(site) + "/posts.json", Text.fileEncode(container)], (res_write) => {
        Page.content.update();
        return Page.cmd("sitePublish", { "inner_path": this.getPath(site) + "/content.json" }, (res_pub) => {
          this.log("savePost", res_write, res_pub);
          if (typeof cb === "function") {
            cb(res_write);
          }
        });
      });
    }

    // Build + sign a NEW version of an existing post (an edit or a tombstone)
    // and save it. The immutable post_id/nonce/date_added carry over; clock and
    // supersedes are derived from what is on disk so the merge orders it after
    // every version this device has seen.
    editPost(post_id, changes, cb) {
      if (cb == null) cb = null;
      return this.getPosts(this.hub, (container) => {
        var maxClock = 0, orig = null;
        container.post.forEach((r) => {
          if (r.post_id === post_id) {
            if (r.clock > maxClock) {
              maxClock = r.clock;
            }
            if (!orig || (r.clock || 0) >= (orig.clock || 0)) {
              orig = r;
            }
          }
        });
        var record = {
          "post_id": post_id,
          "nonce": orig && orig.nonce ? orig.nonce : this.randNonce(),
          "clock": Math.max(maxClock + 1, Date.now()),
          "supersedes": maxClock,
          "deleted": changes.deleted === true,
          "body": changes.deleted ? "" : (changes.body != null ? changes.body : (orig ? orig.body : "")),
          "date_added": orig ? orig.date_added : Time.timestamp()
        };
        if (!changes.deleted) {
          record["date_edited"] = Time.timestamp();
          if (orig && orig.meta != null) {
            record["meta"] = orig.meta;
          }
        }
        return Page.cmd("recordSign", [record], (signed) => {
          if (!signed || signed.error) {
            if (cb) cb(signed);
            return;
          }
          return this.savePost(signed, this.hub, (res) => {
            if (cb) cb(res);
          });
        });
      });
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
        // Flat fallback: solid color derived from the address plus the
        // display name's initial (no gradients)
        attrs.style = "background-color: " + Text.toColor(this.auth_address || "");
        var name = this.getDisplayName();
        var initial = name && name !== _("Unknown") ? name.charAt(0).toUpperCase() : "?";
        return h("a.avatar.letter", attrs, initial);
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
        Page.content.update();
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

    comment(site, post_uri, body, cb, reply_to) {
      if (cb == null) {
        cb = null;
      }
      if (reply_to == null) {
        reply_to = null;
      }
      return this.getData(site, (data) => {
        var row = {
          "comment_id": data.next_comment_id,
          "body": body,
          "post_uri": post_uri,
          "date_added": Time.timestamp()
        };
        if (reply_to) {
          row["reply_to"] = reply_to;
        }
        data.comment.push(row);
        data.next_comment_id += 1;
        return this.save(data, site, (res) => {
          if (cb) {
            return cb(res);
          }
        });
      });
    }

    // Announce a hub in the user's data.json so other users can discover it
    // on the Hubs page. The announce lands on the default hub when the user
    // has a profile there (widest audience), otherwise on the user's active
    // hub. One entry per hub address: announcing again replaces the old one.
    announceHub(hub_address, title, description, cb) {
      if (cb == null) {
        cb = null;
      }
      var target = null;
      var ref, ref1, ref2;
      var default_hubs = ((ref = Page.site_info) != null ? (ref1 = ref.content) != null ? (ref2 = ref1.settings) != null ? ref2.default_hubs : void 0 : void 0 : void 0) || {};
      for (var address in default_hubs) {
        if (Page.user_hubs && Page.user_hubs[address]) {
          target = address;
          break;
        }
      }
      if (!target) {
        target = this.hub;
      }
      this.log("Announcing hub", hub_address, "on", target);
      return this.getData(target, (data) => {
        if (data.hub_announce == null) {
          data.hub_announce = [];
        }
        var row = {
          "address": hub_address,
          "title": title,
          "description": description || "",
          "date_added": Time.timestamp()
        };
        var replaced = false;
        for (var i = 0; i < data.hub_announce.length; i++) {
          if (data.hub_announce[i].address === hub_address) {
            data.hub_announce[i] = row;
            replaced = true;
          }
        }
        if (!replaced) {
          data.hub_announce.push(row);
        }
        return this.save(data, target, (res) => {
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

    // One-time-ish migration of legacy data.json `post[]` into posts.json.
    // ADDITIVE and per-post idempotent: signs only legacy posts not already in
    // posts.json (keeping their legacy post_id for URL/edit continuity), and
    // NEVER strips data.json.post[] (that LWW write could clobber posts not yet
    // synced). Runs in the background on load; converges as data syncs.
    migratePosts(cb) {
      if (cb == null) cb = null;
      var done = () => { if (cb) cb(); };
      return this.getData(this.hub, (data) => {
        var legacy = (data && data.post) || [];
        if (!legacy.length) return done();
        return this.getPosts(this.hub, (container) => {
          var have = {};
          container.post.forEach((r) => { have[r.post_id] = true; });
          var todo = legacy.filter((p) => !have[p.post_id]);
          if (!todo.length) return done();
          var signed = [];
          var i = 0;
          var signNext = () => {
            if (i >= todo.length) {
              // One union-write + one publish for the whole batch.
              var merged = { "record_format": "epix-orset-1", "post": signed };
              if (!signed.length) return done();
              return Page.cmd("fileWrite", [this.getPath(this.hub) + "/posts.json", Text.fileEncode(merged)], () => {
                Page.content.update();
                return Page.cmd("sitePublish", { "inner_path": this.getPath(this.hub) + "/content.json" }, () => done());
              });
            }
            var p = todo[i++];
            var record = {
              "post_id": p.post_id,
              "nonce": this.randNonce(),
              "clock": 1,
              "supersedes": 0,
              "deleted": false,
              "body": p.body,
              "date_added": p.date_added
            };
            if (p.meta != null) record["meta"] = p.meta;
            return Page.cmd("recordSign", [record], (s) => {
              if (s && !s.error) signed.push(s);
              return signNext();
            });
          };
          return signNext();
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
      // A new post is a fresh signed record. The node fills in `author` and the
      // derived immutable `post_id`, then signs it; savePost union-merges it
      // into posts.json (never overwriting other posts) and publishes.
      var record = {
        "nonce": this.randNonce(),
        "clock": Date.now(),
        "supersedes": 0,
        "deleted": false,
        "body": body,
        "date_added": Time.timestamp()
      };
      if (meta) {
        record["meta"] = Text.jsonEncode(meta);
      }
      return Page.cmd("recordSign", [record], (signed) => {
        if (!signed || signed.error) {
          if (cb) cb(signed);
          return;
        }
        var afterImage = () => {
          return this.savePost(signed, this.hub, (res) => {
            if (cb) cb(res);
          });
        };
        // The image is keyed by the node-derived post_id.
        if (image_base64) {
          return this.fileWrite(signed.post_id + ".jpg", image_base64, afterImage);
        }
        return afterImage();
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
        Page.user.followUser(this.hub, this.auth_address, this.row.user_name, (res) => {
          this.submitting_follow = false;
          return Page.projector.scheduleRender();
        });
      } else {
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
      Page.cmd("muteAdd", [this.auth_address, this.row.cert_user_id, "Muted from [page](/" + Page.address + "/?" + Page.history_state.url + ")"]);
      return false;
    }

    // Clicks anywhere on a grid card open the profile. Nested links (follow
    // button, avatar, name) handle themselves; the click still bubbles here,
    // so skip anything that came from an anchor.
    handleCardClick(e) {
      if (e.target && e.target.closest && e.target.closest("a")) {
        return true;
      }
      return Page.navigate(this.getLink());
    }

    // Compact centered card for the Users page grid. list_type is the
    // UserList type ("active", "suggested", ...) the card is rendered in.
    renderGridCard(list_type) {
      var intro, link, meta, name, title;
      link = this.getLink();
      if (this.isFollowed()) {
        title = _("Unfollow");
      } else {
        title = _("Follow");
      }
      name = this.getDisplayName();
      // The "active" query counts the user's posts from the last 7 days; the
      // other user list queries have no date_added column (json table), so
      // only show Time.since for a real timestamp (follower lists have one).
      if (list_type === "active" && this.row.posts) {
        meta = this.row.posts + " " + _("posts this week");
      } else if (typeof this.row.date_added === "number" && isFinite(this.row.date_added)) {
        meta = Time.since(this.row.date_added);
      } else {
        meta = null;
      }
      intro = this.getDisplayIntro();
      return h("div.user.card.grid", {
        key: this.hub + "/" + this.auth_address,
        classes: {
          followed: this.isFollowed(),
          notseeding: !this.isSeeding()
        },
        onclick: this.handleCardClick
      }, [
        h("a.button.button-follow", {
          href: link,
          onclick: this.handleFollowClick,
          title: title,
          classes: {
            loading: this.submitting_follow
          }
        }, "+"), this.renderAvatar({
          href: link,
          onclick: Page.handleLinkClick
        }), h("a.name.link", {
          href: link,
          onclick: Page.handleLinkClick
        }, name), meta ? h("div.meta", meta) : void 0,
        this.row.followed_by ? h("div.intro.followedby", [
          _("Followed by") + " ", h("a.name.link", {
            href: "?ProfileName/" + this.row.followed_by,
            onclick: Page.handleLinkClick
          }, this.row.followed_by)
        ]) : intro ? h("div.intro", intro) : void 0
      ]);
    }

    renderList(type, list_type) {
      var followed, link, seeding, title;
      if (type == null) {
        type = "normal";
      }
      if (list_type == null) {
        list_type = null;
      }
      if (type === "grid") {
        return this.renderGridCard(list_type);
      }
      link = this.getLink();
      followed = this.isFollowed();
      seeding = this.isSeeding();
      if (followed) {
        title = _("Unfollow");
      } else {
        title = _("Follow");
      }
      return h("div.user", {
        key: this.hub + "/" + this.auth_address,
        classes: {
          followed: followed,
          notseeding: !seeding
        },
        enterAnimation: Animation.slideDown,
        exitAnimation: Animation.slideUp
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
          }, this.getDisplayName())
        ]), this.row.followed_by ? h("div.intro.followedby", [
          _("Followed by") + " ", h("a.name.link", {
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
      return Page.cmd("xidResolve", [this.auth_address], (result) => {
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
