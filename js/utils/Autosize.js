(function() {
  class Autosize {
    constructor(attrs) {
      this.attrs = attrs || {};
      this.storeNode = this.storeNode.bind(this);
      this.setValue = this.setValue.bind(this);
      this.autoHeight = this.autoHeight.bind(this);
      this.handleInput = this.handleInput.bind(this);
      this.handleKeydown = this.handleKeydown.bind(this);
      this.submit = this.submit.bind(this);
      this.render = this.render.bind(this);
      this.node = null;
      if (this.attrs.classes == null) this.attrs.classes = {};
      if (this.attrs.classes.loading == null) this.attrs.classes.loading = false;
      if (this.attrs.oninput == null) this.attrs.oninput = this.handleInput;
      if (this.attrs.onkeydown == null) this.attrs.onkeydown = this.handleKeydown;
      if (this.attrs.afterCreate == null) this.attrs.afterCreate = this.storeNode;
      if (this.attrs.rows == null) this.attrs.rows = 1;
      if (this.attrs.disabled == null) this.attrs.disabled = false;
      if (this.attrs.value == null) this.attrs.value = null;
      if (this.attrs.title_submit == null) this.attrs.title_submit = null;
    }

    storeNode(node) {
      this.node = node;
      if (this.attrs.focused) {
        node.setSelectionRange(0, 0);
        node.focus();
      }
      setTimeout(() => { this.autoHeight(); });
    }

    setValue(value) {
      if (value == null) value = null;
      this.attrs.value = value;
      if (this.node) {
        this.node.value = value;
        this.autoHeight();
      }
      Page.projector.scheduleRender();
    }

    autoHeight() {
      var height_before = this.node.style.height;
      if (height_before) {
        this.node.style.height = "0px";
      }
      var h_val = this.node.offsetHeight;
      var scrollh = this.node.scrollHeight;
      this.node.style.height = height_before;
      if (scrollh > h_val) {
        anime({ targets: this.node, height: scrollh, scrollTop: 0 });
      } else {
        this.node.style.height = height_before;
      }
    }

    handleInput(e) {
      if (e == null) e = null;
      this.attrs.value = e.target.value;
      RateLimit(300, this.autoHeight);
    }

    handleKeydown(e) {
      if (e == null) e = null;
      if (e.which === 13 && e.ctrlKey && this.attrs.onsubmit && this.attrs.value.trim()) {
        return this.submit();
      }
    }

    submit() {
      this.attrs.onsubmit();
      setTimeout(() => { this.autoHeight(); }, 100);
      return false;
    }

    render(body) {
      if (body == null) body = null;
      if (body && this.attrs.value === null) {
        this.setValue(body);
      }
      var tag_textarea;
      if (this.loading) {
        var attrs = clone(this.attrs);
        attrs.disabled = true;
        tag_textarea = h("textarea.autosize", attrs);
      } else {
        tag_textarea = h("textarea.autosize", this.attrs);
      }
      return [
        tag_textarea,
        this.attrs.title_submit ? h("a.button.button.button-submit.button-small", {
          href: "#Submit",
          onclick: this.submit,
          classes: this.attrs.classes
        }, this.attrs.title_submit) : void 0
      ];
    }
  }

  Object.defineProperty(Autosize.prototype, 'loading', {
    get: function() {
      return this.attrs.classes.loading;
    },
    set: function(loading) {
      this.attrs.classes.loading = loading;
      this.node.value = this.attrs.value;
      this.autoHeight();
      Page.projector.scheduleRender();
    }
  });

  Object.assign(Autosize.prototype, LogMixin);
  window.Autosize = Autosize;
})();
