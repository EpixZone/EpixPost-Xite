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
      this.submitComment = this.submitComment.bind(this);
      this.pollPendingComments = this.pollPendingComments.bind(this);
      this.renderPendingComment = this.renderPendingComment.bind(this);
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
      // Comments of ours the node has not indexed yet (uri -> row); they
      // render in place until the db row shows up. See submitComment.
      this.pending_comments = {};
      // Publish outcome per comment uri: "publishing" | "published" | "failed"
      this.publish_states = {};
      this.pending_poll = null;
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
      // The user has to exist BEFORE the meta. PostMeta resolves its image
      // path in its constructor, through `post.user.getPath()`, so building
      // the meta first threw "Cannot read properties of undefined (reading
      // 'getPath')" on every post that has meta - which is every post with an
      // image. That throw lands inside ItemList.sync, so it takes down the
      // WHOLE feed load rather than one row, and the page sits on
      // "Loading feed..." for ever.
      this.user = new User({
        hub: row.site,
        auth_address: row.directory.replace("data/users/", "")
      });
      this.user.row = row;
      if (this.row.meta) {
        this.meta = new PostMeta(this, JSON.parse(this.row.meta));
      }
      if (Page.user) {
        this.liked = Page.user.likes[this.row.key];
      }
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
      // resolve() CONSUMES the callback list, so markLoaded has to be put back
      // or body.loaded never returns - and `body` is `overflow: hidden` until
      // it does, so the page cannot be scrolled at all. EpixPost.navigate
      // carries the same line; this path (tapping a comment to open its
      // thread) was missing it, which is why a long thread reached this way
      // was stuck.
      Page.on_loaded.then(Page.markLoaded);
      document.body.classList.remove("loaded");
      Page.setUrl(url);
    }

    handlePostSave(body, cb) {
      // An edit is a new signed version of the same post_id (merge picks the
      // causally-latest); it can never touch any other post.
      return Page.user.editPost(this.row.post_id, { body: body }, cb);
    }

    handlePostDelete(cb) {
      // A delete is a signed tombstone, NOT a splice: absence is not deletion
      // on the network, so only a signed tombstone hides the post. Blast radius
      // is this one post.
      return Page.user.editPost(this.row.post_id, { deleted: true }, cb);
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
      this.submitComment(this.field_comment, null);
    }

    // Write a comment and keep it on screen the whole way. The fileWrite
    // itself returns fast, but the node only indexes a user file once it is
    // signed (inside sitePublish) and the merger db is rebuilt - 5-20s on a
    // busy node - and it does not tell the writing page when that happens.
    // Before this the text vanished from the composer and reappeared much
    // later, with nothing on screen in between. Now the comment shows as a
    // pending row (renderPendingComment) until its db row arrives, and the
    // publish outcome lands on the row instead of only as a late toast.
    submitComment(field, reply_to, cb) {
      var body = field.attrs.value;
      if (!body || !body.trim()) {
        return;
      }
      var timer_loading = setTimeout(() => {
        field.loading = true;
      }, 100);
      var ref = this.row.key.split("-"), site = ref[0], post_uri = ref[1];
      var pending = null;
      Page.user.comment(site, post_uri, body, (res, row) => {
        clearTimeout(timer_loading);
        field.loading = false;
        // A failed write comes back as {error}; only "ok" is a success.
        // (AnonUser answers false after its own "you need a profile" note.)
        var ok = res === "ok";
        if (ok) {
          field.setValue("");
          pending = this.addPendingComment(row, reply_to);
        } else if (res && res.error) {
          Page.cmd("wrapperNotification", ["error", _("Could not save your reply:") + " " + res.error]);
        }
        if (typeof cb === "function") {
          cb(ok);
        }
        Page.projector.scheduleRender();
        this.follow();
      }, reply_to, (res_publish) => {
        if (pending) {
          this.setPublishState(pending.uri, res_publish === "ok" ? "published" : "failed");
        }
      });
    }

    addPendingComment(row, reply_to) {
      var uri = Page.user.getDirectory() + "_" + row.comment_id;
      var pending = {
        uri: uri,
        body: row.body,
        reply_to: reply_to || null,
        date_added: row.date_added,
        added_at: Time.timestamp(),
        // Set once the db row exists but is not rendered by the current
        // view (a reply on a feed card): the row stays to show the outcome.
        indexed: false
      };
      this.pending_comments[uri] = pending;
      this.publish_states[uri] = "publishing";
      this.schedulePendingPoll(1500);
      return pending;
    }

    setPublishState(uri, state) {
      this.publish_states[uri] = state;
      if (state === "published") {
        // Leave the check mark up briefly; after that it is just a comment.
        setTimeout(() => {
          if (this.publish_states[uri] === "published") {
            delete this.publish_states[uri];
            Page.projector.scheduleRender();
          }
        }, 5000);
      }
      Page.projector.scheduleRender();
    }

    // The node leaves the writing page out of the file_done it sends when
    // the signed content gets indexed, so nothing pushes the new row here:
    // re-query while a comment is still pending. Quick at first (it usually
    // lands within seconds), then slower, and give up after a few minutes
    // rather than poll a stuck node forever.
    schedulePendingPoll(delay) {
      if (this.pending_poll) {
        clearTimeout(this.pending_poll);
      }
      this.pending_poll = setTimeout(this.pollPendingComments, delay);
    }

    pollPendingComments() {
      this.pending_poll = null;
      var now = Time.timestamp();
      var oldest = now;
      var waiting = 0;
      for (var uri in this.pending_comments) {
        var pending = this.pending_comments[uri];
        if (pending.indexed) {
          continue;
        }
        waiting += 1;
        oldest = Math.min(oldest, pending.added_at);
      }
      if (!waiting) {
        return;
      }
      var waited = now - oldest;
      if (waited > 300) {
        this.log("Pending comments never got indexed, dropping them");
        for (uri in this.pending_comments) {
          if (!this.pending_comments[uri].indexed) {
            delete this.pending_comments[uri];
          }
        }
        Page.projector.scheduleRender();
        return;
      }
      Page.updateContentNoanim();
      this.schedulePendingPoll(waited < 30 ? 3000 : 10000);
    }

    // Reconcile the pending rows with the fetched comments. `visible` is the
    // set of comment uris this render pass shows: a pending row whose db
    // row is among them goes away (the real row takes over, badge and all);
    // one whose db row exists but is NOT shown by this view (a reply on a
    // feed card, which lists top level only) stays until its publish
    // outcome has been shown, so it does not just blink out of existence.
    settlePendingComments(tree, visible) {
      var changed = false;
      for (var uri in this.pending_comments) {
        if (!tree.by_uri[uri]) {
          continue;
        }
        if (!visible[uri] && this.publish_states[uri]) {
          this.pending_comments[uri].indexed = true;
          continue;
        }
        delete this.pending_comments[uri];
        changed = true;
      }
      if (changed && this.pending_poll) {
        var waiting = false;
        for (uri in this.pending_comments) {
          if (!this.pending_comments[uri].indexed) {
            waiting = true;
          }
        }
        if (!waiting) {
          clearTimeout(this.pending_poll);
          this.pending_poll = null;
        }
      }
    }

    getPendingReplies(parent_uri) {
      var out = [];
      for (var uri in this.pending_comments) {
        var pending = this.pending_comments[uri];
        if ((pending.reply_to || null) === (parent_uri || null)) {
          out.push(pending);
        }
      }
      out.sort(function(a, b) {
        return a.date_added - b.date_added;
      });
      return out;
    }

    // An edit is a new signed version of the same comment (the merge picks the
    // causally-latest); it can never touch any other comment.
    handleCommentSave(comment_id, body, cb) {
      return Page.user.editComment(comment_id, { body: body }, cb);
    }

    // A delete is a signed tombstone, NOT a splice: absence is not deletion on
    // the network, so only a signed tombstone hides the comment.
    handleCommentDelete(comment_id, cb) {
      return Page.user.editComment(comment_id, { deleted: true }, (res) => {
        cb(res);
        return this.unfollow();
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
        state.submitting_like = false;
        state.handleLikeClick = () => {
          if (state.submitting_like) {
            return false;
          }
          var liked = !(Page.user && Page.user.comment_likes[uri]);
          state.submitting_like = true;
          Page.projector.scheduleRender();
          Page.user.toggleCommentLike(uri, liked, () => {
            state.submitting_like = false;
            Page.projector.scheduleRender();
          });
          return false;
        };
        this.comment_states[uri] = state;
      }
      return this.comment_states[uri];
    }

    handleReplySubmit(uri) {
      var state = this.getCommentState(uri);
      this.submitComment(state.field, uri, function(ok) {
        if (ok) {
          state.open = false;
        }
      });
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
      var ref, ref1, ref2, ref3;
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
          }, display_name), comment.cert_user_id && !comment.cert_user_id.match(/@xid(\.epix)?$/) ? [
            h("span.sep", " · "), h("span.address", {
              title: user_address
            }, comment.cert_user_id)
          ] : void 0, h("span.sep", " · "), h("a.added.link", {
            href: focus_href,
            title: Time.date(comment.date_added, "long"),
            onclick: Page.handleLinkClick
          }, Time.since(comment.date_added)), h("div.comment-actions", [
            h("a.like.link", {
              classes: {
                active: !!((ref2 = Page.user) != null ? ref2.comment_likes[uri] : void 0),
                loading: state.submitting_like
              },
              href: "#Like",
              title: _("Like"),
              onclick: state.handleLikeClick
            }, [
              h("span.icon.icon-heart", {
                classes: {
                  active: !!((ref3 = Page.user) != null ? ref3.comment_likes[uri] : void 0)
                }
              }),
              comment.likes ? "" + comment.likes : void 0
            ]),
            h("a.icon.icon-reply", {
              href: "#Reply",
              onclick: state.handleReplyClick
            }, _("Reply"))
          ])
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
        ]) : void 0,
        this.publish_states[uri] ? this.renderCommentStatus(this.publish_states[uri]) : void 0,
        this.renderPendingReplies(uri)
      ]);
    }

    // The row of a comment we just wrote, in the spot its db row will take
    // (top level, or nested under the parent it replies to). Looks like a
    // comment minus the reply/edit affordances, plus a status line.
    renderPendingComment(pending, opts) {
      if (opts == null) {
        opts = {};
      }
      var noanim = this.isNoanim();
      var display_name = Page.user ? Page.user.getDisplayName() : "";
      var status;
      if (pending.indexed) {
        status = this.publish_states[pending.uri] || "published";
      } else {
        status = this.publish_states[pending.uri] === "failed" ? "failed" : "sending";
      }
      return h("div.comment.pending", {
        key: "pending_" + pending.uri,
        animate_scrollfix: true,
        enterAnimation: noanim ? void 0 : Animation.slideDown,
        classes: {
          nested: !!opts.nested
        }
      }, [
        h("div.user", [
          h("span.name", display_name),
          h("span.sep", " \u00b7 "),
          h("span.added", Time.since(pending.date_added))
        ]),
        h("div.comment-body-wrap", [
          h("div.body", {
            innerHTML: Text.renderMarked(pending.body)
          })
        ]),
        this.renderCommentStatus(status)
      ]);
    }

    // Pending replies to `parent_uri`, nested under it like real replies.
    renderPendingReplies(parent_uri) {
      var pending = this.getPendingReplies(parent_uri);
      if (!pending.length) {
        return void 0;
      }
      return h("div.comment-children.pending-replies", pending.map((row) => {
        return this.renderPendingComment(row, {nested: true});
      }));
    }

    renderCommentStatus(status) {
      var text = {
        sending: _("Sending..."),
        publishing: _("Publishing..."),
        published: _("Published"),
        failed: _("Saved on this node, but no peers accepted it yet. It will retry on the next sync.")
      }[status];
      var icon;
      if (status === "published") {
        icon = h("span.status-icon.ok", "\u2713");
      } else if (status === "failed") {
        icon = h("span.status-icon.warn", "!");
      } else {
        icon = h("span.spinner");
      }
      return h("div.comment-status", {
        classes: {
          published: status === "published",
          failed: status === "failed"
        }
      }, [icon, h("span.status-text", text)]);
    }

    // Feed card: top level comments only (newest first, capped), each with a
    // reply count chip that jumps into the thread view.
    renderComments() {
      var noanim = this.isNoanim();
      var tree = this.buildCommentTree();
      var top_desc = tree.top.slice().reverse();
      var visible = {};
      var shown = top_desc.slice(0, this.comment_limit);
      for (var i = 0; i < shown.length; i++) {
        visible[this.getCommentUri(shown[i])] = true;
      }
      this.settlePendingComments(tree, visible);
      var pending_top = this.getPendingReplies(null);
      if (!tree.top.length && !pending_top.length && !this.commenting) {
        return [];
      }
      return h("div.comment-list", {
        enterAnimation: noanim ? void 0 : Animation.slideDown,
        exitAnimation: noanim ? void 0 : Animation.slideUp,
        animate_scrollfix: true,
        animate_noscale: true
      }, [
        this.commenting ? h("div.comment-create", {
          enterAnimation: noanim ? void 0 : Animation.slideDown
        }, this.field_comment.render()) : void 0,
        // Newest first here, so ours sits on top while it is pending
        pending_top.slice().reverse().map((pending) => {
          return this.renderPendingComment(pending);
        }),
        shown.map((comment) => {
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
      var visible = {};
      var i, j, uri;
      if (focus_uri && tree.by_uri[focus_uri]) {
        var chain = this.getAncestors(focus_uri, tree).concat([tree.by_uri[focus_uri]], tree.children[focus_uri] || []);
        for (i = 0; i < chain.length; i++) {
          visible[this.getCommentUri(chain[i])] = true;
        }
      } else {
        for (i = 0; i < tree.top.length; i++) {
          uri = this.getCommentUri(tree.top[i]);
          visible[uri] = true;
          var kids = tree.children[uri] || [];
          for (j = 0; j < kids.length; j++) {
            visible[this.getCommentUri(kids[j])] = true;
          }
        }
      }
      this.settlePendingComments(tree, visible);
      if (focus_uri && tree.by_uri[focus_uri]) {
        // Build the ancestor chain as a CASCADE, each comment one step in
        // from the one it answers, the way a threaded forum reads.
        //
        // It used to render as two flat blocks: every ancestor together in
        // one indented box, then the focused comment flush left underneath.
        // That put the reply LESS far in than the comment it was replying to,
        // so the conversation appeared to run backwards, and a chain three
        // deep showed no structure at all because every ancestor sat at the
        // same depth.
        //
        // Assembled innermost-first: start with the focused comment and its
        // replies, then wrap it in one `.thread-chain` per ancestor, walking
        // outwards. Each wrapper draws the indent and the line down the left.
        var ancestors = this.getAncestors(focus_uri, tree);
        var replies = tree.children[focus_uri] || [];
        var node = [
          this.renderComment(tree.by_uri[focus_uri], tree, {focused: true}),
          replies.length ? h("div.thread-chain.thread-replies", {
            key: "replies_" + focus_uri
          }, replies.map((comment) => {
            return this.renderComment(comment, tree, {show_chip: true, nested: true});
          })) : void 0
        ];
        for (i = ancestors.length - 1; i >= 0; i--) {
          node = [
            this.renderComment(ancestors[i], tree, {connector: true}),
            h("div.thread-chain", {
              key: "chain_" + this.getCommentUri(ancestors[i])
            }, node)
          ];
        }
        parts.push(h("div.thread-root", {key: "root_" + focus_uri}, node));
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
      // Oldest first here, so a pending top-level comment goes at the end;
      // pending replies render inside their parent (renderPendingReplies).
      parts = parts.concat(this.getPendingReplies(null).map((pending) => {
        return this.renderPendingComment(pending);
      }));
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
      if (this.row.cert_user_id && !this.row.cert_user_id.match(/@xid(\.epix)?$/)) {
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
