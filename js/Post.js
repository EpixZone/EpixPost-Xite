(function() {

  class Post {
    constructor(row, item_list) {
      this.item_list = item_list;
      this.render = this.render.bind(this);
      this.renderHeader = this.renderHeader.bind(this);
      this.handleHubPillClick = this.handleHubPillClick.bind(this);
      this.renderActions = this.renderActions.bind(this);
      this.renderComment = this.renderComment.bind(this);
      this.renderComments = this.renderComments.bind(this);
      this.renderThreadComments = this.renderThreadComments.bind(this);
      this.follow = this.follow.bind(this);
      this.unfollow = this.unfollow.bind(this);
      this.handleSettingsClick = this.handleSettingsClick.bind(this);
      this.getPostUri = this.getPostUri.bind(this);
      this.getCommentUri = this.getCommentUri.bind(this);
      this.handleMoreCommentsClick = this.handleMoreCommentsClick.bind(this);
      this.handleCommentDelete = this.handleCommentDelete.bind(this);
      this.handleCommentSave = this.handleCommentSave.bind(this);
      this.handleCommentSubmit = this.handleCommentSubmit.bind(this);
      this.handleCommentClick = this.handleCommentClick.bind(this);
      this.handleLikeClick = this.handleLikeClick.bind(this);
      this.handleShareClick = this.handleShareClick.bind(this);
      this.handlePostDelete = this.handlePostDelete.bind(this);
      this.handlePostSave = this.handlePostSave.bind(this);
      this.liked = false;
      this.commenting = false;
      this.submitting_like = false;
      this.owned = false;
      this.editable_comments = {};
      this.comment_states = {};
      this.field_comment = new Autosize({
        placeholder: _("Post your reply"),
        onsubmit: this.handleCommentSubmit,
        title_submit: _("Reply")
      });
      this.comment_limit = 3;
      this.menu = null;
      this.meta = null;
      this.css_style = "";
      this.setRow(row);
    }

    setRow(row) {
      var ref;
      this.row = row;
      if (this.row.meta) {
        this.meta = new PostMeta(this, JSON.parse(this.row.meta));
      }
      if (Page.user) {
        this.liked = Page.user.likes[this.row.key];
      }
      this.user = new User({
        hub: row.site,
        auth_address: row.directory.replace("data/users/", "")
      });
      this.user.row = row;
      this.owned = this.user.auth_address === ((ref = Page.user) != null ? ref.auth_address : void 0);
      if (this.owned) {
        this.editable_body = new Editable("div.body", this.handlePostSave, this.handlePostDelete);
        this.editable_body.render_function = Text.renderMarked;
        return this.editable_body.empty_text = " ";
      }
    }

    isThreadMode() {
      return !!(this.item_list && this.item_list.thread_mode);
    }

    isNoanim() {
      return !!(this.item_list && this.item_list.noanim);
    }

    getLink() {
      return "?Post/" + this.user.hub + "/" + this.user.auth_address + "/" + this.row.post_id;
    }

    getCommentLink(comment_uri) {
      return this.getLink() + "/" + comment_uri;
    }

    getAbsoluteLink() {
      return "/" + Page.address + "/" + this.getLink();
    }

    // Copy text to the clipboard; falls back to a hidden textarea +
    // execCommand for browsers/iframes where the clipboard API is blocked.
    copyLink() {
      var link = this.getAbsoluteLink();
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

    handleShareClick() {
      this.copyLink();
      return false;
    }

    // In-app navigation from a non-anchor element (comment body taps):
    // mirrors Page.handleLinkClick's scroll/loading handling.
    navigateTo(url) {
      Page.history_state["scrollTop"] = window.pageYOffset;
      Page.cmd("wrapperReplaceState", [Page.history_state, null]);
      window.scroll(window.pageXOffset, 0);
      Page.history_state["scrollTop"] = 0;
      Page.on_loaded.resolved = false;
      document.body.classList.remove("loaded");
      Page.setUrl(url);
    }

    handlePostSave(body, cb) {
      return Page.user.getData(Page.user.hub, (data) => {
        var i, j, len, post, post_index, ref;
        ref = data.post;
        for (i = j = 0, len = ref.length; j < len; i = ++j) {
          post = ref[i];
          if (post.post_id === this.row.post_id) {
            post_index = i;
          }
        }
        data.post[post_index].body = body;
        return Page.user.save(data, Page.user.hub, (res) => {
          return cb(res);
        });
      });
    }

    handlePostDelete(cb) {
      return Page.user.getData(Page.user.hub, (data) => {
        var i, j, len, post, post_index, ref, ref1, ref2;
        ref = data.post;
        for (i = j = 0, len = ref.length; j < len; i = ++j) {
          post = ref[i];
          if (post.post_id === this.row.post_id) {
            post_index = i;
          }
        }
        data.post.splice(post_index, 1);
        if ((ref1 = this.meta) != null ? (ref2 = ref1.meta) != null ? ref2.img : void 0 : void 0) {
          return Page.cmd("fileDelete", (this.user.getPath()) + "/" + this.row.post_id + ".jpg", () => {
            return Page.user.save(data, Page.user.hub, (res) => {
              return cb(res);
            });
          });
        } else {
          return Page.user.save(data, Page.user.hub, (res) => {
            return cb(res);
          });
        }
      });
    }

    handleLikeClick(e) {
      var post_uri, ref, site;
      this.submitting_like = true;
      ref = this.row.key.split("-"), site = ref[0], post_uri = ref[1];
      if (Page.user.likes[post_uri]) {
        Page.user.dislike(site, post_uri, () => {
          this.submitting_like = false;
          return this.unfollow();
        });
      } else {
        Page.user.like(site, post_uri, () => {
          this.submitting_like = false;
          return this.follow();
        });
      }
      return false;
    }

    handleCommentClick() {
      if (this.field_comment.node && (this.commenting || this.isThreadMode())) {
        this.field_comment.node.focus();
      } else {
        this.commenting = true;
        Page.projector.scheduleRender();
        setTimeout((() => {
          if (this.field_comment.node) {
            return this.field_comment.node.focus();
          }
        }), 600);
      }
      return false;
    }

    handleCommentSubmit() {
      var post_uri, ref, site, timer_loading;
      if (!this.field_comment.attrs.value) {
        return;
      }
      timer_loading = setTimeout((() => {
        return this.field_comment.loading = true;
      }), 100);
      ref = this.row.key.split("-"), site = ref[0], post_uri = ref[1];
      return Page.user.comment(site, post_uri, this.field_comment.attrs.value, (res) => {
        clearTimeout(timer_loading);
        this.field_comment.loading = false;
        if (res) {
          this.field_comment.setValue("");
        }
        return this.follow();
      });
    }

    handleCommentSave(comment_id, body, cb) {
      return Page.user.getData(this.row.site, (data) => {
        var comment, comment_index, i, j, len, ref;
        ref = data.comment;
        for (i = j = 0, len = ref.length; j < len; i = ++j) {
          comment = ref[i];
          if (comment.comment_id === comment_id) {
            comment_index = i;
          }
        }
        data.comment[comment_index].body = body;
        return Page.user.save(data, this.row.site, (res) => {
          return cb(res);
        });
      });
    }

    handleCommentDelete(comment_id, cb) {
      return Page.user.getData(this.row.site, (data) => {
        var comment, comment_index, i, j, len, ref;
        ref = data.comment;
        for (i = j = 0, len = ref.length; j < len; i = ++j) {
          comment = ref[i];
          if (comment.comment_id === comment_id) {
            comment_index = i;
          }
        }
        data.comment.splice(comment_index, 1);
        return Page.user.save(data, this.row.site, (res) => {
          cb(res);
          return this.unfollow();
        });
      });
    }

    handleMoreCommentsClick() {
      this.comment_limit += 10;
      return false;
    }

    getEditableComment(comment_uri) {
      var comment_id, handleCommentDelete, handleCommentSave, ref, user_address;
      if (!this.editable_comments[comment_uri]) {
        ref = comment_uri.lastIndexOf("_"), user_address = comment_uri.substring(0, ref), comment_id = comment_uri.substring(ref + 1);
        handleCommentSave = (body, cb) => {
          return this.handleCommentSave(parseInt(comment_id), body, cb);
        };
        handleCommentDelete = (cb) => {
          return this.handleCommentDelete(parseInt(comment_id), cb);
        };
        this.editable_comments[comment_uri] = new Editable("div.body", handleCommentSave, handleCommentDelete);
        this.editable_comments[comment_uri].render_function = Text.renderMarked;
      }
      return this.editable_comments[comment_uri];
    }

    getPostUri() {
      return this.user.auth_address + "_" + this.row.post_id;
    }

    getCommentUri(comment) {
      return comment.directory.replace("data/users/", "") + "_" + comment.comment_id;
    }

    // Build the reply tree from this.row.comments. reply_to is user
    // controlled, so it needs to be treated as hostile: replies whose parent
    // is not in the fetched set degrade to top level, and comments only
    // reachable through a reply cycle get promoted to top level too.
    buildCommentTree() {
      var comment, comments, i, parent_uri, uri;
      comments = this.row.comments || [];
      var sorted = comments.slice().sort(function(a, b) {
        return a.date_added - b.date_added;
      });
      var by_uri = {};
      for (i = 0; i < sorted.length; i++) {
        by_uri[this.getCommentUri(sorted[i])] = sorted[i];
      }
      var children = {};
      var top = [];
      for (i = 0; i < sorted.length; i++) {
        comment = sorted[i];
        uri = this.getCommentUri(comment);
        parent_uri = comment.reply_to;
        if (parent_uri && parent_uri !== uri && by_uri[parent_uri]) {
          if (!children[parent_uri]) {
            children[parent_uri] = [];
          }
          children[parent_uri].push(comment);
        } else {
          top.push(comment);
        }
      }
      // Mark everything reachable from the top level, then promote the rest
      var reachable = {};
      var markReachable = function(getUri, start) {
        var queue = start.slice();
        while (queue.length) {
          var item = queue.shift();
          var item_uri = getUri(item);
          if (reachable[item_uri]) {
            continue;
          }
          reachable[item_uri] = true;
          if (children[item_uri]) {
            queue = queue.concat(children[item_uri]);
          }
        }
      };
      markReachable(this.getCommentUri, top);
      for (i = 0; i < sorted.length; i++) {
        comment = sorted[i];
        uri = this.getCommentUri(comment);
        if (!reachable[uri]) {
          top.push(comment);
          markReachable(this.getCommentUri, [comment]);
        }
      }
      return {by_uri: by_uri, children: children, top: top};
    }

    countReplies(uri, tree, visited) {
      if (visited == null) {
        visited = {};
      }
      var replies = tree.children[uri];
      if (!replies) {
        return 0;
      }
      var count = 0;
      for (var i = 0; i < replies.length; i++) {
        var child_uri = this.getCommentUri(replies[i]);
        if (visited[child_uri]) {
          continue;
        }
        visited[child_uri] = true;
        count += 1 + this.countReplies(child_uri, tree, visited);
      }
      return count;
    }

    // Ancestor chain of a comment (root first); the visited guard stops
    // reply_to cycles.
    getAncestors(comment_uri, tree) {
      var ancestors = [];
      var visited = {};
      visited[comment_uri] = true;
      var comment = tree.by_uri[comment_uri];
      var parent_uri = comment ? comment.reply_to : null;
      while (parent_uri && tree.by_uri[parent_uri] && !visited[parent_uri]) {
        visited[parent_uri] = true;
        ancestors.unshift(tree.by_uri[parent_uri]);
        parent_uri = tree.by_uri[parent_uri].reply_to;
      }
      return ancestors;
    }

    // Per-comment UI state (inline reply composer + stable event handlers;
    // maquette requires handler identity to stay stable between renders).
    getCommentState(uri) {
      if (!this.comment_states[uri]) {
        var state = {open: false};
        state.field = new Autosize({
          placeholder: _("Post your reply"),
          onsubmit: () => {
            return this.handleReplySubmit(uri);
          },
          title_submit: _("Reply")
        });
        state.handleReplyClick = () => {
          state.open = !state.open;
          if (state.open) {
            setTimeout((function() {
              if (state.field.node) {
                return state.field.node.focus();
              }
            }), 100);
          }
          Page.projector.scheduleRender();
          return false;
        };
        state.handleBodyClick = (e) => {
          return this.handleCommentBodyClick(e, uri);
        };
        this.comment_states[uri] = state;
      }
      return this.comment_states[uri];
    }

    handleReplySubmit(uri) {
      var state = this.getCommentState(uri);
      if (!state.field.attrs.value || !state.field.attrs.value.trim()) {
        return;
      }
      var timer_loading = setTimeout((function() {
        return state.field.loading = true;
      }), 100);
      var ref = this.row.key.split("-"), site = ref[0], post_uri = ref[1];
      return Page.user.comment(site, post_uri, state.field.attrs.value, (res) => {
        clearTimeout(timer_loading);
        state.field.loading = false;
        if (res) {
          state.field.setValue("");
          state.open = false;
        }
        Page.projector.scheduleRender();
        return this.follow();
      }, uri);
    }

    // Tapping a comment body opens its focus view; links inside the body and
    // text selection keep working.
    handleCommentBodyClick(e, uri) {
      var node = e.target;
      while (node && node !== e.currentTarget) {
        if (node.tagName === "A" || node.tagName === "TEXTAREA" || node.tagName === "BUTTON") {
          return true;
        }
        node = node.parentNode;
      }
      if (window.getSelection && String(window.getSelection())) {
        return true;
      }
      this.navigateTo(this.getCommentLink(uri));
      return false;
    }

    handleSettingsClick() {
      this.css_style = "z-index: " + this.row.date_added + "; position: relative";
      Page.cmd("feedListFollow", [], (follows) => {
        var followed, ref;
        if (!this.menu) {
          this.menu = new Menu();
        }
        followed = follows["Post follow"] && (ref = this.getPostUri(), follows["Post follow"][1].indexOf(ref) >= 0);
        this.menu.items = [];
        this.menu.items.push([
          _("Follow in newsfeed"), (() => {
            if (followed) {
              return this.unfollow();
            } else {
              return this.follow();
            }
          }), followed
        ]);
        this.menu.items.push([
          _("Copy link"), (() => {
            this.copyLink();
            return false;
          })
        ]);
        this.menu.items.push([_("Mute user"), this.user.handleMuteClick]);
        this.menu.items.push([_("Permalink"), this.getLink()]);
        if (this.owned) {
          this.menu.items.push([
            _("Edit"), ((e) => {
              return this.editable_body.handleEditClick(e);
            })
          ]);
        }
        return this.menu.toggle();
      });
      return false;
    }

    unfollow() {
      return Page.cmd("feedListFollow", [], (follows) => {
        var followed_uris, index;
        if (!follows["Post follow"]) {
          return;
        }
        followed_uris = follows["Post follow"][1];
        index = followed_uris.indexOf(this.getPostUri());
        if (index === -1) {
          return;
        }
        followed_uris.splice(index, 1);
        if (followed_uris.length === 0) {
          delete follows["Post follow"];
        }
        this.log("Unfollow", follows);
        return Page.cmd("feedFollow", [follows]);
      });
    }

    follow() {
      return Page.cmd("feedListFollow", [], (follows) => {
        var followed_uris;
        if (!follows["Post follow"]) {
          follows["Post follow"] = ["SELECT\n \"comment\" AS type,\n comment.date_added AS date_added,\n \"a followed post\" AS title,\n '@' || user_name || ': ' || comment.body AS body,\n '?Post/' || json.site || '/' || REPLACE(post_uri, '_', '/') AS url\nFROM comment\nLEFT JOIN json USING (json_id)\nWHERE post_uri IN (:params)", []];
        }
        followed_uris = follows["Post follow"][1];
        followed_uris.push(this.getPostUri());
        return Page.cmd("feedFollow", [follows]);
      });
    }

    // One comment row. opts: show_chip (reply count chip linking to the
    // comment's focus view), nested (one level deep in thread view),
    // connector (ancestor chain), focused (highlighted target comment).
    renderComment(comment, tree, opts) {
      if (opts == null) {
        opts = {};
      }
      var ref, ref1;
      var uri = this.getCommentUri(comment);
      var state = this.getCommentState(uri);
      // May be created before the language file loads: re-resolve on render
      state.field.attrs.placeholder = _("Post your reply");
      state.field.attrs.title_submit = _("Reply");
      var noanim = this.isNoanim();
      var user_address = comment.directory.replace("data/users/", "");
      var owned = user_address === ((ref = Page.user) != null ? ref.auth_address : void 0);
      var user_link = "?Profile/" + comment.hub + "/" + user_address + "/" + comment.cert_user_id;
      var display_name = Page.getXidDisplayName(user_address, comment.user_name);
      var focus_href = this.getCommentLink(uri);
      var reply_count = opts.show_chip ? this.countReplies(uri, tree) : 0;
      var body_tag;
      if (owned) {
        body_tag = this.getEditableComment(uri).render(comment.body);
      } else if (((ref1 = comment.body) != null ? ref1.length : void 0) > 5000) {
        body_tag = h("div.body.maxheight", {
          innerHTML: Text.renderMarked(comment.body),
          afterCreate: Maxheight.apply
        });
      } else {
        body_tag = h("div.body", {
          innerHTML: Text.renderMarked(comment.body)
        });
      }
      return h("div.comment", {
        id: uri,
        key: uri,
        animate_scrollfix: true,
        enterAnimation: noanim ? void 0 : Animation.slideDown,
        exitAnimation: noanim ? void 0 : Animation.slideUp,
        classes: {
          focused: !!opts.focused,
          nested: !!opts.nested,
          "in-chain": !!opts.connector
        }
      }, [
        h("div.user", [
          h("a.name.link", {
            href: user_link,
            onclick: Page.handleLinkClick
          }, display_name), comment.cert_user_id && !comment.cert_user_id.match(/@xid$/) ? [
            h("span.sep", " · "), h("span.address", {
              title: user_address
            }, comment.cert_user_id)
          ] : void 0, h("span.sep", " · "), h("a.added.link", {
            href: focus_href,
            title: Time.date(comment.date_added, "long"),
            onclick: Page.handleLinkClick
          }, Time.since(comment.date_added)), h("a.icon.icon-reply", {
            href: "#Reply",
            onclick: state.handleReplyClick
          }, _("Reply"))
        ]),
        h("div.comment-body-wrap", {
          onclick: state.handleBodyClick,
          classes: {
            clickable: !opts.focused
          }
        }, body_tag),
        opts.show_chip && reply_count > 0 ? h("a.replies-chip.link", {
          href: focus_href,
          onclick: Page.handleLinkClick
        }, reply_count === 1 ? _("1 reply") : reply_count + " " + _("replies")) : void 0,
        state.open ? h("div.comment-create.reply-create", {
          enterAnimation: noanim ? void 0 : Animation.slideDown
        }, [
          h("div.replying-to", [_("Replying to"), " ", h("span.reply-name", "@" + display_name)]),
          state.field.render()
        ]) : void 0
      ]);
    }

    // Feed card: top level comments only (newest first, capped), each with a
    // reply count chip that jumps into the thread view.
    renderComments() {
      var noanim = this.isNoanim();
      var tree = this.buildCommentTree();
      if (!tree.top.length && !this.commenting) {
        return [];
      }
      var top_desc = tree.top.slice().reverse();
      return h("div.comment-list", {
        enterAnimation: noanim ? void 0 : Animation.slideDown,
        exitAnimation: noanim ? void 0 : Animation.slideUp,
        animate_scrollfix: true,
        animate_noscale: true
      }, [
        this.commenting ? h("div.comment-create", {
          enterAnimation: noanim ? void 0 : Animation.slideDown
        }, this.field_comment.render()) : void 0,
        top_desc.slice(0, this.comment_limit).map((comment) => {
          return this.renderComment(comment, tree, {show_chip: true});
        }),
        top_desc.length > this.comment_limit ? h("a.more", {
          href: "#More",
          onclick: this.handleMoreCommentsClick,
          enterAnimation: noanim ? void 0 : Animation.slideDown,
          exitAnimation: noanim ? void 0 : Animation.slideUp
        }, _("Show more comments...")) : void 0
      ]);
    }

    // Thread view. Without a focused comment: direct replies with one level
    // of nested replies inline, deeper branches behind "View replies (N)".
    // With a focused comment: tappable ancestor chain, the highlighted
    // comment, then its direct replies.
    renderThreadComments() {
      var tree = this.buildCommentTree();
      var focus_uri = this.item_list ? this.item_list.focus_uri : null;
      var parts = [];
      if (focus_uri && tree.by_uri[focus_uri]) {
        var ancestors = this.getAncestors(focus_uri, tree);
        if (ancestors.length) {
          parts.push(h("div.thread-context", ancestors.map((comment) => {
            return this.renderComment(comment, tree, {connector: true});
          })));
        }
        parts.push(this.renderComment(tree.by_uri[focus_uri], tree, {focused: true}));
        var replies = tree.children[focus_uri] || [];
        if (replies.length) {
          parts.push(h("div.thread-replies", replies.map((comment) => {
            return this.renderComment(comment, tree, {show_chip: true, nested: true});
          })));
        }
      } else {
        parts = tree.top.map((comment) => {
          var uri = this.getCommentUri(comment);
          var kids = tree.children[uri] || [];
          return h("div.thread-branch", {
            key: "branch_" + uri
          }, [
            this.renderComment(comment, tree, {}),
            kids.length ? h("div.comment-children", kids.map((kid) => {
              return this.renderComment(kid, tree, {show_chip: true, nested: true});
            })) : void 0
          ]);
        });
      }
      return parts;
    }

    handleHubPillClick(e) {
      if (e.which === 2) {
        return true;
      }
      if (Page.local_storage) {
        Page.local_storage.settings.feed_hub = this.row.site;
        Page.saveLocalStorage();
      }
      Page.content_feed.update();
      Page.navigate("?Home");
      return false;
    }

    renderHeader() {
      var handle = null;
      if (this.row.cert_user_id && !this.row.cert_user_id.match(/@xid$/)) {
        handle = this.row.cert_user_id;
      }
      return h("div.user", [
        this.user.renderAvatar({
          href: this.user.getLink(),
          onclick: Page.handleLinkClick
        }),
        h("div.names", [
          h("div.nameline", [
            h("a.name.link", {
              href: this.user.getLink(),
              onclick: Page.handleLinkClick
            }, this.user.getDisplayName()),
            handle ? h("span.address", {
              title: this.user.auth_address
            }, handle) : void 0
          ]),
          h("div.metaline", [
            h("a.added.link", {
              href: this.getLink(),
              title: Time.date(this.row.date_added, "long"),
              onclick: Page.handleLinkClick
            }, Time.since(this.row.date_added)),
            // Which hub the post lives on; tapping filters the feed to it.
            // Hidden while only one hub is seeded (it would say the obvious).
            Object.keys(Page.merged_sites || {}).length > 1 && this.row.site ? h("a.hub-pill", {
              href: "?Home",
              title: _("Show only posts from this hub"),
              onclick: this.handleHubPillClick
            }, Page.getHubTitle(this.row.site)) : void 0
          ])
        ]),
        this.menu ? this.menu.render(".menu-right") : void 0,
        h("a.settings.icon.icon-kebab", {
          href: "#Settings",
          title: _("More"),
          onclick: Page.returnFalse,
          onmousedown: this.handleSettingsClick
        })
      ]);
    }

    renderActions() {
      var ref, ref1, ref2;
      var post_uri = this.row.key.split("-")[1];
      var reply_count = (ref = this.row.comments) != null ? ref.length : 0;
      return h("div.actions", [
        h("span.action-reply", [
          h("a.icon.icon-comment.link", {
            href: "#Reply",
            title: _("Reply"),
            onclick: this.handleCommentClick
          }),
          reply_count ? h("a.count.link", {
            href: this.getLink(),
            title: _("View replies"),
            onclick: Page.handleLinkClick
          }, "" + reply_count) : void 0
        ]),
        h("a.like.link", {
          classes: {
            active: (ref1 = Page.user) != null ? ref1.likes[post_uri] : void 0,
            loading: this.submitting_like
          },
          href: "#Like",
          title: _("Like"),
          onclick: this.handleLikeClick
        }, [
          h("span.icon.icon-heart", {
            classes: {
              active: (ref2 = Page.user) != null ? ref2.likes[post_uri] : void 0
            }
          }),
          this.row.likes ? "" + this.row.likes : void 0
        ]),
        h("a.icon.icon-share.link", {
          href: "#Share",
          title: _("Copy link"),
          onclick: this.handleShareClick
        })
      ]);
    }

    render() {
      var ref;
      var noanim = this.isNoanim();
      var thread_mode = this.isThreadMode();
      // May be constructed before the language file loads: re-resolve on render
      this.field_comment.attrs.placeholder = _("Post your reply");
      this.field_comment.attrs.title_submit = _("Reply");
      return h("div.post", {
        key: this.row.key,
        enterAnimation: noanim ? void 0 : Animation.slideDown,
        exitAnimation: noanim ? void 0 : Animation.slideUp,
        animate_scrollfix: true,
        classes: {
          selected: this.row.selected,
          thread: thread_mode
        },
        style: this.css_style
      }, [
        this.renderHeader(),
        this.owned ? this.editable_body.render(this.row.body) : h("div.body", {
          classes: {
            maxheight: !thread_mode && !this.row.selected && ((ref = this.row.body) != null ? ref.length : void 0) > 3000
          },
          innerHTML: Text.renderMarked(this.row.body),
          afterCreate: Maxheight.apply,
          afterUpdate: Maxheight.apply
        }),
        this.meta ? this.meta.render() : void 0,
        this.renderActions(),
        thread_mode ? h("div.comment-list.thread", [
          h("div.comment-create", this.field_comment.render()),
          this.renderThreadComments()
        ]) : this.renderComments()
      ]);
    }
  }

  Object.assign(Post.prototype, LogMixin);
  window.Post = Post;

})();
