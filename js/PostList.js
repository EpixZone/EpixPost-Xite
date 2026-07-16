(function() {

  class PostList {
    constructor() {
      this.queryComments = this.queryComments.bind(this);
      this.queryLikes = this.queryLikes.bind(this);
      this.update = this.update.bind(this);
      this.getContentKey = this.getContentKey.bind(this);
      this.handleMoreClick = this.handleMoreClick.bind(this);
      this.addScrollwatcher = this.addScrollwatcher.bind(this);
      this.storeMoreTag = this.storeMoreTag.bind(this);
      this.render = this.render.bind(this);
      this.item_list = new ItemList(Post, "key");
      this.posts = this.item_list.items;
      this.need_update = true;
      this.directories = [];
      // Main feed list (set by ContentFeed): honors the feed hub filter.
      // Profile/thread lists keep it false and stay unfiltered.
      this.is_feed = false;
      this.loaded = false;
      this.hide_empty = false;
      this.filter_post_ids = null;
      this.limit = 10;
      // Skip enter/exit animations on background sync refreshes
      this.noanim = false;
      // Thread view (ContentThread): render posts with the full reply tree;
      // focus_uri selects the comment whose ancestors/replies get shown
      this.thread_mode = false;
      this.focus_uri = null;
      this.content_key = null;
    }

    queryComments(post_uris, cb) {
      var query = "SELECT post_uri, comment.body, comment.date_added, comment.comment_id, comment.reply_to, json.cert_auth_type, json.cert_user_id, json.user_name, json.hub, json.directory, json.site FROM comment LEFT JOIN json USING (json_id) WHERE ? AND date_added < " + (Time.timestamp() + 120) + " ORDER BY date_added DESC";
      Page.cmd("dbQuery", [query, { post_uri: post_uris }], cb);
    }

    queryLikes(post_uris, cb) {
      var query = "SELECT post_uri, COUNT(*) AS likes FROM post_like WHERE ? GROUP BY post_uri";
      Page.cmd("dbQuery", [query, { post_uri: post_uris }], cb);
    }

    // Cheap fingerprint of everything the rendered rows depend on: skip the
    // sync + re-render when a background refresh returns identical content.
    getContentKey(rows) {
      var parts = [];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var comments = row.comments || [];
        var comments_size = 0;
        for (var j = 0; j < comments.length; j++) {
          comments_size += comments[j].body != null ? comments[j].body.length : 0;
          comments_size += comments[j].reply_to != null ? 1 : 0;
        }
        parts.push([
          row.key, row.date_added, comments.length, comments_size,
          row.likes || 0, row.body != null ? row.body.length : 0
        ].join("."));
      }
      return parts.join("|");
    }

    // The feed's hub filter, or null. Only used on the main feed; the value
    // is bound as a query param and strictly validated (address shape +
    // still seeded) before it gets near the SQL.
    getFeedHub() {
      if (!this.is_feed) {
        return null;
      }
      var ref, ref1;
      var feed_hub = (ref = Page.local_storage) != null ? ((ref1 = ref.settings) != null ? ref1.feed_hub : void 0) : void 0;
      if (!feed_hub || !/^epix1[a-z0-9]+$/.test(feed_hub)) {
        return null;
      }
      if (!Page.merged_sites || !Page.merged_sites[feed_hub]) {
        return null;
      }
      return feed_hub;
    }

    update() {
      this.need_update = false;
      var param = {};
      var where;
      if (this.directories === "all") {
        where = "WHERE post_id IS NOT NULL AND post.date_added < " + (Time.timestamp() + 120) + " ";
      } else {
        where = "WHERE directory IN " + Text.sqlIn(this.directories) + " AND post_id IS NOT NULL AND post.date_added < " + (Time.timestamp() + 120) + " ";
      }
      if (this.filter_post_ids) {
        where += "AND post_id IN " + Text.sqlIn(this.filter_post_ids) + " ";
      }
      var feed_hub = this.getFeedHub();
      if (feed_hub) {
        where += "AND json.site = :feed_hub ";
        param.feed_hub = feed_hub;
      }
      var query = "SELECT * FROM post LEFT JOIN json ON (post.json_id = json.json_id) " + where + " ORDER BY date_added DESC LIMIT " + (this.limit + 1);
      this.logStart("Update");
      Page.cmd("dbQuery", [query, param], (rows) => {
        // A post served by several hubs renders once per hub on purpose:
        // hubs are separate communities (each row's key includes the site).
        this.has_more = rows.length > this.limit;
        var post_uris = [];
        var all_addresses = [];
        for (var j = 0; j < rows.length; j++) {
          var row = rows[j];
          row["key"] = row["site"] + "-" + row["directory"].replace("data/users/", "") + "_" + row["post_id"];
          row["post_uri"] = row["directory"].replace("data/users/", "") + "_" + row["post_id"];
          post_uris.push(row["post_uri"]);
          var addr = row["directory"].replace("data/users/", "");
          if (addr) all_addresses.push(addr);
        }
        var p_comments = new Deferred();
        var p_likes = new Deferred();
        this.queryComments(post_uris, (comment_rows) => {
          var comment_db = {};
          for (var k = 0; k < comment_rows.length; k++) {
            var comment_row = comment_rows[k];
            var ckey = comment_row.site + "/" + comment_row.post_uri;
            if (comment_db[ckey] == null) comment_db[ckey] = [];
            comment_db[ckey].push(comment_row);
            var c_addr = comment_row.directory != null ? comment_row.directory.replace("data/users/", "") : void 0;
            if (c_addr) all_addresses.push(c_addr);
          }
          for (var l = 0; l < rows.length; l++) {
            var row = rows[l];
            row["comments"] = comment_db[row.site + "/" + row.post_uri];
            var ref1;
            if (((ref1 = this.filter_post_ids) != null ? ref1.length : void 0) === 1 && row.post_id === parseInt(this.filter_post_ids[0])) {
              row.selected = true;
            }
          }
          p_comments.resolve();
        });
        this.queryLikes(post_uris, (like_rows) => {
          var like_db = {};
          for (var k = 0; k < like_rows.length; k++) {
            like_db[like_rows[k]["post_uri"]] = like_rows[k]["likes"];
          }
          for (var l = 0; l < rows.length; l++) {
            rows[l]["likes"] = like_db[rows[l]["post_uri"]];
          }
          p_likes.resolve();
        });
        Deferred.join(p_comments, p_likes).then(() => {
          var content_key = this.getContentKey(rows);
          if (this.loaded && content_key === this.content_key) {
            this.logEnd("Update (unchanged)");
            return;
          }
          this.content_key = content_key;
          Page.resolveXidProfiles(all_addresses, () => {
            this.item_list.sync(rows);
            this.loaded = true;
            this.logEnd("Update");
            Page.projector.scheduleRender();
            if (this.has_more) this.addScrollwatcher();
          });
        });
      });
    }

    handleMoreClick() {
      this.limit += 10;
      this.update();
      return false;
    }

    addScrollwatcher() {
      setTimeout(() => {
        for (var i = 0; i < Page.scrollwatcher.items.length; i++) {
          if (Page.scrollwatcher.items[i][1] === this.tag_more) {
            Page.scrollwatcher.items.splice(i, 1);
            break;
          }
        }
        Page.scrollwatcher.add(this.tag_more, (tag) => {
          if (tag.getBoundingClientRect().top === 0) return;
          this.limit += 10;
          this.need_update = true;
          Page.projector.scheduleRender();
        });
      }, 2000);
    }

    storeMoreTag(elem) { this.tag_more = elem; }

    render() {
      // Post rows read these off the shared ItemList (their item_list ref)
      this.item_list.noanim = this.noanim;
      this.item_list.thread_mode = this.thread_mode;
      this.item_list.focus_uri = this.focus_uri;
      if (this.need_update) this.update();
      if (!this.posts.length) {
        if (!this.loaded || this.hide_empty) {
          return null;
        } else {
          return h("div.post-list", [
            h("div.post-list-empty", {
              enterAnimation: Animation.slideDown, exitAnimation: Animation.slideUp
            }, [h("h2", _("No posts yet")), h("a", { href: "?Users", onclick: Page.handleLinkClick }, _("Let's follow some users!"))])
          ]);
        }
      }
      return [
        h("div.post-list", this.posts.slice(0, this.limit + 1).map((post) => {
          try { return post.render(); } catch (err) {
            Debug.formatException(err);
            return h("div.error", { key: post.row.key }, [_("Post render error:") + " " + err.message]);
          }
        })),
        this.has_more ? h("a.more.small", {
          href: "#More", onclick: this.handleMoreClick,
          enterAnimation: Animation.slideDown, exitAnimation: Animation.slideUp,
          afterCreate: this.storeMoreTag
        }, _("Show more posts...")) : void 0
      ];
    }
  }

  Object.assign(PostList.prototype, LogMixin);
  window.PostList = PostList;

})();
