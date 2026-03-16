(function() {

  class PostList {
    constructor() {
      this.queryComments = this.queryComments.bind(this);
      this.queryLikes = this.queryLikes.bind(this);
      this.update = this.update.bind(this);
      this.handleMoreClick = this.handleMoreClick.bind(this);
      this.addScrollwatcher = this.addScrollwatcher.bind(this);
      this.storeMoreTag = this.storeMoreTag.bind(this);
      this.render = this.render.bind(this);
      this.item_list = new ItemList(Post, "key");
      this.posts = this.item_list.items;
      this.need_update = true;
      this.directories = [];
      this.loaded = false;
      this.filter_post_ids = null;
      this.limit = 10;
    }

    queryComments(post_uris, cb) {
      var query = "SELECT post_uri, comment.body, comment.date_added, comment.comment_id, json.cert_auth_type, json.cert_user_id, json.user_name, json.hub, json.directory, json.site FROM comment LEFT JOIN json USING (json_id) WHERE ? AND date_added < " + (Time.timestamp() + 120) + " ORDER BY date_added DESC";
      Page.cmd("dbQuery", [query, { post_uri: post_uris }], cb);
    }

    queryLikes(post_uris, cb) {
      var query = "SELECT post_uri, COUNT(*) AS likes FROM post_like WHERE ? GROUP BY post_uri";
      Page.cmd("dbQuery", [query, { post_uri: post_uris }], cb);
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
      if (Page.local_storage.settings.hide_hello_epixpost) {
        where += "AND post_id > 1 ";
      }
      var query = "SELECT * FROM post LEFT JOIN json ON (post.json_id = json.json_id) " + where + " ORDER BY date_added DESC LIMIT " + (this.limit + 1);
      this.logStart("Update");
      Page.cmd("dbQuery", [query, param], (rows) => {
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
          Page.resolveXidProfiles(all_addresses, () => {
            this.item_list.sync(rows);
            this.loaded = true;
            this.logEnd("Update");
            Page.projector.scheduleRender();
            if (this.posts.length > this.limit) this.addScrollwatcher();
          });
        });
        this.queryLikes(post_uris, (like_rows) => {
          var like_db = {};
          for (var k = 0; k < like_rows.length; k++) {
            like_db[like_rows[k]["post_uri"]] = like_rows[k]["likes"];
          }
          for (var l = 0; l < rows.length; l++) {
            rows[l]["likes"] = like_db[rows[l]["post_uri"]];
          }
          this.item_list.sync(rows);
          Page.projector.scheduleRender();
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
      if (this.need_update) this.update();
      if (!this.posts.length) {
        if (!this.loaded) {
          return null;
        } else {
          return h("div.post-list", [
            h("div.post-list-empty", {
              enterAnimation: Animation.slideDown, exitAnimation: Animation.slideUp
            }, [h("h2", "No posts yet"), h("a", { href: "?Users", onclick: Page.handleLinkClick }, "Let's follow some users!")])
          ]);
        }
      }
      return [
        h("div.post-list", this.posts.slice(0, this.limit + 1).map((post) => {
          try { return post.render(); } catch (err) {
            h("div.error", ["Post render error:", err.message]);
            return Debug.formatException(err);
          }
        })),
        this.posts.length > this.limit ? h("a.more.small", {
          href: "#More", onclick: this.handleMoreClick,
          enterAnimation: Animation.slideDown, exitAnimation: Animation.slideUp,
          afterCreate: this.storeMoreTag
        }, "Show more posts...") : void 0
      ];
    }
  }

  Object.assign(PostList.prototype, LogMixin);
  window.PostList = PostList;

})();
