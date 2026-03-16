(function() {

  class Trigger {
    constructor() {
      this.handleTitleClick = this.handleTitleClick.bind(this);
      this.render = this.render.bind(this);
      this.trigger_off = true;
    }

    handleTitleClick() {
      if (this.trigger_off) {
        this.trigger_off = false;
        document.body.classList.add("trigger-on");
      } else {
        document.body.classList.remove("trigger-on");
        this.trigger_off = true;
      }
      return false;
    }

    render() {
      return h("div.Trigger", {
        classes: { "trigger-off": this.trigger_off }
      }, [
        h("a.icon", { "href": "#Trigger", onclick: this.handleTitleClick })
      ]);
    }
  }

  Object.assign(Trigger.prototype, LogMixin);
  window.Trigger = Trigger;

})();
