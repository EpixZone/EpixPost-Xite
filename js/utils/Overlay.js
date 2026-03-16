(function() {
  class Overlay {
    constructor() {
      this.zoomImageTag = this.zoomImageTag.bind(this);
      this.handleClick = this.handleClick.bind(this);
      this.render = this.render.bind(this);
      this.visible = false;
      this.called = false;
      this.height = 0;
      this.image_top = 0;
      this.image_left = 0;
      this.image_width = 0;
      this.image_height = 0;
      this.background_image = "";
      this.image_transform = "";
      this.style = "";
      this.pos = null;
      this.tag = null;
    }

    zoomImageTag(tag, target_width, target_height) {
      this.log("Show", target_width, target_height);
      this.background_image = tag.style.backgroundImage;
      this.height = document.body.scrollHeight;
      var pos = tag.getBoundingClientRect();
      this.original_pos = pos;
      this.image_top = parseInt(pos.top + window.scrollY) + "px";
      this.image_left = parseInt(pos.left) + "px";
      this.image_width = target_width;
      this.image_height = target_height;
      var ratio = pos.width / target_width;
      this.image_transform = "scale(" + ratio + ") ";
      this.image_margin_left = parseInt((pos.width - target_width) / 2);
      this.image_margin_top = parseInt((pos.height - target_height) / 2);
      this.style = "";
      this.called = true;
      this.tag = tag;
      this.visible = true;
      window.requestAnimationFrame(() => {
        this.image_transform = "scale(1) ";
        Page.projector.scheduleRender();
      });
    }

    handleClick() {
      this.log("Hide");
      var ratio = this.original_pos.width / this.image_width;
      this.image_transform = "scale(" + ratio + ") ";
      this.image_margin_left = Math.floor((this.original_pos.width - this.image_width) / 2);
      this.image_margin_top = Math.floor((this.original_pos.height - this.image_height) / 2);
      this.visible = false;
      setTimeout(() => {
        if (!this.visible) {
          this.style = "opacity: 0";
          Page.projector.scheduleRender();
        }
      }, 400);
      setTimeout(() => {
        if (!this.visible) {
          this.called = false;
          Page.projector.scheduleRender();
        }
      }, 900);
      return false;
    }

    render() {
      if (!this.called) {
        return h("div#Overlay", {
          classes: { visible: this.visible },
          onclick: this.handleClick
        });
      }
      return h("div#Overlay", {
        classes: { visible: this.visible },
        onclick: this.handleClick,
        style: "height: " + this.height + "px"
      }, [
        h("div.img", {
          style: "transform: " + this.image_transform + "; margin-left: " + this.image_margin_left + "px; margin-top: " + this.image_margin_top + "px;\ntop: " + this.image_top + "; left: " + this.image_left + ";\nwidth: " + this.image_width + "px; height: " + this.image_height + "px;\nbackground-image: " + this.background_image + ";\n" + this.style
        })
      ]);
    }
  }

  Object.assign(Overlay.prototype, LogMixin);
  window.Overlay = Overlay;
})();
