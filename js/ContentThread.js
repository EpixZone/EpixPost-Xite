(function() {

  class ContentThread {
    constructor() {
      this.update = this.update.bind(this);
      this.render = this.render.bind(this);
      this.setPost = this.setPost.bind(this);
      this.getUserDir = this.getUserDir.bind(this);
      this.handleBackClick = this.handleBackClick.bind(this);
      this.handleDownloadClick = this.handleDownloadClick.bind(this);
      this.post_list = null;
      this.hub = null;
      this.auth_address = null;
      this.post_id = null;
      this.focus_uri = null;
      this.need_update = true;
      this.noanim = false;
      this.downloading = false;
    }

    getUserDir() {
      var profile, ref, ref1;
      if (this.auth_address === ((ref = Page.site_info) != null ? ref.auth_address : void 0)) {
        return Page.site_info.xid_directory || this.auth_address;
      }
      profile = (ref1 = Page.xid_profiles) != null ? ref1[this.auth_address] : void 0;
      if ((profile != null ? profile.name : void 0) && (profile != null ? profile.tld : void 0)) {
        return profile.name + "." + profile.tld;
      }
      return this.auth_address;
    }

    // Route target for ?Post/<hub>/<addr>/<post_id>[/<comment_uri>].
    // Returns true when the target changed (EpixPost.route re-mounts then).
    setPost(hub, auth_address, post_id, focus_uri) {
      if (focus_uri == null) {
        focus_uri = null;
      }
      var post_changed = this.hub !== hub || this.auth_address !== auth_address || this.post_id !== post_id;
      var focus_changed = this.focus_uri !== focus_uri;
      this.hub = hub;
      this.auth_address = auth_address;
      this.post_id = post_id;
      this.focus_uri = focus_uri;
      if (!this.post_list || post_changed) {
        this.post_list = new PostList();
        this.post_list.directories = ["data/users/" + this.getUserDir()];
        this.post_list.filter_post_ids = [post_id];
        this.post_list.limit = 1;
        this.post_list.hide_empty = true;
        this.post_list.thread_mode = true;
      }
      this.post_list.focus_uri = this.focus_uri;
      if (post_changed || focus_changed) {
        this.need_update = true;
      }
      return post_changed || focus_changed;
    }

    handleBackClick(e) {
      if (Page.can_go_back) {
        window.history.back();
        return false;
      }
      return Page.handleLinkClick(e);
    }

    handleDownloadClick() {
      this.downloading = true;
      Page.projector.scheduleRender();
      Page.cmd("mergerSiteAdd", this.hub, () => {
        Page.updateSiteInfo(() => {
          this.downloading = false;
          this.update();
        });
      });
      return false;
    }

    renderNotSeeded() {
      return h("div.post-list-empty.thread-notseeded", [
        h("h2", _("This post is on a hub you don't seed yet")),
        h("p", _("Download the hub to view the post and its replies.")),
        h("a.button.button-submit", {
          href: "#Download",
          onclick: this.handleDownloadClick,
          classes: {
            loading: this.downloading
          }
        }, _("Download hub"))
      ]);
    }

    render() {
      if (this.need_update) {
        this.log("Updating", this.hub, this.auth_address, this.post_id, this.focus_uri);
        this.need_update = false;
        this.post_list.noanim = this.noanim;
        this.post_list.need_update = true;
        // The post author may publish under an xID directory name instead of
        // the auth address; retarget the query once the profile resolves.
        Page.resolveXidProfiles([this.auth_address], () => {
          var dir = "data/users/" + this.getUserDir();
          if (this.post_list.directories[0] !== dir) {
            this.post_list.directories = [dir];
            this.post_list.need_update = true;
            Page.projector.scheduleRender();
          }
        });
      }
      var not_seeded = this.hub && !Page.merged_sites[this.hub];
      if ((this.post_list.loaded || not_seeded) && !Page.on_loaded.resolved) {
        Page.on_loaded.resolve();
      }
      return h("div#Content.center.content-thread", [
        h("div.col-center", [
          h("div.thread-head", [
            h("a.icon.icon-back.thread-back", {
              href: "?Home",
              title: _("Back"),
              onclick: this.handleBackClick
            }),
            h("h2.thread-title", this.focus_uri ? _("Reply") : _("Post"))
          ]),
          not_seeded ? this.renderNotSeeded() : [
            this.post_list.render(),
            this.post_list.loaded && !this.post_list.posts.length ? h("div.post-list-empty", [
              h("h2", _("Post not found")),
              h("p", _("It may still be downloading from peers, or it was deleted."))
            ]) : void 0
          ]
        ])
      ]);
    }

    update(mode) {
      this.noanim = mode === "noanim";
      this.need_update = true;
      Page.projector.scheduleRender();
    }
  }

  Object.assign(ContentThread.prototype, LogMixin);
  window.ContentThread = ContentThread;

})();
