(function() {

  // Post image handling. The box is sized with CSS aspect-ratio from the
  // preview data, so nothing shifts when the real image arrives. Flow when
  // the image scrolls into view (data saver OFF): blurred preview ->
  // optionalFileInfo -> swap to the real file if downloaded, otherwise
  // fileNeed completion -> Image.onload swaps it. A failed request can retry
  // while visible. Data saver ON: preview + "Show image".
  class PostMeta {
    constructor(post, meta) {
      this.post = post;
      this.meta = meta;
      this.afterCreateImage = this.afterCreateImage.bind(this);
      this.startDownload = this.startDownload.bind(this);
      this.loadFullsize = this.loadFullsize.bind(this);
      this.handleImageClick = this.handleImageClick.bind(this);
      this.handleRetryClick = this.handleRetryClick.bind(this);
      this.handleOptionalHelpClick = this.handleOptionalHelpClick.bind(this);
      this.handleImageDeleteClick = this.handleImageDeleteClick.bind(this);
      this.handleImageSettingsClick = this.handleImageSettingsClick.bind(this);
      this.handlePlayClick = this.handlePlayClick.bind(this);
      this.handleVideoError = this.handleVideoError.bind(this);
      this.handleVideoRetry = this.handleVideoRetry.bind(this);
      this.render = this.render.bind(this);
      this.image_download = ImageDownload.forPath(this.getImagePath());
      // The magnet video mounts its <video> (and starts the node fetch) only
      // after the user clicks play, so a feed full of magnet posts doesn't open
      // a stream for every one.
      this.video_started = false;
      this.video_failed = false;
    }

    get loading() { return this.image_download.loading; }
    get loaded() { return this.image_download.loaded; }
    get failed() { return this.image_download.failed; }

    getImagePath() {
      return this.post.user.getPath() + "/" + this.post.row.post_id + ".jpg";
    }

    isDataSaver() {
      var ref, ref1;
      return !!((ref = Page.local_storage) != null ? (ref1 = ref.settings) != null ? ref1.data_saver : void 0 : void 0);
    }

    afterCreateImage(tag) {
      Page.scrollwatcher.add(tag, () => {
        try {
          this.image_preview.preview_uri = this.image_preview.getPreviewUri();
        } catch (e) {
          this.log("Image preview error: " + e);
        }
        this.image_download.watch(tag, () => !this.isDataSaver());
        Page.cmd("optionalFileInfo", this.getImagePath(), (res) => {
          this.image_preview.optional_info = res;
          if (!this.isDataSaver() && !this.loaded) {
            if (res != null ? res.is_downloaded : void 0) {
              this.loadFullsize();
            } else if (res) {
              this.startDownload();
            }
          }
          Page.projector.scheduleRender();
        });
        Page.projector.scheduleRender();
      });
    }

    startDownload() {
      this.image_download.start();
    }

    loadFullsize() {
      this.image_download.load();
    }

    handleImageClick(e) {
      var ref;
      if (this.loaded || ((ref = this.image_preview.optional_info) != null ? ref.is_downloaded : void 0)) {
        Page.overlay.zoomImageTag(e.currentTarget, this.image_preview.width, this.image_preview.height);
      } else {
        this.image_download.start(true);
      }
      return false;
    }

    handleRetryClick() {
      this.image_download.start(true);
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
      var inner_path = this.getImagePath();
      Page.cmd("optionalFileDelete", inner_path, () => {
        if (this.image_preview.optional_info) {
          this.image_preview.optional_info.is_downloaded = 0;
          this.image_preview.optional_info.peer -= 1;
        }
        this.image_download.reset();
        Page.projector.scheduleRender();
      });
    }

    handleImageSettingsClick(e) {
      if (e.target.classList.contains("menu-item")) return;
      this.post.user.hasHelp((helping) => {
        if (!this.menu_image) this.menu_image = new Menu();
        this.optional_helping = helping;
        this.menu_image.items = [];
        this.menu_image.items.push([_("Help distribute this user's new images"), this.handleOptionalHelpClick, () => { return this.optional_helping; }]);
        this.menu_image.items.push(["---"]);
        var ref;
        if (this.loaded || ((ref = this.image_preview.optional_info) != null ? ref.is_downloaded : void 0)) {
          this.menu_image.items.push([_("Delete image"), this.handleImageDeleteClick]);
        } else {
          this.menu_image.items.push([_("Show image"), this.handleImageClick, false]);
        }
        this.menu_image.toggle();
      });
      return false;
    }

    handlePlayClick() {
      this.video_started = true;
      this.video_failed = false;
      Page.projector.scheduleRender();
      return false;
    }

    handleVideoError() {
      // The node couldn't stream it (e.g. the web seed is unreachable over the
      // node's current transport). Show an honest message, not a black box.
      this.video_failed = true;
      Page.projector.scheduleRender();
    }

    handleVideoRetry() {
      this.video_failed = false;
      this.video_started = true;
      Page.projector.scheduleRender();
      return false;
    }

    // A readable label for the video: the magnet's dn= display name, or the
    // filename of a .torrent URL, else a generic fallback.
    magnetLabel() {
      var src = this.meta.magnet || "";
      var m = /[?&]dn=([^&]*)/.exec(src);
      if (m) {
        try {
          return decodeURIComponent(m[1].replace(/\+/g, " "));
        } catch (e) {}
      }
      if (/^https?:\/\//i.test(src)) {
        var base = src.split(/[?#]/)[0].split("/").pop() || "";
        base = base.replace(/\.torrent$/i, "");
        if (base) {
          try {
            return decodeURIComponent(base);
          } catch (e) {
            return base;
          }
        }
      }
      return _("Video");
    }

    renderVideo() {
      var bt = !!(Page.server_info && Page.server_info.bittorrent);
      var label = this.magnetLabel();
      if (!bt) {
        // No BitTorrent engine in this build (e.g. the iOS app): an honest card,
        // never a dead player.
        return h("div.video.preview.unavailable", [
          h("span.icon.icon-magnet.video-badge"),
          h("div.video-name", label),
          h("div.video-note", _("Video streaming is available on EpixNet desktop or Android."))
        ]);
      }
      if (this.video_failed) {
        return h("div.video.preview.unavailable", [
          h("span.icon.icon-magnet.video-badge"),
          h("div.video-name", label),
          h("div.video-note", _("Couldn't stream this video (the source may be unreachable over this node's connection).")),
          h("a.video-retry", { href: "#Retry", onclick: this.handleVideoRetry }, _("Try again"))
        ]);
      }
      if (!this.video_started) {
        return h("a.video.preview.poster", {
          href: "#Play",
          title: label,
          onclick: this.handlePlayClick
        }, [
          h("span.video-play"),
          h("div.video-name", label)
        ]);
      }
      // The node fetches + SHA-1-verifies the torrent and streams it; the page
      // never speaks BitTorrent. The magnet is percent-encoded so its own &/=
      // survive the query string.
      var src = "/bt/stream?m=" + encodeURIComponent(this.meta.magnet);
      return h("div.video.preview.playing", [
        h("video", {
          src: src,
          controls: true,
          autoplay: true,
          playsinline: true,
          preload: "metadata",
          onerror: this.handleVideoError
        })
      ]);
    }

    render() {
      var img = this.meta.img ? this.renderImage() : void 0;
      var video = this.meta.magnet ? this.renderVideo() : void 0;
      // Common cases return a single node (as before); only a post with both an
      // image and a magnet needs a wrapper. Keeping the single-node shape avoids
      // mixing keyed/unkeyed children in the post's child list.
      if (img && video) {
        return h("div.post-media", [img, video]);
      }
      return img || video || void 0;
    }

    renderImage() {
      if (!this.image_preview) {
        this.image_preview = new ImagePreview();
        this.image_preview.setPreviewData(this.meta.img);
      }
      var info = this.image_preview.optional_info;
      var downloaded = this.loaded || (info != null ? info.is_downloaded : void 0);
      var style = "aspect-ratio: " + this.image_preview.width + " / " + this.image_preview.height + ";";
      if (this.image_preview.preview_uri) {
        style += " background-image: url(" + this.image_preview.preview_uri + ");";
      }
      var style_fullsize = "";
      if (downloaded) {
        style_fullsize = "background-image: url(" + this.getImagePath() + ")";
      }
      return h("div.img.preview", {
        afterCreate: this.afterCreateImage,
        style: style,
        classes: {
          downloaded: !!downloaded,
          hasinfo: (info != null ? info.peer : void 0) != null,
          loading: this.loading,
          failed: this.failed
        }
      },
        h("a.fullsize", { href: "#Image", onclick: this.handleImageClick, style: style_fullsize }),
        !downloaded && this.loading ? h("div.img-pill.downloading", [
          h("span.spinner"), _("Downloading from peers...")
        ]) : void 0,
        !downloaded && this.failed ? h("a.img-pill.retry", {
          href: "#Retry", onclick: this.handleRetryClick
        }, _("Image not available. Tap to retry")) : void 0,
        !downloaded && !this.loading && !this.failed && info ? h("a.show", {
          href: "#Show", onclick: this.handleImageClick
        }, h("div.title", _("Show image"))) : void 0,
        info ? h("a.details", {
          href: "#Settings", onclick: Page.returnFalse, onmousedown: this.handleImageSettingsClick
        }, [
          h("div.size", Text.formatSize(info.size)),
          h("div.peers.icon-profile"),
          info.peer,
          h("span.image-settings.icon.icon-kebab"),
          this.menu_image ? this.menu_image.render(".menu-right") : void 0
        ]) : void 0
      );
    }
  }

  Object.assign(PostMeta.prototype, LogMixin);
  window.PostMeta = PostMeta;

})();
