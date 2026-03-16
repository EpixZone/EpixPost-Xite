(function() {

  class PostMeta {
    constructor(post, meta) {
      this.post = post;
      this.meta = meta;
      this.afterCreateImage = this.afterCreateImage.bind(this);
      this.handleImageClick = this.handleImageClick.bind(this);
      this.handleOptionalHelpClick = this.handleOptionalHelpClick.bind(this);
      this.handleImageDeleteClick = this.handleImageDeleteClick.bind(this);
      this.handleImageSettingsClick = this.handleImageSettingsClick.bind(this);
      this.render = this.render.bind(this);
    }

    afterCreateImage(tag) {
      Page.scrollwatcher.add(tag, () => {
        try {
          this.image_preview.preview_uri = this.image_preview.getPreviewUri();
          Page.cmd("optionalFileInfo", this.post.user.getPath() + "/" + this.post.row.post_id + ".jpg", (res) => {
            this.image_preview.optional_info = res;
            Page.projector.scheduleRender();
          });
        } catch (e) {
          this.log("Image preview error: " + e);
        }
        Page.projector.scheduleRender();
      });
    }

    handleImageClick(e) {
      var ref;
      if (this.image_preview.load_fullsize || ((ref = this.image_preview.optional_info) != null ? ref.is_downloaded : void 0)) {
        Page.overlay.zoomImageTag(e.currentTarget, this.image_preview.width, this.image_preview.height);
      } else {
        this.image_preview.load_fullsize = true;
        this.image_preview.loading = true;
        var image = new Image();
        image.src = this.post.user.getPath() + "/" + this.post.row.post_id + ".jpg";
        image.onload = () => {
          this.image_preview.loading = false;
          this.image_preview.optional_info.is_downloaded = 1;
          this.image_preview.optional_info.peer += 1;
          Page.projector.scheduleRender();
        };
        Page.projector.scheduleRender();
      }
      return false;
    }

    handleOptionalHelpClick() {
      this.post.user.hasHelp((optional_helping) => {
        this.optional_helping = optional_helping;
        if (this.optional_helping) {
          Page.cmd("OptionalHelpRemove", ["data/users/" + this.post.user.auth_address, this.post.user.hub]);
          this.optional_helping = false;
        } else {
          Page.cmd("OptionalHelp", ["data/users/" + this.post.user.auth_address, this.post.row.user_name + "'s new images", this.post.user.hub]);
          this.optional_helping = true;
        }
        Page.content_profile.update();
        Page.projector.scheduleRender();
      });
      return true;
    }

    handleImageDeleteClick() {
      var inner_path = this.post.user.getPath() + "/" + this.post.row.post_id + ".jpg";
      Page.cmd("optionalFileDelete", inner_path, () => {
        this.image_preview.optional_info.is_downloaded = 0;
        this.image_preview.optional_info.peer -= 1;
        Page.projector.scheduleRender();
      });
    }

    handleImageSettingsClick(e) {
      if (e.target.classList.contains("menu-item")) return;
      this.post.user.hasHelp((helping) => {
        if (!this.menu_image) this.menu_image = new Menu();
        this.optional_helping = helping;
        this.menu_image.items = [];
        this.menu_image.items.push(["Help distribute this user's new images", this.handleOptionalHelpClick, () => { return this.optional_helping; }]);
        this.menu_image.items.push(["---"]);
        var ref;
        if ((ref = this.image_preview.optional_info) != null ? ref.is_downloaded : void 0) {
          this.menu_image.items.push(["Delete image", this.handleImageDeleteClick]);
        } else {
          this.menu_image.items.push(["Show image", this.handleImageClick, false]);
        }
        this.menu_image.toggle();
      });
      return false;
    }

    render() {
      if (this.meta.img) {
        if (!this.image_preview) {
          this.image_preview = new ImagePreview();
          this.image_preview.setPreviewData(this.meta.img);
        }
        var ref = this.image_preview.getSize(530, 600);
        var width = ref[0], height = ref[1];
        var style_preview = "";
        if (this.image_preview != null ? this.image_preview.preview_uri : void 0) {
          style_preview = "background-image: url(" + this.image_preview.preview_uri + ")";
        }
        var style_fullsize = "";
        var ref2;
        if (this.image_preview.load_fullsize || ((ref2 = this.image_preview.optional_info) != null ? ref2.is_downloaded : void 0)) {
          style_fullsize = "background-image: url(" + this.post.user.getPath() + "/" + this.post.row.post_id + ".jpg)";
        }
        var ref3, ref4, ref5, ref6, ref7, ref8;
        return h("div.img.preview", {
          afterCreate: this.afterCreateImage,
          style: "width: " + width + "px; height: " + height + "px; " + style_preview,
          classes: {
            downloaded: (ref3 = this.image_preview.optional_info) != null ? ref3.is_downloaded : void 0,
            hasinfo: ((ref4 = this.image_preview.optional_info) != null ? ref4.peer : void 0) !== null,
            loading: this.image_preview.loading
          }
        },
          h("a.fullsize", { href: "#", onclick: this.handleImageClick, style: style_fullsize }),
          Page.server_info.rev < 1700 ? h("small.oldversion", "You need EpixNet 0.5.0 to view this image") : void 0,
          (ref5 = this.image_preview) != null ? ref5.optional_info : void 0 ? h("a.show", { href: "#", onclick: this.handleImageClick }, h("div.title", "Loading...\nShow image")) : void 0,
          (ref6 = this.image_preview) != null ? ref6.optional_info : void 0 ? h("a.details", {
            href: "#Settings", onclick: Page.returnFalse, onmousedown: this.handleImageSettingsClick
          }, [
            h("div.size", Text.formatSize((ref7 = this.image_preview.optional_info) != null ? ref7.size : void 0)),
            h("div.peers.icon-profile"),
            (ref8 = this.image_preview.optional_info) != null ? ref8.peer : void 0,
            h("a.image-settings", "\u22EE"),
            this.menu_image ? this.menu_image.render(".menu-right") : void 0
          ]) : void 0
        );
      }
    }
  }

  Object.assign(PostMeta.prototype, LogMixin);
  window.PostMeta = PostMeta;

})();
