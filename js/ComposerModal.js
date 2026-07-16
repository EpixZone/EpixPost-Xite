(function() {

  // Shared post composer (rail Post button, mobile FAB and the fake input on
  // the feed all open it via Page.composer.open()). Desktop: centered modal;
  // mobile: full screen sheet (CSS).
  class ComposerModal {
    constructor() {
      this.open = this.open.bind(this);
      this.close = this.close.bind(this);
      this.handleScrimClick = this.handleScrimClick.bind(this);
      this.handleCloseClick = this.handleCloseClick.bind(this);
      this.handleInput = this.handleInput.bind(this);
      this.handleUpload = this.handleUpload.bind(this);
      this.handleUploadClick = this.handleUploadClick.bind(this);
      this.handleImageClose = this.handleImageClose.bind(this);
      this.handleHubChange = this.handleHubChange.bind(this);
      this.handlePostSubmit = this.handlePostSubmit.bind(this);
      this.render = this.render.bind(this);
      this.visible = false;
      this.submitting = false;
      this.selected_hub = null;
      this.char_limit = 5000;
      this.field_post = new Autosize({
        placeholder: _("What's happening?"),
        "class": "postfield",
        oninput: this.handleInput
      });
      this.upload = new Uploadable(this.handleUpload);
      this.upload.resize_width = 900;
      this.upload.resize_height = 700;
      this.image = new ImagePreview();
    }

    open() {
      var ref;
      if (!((ref = Page.user) != null ? ref.hub : void 0)) {
        // No profile yet: send the user to the relevant setup step instead
        if (Page.site_info != null ? Page.site_info.cert_user_id : void 0) {
          Page.setUrl("?Create+profile");
        } else {
          Page.shell.handleSelectUserClick();
        }
        return;
      }
      this.visible = true;
      // Preselection: the feed's hub filter wins when the user has a profile
      // on that hub, else the previous pick if still valid, else the default
      // hub (Page.user.hub)
      var settings = Page.local_storage != null ? Page.local_storage.settings : void 0;
      var feed_hub = settings != null ? settings.feed_hub : void 0;
      if (feed_hub && Page.user_hubs[feed_hub]) {
        this.selected_hub = feed_hub;
      } else if (!this.selected_hub || !Page.user_hubs[this.selected_hub]) {
        this.selected_hub = Page.user.hub;
      }
      Page.projector.scheduleRender();
      setTimeout((() => {
        if (this.field_post.node) {
          return this.field_post.node.focus();
        }
      }), 100);
    }

    close() {
      this.visible = false;
      Page.projector.scheduleRender();
    }

    handleCloseClick() {
      this.close();
      return false;
    }

    handleScrimClick(e) {
      if (e.target === e.currentTarget) {
        this.close();
        return false;
      }
      return true;
    }

    handleInput(e) {
      this.field_post.attrs.value = e.target.value;
      RateLimit(300, this.field_post.autoHeight);
      Page.projector.scheduleRender();
    }

    handleUpload(base64uri, width, height) {
      this.image.base64uri = base64uri;
      this.image.width = width;
      this.image.height = height;
      this.upload.getPreviewData(base64uri, 10, 10, (preview_data) => {
        this.image.preview_data = preview_data;
        Page.projector.scheduleRender();
      });
      Page.projector.scheduleRender();
    }

    handleUploadClick() {
      this.upload.handleUploadClick();
      return false;
    }

    handleImageClose() {
      this.image.height = 0;
      this.image.base64uri = "";
      Page.projector.scheduleRender();
      return false;
    }

    handleHubChange(e) {
      this.selected_hub = e.target.value;
      Page.projector.scheduleRender();
    }

    getHubTitle(address) {
      return Page.getHubTitle(address);
    }

    // Posting to a hub other than the default one uses a temporary User
    // bound to that hub's row, so user.post writes into the right merged site.
    getPostUser() {
      if (this.selected_hub && this.selected_hub !== Page.user.hub && Page.user_hubs[this.selected_hub]) {
        var user = new User({
          hub: this.selected_hub,
          auth_address: Page.user.auth_address
        });
        user.row = Page.user_hubs[this.selected_hub];
        return user;
      }
      return Page.user;
    }

    handlePostSubmit() {
      if (this.submitting) {
        return false;
      }
      var value = this.field_post.attrs.value || "";
      if (!value.trim() && !this.image.base64uri) {
        return false;
      }
      this.submitting = true;
      this.field_post.loading = true;
      Page.projector.scheduleRender();
      var meta = null;
      if (this.image.height) {
        meta = {img: this.image.preview_data};
      }
      var img_data = this.image.base64uri ? this.image.base64uri.replace(/.*base64,/, "") : null;
      this.getPostUser().post(value, meta, img_data, (res) => {
        this.submitting = false;
        this.field_post.loading = false;
        if (res) {
          this.field_post.setValue("");
          this.image = new ImagePreview();
          this.close();
        }
        setTimeout((function() {
          Page.content.update();
        }), 100);
      });
      return false;
    }

    renderHubSelect() {
      var hubs = Object.keys(Page.user_hubs || {});
      if (hubs.length <= 1) {
        return void 0;
      }
      return h("select.hub-select", {
        title: _("Post to hub"),
        value: this.selected_hub,
        onchange: this.handleHubChange
      }, hubs.map((address) => {
        return h("option", {
          key: address,
          value: address,
          selected: address === this.selected_hub
        }, this.getHubTitle(address));
      }));
    }

    render() {
      if (!this.visible) {
        return void 0;
      }
      // Constructed before the language file loads: re-resolve on render
      this.field_post.attrs.placeholder = _("What's happening?");
      var value = this.field_post.attrs.value || "";
      return h("div.composer-scrim", {
        key: "composer",
        onclick: this.handleScrimClick
      }, [
        h("div.composer-modal", [
          h("div.composer-head", [
            h("a.icon.icon-close.composer-close", {
              href: "#Close",
              title: _("Close"),
              onclick: this.handleCloseClick
            }),
            this.renderHubSelect(),
            h("a.button.button-submit.composer-submit", {
              href: "#Post",
              onclick: this.handlePostSubmit,
              classes: {
                loading: this.submitting
              }
            }, _("Post"))
          ]),
          h("div.composer-body", [
            Page.user && Page.user.hub ? Page.user.renderAvatar() : void 0,
            h("div.composer-field", this.field_post.render())
          ]),
          this.image.base64uri ? h("div.image", {
            style: "aspect-ratio: " + this.image.width + " / " + this.image.height + "; background-image: url(" + this.image.base64uri + ")"
          }, [
            h("a.close.icon.icon-close", {
              href: "#Remove",
              title: _("Remove image"),
              onclick: this.handleImageClose
            })
          ]) : void 0,
          h("div.composer-foot", [
            h("a.icon.icon-image.link", {
              href: "#Image",
              title: _("Add image"),
              onclick: this.handleUploadClick
            }),
            h("span.char-count", {
              classes: {
                warn: value.length > this.char_limit
              }
            }, value.length ? value.length + " / " + this.char_limit : "")
          ])
        ])
      ]);
    }
  }

  Object.assign(ComposerModal.prototype, LogMixin);
  window.ComposerModal = ComposerModal;

})();
