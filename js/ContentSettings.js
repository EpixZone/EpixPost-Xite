(function() {

  class ContentSettings {
    constructor() {
      this.update = this.update.bind(this);
      this.render = this.render.bind(this);
      this.updateFollows = this.updateFollows.bind(this);
      this.handleFollowToggle = this.handleFollowToggle.bind(this);
      this.handleDataSaverToggle = this.handleDataSaverToggle.bind(this);
      this.handleHubSelect = this.handleHubSelect.bind(this);
      this.handleEditXidClick = this.handleEditXidClick.bind(this);
      this.need_update = true;
      this.loaded = false;
      this.follows = {};
    }

    updateFollows() {
      if (!(Page.site_info != null ? Page.site_info.cert_user_id : void 0)) {
        this.follows = {};
        this.loaded = true;
        Page.projector.scheduleRender();
        return;
      }
      Page.cmd("feedListFollow", [], (follows) => {
        this.follows = follows;
        Page.shell.follows = follows;
        this.loaded = true;
        Page.projector.scheduleRender();
      });
    }

    handleFollowToggle(e) {
      var type = e.currentTarget.attributes.type.value;
      this.follows[type] = !this.follows[type];
      Page.shell.follows = this.follows;
      Page.shell.saveFollows();
      Page.projector.scheduleRender();
      return false;
    }

    handleDataSaverToggle() {
      Page.local_storage.settings.data_saver = !Page.local_storage.settings.data_saver;
      Page.saveLocalStorage();
      Page.projector.scheduleRender();
      return false;
    }

    handleHubSelect(e) {
      var hub = e.currentTarget.attributes.hub.value;
      Page.local_storage.settings.hub = hub;
      Page.saveLocalStorage();
      Page.checkUser();
      Page.projector.scheduleRender();
      return false;
    }

    handleEditXidClick() {
      Page.cmd("wrapperOpenWindow", ["/" + Page.xid_site + "/"]);
      return false;
    }

    getHubTitle(address) {
      return Page.getHubTitle(address);
    }

    renderToggleRow(title, type, checked, onclick, note) {
      return h("a.settings-row", {
        key: type,
        href: "#" + type,
        type: type,
        onclick: onclick,
        classes: {checked: !!checked}
      }, [
        h("span.settings-row-text", [
          h("span.settings-row-title", title),
          note ? h("span.settings-row-note", note) : void 0
        ]),
        h("span.checkbox-skin")
      ]);
    }

    renderNotificationsSection() {
      var can_follow = Page.user && Page.user.row;
      return h("div.settings-section", [
        h("div.settings-section-title", _("Notifications")),
        !can_follow ? h("div.settings-empty", _("Create a profile to follow activity in your newsfeed.")) : [
          this.renderToggleRow(_("Follow username mentions"), "Mentions", this.follows["Mentions"], this.handleFollowToggle),
          this.renderToggleRow(_("Follow comments on your posts"), "Comments on your posts", this.follows["Comments on your posts"], this.handleFollowToggle),
          this.renderToggleRow(_("Follow new followers"), "New followers", this.follows["New followers"], this.handleFollowToggle)
        ]
      ]);
    }

    renderDisplaySection() {
      var settings = Page.local_storage != null ? Page.local_storage.settings : {};
      return h("div.settings-section", [
        h("div.settings-section-title", _("Display")),
        this.renderToggleRow(
          _("Data saver"), "data_saver", settings.data_saver, this.handleDataSaverToggle,
          _("Don't auto-download post images; load them when tapped")
        ),
        h("div.settings-row", {key: "theme"}, [
          h("span.settings-row-text", [
            h("span.settings-row-title", _("Theme")),
            h("span.settings-row-note", _("Light and dark follow the EpixNet wrapper setting"))
          ])
        ])
      ]);
    }

    renderHubRow(address, checked, enabled) {
      return h("a.settings-row", {
        key: "hub-" + address,
        href: "#Use+hub",
        hub: address,
        onclick: this.handleHubSelect,
        classes: {checked: checked, disabled: !enabled}
      }, [
        h("span.settings-row-text", [
          h("span.settings-row-title", this.getHubTitle(address)),
          h("span.settings-row-note.mono", address)
        ]),
        h("span.radio-skin")
      ]);
    }

    renderHubsSection() {
      var ref;
      var default_hub = (ref = Page.user) != null ? ref.hub : void 0;
      var hub_keys = Object.keys(Page.user_hubs || {});
      var rows = [];
      if (!default_hub) {
        rows.push(h("div.settings-empty", {key: "nohub"}, _("Create a profile to store your posts on a hub.")));
      } else {
        rows.push(h("div.settings-note", {key: "hubnote"}, _("Preselected when you write a new post. Replies always go to the hub the post is on.")));
        if (hub_keys.indexOf(default_hub) === -1) {
          hub_keys.push(default_hub);
        }
        for (var i = 0; i < hub_keys.length; i++) {
          rows.push(this.renderHubRow(hub_keys[i], hub_keys[i] === default_hub, hub_keys.length > 1));
        }
        if (hub_keys.length <= 1) {
          rows.push(h("div.settings-empty", {key: "onehub"}, _("Your profile is only on one hub. Join another hub to be able to switch.")));
        }
      }
      rows.push(h("a.settings-row.settings-nav", {
        key: "managehubs",
        href: "?Hubs",
        onclick: Page.handleLinkClick
      }, [
        h("span.settings-row-title", _("Manage hubs")),
        h("span.settings-row-chevron", "›")
      ]));
      return h("div.settings-section", [
        h("div.settings-section-title", _("Default hub")),
        rows
      ]);
    }

    renderAccountSection() {
      var cert = Page.site_info.cert_user_id;
      var rows = [];
      rows.push(h("div.settings-row", {key: "account"}, [
        h("span.settings-row-text", [
          h("span.settings-row-title", _("Account")),
          h("span.settings-row-note", cert || _("No account selected"))
        ]),
        h("a.button.button-small", {
          href: "#Select+user",
          onclick: Page.shell.handleSelectUserClick
        }, cert ? _("Switch account") : _("Select account"))
      ]));
      if (cert && cert.match(/@xid$/)) {
        rows.push(h("a.settings-row.settings-nav", {
          key: "editxid",
          href: "#Edit+profile",
          onclick: this.handleEditXidClick
        }, [
          h("span.settings-row-title", _("Edit profile on xID")),
          h("span.settings-row-chevron", "›")
        ]));
      }
      return h("div.settings-section", [
        h("div.settings-section-title", _("Account")),
        rows
      ]);
    }

    render() {
      if (this.loaded && !Page.on_loaded.resolved) {
        Page.on_loaded.resolve();
      }
      if (this.need_update) {
        this.log("Updating");
        this.need_update = false;
        this.updateFollows();
      }
      if (!Page.site_info || !Page.local_storage) {
        return h("div#Content.center.content-settings");
      }
      return h("div#Content.center.content-settings", [
        h("h1", _("Settings")),
        this.renderNotificationsSection(),
        this.renderDisplaySection(),
        this.renderHubsSection(),
        this.renderAccountSection()
      ]);
    }

    update() {
      this.need_update = true;
      Page.projector.scheduleRender();
    }
  }

  Object.assign(ContentSettings.prototype, LogMixin);
  window.ContentSettings = ContentSettings;

})();
