(function() {

  // Shared hub membership actions, used by the Hubs page and the Create
  // profile page. All functions are stateless and act on the account
  // currently selected in Page.site_info.
  var HubActions = {

    // Write the user's default profile data.json to the chosen hub.
    // on_status(text) reports progress (optional), cb(ok) fires when done.
    joinHub: function(hub, on_status, cb) {
      if (on_status == null) {
        on_status = null;
      }
      if (cb == null) {
        cb = null;
      }
      var user = new User({
        hub: hub,
        auth_address: Page.site_info.auth_address
      });
      Page.setHubRemoved(hub, false);
      if (on_status) {
        on_status(_("Checking user on selected hub..."));
      }
      Page.cmd("fileGet", {
        "inner_path": user.getPath(hub) + "/content.json",
        "required": false
      }, function(found) {
        if (found) {
          Page.cmd("wrapperNotification", ["error", _("User") + " " + Page.site_info.cert_user_id + " " + _("already exists on this hub")]);
          if (typeof cb === "function") {
            cb(false);
          }
          return;
        }
        var data = user.getDefaultData();
        data.hub = hub;
        if (on_status) {
          on_status(_("Creating new profile..."));
        }
        user.save(data, hub, function() {
          Page.checkUser();
          if (typeof cb === "function") {
            cb(true);
          }
        });
      });
    },

    // Leave a hub: stop merging/seeding it so it disappears from the app.
    // Non-destructive: the profile and posts stay on the hub (other peers
    // keep serving them) and are still there on a rejoin.
    leaveHub: function(hub, cb) {
      if (cb == null) {
        cb = null;
      }
      Page.cmd("wrapperConfirm", [
        _("Leave this hub? Your posts stay on the hub and will still be there if you rejoin."),
        _("Leave hub")
      ], function() {
        Page.setHubRemoved(hub, true);
        if (Page.local_storage && Page.local_storage.settings.hub === hub) {
          delete Page.local_storage.settings.hub;
          Page.saveLocalStorage();
        }
        Page.cmd("mergerSiteDelete", hub, function() {
          Page.updateSiteInfo(function() {
            Page.checkUser(function() {
              if (typeof cb === "function") {
                cb(true);
              }
            });
          });
        });
      });
      return false;
    },

    // Stop seeding a hub the user has no profile on.
    stopSeeding: function(hub, cb) {
      if (cb == null) {
        cb = null;
      }
      Page.cmd("wrapperConfirm", [
        _("Your node will stop hosting this hub's data. Posts from its users will disappear from your feeds."),
        _("Stop seeding")
      ], function() {
        Page.setHubRemoved(hub, true);
        Page.cmd("mergerSiteDelete", hub, function() {
          Page.updateSiteInfo(function() {
            if (typeof cb === "function") {
              cb(true);
            }
          });
        });
      });
      return false;
    }
  };

  window.HubActions = HubActions;

})();
