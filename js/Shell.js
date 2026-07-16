(function() {

  class Shell {
    constructor() {
      this.handleSelectUserClick = this.handleSelectUserClick.bind(this);
      this.handleProfileNavClick = this.handleProfileNavClick.bind(this);
      this.handleAccountRailClick = this.handleAccountRailClick.bind(this);
      this.handleAccountTopClick = this.handleAccountTopClick.bind(this);
      this.handleComposeClick = this.handleComposeClick.bind(this);
      this.saveFollows = this.saveFollows.bind(this);
      this.setTitle = this.setTitle.bind(this);
      this.renderNavItem = this.renderNavItem.bind(this);
      this.render = this.render.bind(this);
      this.menu_account_rail = new Menu();
      this.menu_account_top = new Menu();
      this.composer = new ComposerModal();
      this.follows = {};
      this.title = null;
    }

    // Content pages can set the mobile top bar title with
    // Page.shell.setTitle(_("...")); it is cleared on every route change.
    setTitle(title) {
      this.title = title;
      Page.projector.scheduleRender();
    }

    getTitle() {
      if (this.title) {
        return this.title;
      }
      var route = this.getRoute();
      if (route === "Users") return _("Users");
      if (route === "Hubs") return _("Hubs");
      if (route === "Settings") return _("Settings");
      if (route === "Profile" || route === "ProfileName") return _("Profile");
      if (route === "Post") return _("Post");
      if (route === "Create+profile") return _("Create profile");
      return _("Home");
    }

    getRoute() {
      var ref = Page.params;
      if ((ref != null ? ref.urls : void 0) && ref.urls[0]) {
        return ref.urls[0];
      }
      return "";
    }

    isActive(id) {
      var route = this.getRoute();
      if (id === "home") {
        return route === "" || route === "Home";
      } else if (id === "hubs") {
        return route === "Hubs";
      } else if (id === "users") {
        return route === "Users";
      } else if (id === "settings") {
        return route === "Settings";
      } else if (id === "profile") {
        if (route === "Create+profile" || route === "ProfileName") {
          return true;
        }
        if (route === "Profile") {
          var ref = Page.user;
          return (ref != null ? ref.auth_address : void 0) && Page.params.urls[2] === Page.user.auth_address;
        }
      }
      return false;
    }

    // Two-step account select: ask for merger permission first, then open the
    // xID cert selector. (Moved from the old Head.js)
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

    buildAccountMenu(menu) {
      var ref;
      menu.items = [];
      if ((ref = Page.user) != null ? ref.hub : void 0) {
        menu.items.push([_("My profile"), () => { Page.setUrl(Page.user.getLink()); return false; }]);
        menu.items.push([_("Settings"), () => { Page.setUrl("?Settings"); return false; }]);
        menu.items.push(["---"]);
        menu.items.push([_("Switch account"), this.handleSelectUserClick]);
      } else if (Page.site_info != null ? Page.site_info.cert_user_id : void 0) {
        menu.items.push([_("Create profile"), () => { Page.setUrl("?Create+profile"); return false; }]);
        menu.items.push([_("Settings"), () => { Page.setUrl("?Settings"); return false; }]);
        menu.items.push(["---"]);
        menu.items.push([_("Switch account"), this.handleSelectUserClick]);
      } else {
        menu.items.push([_("Select account"), this.handleSelectUserClick]);
      }
    }

    handleAccountRailClick() {
      this.buildAccountMenu(this.menu_account_rail);
      this.menu_account_rail.toggle();
      Page.projector.scheduleRender();
      return false;
    }

    handleAccountTopClick() {
      this.buildAccountMenu(this.menu_account_top);
      this.menu_account_top.toggle();
      Page.projector.scheduleRender();
      return false;
    }

    // Post button / FAB: open the shared composer modal.
    handleComposeClick() {
      Page.composer.open();
      return false;
    }

    // Newsfeed follow queries. (Moved from the old Head.js; the Settings page
    // toggles this.follows and calls this to persist.)
    saveFollows() {
      if (!Page.user || !Page.user.row) {
        return;
      }
      var out = {};
      // feedFollow replaces the whole follow dict: keep the per-post follows
      // (managed from the post kebab menu) when the master toggles change.
      if (this.follows["Post follow"]) {
        out["Post follow"] = this.follows["Post follow"];
      }
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

    // One stable handler for the profile nav item: maquette does not allow an
    // event handler to change identity between renders, so we branch on click.
    handleProfileNavClick(e) {
      var ref;
      if (((ref = Page.user) != null ? ref.hub : void 0) || (Page.site_info != null ? Page.site_info.cert_user_id : void 0)) {
        return Page.handleLinkClick(e);
      }
      return this.handleSelectUserClick();
    }

    getProfileHref() {
      var ref;
      if ((ref = Page.user) != null ? ref.hub : void 0) {
        return Page.user.getLink();
      }
      if (Page.site_info != null ? Page.site_info.cert_user_id : void 0) {
        return "?Create+profile";
      }
      return "#Select+user";
    }

    getNavItems(include_settings) {
      var items = [
        {id: "home", title: _("Home"), href: "?Home", icon: "icon-home"},
        {id: "hubs", title: _("Hubs"), href: "?Hubs", icon: "icon-hubs"},
        {id: "users", title: _("Users"), href: "?Users", icon: "icon-users"},
        {id: "profile", title: _("Profile"), href: this.getProfileHref(), icon: "icon-profile", onclick: this.handleProfileNavClick}
      ];
      if (include_settings) {
        items.push({id: "settings", title: _("Settings"), href: "?Settings", icon: "icon-settings"});
      }
      return items;
    }

    renderNavItem(item) {
      return h("a.nav-item", {
        key: item.id,
        href: item.href,
        title: item.title,
        onclick: item.onclick || Page.handleLinkClick,
        classes: {active: this.isActive(item.id)}
      }, [
        h("span.icon." + item.icon),
        h("span.nav-label", item.title)
      ]);
    }

    getAvatarStyle() {
      var attrs = {};
      var ref;
      if ((ref = Page.user) != null ? ref.hub : void 0) {
        Page.user.renderAvatar(attrs);  // fills attrs.style, no other side effect
        return attrs.style;
      }
      return "background-image: url('img/default-avatar.svg')";
    }

    renderRailAccount() {
      var name, address, ref, ref1, ref2;
      if ((ref = Page.user) != null ? ref.hub : void 0) {
        name = Page.user.getDisplayName();
        address = Page.site_info.cert_user_id;
      } else if ((ref1 = Page.site_info) != null ? ref1.cert_user_id : void 0) {
        name = Page.site_info.cert_user_id.replace(/@.*$/, "");
        address = Page.site_info.cert_user_id;
      } else if (Page.site_info) {
        name = _("Visitor");
        address = _("Select your account");
      } else {
        return h("div.rail-account.empty");
      }
      return h("div.rail-account-wrap", [
        h("a.rail-account", {
          href: "#Account",
          title: name,
          onclick: Page.returnFalse,
          onmousedown: this.handleAccountRailClick
        }, [
          h("span.avatar", {style: this.getAvatarStyle()}),
          h("div.rail-account-info", [
            h("span.name", name),
            h("span.address", address)
          ])
        ]),
        this.menu_account_rail.render(".menu-account")
      ]);
    }

    renderRail() {
      return h("div.rail", [
        h("a.rail-logo", {href: "?Home", onclick: Page.handleLinkClick}, [
          h("img", {src: "img/logo.svg", alt: ""}),
          h("span.logo-text", _("Epix Post"))
        ]),
        h("nav.rail-nav", this.getNavItems(true).map(this.renderNavItem)),
        h("a.button.button-submit.rail-post", {
          href: "#Compose",
          title: _("New post"),
          onclick: this.handleComposeClick
        }, [
          h("span.icon.icon-compose"),
          h("span.rail-post-label", _("Post"))
        ]),
        h("div.rail-spacer"),
        this.renderRailAccount()
      ]);
    }

    renderTopbar() {
      return h("div.topbar", [
        h("a.topbar-logo", {href: "?Home", onclick: Page.handleLinkClick, title: _("Home")},
          h("img", {src: "img/logo.svg", alt: "Epix Post"})
        ),
        h("div.topbar-title", this.getTitle()),
        h("div.topbar-account", [
          h("a.avatar", {
            href: "#Account",
            title: _("Account"),
            style: this.getAvatarStyle(),
            onclick: Page.returnFalse,
            onmousedown: this.handleAccountTopClick
          }),
          this.menu_account_top.render(".menu-topbar")
        ])
      ]);
    }

    render() {
      return h("div#Shell", [
        this.renderRail(),
        this.renderTopbar(),
        h("nav.bottomnav", this.getNavItems(false).map(this.renderNavItem)),
        h("a.fab", {
          href: "#Compose",
          title: _("New post"),
          onclick: this.handleComposeClick
        }, h("span.icon.icon-compose")),
        this.composer.render()
      ]);
    }
  }

  Object.assign(Shell.prototype, LogMixin);
  window.Shell = Shell;

})();
