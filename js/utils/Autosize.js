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
      var node = this.node;
      if (!node || !node.isConnected) return;
      var style = window.getComputedStyle(node);
      var height_before = node.offsetHeight;
      var scroll_before = node.scrollTop;
      // Collapsing the live editor to measure it also collapses its scroll
      // container, which jumps away from the caret in long posts. Measure a
      // hidden copy at the same width without changing the document layout.
      var measure = node.cloneNode(false);
      measure.removeAttribute("id");
      measure.removeAttribute("name");
      measure.setAttribute("aria-hidden", "true");
      measure.tabIndex = -1;
      Object.assign(measure.style, {
        position: "fixed", top: "0px", left: "0px", visibility: "hidden",
        pointerEvents: "none", height: "0px", minHeight: "0px", maxHeight: "none",
        width: style.width, overflow: "hidden"
      });
      measure.value = node.value;
      node.parentNode.appendChild(measure);
      var height = measure.scrollHeight;
      if (style.boxSizing === "border-box") {
        height += parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      } else {
        height -= parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      }
      measure.remove();
      node.style.height = Math.ceil(height) + "px";
      // New lines may scroll inside the textarea before it grows. Transfer
      // that consumed scroll to its ancestors so the caret stays in view.
      if (document.activeElement === node && node.offsetHeight > height_before && scroll_before > node.scrollTop) {
        var remaining = (scroll_before - node.scrollTop) * (node.getBoundingClientRect().height / node.offsetHeight || 1);
        for (var parent = node.parentElement; parent && remaining > 0; parent = parent.parentElement) {
          var scale = parent.getBoundingClientRect().height / parent.offsetHeight || 1;
          var before = parent.scrollTop;
          parent.scrollTop += remaining / scale;
          remaining -= (parent.scrollTop - before) * scale;
        }
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
