(function() {
  class ImagePreview {
    constructor() {
      this.setPreviewData = this.setPreviewData.bind(this);
      this.width = 0;
      this.height = 0;
      this.preview_data = "";
      this.pixel_chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    }

    getSize(target_width, target_height) {
      return this.calcSize(this.width, this.height, target_width, target_height);
    }

    calcSize(source_width, source_height, target_width, target_height) {
      var width = target_width;
      var height = width * (source_height / source_width);
      if (height > target_height) {
        height = target_height;
        width = height * (source_width / source_height);
      }
      return [Math.round(width), Math.round(height)];
    }

    setPreviewData(preview_data) {
      this.preview_data = preview_data;
      var ref = this.preview_data.split(",");
      this.width = ref[0];
      this.height = ref[1];
    }

    getPreviewUri(target_width, target_height) {
      if (target_width == null) target_width = 10;
      if (target_height == null) target_height = 10;
      this.logStart("Render");
      var ref = this.preview_data.split(",");
      this.width = ref[0];
      this.height = ref[1];
      var colors = ref[2];
      var pixels = ref[3];
      var ref1 = this.getSize(target_width, target_height);
      var width = ref1[0];
      var height = ref1[1];
      colors = colors.match(/.{3}/g);
      pixels = pixels.split("");
      var canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      var ctx = canvas.getContext('2d');
      var image_data = ctx.createImageData(width, height);
      var color_codes = {};
      for (var i = 0; i < colors.length; i++) {
        color_codes[this.pixel_chars[i]] = colors[i];
      }
      var di = 0;
      for (var k = 0; k < pixels.length; k++) {
        var hex = color_codes[pixels[k]];
        var r = parseInt(hex[0], 16) * 17;
        var g = parseInt(hex[1], 16) * 17;
        var b = parseInt(hex[2], 16) * 17;
        image_data.data[di] = r;
        image_data.data[di + 1] = g;
        image_data.data[di + 2] = b;
        image_data.data[di + 3] = 255;
        di += 4;
      }
      ctx.putImageData(image_data, 0, 0);
      var canvas2 = document.createElement("canvas");
      canvas2.width = width * 3;
      canvas2.height = height * 3;
      ctx = canvas2.getContext('2d');
      ctx.filter = "blur(1px)";
      ctx.drawImage(canvas, -5, -5, canvas.width * 3 + 10, canvas.height * 3 + 10);
      ctx.drawImage(canvas, 0, 0, canvas.width * 3, canvas.height * 3);
      var back = canvas2.toDataURL("image/png");
      this.logEnd("Render");
      return back;
    }
  }

  Object.assign(ImagePreview.prototype, LogMixin);
  window.ImagePreview = ImagePreview;
})();
