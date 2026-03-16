(function() {

  class ContentUsers {
    constructor() {
      this.update = this.update.bind(this);
      this.render = this.render.bind(this);
      this.handleSearchInput = this.handleSearchInput.bind(this);
      this.handleRecentMoreClick = this.handleRecentMoreClick.bind(this);
      this.handleActiveMoreClick = this.handleActiveMoreClick.bind(this);
      this.handleSuggestedMoreClick = this.handleSuggestedMoreClick.bind(this);
      this.user_list_suggested = new UserList("suggested");
      this.user_list_suggested.limit = 9;
      this.user_list_active = new UserList("active");
      this.user_list_active.limit = 9;
      this.user_list_recent = new UserList("recent");
      this.user_list_recent.limit = 90;
      this.loaded = true;
      this.need_update = false;
      this.search = "";
      this.num_users_total = null;
    }

    handleSuggestedMoreClick() {
      this.user_list_suggested.limit += 90;
      this.user_list_suggested.need_update = true;
      this.user_list_suggested.loading = true;
      Page.projector.scheduleRender();
      return false;
    }

    handleActiveMoreClick() {
      this.user_list_active.limit += 90;
      this.user_list_active.need_update = true;
      this.user_list_active.loading = true;
      Page.projector.scheduleRender();
      return false;
    }

    handleRecentMoreClick() {
      this.user_list_recent.limit += 300;
      this.user_list_recent.need_update = true;
      this.user_list_recent.loading = true;
      Page.projector.scheduleRender();
      return false;
    }

    handleSearchInput(e) {
      var rate_limit;
      if (e == null) {
        e = null;
      }
      this.search = e.target.value;
      if (this.search === "") {
        rate_limit = 0;
      }
      if (this.search.length < 3) {
        rate_limit = 400;
      } else {
        rate_limit = 200;
      }
      return RateLimit(rate_limit, () => {
        this.log("Search", this.search);
        this.user_list_recent.search = this.search;
        this.user_list_recent.need_update = true;
        this.user_list_recent.limit = 15;
        return Page.projector.scheduleRender();
      });
    }

    render() {
      var ref, ref1, ref2;
      if (this.loaded && !Page.on_loaded.resolved) {
        Page.on_loaded.resolve();
      }
      if (this.need_update || !this.num_users_total) {
        Page.cmd("dbQuery", "SELECT COUNT(*) AS num FROM user", (res) => {
          this.num_users_total = res[0]["num"];
          return Page.projector.scheduleRender();
        });
      }
      if (this.need_update) {
        this.log("Updating");
        this.need_update = false;
        if ((ref = this.user_list_recent) != null) {
          ref.need_update = true;
        }
        if ((ref1 = this.user_list_active) != null) {
          ref1.need_update = true;
        }
        if (Page.user.auth_address) {
          if ((ref2 = this.user_list_suggested) != null) {
            ref2.need_update = true;
          }
        }
      }
      return h("div#Content.center", [
        h("input.text.big.search", {
          placeholder: "Search in users...",
          value: this.search,
          oninput: this.handleSearchInput
        }), !this.search ? [
          this.user_list_suggested.users.length > 0 ? h("h2.suggested", "Suggested users") : void 0, h("div.users.cards.suggested", [this.user_list_suggested.render("card")]), this.user_list_suggested.users.length === this.user_list_suggested.limit ? h("a.more.suggested", {
            href: "#",
            onclick: this.handleSuggestedMoreClick
          }, "Show more...") : this.user_list_suggested.users.length > 0 && this.user_list_suggested.loading ? h("a.more.suggested", {
            href: "#",
            onclick: this.handleSuggestedMoreClick
          }, "Loading...") : void 0, this.user_list_active.users.length > 0 ? h("h2.active", "Most active") : void 0, h("div.users.cards.active", [this.user_list_active.render("card")]), this.user_list_active.users.length === this.user_list_active.limit ? h("a.more.active", {
            href: "#",
            onclick: this.handleActiveMoreClick
          }, "Show more...") : this.user_list_active.users.length > 0 && this.user_list_active.loading ? h("a.more.active", {
            href: "#",
            onclick: this.handleActiveMoreClick
          }, "Loading...") : void 0, this.user_list_recent.users.length > 0 ? h("h2.recent", "New users in Epix Post") : void 0
        ] : void 0, h("div.users.cards.recent", [this.user_list_recent.render("card")]), this.user_list_recent.users.length === this.user_list_recent.limit ? h("a.more.recent", {
          href: "#",
          onclick: this.handleRecentMoreClick
        }, "Show more...") : this.user_list_recent.users.length > 0 && this.user_list_recent.loading ? h("a.more.recent", {
          href: "#",
          onclick: this.handleRecentMoreClick
        }, "Loading...") : void 0, this.user_list_recent.users.length ? h("h5", {
          style: "text-align: center"
        }, "Total: " + this.num_users_total + " registered users") : void 0
      ]);
    }

    update() {
      this.need_update = true;
      return Page.projector.scheduleRender();
    }
  }

  Object.assign(ContentUsers.prototype, LogMixin);
  window.ContentUsers = ContentUsers;

})();
