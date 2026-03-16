(function() {

  class Head {
    constructor() {
      this.handleFollowMenuItemClick = this.handleFollowMenuItemClick.bind(this);
      this.handleMenuClick = this.handleMenuClick.bind(this);
      this.saveFollows = this.saveFollows.bind(this);
      this.render = this.render.bind(this);
      this.menu = new Menu();
      this.follows = [];
    }

    handleSelectUserClick() {
      if (Page.site_info.settings.permissions.indexOf("Merger:EpixPost") < 0) {
        Page.cmd("wrapperPermissionAdd", "Merger:EpixPost", () => {
          Page.updateSiteInfo(function() { Page.content.update(); });
        });
      } else {
        Page.cmd("certXid", {});
      }
      return false;
    }

    handleFollowMenuItemClick(type, item) {
      var selected = !this.follows[type];
      this.follows[type] = selected;
      item[2] = selected;
      this.saveFollows();
      Page.projector.scheduleRender();
      return true;
    }

    handleMenuClick() {
      if (!(Page.site_info != null ? Page.site_info.cert_user_id : void 0)) {
        return this.handleSelectUserClick();
      }
      Page.cmd("feedListFollow", [], (follows) => {
        this.follows = follows;
        this.menu.items = [];
        this.menu.items.push(["Follow username mentions", (item) => { return this.handleFollowMenuItemClick("Mentions", item); }, this.follows["Mentions"]]);
        this.menu.items.push(["Follow comments on your posts", (item) => { return this.handleFollowMenuItemClick("Comments on your posts", item); }, this.follows["Comments on your posts"]]);
        this.menu.items.push(["Follow new followers", (item) => { return this.handleFollowMenuItemClick("New followers", item); }, this.follows["New followers"]]);
        this.menu.items.push(["Hide \"Hello Epix Post!\" messages", (item) => {
          Page.local_storage.settings.hide_hello_epixpost = !Page.local_storage.settings.hide_hello_epixpost;
          item[2] = Page.local_storage.settings.hide_hello_epixpost;
          Page.projector.scheduleRender();
          Page.saveLocalStorage();
          Page.content.need_update = true;
          return false;
        }, Page.local_storage.settings.hide_hello_epixpost]);
        var hub_keys = Object.keys(Page.user_hubs);
        if (hub_keys.length > 1) {
          this.menu.items.push(["---"]);
          for (var ki = 0; ki < hub_keys.length; ki++) {
            (function(key) {
              this.menu.items.push(["Use hub " + key, (item) => {
                Page.local_storage.settings.hub = key;
                Page.saveLocalStorage();
                Page.checkUser();
              }, Page.user.row.site === key]);
            }).call(this, hub_keys[ki]);
          }
        }
        this.menu.toggle();
        Page.projector.scheduleRender();
      });
      return false;
    }

    saveFollows() {
      var out = {};
      if (this.follows["Mentions"]) {
        out["Mentions"] = ["SELECT 'mention' AS type, comment.date_added AS date_added, 'a comment' AS title, '@' || user_name || ': ' || comment.body AS body, '?Post/' || json.site || '/' || REPLACE(post_uri, '_', '/') AS url FROM comment LEFT JOIN json USING (json_id) WHERE comment.body LIKE '%@" + Page.user.row.user_name + "%' UNION SELECT 'mention' AS type, post.date_added AS date_added, 'In ' || json.user_name || \"'s post\" AS title, '@' || json.user_name || ': ' || post.body AS body, '?Post/' || json.site || '/' || REPLACE(json.directory, 'data/users/', '') || '/' || post_id AS url FROM post LEFT JOIN json USING (json_id) WHERE post.body LIKE '%@" + Page.user.row.user_name + "%'", [""]];
      }
      if (this.follows["Comments on your posts"]) {
        out["Comments on your posts"] = ["SELECT 'comment' AS type, comment.date_added AS date_added, 'Your post' AS title, '@' || json.user_name || ': ' || comment.body AS body, '?Post/' || site || '/' || REPLACE(post_uri, '_', '/') AS url FROM comment LEFT JOIN json USING (json_id) WHERE post_uri LIKE '" + Page.user.auth_address + "%'", [""]];
      }
      if (this.follows["New followers"]) {
        out["New followers"] = ["SELECT 'follow' AS type, follow.date_added AS date_added, json.user_name || ' started following you' AS title, '' AS body, '?Profile/' || json.hub || REPLACE(json.directory, 'data/users', '') AS url FROM follow LEFT JOIN json USING(json_id) WHERE auth_address = '" + Page.user.auth_address + "' GROUP BY json.directory", [""]];
      }
      Page.cmd("feedFollow", [out]);
    }

    render() {
      var ref, ref1, ref2, ref3, xid_display;
      return h("div.head.center", [
        h("a.logo", { href: "?Home", onclick: Page.handleLinkClick },
          h("img", { src: "img/logo.svg", height: 40, onerror: "this.src='img/logo.png'; this.onerror=null;" })
        ),
        ((ref = Page.user) != null ? ref.hub : void 0) ? h("div.right.authenticated", [
          h("div.user",
            h("a.name.link", { href: Page.user.getLink(), onclick: Page.handleLinkClick }, Page.user.getDisplayName()),
            h("a.address", { href: "#Select+user", onclick: this.handleSelectUserClick }, Page.site_info.cert_user_id)
          ),
          h("a.settings", { href: "#Settings", onclick: Page.returnFalse, onmousedown: this.handleMenuClick }, "\u22EE"),
          this.menu.render()
        ]) : !((ref1 = Page.user) != null ? ref1.hub : void 0) && ((ref2 = Page.site_info) != null ? ref2.cert_user_id : void 0) ? (
          xid_display = Page.site_info.cert_user_id.replace(/@.*$/, ""),
          h("div.right.selected", [
            h("div.user",
              h("a.name.link", { href: "?Create+profile", onclick: Page.handleLinkClick }, xid_display),
              h("a.address", { href: "#Select+user", onclick: this.handleSelectUserClick }, Page.site_info.cert_user_id)
            ),
            this.menu.render(),
            h("a.settings", { href: "#Settings", onclick: Page.returnFalse, onmousedown: this.handleMenuClick }, "\u22EE")
          ])
        ) : !((ref3 = Page.user) != null ? ref3.hub : void 0) && Page.site_info ? h("div.right.unknown", [
          h("div.user",
            h("a.name.link", { href: "#Select+user", onclick: this.handleSelectUserClick }, "Visitor"),
            h("a.address", { href: "#Select+user", onclick: this.handleSelectUserClick }, "Select your account")
          ),
          this.menu.render(),
          h("a.settings", { href: "#Settings", onclick: Page.returnFalse, onmousedown: this.handleMenuClick }, "\u22EE")
        ]) : h("div.right.unknown")
      ]);
    }
  }

  Object.assign(Head.prototype, LogMixin);
  window.Head = Head;

})();
