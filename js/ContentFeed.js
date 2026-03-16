(function() {

  class ContentFeed {
    constructor() {
      this.update = this.update.bind(this);
      this.render = this.render.bind(this);
      this.handleListTypeClick = this.handleListTypeClick.bind(this);
      this.post_create = new PostCreate();
      this.post_list = new PostList();
      this.activity_list = new ActivityList();
      this.new_user_list = new UserList("new");
      this.suggested_user_list = new UserList("suggested");
      this.need_update = true;
      this.type = "followed";
      this.update();
    }

    handleListTypeClick(e) {
      this.type = e.currentTarget.attributes.type.value;
      this.post_list.limit = 10;
      this.activity_list.limit = 10;
      this.update();
      return false;
    }

    render() {
      var key, followed;
      if (this.post_list.loaded && !Page.on_loaded.resolved) {
        Page.on_loaded.resolve();
      }
      if (this.need_update) {
        this.log("Updating", this.type);
        this.need_update = false;
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
              results.push("data/users/" + (like.split('_')[0]));
            }
            return results;
          })();
          this.post_list.filter_post_ids = (() => {
            var ref = Page.user.likes;
            var results = [];
            for (var like in ref) {
              results.push(like.split('_')[1]);
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
      return h("div#Content.center", [
        h("div.col-center", [
          this.post_create.render(),
          h("div.post-list-type",
            h("a.link", {
              href: "#Everyone",
              onclick: this.handleListTypeClick,
              type: "everyone",
              classes: { active: this.type === "everyone" }
            }, "Everyone"),
            h("a.link", {
              href: "#Liked",
              onclick: this.handleListTypeClick,
              type: "liked",
              classes: { active: this.type === "liked" }
            }, "Liked"),
            h("a.link", {
              href: "#Followed+users",
              onclick: this.handleListTypeClick,
              type: "followed",
              classes: { active: this.type === "followed" }
            }, "Followed users")
          ),
          this.post_list.render()
        ]),
        h("div.col-right.noscrollfix", [
          this.activity_list.render(),
          this.new_user_list.users.length > 0 ? h("h2.sep.new", [
            "New users",
            h("a.link", { href: "?Users", onclick: Page.handleLinkClick }, "Browse all \u203A")
          ]) : void 0,
          this.new_user_list.render(".gray"),
          this.suggested_user_list.users.length > 0 ? h("h2.sep.suggested", ["Suggested users"]) : void 0,
          this.suggested_user_list.render(".gray")
        ])
      ]);
    }

    update() {
      this.need_update = true;
      Page.projector.scheduleRender();
    }
  }

  Object.assign(ContentFeed.prototype, LogMixin);
  window.ContentFeed = ContentFeed;

})();
