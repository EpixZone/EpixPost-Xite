(function() {
  class Uploadable {
    constructor(handleSave) {
      this.handleSave = handleSave;
      this.storeNode = this.storeNode.bind(this);
      this.resizeImage = this.resizeImage.bind(this);
      this.handleUploadClick = this.handleUploadClick.bind(this);
      this.render = this.render.bind(this);
      this.node = null;
      this.resize_width = 50;
      this.resize_height = 50;
      this.preverse_ratio = true;
      this.image_preview = new ImagePreview();
      this.pixel_chars = this.image_preview.pixel_chars;
    }

    storeNode(node) { this.node = node; }

    scaleHalf(image) {
      var canvas = document.createElement("canvas");
      canvas.width = image.width / 2;
      canvas.height = image.height / 2;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas;
    }

    resizeImage(file, width, height, cb) {
      var image = new Image();
      image.onload = () => {
        this.log("Resize image loaded");
        var canvas = document.createElement("canvas");
        if (this.preverse_ratio) {
          var ref = this.image_preview.calcSize(image.width, image.height, width, height);
          canvas.width = ref[0];
          canvas.height = ref[1];
        } else {
          canvas.width = width;
          canvas.height = height;
        }
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#FFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        while (image.width > width * 2) { image = this.scaleHalf(image); }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        var image_base64uri = canvas.toDataURL("image/jpeg", 0.8);
        this.log("Size: " + image_base64uri.length + " bytes");
        cb(image_base64uri, canvas.width, canvas.height);
      };
      image.onerror = (e) => {
        this.log("Image upload error", e);
        Page.cmd("wrapperNotification", ["error", _("Invalid image, only jpg format supported")]);
        cb(null);
      };
      if (file.name) {
        image.src = URL.createObjectURL(file);
      } else {
        image.src = file;
      }
    }

    handleUploadClick(e) {
      this.log("handleUploadClick", e);
      var input = document.createElement('input');
      document.body.appendChild(input);
      input.type = "file";
      input.style.visibility = "hidden";
      input.onchange = (e) => {
        this.log("Uploaded");
        this.resizeImage(input.files[0], this.resize_width, this.resize_height, (image_base64uri, width, height) => {
          this.log("Resized", width, height);
          if (image_base64uri) { this.handleSave(image_base64uri, width, height); }
          input.remove();
        });
      };
      input.click();
      return false;
    }

    render(body) {
      return h("div.uploadable",
        h("a.icon.icon-upload", { href: "#Upload", onclick: this.handleUploadClick }),
        body()
      );
    }

    // Quantize RGBA pixel data to at most max_colors colors (4 bit per
    // channel, most frequent colors kept, the rest mapped to the nearest
    // palette entry). Replaces the old pngencoder.js RgbQuant dependency.
    // Returns [palette hex triplets, pixel chars] in the ImagePreview format.
    quantizePixels(data, max_colors) {
      var counts = {};
      var rounded = [];
      for (var i = 0; i <= data.length - 1; i += 4) {
        var r = Math.round(data[i] / 17);
        var g = Math.round(data[i + 1] / 17);
        var b = Math.round(data[i + 2] / 17);
        var hex = Number(0x1000 + r * 0x100 + g * 0x10 + b).toString(16).substring(1);
        rounded.push(hex);
        counts[hex] = (counts[hex] || 0) + 1;
      }
      var palette = Object.keys(counts).sort(function(a, b) {
        return counts[b] - counts[a];
      }).slice(0, max_colors);
      var nearest = {};
      var pixels = [];
      for (var k = 0; k < rounded.length; k++) {
        var hex2 = rounded[k];
        if (nearest[hex2] == null) {
          var best = 0;
          var best_dist = Infinity;
          for (var j = 0; j < palette.length; j++) {
            var dr = parseInt(hex2[0], 16) - parseInt(palette[j][0], 16);
            var dg = parseInt(hex2[1], 16) - parseInt(palette[j][1], 16);
            var db = parseInt(hex2[2], 16) - parseInt(palette[j][2], 16);
            var dist = dr * dr + dg * dg + db * db;
            if (dist < best_dist) {
              best_dist = dist;
              best = j;
            }
          }
          nearest[hex2] = best;
        }
        pixels.push(this.pixel_chars[nearest[hex2]]);
      }
      return [palette, pixels];
    }

    getPreviewData(image_base64uri, target_width, target_height, cb) {
      var image = new Image();
      image.src = image_base64uri;
      image.onload = () => {
        var image_width = image.width;
        var image_height = image.height;
        var canvas = document.createElement("canvas");
        var ref = this.image_preview.calcSize(image.width, image.height, target_width, target_height);
        canvas.width = ref[0];
        canvas.height = ref[1];
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#FFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        while (image.width > target_width * 2) { image = this.scaleHalf(image); }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        var image_data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var pixeldata = this.quantizePixels(image_data.data, 16);
        var back = [image_width, image_height, pixeldata[0].join(""), pixeldata[1].join("")].join(",");
        this.log("Previewdata size:", back.length);
        cb(back);
      };
    }
  }

  Object.assign(Uploadable.prototype, LogMixin);
  window.Uploadable = Uploadable;
})();
