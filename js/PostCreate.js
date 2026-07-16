(function() {

  // Timeline-top teaser: a fake input that opens the shared composer modal
  // (Page.composer). The empty states are kept for pages that render this
  // while no cert/profile exists (the Home feed shows the onboarding card
  // instead).
  class PostCreate {
    constructor() {
      this.handleOpenClick = this.handleOpenClick.bind(this);
      this.render = this.render.bind(this);
    }

    handleOpenClick() {
      if (Page.composer) {
        Page.composer.open();
      }
      return false;
    }

    render() {
      var user = Page.user;
      if (user === false) {
        return h("div.post-create.post.empty");
      } else if (user != null ? user.hub : void 0) {
        return h("div.post-create.post.fake",
          h("div.user", user.renderAvatar()),
          h("a.fake-input", { href: "#Compose", onclick: this.handleOpenClick }, _("What's happening?")),
          h("a.icon.icon-image.link", { href: "#Image", title: _("Add image"), onclick: this.handleOpenClick })
        );
      } else if (Page.site_info.cert_user_id) {
        return h("div.post-create.post.empty.noprofile",
          h("div.user", h("a.avatar", { href: "#", style: "background-image: url('img/default-avatar.svg')" })),
          h("div.select-user-container", h("a.button.button-submit.select-user", { href: "?Create+profile", onclick: Page.handleLinkClick }, [_("Create new profile")])),
          h("textarea", { disabled: true })
        );
      } else {
        return h("div.post-create.post.empty.nocert",
          h("div.user", h("a.avatar", { href: "#", style: "background-image: url('img/default-avatar.svg')" })),
          h("div.select-user-container", h("a.button.button-submit.select-user", { href: "#Select+user", onclick: Page.shell.handleSelectUserClick }, [h("div.icon.icon-profile"), _("Select user to post new content")])),
          h("textarea", { disabled: true })
        );
      }
    }
  }

  Object.assign(PostCreate.prototype, LogMixin);
  window.PostCreate = PostCreate;

})();
