(function() {

  class Post {
    constructor(row, item_list) {
      this.item_list = item_list;
      this.render = this.render.bind(this);
      this.renderComments = this.renderComments.bind(this);
      this.follow = this.follow.bind(this);
      this.unfollow = this.unfollow.bind(this);
      this.handleSettingsClick = this.handleSettingsClick.bind(this);
      this.getPostUri = this.getPostUri.bind(this);
      this.handleReplyClick = this.handleReplyClick.bind(this);
      this.handleMoreCommentsClick = this.handleMoreCommentsClick.bind(this);
      this.handleCommentDelete = this.handleCommentDelete.bind(this);
      this.handleCommentSave = this.handleCommentSave.bind(this);
      this.handleCommentSubmit = this.handleCommentSubmit.bind(this);
      this.handleCommentClick = this.handleCommentClick.bind(this);
      this.handleLikeClick = this.handleLikeClick.bind(this);
      this.handlePostDelete = this.handlePostDelete.bind(this);
      this.handlePostSave = this.handlePostSave.bind(this);
      this.liked = false;
      this.commenting = false;
      this.submitting_like = false;
      this.owned = false;
      this.editable_comments = {};
      this.field_comment = new Autosize({
        placeholder: "Add your comment",
        onsubmit: this.handleCommentSubmit,
        title_submit: "Send"
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

    getLink() {
      return "?Post/" + this.user.hub + "/" + this.user.auth_address + "/" + this.row.post_id;
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
        Animation.flashOut(e.currentTarget.firstChild);
        Page.user.dislike(site, post_uri, () => {
          this.submitting_like = false;
          return this.unfollow();
        });
      } else {
        Animation.flashIn(e.currentTarget.firstChild);
        Page.user.like(site, post_uri, () => {
          this.submitting_like = false;
          return this.follow();
        });
      }
      return false;
    }

    handleCommentClick() {
      if (this.field_comment.node) {
        this.field_comment.node.focus();
      } else {
        this.commenting = true;
        setTimeout((() => {
          return this.field_comment.node.focus();
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
        clearInterval(timer_loading);
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

    handleReplyClick(e) {
      var user_name;
      user_name = e.currentTarget.attributes.user_name.value;
      if (this.field_comment.attrs.value) {
        this.field_comment.setValue(this.field_comment.attrs.value + "\n@" + user_name + ": ");
      } else {
        this.field_comment.setValue("@" + user_name + ": ");
      }
      this.handleCommentClick(e);
      return false;
    }

    getEditableComment(comment_uri) {
      var comment_id, handleCommentDelete, handleCommentSave, ref, user_address;
      if (!this.editable_comments[comment_uri]) {
        ref = comment_uri.split("_"), user_address = ref[0], comment_id = ref[1];
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
          "Follow in newsfeed", (() => {
            if (followed) {
              return this.unfollow();
            } else {
              return this.follow();
            }
          }), followed
        ]);
        this.menu.items.push(["Permalink", this.getLink()]);
        if (this.owned) {
          this.menu.items.push([
            "Edit", ((e) => {
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

    renderComments() {
      var comment_limit, ref, ref1;
      if (!this.row.comments && !this.commenting) {
        return [];
      }
      if (this.row.selected) {
        comment_limit = this.comment_limit + 50;
      } else {
        comment_limit = this.comment_limit;
      }
      return h("div.comment-list", {
        enterAnimation: Animation.slideDown,
        exitAnimation: Animation.slideUp,
        animate_scrollfix: true,
        animate_noscale: true
      }, [
        this.commenting ? h("div.comment-create", {
          enterAnimation: Animation.slideDown
        }, this.field_comment.render()) : void 0, (ref = this.row.comments) != null ? ref.slice(0, comment_limit).map((comment) => {
          var comment_uri, owned, ref1, ref2, user_address, user_link;
          user_address = comment.directory.replace("data/users/", "");
          comment_uri = user_address + "_" + comment.comment_id;
          owned = user_address === ((ref1 = Page.user) != null ? ref1.auth_address : void 0);
          user_link = "?Profile/" + comment.hub + "/" + user_address + "/" + comment.cert_user_id;
          return h("div.comment", {
            id: comment_uri,
            key: comment_uri,
            animate_scrollfix: true,
            enterAnimation: Animation.slideDown,
            exitAnimation: Animation.slideUp
          }, [
            h("div.user", [
              h("a.name.link", {
                href: user_link,
                style: "color: " + (Text.toColor(user_address)),
                onclick: Page.handleLinkClick
              }, Page.getXidDisplayName(user_address, comment.user_name)), comment.cert_user_id && !comment.cert_user_id.match(/@xid$/) ? [
                h("span.sep", " \u00B7 "), h("span.address", {
                  title: user_address
                }, comment.cert_user_id)
              ] : void 0, h("span.sep", " \u00B7 "), h("a.added.link", {
                href: "#",
                title: Time.date(comment.date_added, "long")
              }, Time.since(comment.date_added)), h("a.icon.icon-reply", {
                href: "#Reply",
                onclick: this.handleReplyClick,
                user_name: comment.user_name
              }, "Reply")
            ]), owned ? this.getEditableComment(comment_uri).render(comment.body) : ((ref2 = comment.body) != null ? ref2.length : void 0) > 5000 ? h("div.body.maxheight", {
              innerHTML: Text.renderMarked(comment.body),
              afterCreate: Maxheight.apply
            }) : h("div.body", {
              innerHTML: Text.renderMarked(comment.body)
            })
          ]);
        }) : void 0, ((ref1 = this.row.comments) != null ? ref1.length : void 0) > comment_limit ? h("a.more", {
          href: "#More",
          onclick: this.handleMoreCommentsClick,
          enterAnimation: Animation.slideDown,
          exitAnimation: Animation.slideUp
        }, "Show more comments...") : void 0
      ]);
    }

    render() {
      var post_uri, ref, ref1, ref2, ref3, site;
      ref = this.row.key.split("-"), site = ref[0], post_uri = ref[1];
      return h("div.post", {
        key: this.row.key,
        enterAnimation: Animation.slideDown,
        exitAnimation: Animation.slideUp,
        animate_scrollfix: true,
        classes: {
          selected: this.row.selected
        },
        style: this.css_style
      }, [
        h("div.user", [
          this.user.renderAvatar({
            href: this.user.getLink(),
            onclick: Page.handleLinkClick
          }), h("a.name.link", {
            href: this.user.getLink(),
            onclick: Page.handleLinkClick,
            style: "color: " + (Text.toColor(this.user.auth_address))
          }, this.user.getDisplayName()), this.row.cert_user_id && !this.row.cert_user_id.match(/@xid$/) ? [
            h("span.sep", " \u00B7 "), h("span.address", {
              title: this.user.auth_address
            }, this.row.cert_user_id)
          ] : void 0, h("span.sep", " \u00B7 "), h("a.added.link", {
            href: this.getLink(),
            title: Time.date(this.row.date_added, "long"),
            onclick: Page.handleLinkClick
          }, Time.since(this.row.date_added)), this.menu ? this.menu.render(".menu-right") : void 0, h("a.settings", {
            href: "#Settings",
            onclick: Page.returnFalse,
            onmousedown: this.handleSettingsClick
          }, "\u22EE")
        ]), this.owned ? this.editable_body.render(this.row.body) : h("div.body", {
          classes: {
            maxheight: !this.row.selected && ((ref1 = this.row.body) != null ? ref1.length : void 0) > 3000
          },
          innerHTML: Text.renderMarked(this.row.body),
          afterCreate: Maxheight.apply,
          afterUpdate: Maxheight.apply
        }), this.meta ? this.meta.render() : void 0, h("div.actions", [
          h("a.icon.icon-comment.link", {
            href: "#Comment",
            onclick: this.handleCommentClick
          }, "Comment"), h("a.like.link", {
            classes: {
              active: (ref2 = Page.user) != null ? ref2.likes[post_uri] : void 0,
              loading: this.submitting_like,
              "like-epix": this.row.likes === 0
            },
            href: "#Like",
            onclick: this.handleLikeClick
          }, h("div.icon.icon-heart", {
            classes: {
              active: (ref3 = Page.user) != null ? ref3.likes[post_uri] : void 0
            }
          }), this.row.likes ? this.row.likes : void 0)
        ]), this.renderComments()
      ]);
    }
  }

  Object.assign(Post.prototype, LogMixin);
  window.Post = Post;

})();
