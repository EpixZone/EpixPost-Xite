(function() {

  class ContentFeed {
    constructor() {
      this.update = this.update.bind(this);
      this.render = this.render.bind(this);
      this.handleListTypeClick = this.handleListTypeClick.bind(this);
      this.handleHubMenuClick = this.handleHubMenuClick.bind(this);
      this.onboarding = new Onboarding();
      this.post_create = new PostCreate();
      this.post_list = new PostList();
      this.post_list.is_feed = true;
      this.activity_list = new ActivityList();
      this.activity_list.is_feed = true;
      this.new_user_list = new UserList("new");
      this.suggested_user_list = new UserList("suggested");
      this.need_update = true;
      this.noanim = false;
      this.type = "followed";
      // The default tab is decided once the user's follows are known (see
      // update); an explicit tab click locks the choice for the session.
      this.type_chosen = false;
      // Hub filter pill: menu instance + mergerSiteList cache (hub titles),
      // same data source pattern as ContentHubs
      this.hub_menu = new Menu();
      this.hub_sites = null;
      this.update();
    }

    handleListTypeClick(e) {
      this.type = e.currentTarget.attributes.type.value;
      this.type_chosen = true;
      this.post_list.limit = 10;
      this.activity_list.limit = 10;
      this.update();
      return false;
    }

    // The selected feed hub filter, or null for All hubs. A hub that is no
    // longer seeded falls back to All hubs silently (the setting is kept, so
    // re-seeding the hub restores the filter).
    getFeedHub() {
      var ref, ref1;
      var feed_hub = (ref = Page.local_storage) != null ? ((ref1 = ref.settings) != null ? ref1.feed_hub : void 0) : void 0;
      if (!feed_hub) {
        return null;
      }
      if (!Page.merged_sites || !Page.merged_sites[feed_hub]) {
        return null;
      }
      return feed_hub;
    }

    getHubTitle(address) {
      return Page.getHubTitle(address);
    }

    updateHubSites() {
      Page.cmd("mergerSiteList", true, (sites) => {
        this.hub_sites = sites;
        Page.projector.scheduleRender();
      });
    }

    // Rebuild the items from the current seeded hub list, then toggle
    // (Menu pattern: opened on mousedown, stable handler identity)
    handleHubMenuClick() {
      var menu = this.hub_menu;
      var selected = this.getFeedHub();
      menu.items = [];
      menu.addItem(_("All hubs"), (() => {
        return this.selectFeedHub(null);
      }), !selected);
      var addresses = Object.keys(Page.merged_sites || {});
      for (var i = 0; i < addresses.length; i++) {
        menu.addItem(this.getHubTitle(addresses[i]), ((address) => {
          return () => {
            return this.selectFeedHub(address);
          };
        })(addresses[i]), addresses[i] === selected);
      }
      this.updateHubSites();
      menu.toggle();
      return false;
    }

    selectFeedHub(address) {
      if (address) {
        Page.local_storage.settings.feed_hub = address;
      } else {
        delete Page.local_storage.settings.feed_hub;
      }
      Page.saveLocalStorage();
      this.post_list.limit = 10;
      this.activity_list.limit = 10;
      this.update();
      return false;
    }

    render() {
      var key, followed;
      // While the setup card is visible it owns the calls-to-action: hide the
      // post editor (its "Select user..." / "Create new profile" empty states
      // would duplicate the card) and the "No posts yet" empty state.
      var onboarding = this.onboarding.render();
      this.post_list.hide_empty = !!onboarding;
      if (this.post_list.loaded && !Page.on_loaded.resolved) {
        Page.on_loaded.resolve();
      }
      // Pick the default tab once the user's follows are known: "Followed
      // users" reads as an empty feed for someone who follows nobody, so
      // those users (and visitors) start on "Everyone".
      if (!this.type_chosen && Page.on_user_info.resolved) {
        var follows = (Page.user != null ? Page.user.followed_users : void 0) || {};
        var default_type = Object.keys(follows).length ? "followed" : "everyone";
        if (this.type !== default_type) {
          this.type = default_type;
          this.need_update = true;
        }
        this.type_chosen = true;
      }
      if (this.need_update) {
        this.log("Updating", this.type);
        this.need_update = false;
        if (this.hub_sites === null) {
          this.updateHubSites();
        }
        this.post_list.noanim = this.noanim;
        this.activity_list.noanim = this.noanim;
        this.new_user_list.need_update = true;
        this.suggested_user_list.need_update = true;
        if (this.type === "followed") {
          this.post_list.directories = (() => {
            var ref = Page.user.followed_users;
            var results = [];
            for (key in ref) {
              followed = ref[key];
              results.push("data/users/" + (key.split('/')[1]));
            }
            return results;
          })();
          if (Page.user.hub) {
            this.post_list.directories.push("data/users/" + Page.user.auth_address);
          }
          this.post_list.filter_post_ids = null;
        } else if (this.type === "liked") {
          this.post_list.directories = (() => {
            var ref = Page.user.likes;
            var results = [];
            for (var like in ref) {
              results.push("data/users/" + like.substring(0, like.lastIndexOf('_')));
            }
            return results;
          })();
          this.post_list.filter_post_ids = (() => {
            var ref = Page.user.likes;
            var results = [];
            for (var like in ref) {
              results.push(like.substring(like.lastIndexOf('_') + 1));
            }
            return results;
          })();
        } else {
          this.post_list.directories = "all";
          this.post_list.filter_post_ids = null;
        }
        this.post_list.need_update = true;
        if (this.type === "followed") {
          this.activity_list.directories = (() => {
            var ref = Page.user.followed_users;
            var results = [];
            for (key in ref) {
              followed = ref[key];
              results.push("data/users/" + (key.split('/')[1]));
            }
            return results;
          })();
        } else {
          this.activity_list.directories = "all";
        }
        this.activity_list.update();
      }
      var feed_hub = this.getFeedHub();
      return h("div#Content.center", [
        h("div.col-center", [
          onboarding,
          onboarding ? void 0 : this.post_create.render(),
          h("div.feed-tabs-row", [
            h("div.post-list-type",
              h("a.link", {
                href: "#Everyone",
                onclick: this.handleListTypeClick,
                type: "everyone",
                classes: { active: this.type === "everyone" }
              }, _("Everyone")),
              h("a.link", {
                href: "#Liked",
                onclick: this.handleListTypeClick,
                type: "liked",
                classes: { active: this.type === "liked" }
              }, _("Liked")),
              h("a.link", {
                href: "#Followed+users",
                onclick: this.handleListTypeClick,
                type: "followed",
                classes: { active: this.type === "followed" }
              }, _("Followed users"))
            ),
            h("div.feed-hub-wrap", [
              h("a.feed-hub-pill", {
                href: "#Filter+hub",
                title: _("Filter posts by hub"),
                onclick: Page.returnFalse,
                onmousedown: this.handleHubMenuClick,
                classes: { active: !!feed_hub }
              }, [
                h("span.feed-hub-pill-label", feed_hub ? this.getHubTitle(feed_hub) : _("All hubs"))
              ]),
              this.hub_menu.render(".menu-right")
            ])
          ]),
          this.post_list.render()
        ]),
        h("div.col-right.noscrollfix", [
          this.activity_list.render(),
          this.new_user_list.users.length > 0 ? h("h2.sep.new", [
            _("New users"),
            h("a.link", { href: "?Users", onclick: Page.handleLinkClick }, _("Browse all") + " \u203A")
          ]) : void 0,
          this.new_user_list.render(".gray"),
          this.suggested_user_list.users.length > 0 ? h("h2.sep.suggested", [_("Suggested users")]) : void 0,
          this.suggested_user_list.render(".gray")
        ])
      ]);
    }

    // mode "noanim": background sync refresh, rows sync without enter/exit
    // animations (threaded down to PostList/ActivityList).
    update(mode) {
      this.noanim = mode === "noanim";
      this.need_update = true;
      Page.projector.scheduleRender();
    }
  }

  Object.assign(ContentFeed.prototype, LogMixin);
  window.ContentFeed = ContentFeed;

})();
