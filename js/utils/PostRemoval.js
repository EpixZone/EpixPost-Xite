(function() {
  // Presentation and command gates for this app. Trust and snapshot validation
  // belong to RemovalPolicy. Never put a target address into a blocked card.
  var viewKeys = new Map();
  var stopHandlers = new Map();
  var PostRemoval = {
    check: function(address) {
      if (!address) return {status: "verification_unavailable"};
      return window.RemovalPolicy ? window.RemovalPolicy.check(address) : {status: "verification_unavailable"};
    },
    allowed: function(address) { return this.check(address).status === "allowed"; },
    message: function(decision) {
      if (window.RemovalPolicy && window.RemovalPolicy.message) return window.RemovalPolicy.message(decision);
      return _("Removal policy could not be verified. Please retry before continuing.");
    },
    notify: function(address) {
      var result = this.check(address);
      if (result.status === "allowed") return true;
      Page.cmd("wrapperNotification", ["info", this.message(result)]);
      return false;
    },
    allowedRow: function(row) {
      if (!row || typeof row !== "object") return true;
      return [row.site, row.hub, row.subject_hub].every((address) => address == null || address === "" || this.allowed(address));
    },
    render: function(address, selector) {
      var decision = this.check(address);
      if (decision.status === "allowed") return null;
      if (!viewKeys.has(address)) viewKeys.set(address, "removal-view-" + viewKeys.size);
      if (!stopHandlers.has(address)) stopHandlers.set(address, function() {
        // The target stays in a closure, never in a rendered href/data attribute.
        if (Page.user_hubs && Page.user_hubs[address]) return HubActions.leaveHub(address);
        return HubActions.stopSeeding(address);
      });
      return h(selector || "div.hub.card.hub-detail", {key: viewKeys.get(address), role: "status"}, [
        h("h2", decision.status === "removed" ? _("Hub removed") : _("Hub verification unavailable")),
        h("p", this.message(decision)),
        decision.status === "removed" && decision.removedKey ? h("p.hub-removal-key", _("Removal key:") + " " + decision.removedKey) : void 0,
        Page.merged_sites && Page.merged_sites[address] ? h("button.button.button-small", {
          type: "button", onclick: stopHandlers.get(address)
        }, _("Stop seeding this hub")) : void 0
      ]);
    },
    sqlScope: function(column) {
      var hubs = Object.keys(Page.merged_sites || {}).filter((address) => /^epix1[a-z0-9]+$/.test(address) && this.allowed(address));
      return hubs.length ? column + " IN (" + hubs.map((address) => "'" + address + "'").join(",") + ")" : "0";
    },
    refresh: function() {
      if (!window.RemovalPolicy) return false;
      window.RemovalPolicy.refresh().then(() => {
        if (Page.shell && typeof Page.shell.refreshRemovalFeeds === "function") Page.shell.refreshRemovalFeeds();
        if (Page.site_info && Page.local_storage) Page.checkUser();
        if (Page.content) Page.content.update();
        Page.projector.scheduleRender();
      }).catch(() => Page.projector.scheduleRender());
      return false;
    },
    renderStatus: function() {
      var decision = this.check(Page.address);
      if (decision.status !== "verification_unavailable") return null;
      return h("div.hub-community-error", {key: "removal-policy-status", role: "status"}, [
        h("p", this.message(decision)),
        h("button.button.button-small", {type: "button", onclick: PostRemoval.refresh}, _("Retry removal policy"))
      ]);
    },
    mergedTarget: function(params) {
      var path = typeof params === "string" ? params : Array.isArray(params) ? params[0] : params && params.inner_path;
      var match = typeof path === "string" && path.match(/^merged-[^/]+\/([^/]+)(?:\/|$)/);
      return match ? match[1] : null;
    }
  };
  window.PostRemoval = PostRemoval;
})();
