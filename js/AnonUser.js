(function() {

  class AnonUser {
    constructor() {
      this.updateInfo = this.updateInfo.bind(this);
      this.save = this.save.bind(this);
      this.auth_address = null;
      this.hub = null;
      this.followed_users = {};
      this.likes = {};
    }

    updateInfo(cb) {
      if (cb == null) cb = null;
      Page.on_local_storage.then(() => {
        this.followed_users = Page.local_storage.followed_users;
        if (typeof cb === "function") cb(true);
      });
    }

    like(site, post_uri, cb) {
      if (cb == null) cb = null;
      Page.cmd("wrapperNotification", ["info", _("You need a profile for this feature")]);
      if (cb) cb(true);
    }

    dislike(site, post_uri, cb) {
      if (cb == null) cb = null;
      Page.cmd("wrapperNotification", ["info", _("You need a profile for this feature")]);
      if (cb) cb(true);
    }

    followUser(hub, auth_address, user_name, cb) {
      if (cb == null) cb = null;
      this.followed_users[hub + "/" + auth_address] = true;
      this.save(cb);
      Page.needSite(hub);
      Page.content.update();
    }

    unfollowUser(hub, auth_address, cb) {
      if (cb == null) cb = null;
      delete this.followed_users[hub + "/" + auth_address];
      this.save(cb);
      Page.content.update();
    }

    comment(site, post_uri, body, cb) {
      if (cb == null) cb = null;
      Page.cmd("wrapperNotification", ["info", _("You need a profile for this feature")]);
      if (typeof cb === "function") cb(false);
    }

    save(cb) {
      if (cb == null) cb = null;
      Page.saveLocalStorage(cb);
    }
  }

  Object.assign(AnonUser.prototype, LogMixin);
  window.AnonUser = AnonUser;

})();
