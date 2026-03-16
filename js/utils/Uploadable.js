(function() {
  class Uploadable {
    constructor(handleSave) {
      this.handleSave = handleSave;
      this.storeNode = this.storeNode.bind(this);
      this.resizeImage = this.resizeImage.bind(this);
      this.handleUploadClick = this.handleUploadClick.bind(this);
      this.render = this.render.bind(this);
      this.getPixelData = this.getPixelData.bind(this);
      this.node = null;
      this.resize_width = 50;
      this.resize_height = 50;
      this.preverse_ratio = true;
      this.try_png = false;
      this.png_limit = 2200;
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
        var image_base64uri;
        if (this.try_png) {
          var quant = new RgbQuant({ colors: 128, method: 1 });
          quant.sample(canvas);
          quant.palette(true);
          var canvas_quant = drawPixels(quant.reduce(canvas), width);
          var optimizer = new CanvasTool.PngEncoder(canvas_quant, {
            bitDepth: 8, colourType: CanvasTool.PngEncoder.ColourType.TRUECOLOR
          });
          image_base64uri = "data:image/png;base64," + btoa(optimizer.convert());
          if (image_base64uri.length > this.png_limit) {
            this.log("PNG too large (" + image_base64uri.length + " bytes), convert to jpg instead");
            image_base64uri = canvas.toDataURL("image/jpeg", 0.8);
          }
        } else {
          image_base64uri = canvas.toDataURL("image/jpeg", 0.8);
        }
        this.log("Size: " + image_base64uri.length + " bytes");
        cb(image_base64uri, canvas.width, canvas.height);
      };
      image.onerror = (e) => {
        this.log("Image upload error", e);
        Page.cmd("wrapperNotification", ["error", "Invalid image, only jpg format supported"]);
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
      var script = document.createElement("script");
      script.src = "js-external/pngencoder.js";
      document.head.appendChild(script);
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

    getPixelData(data) {
      var color_db = {};
      var colors = [];
      var colors_next_id = 0;
      var pixels = [];
      for (var i = 0; i <= data.length - 1; i += 4) {
        var r = Math.round(data[i] / 17);
        var g = Math.round(data[i + 1] / 17);
        var b = Math.round(data[i + 2] / 17);
        var hex = Number(0x1000 + r * 0x100 + g * 0x10 + b).toString(16).substring(1);
        if (i === 0) this.log(r, g, b, data[i + 3], hex);
        if (!color_db[hex]) {
          color_db[hex] = this.pixel_chars[colors_next_id];
          colors.push(hex);
          colors_next_id += 1;
        }
        pixels.push(color_db[hex]);
      }
      return [colors, pixels];
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
        var quant = new RgbQuant({ colors: 16, method: 1 });
        quant.sample(canvas);
        quant.palette(true);
        canvas = drawPixels(quant.reduce(canvas), canvas.width);
        ctx = canvas.getContext("2d");
        var image_data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var pixeldata = this.getPixelData(image_data.data);
        var back = [image_width, image_height, pixeldata[0].join(""), pixeldata[1].join("")].join(",");
        this.log("Previewdata size:", back.length);
        cb(back);
      };
    }
  }

  Object.assign(Uploadable.prototype, LogMixin);
  window.Uploadable = Uploadable;
})();
