(function() {

  class PostCreate {
    constructor() {
      this.startEdit = this.startEdit.bind(this);
      this.handleUpload = this.handleUpload.bind(this);
      this.handleImageClose = this.handleImageClose.bind(this);
      this.handlePostSubmit = this.handlePostSubmit.bind(this);
      this.handleUploadClick = this.handleUploadClick.bind(this);
      this.render = this.render.bind(this);
      this.field_post = new Autosize({
        placeholder: "Write something...",
        "class": "postfield",
        onfocus: this.startEdit,
        onblur: this.startEdit
      });
      this.upload = new Uploadable(this.handleUpload);
      this.upload.resize_width = 900;
      this.upload.resize_height = 700;
      this.is_editing = false;
      this.submitting = false;
      this.image = new ImagePreview();
    }

    startEdit() {
      this.is_editing = true;
      Page.projector.scheduleRender();
    }

    handleUpload(base64uri, width, height) {
      this.startEdit();
      this.image.base64uri = base64uri;
      this.image.width = width;
      this.image.height = height;
      this.upload.getPreviewData(base64uri, 10, 10, (preview_data) => {
        this.image.preview_data = preview_data;
        Page.projector.scheduleRender();
      });
    }

    handleImageClose() {
      this.image.height = 0;
      this.image.base64uri = "";
      return false;
    }

    handlePostSubmit() {
      if (this.submitting) return false;
      this.submitting = true;
      this.field_post.loading = true;
      Page.projector.scheduleRender();
      var meta;
      if (this.image.height) {
        meta = {};
        meta["img"] = this.image.preview_data;
      } else {
        meta = null;
      }
      var img_data = this.image.base64uri != null ? this.image.base64uri.replace(/.*base64,/, "") : void 0;
      Page.user.post(this.field_post.attrs.value, meta, img_data, (res) => {
        this.submitting = false;
        this.field_post.loading = false;
        if (res) {
          this.field_post.setValue("");
          this.image = new ImagePreview();
          document.activeElement.blur();
        }
        setTimeout(function() { Page.content.update(); }, 100);
      });
      return false;
    }

    handleUploadClick() {
      if (Page.server_info.rev < 1700) {
        Page.cmd("wrapperNotification", ["info", "You need EpixNet version 0.5.0 to upload images"]);
      } else {
        this.upload.handleUploadClick();
      }
    }

    render() {
      var user = Page.user;
      if (user === false) {
        return h("div.post-create.post.empty");
      } else if (user != null ? user.hub : void 0) {
        return h("div.post-create.post", {
          classes: { editing: this.is_editing }
        },
          h("div.user", user.renderAvatar()),
          h("a.icon-image.link", { href: "#", onclick: this.handleUploadClick }),
          this.field_post.render(),
          this.image.base64uri ? h("div.image", {
            style: "background-image: url(" + this.image.base64uri + "); height: " + this.image.getSize(530, 600)[1] + "px",
            classes: { empty: false }
          }, [h("a.close", { href: "#", onclick: this.handleImageClose }, "\u00d7")]) : h("div.image", {
            style: "height: 0px", classes: { empty: true }
          }),
          h("div.postbuttons", h("a.button.button-submit", { href: "#Submit", onclick: this.handlePostSubmit, classes: { loading: this.submitting } }, "Submit new post")),
          h("div", { style: "clear: both" })
        );
      } else if (Page.site_info.cert_user_id) {
        return h("div.post-create.post.empty.noprofile",
          h("div.user", h("a.avatar", { href: "#", style: "background-image: url('img/unkown.png')" })),
          h("div.select-user-container", h("a.button.button-submit.select-user", { href: "?Create+profile", onclick: Page.handleLinkClick }, ["Create new profile"])),
          h("textarea", { disabled: true })
        );
      } else {
        return h("div.post-create.post.empty.nocert",
          h("div.user", h("a.avatar", { href: "#", style: "background-image: url('img/unkown.png')" })),
          h("div.select-user-container", h("a.button.button-submit.select-user", { href: "#Select+user", onclick: Page.head.handleSelectUserClick }, [h("div.icon.icon-profile"), "Select user to post new content"])),
          h("textarea", { disabled: true })
        );
      }
    }
  }

  Object.assign(PostCreate.prototype, LogMixin);
  window.PostCreate = PostCreate;

})();
