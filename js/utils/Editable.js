(function() {
  class Editable {
    constructor(type, handleSave, handleDelete) {
      this.type = type;
      this.handleSave = handleSave;
      this.handleDelete = handleDelete;
      this.storeNode = this.storeNode.bind(this);
      this.handleEditClick = this.handleEditClick.bind(this);
      this.handleCancelClick = this.handleCancelClick.bind(this);
      this.handleDeleteClick = this.handleDeleteClick.bind(this);
      this.handleSaveClick = this.handleSaveClick.bind(this);
      this.render = this.render.bind(this);
      this.node = null;
      this.editing = false;
      this.render_function = null;
      this.empty_text = "Click here to edit this field";
    }

    storeNode(node) { this.node = node; }

    handleEditClick(e) {
      this.editing = true;
      this.field_edit = new Autosize({ focused: 1, style: "height: 0px" });
      return false;
    }

    handleCancelClick() {
      this.editing = false;
      return false;
    }

    handleDeleteClick() {
      Page.cmd("wrapperConfirm", ["Are you sure?", "Delete"], () => {
        this.field_edit.loading = true;
        this.handleDelete((res) => { this.field_edit.loading = false; });
      });
      return false;
    }

    handleSaveClick() {
      this.field_edit.loading = true;
      this.handleSave(this.field_edit.attrs.value, (res) => {
        this.field_edit.loading = false;
        if (res) this.editing = false;
      });
      return false;
    }

    render(body) {
      if (this.editing) {
        return h("div.editable.editing", {
          exitAnimation: Animation.slideUp
        }, this.field_edit.render(body), h("div.editablebuttons",
          h("a.link", { href: "#Cancel", onclick: this.handleCancelClick, tabindex: "-1" }, "Cancel"),
          this.handleDelete ? h("a.button.button-submit.button-small.button-outline", {
            href: "#Delete", onclick: this.handleDeleteClick, tabindex: "-1"
          }, "Delete") : void 0,
          h("a.button.button-submit.button-small", { href: "#Save", onclick: this.handleSaveClick }, "Save")
        ));
      } else {
        return h("div.editable", { enterAnimation: Animation.slideDown },
          h("a.icon.icon-edit", { key: this.node, href: "#Edit", onclick: this.handleEditClick }),
          !body ? h(this.type, h("span.empty", { onclick: this.handleEditClick }, this.empty_text))
            : this.render_function ? h(this.type, { innerHTML: this.render_function(body) })
            : h(this.type, body)
        );
      }
    }
  }

  Object.assign(Editable.prototype, LogMixin);
  window.Editable = Editable;
})();
