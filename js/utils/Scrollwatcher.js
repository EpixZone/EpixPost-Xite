(function() {
  class Scrollwatcher {
    constructor() {
      this.checkScroll = this.checkScroll.bind(this);
      this.log("Scrollwatcher");
      this.items = [];
      window.onscroll = () => { RateLimit(200, this.checkScroll); };
    }

    checkScroll() {
      if (!this.items.length) return;
      var view_top = window.scrollY;
      var view_bottom = window.scrollY + window.innerHeight;
      for (var i = this.items.length - 1; i >= 0; i--) {
        var item_top = this.items[i][0];
        var tag = this.items[i][1];
        var cb = this.items[i][2];
        if (item_top + 900 > view_top && item_top - 400 < view_bottom) {
          this.items.splice(i, 1);
          cb(tag);
        }
      }
    }

    add(tag, cb) {
      this.items.push([tag.getBoundingClientRect().top + window.scrollY, tag, cb]);
      RateLimit(200, this.checkScroll);
    }
  }

  Object.assign(Scrollwatcher.prototype, LogMixin);
  window.Scrollwatcher = Scrollwatcher;
})();
