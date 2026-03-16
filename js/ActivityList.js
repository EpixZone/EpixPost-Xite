(function() {

  class ActivityList {
    constructor() {
      this.handleMoreClick = this.handleMoreClick.bind(this);
      this.render = this.render.bind(this);
      this.update = this.update.bind(this);
      this.activities = null;
      this.directories = [];
      this.need_update = true;
      this.limit = 10;
      this.found = 0;
      this.loading = true;
      this.update_timer = null;
    }

    queryActivities(cb) {
      var where;
      if (this.directories === "all") {
        where = "WHERE date_added > " + (Time.timestamp() - 60 * 60 * 24 * 2) + " AND date_added < " + (Time.timestamp() + 120) + " ";
      } else {
        where = "WHERE json.directory IN " + Text.sqlIn(this.directories) + " AND date_added < " + (Time.timestamp() + 120) + " ";
      }
      var query = "SELECT\n 'comment' AS type, json.*,\n json.site || \"/\" || post_uri AS subject, body, date_added,\n NULL AS subject_auth_address, NULL AS subject_hub, NULL AS subject_user_name\nFROM\n json\nLEFT JOIN comment USING (json_id)\n " + where + "\n\nUNION ALL\n\nSELECT\n 'post_like' AS type, json.*,\n json.site || \"/\" || post_uri AS subject, '' AS body, date_added,\n NULL AS subject_auth_address, NULL AS subject_hub, NULL AS subject_user_name\nFROM\n json\nLEFT JOIN post_like USING (json_id)\n " + where;
      if (this.directories !== "all") {
        query += "UNION ALL\n\nSELECT\n 'follow' AS type, json.*,\n follow.hub || \"/\" || follow.auth_address AS subject, '' AS body, date_added,\n follow.auth_address AS subject_auth_address, follow.hub AS subject_hub, follow.user_name AS subject_user_name\nFROM\n json\nLEFT JOIN follow USING (json_id)\n " + where;
      }
      query += "\nORDER BY date_added DESC\nLIMIT " + (this.limit + 1);
      this.logStart("Update");
      Page.cmd("dbQuery", [query, { directories: this.directories }], (rows) => {
        var directories = [];
        rows = rows.filter(function(row) { return row.subject; });
        var all_addresses = [];
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          row.auth_address = row.directory.replace("data/users/", "");
          var subject_address = row.subject.replace(/_.*/, "").replace(/.*\//, "");
          row.post_id = row.subject.replace(/.*_/, "").replace(/.*\//, "");
          row.subject_address = subject_address;
          var directory = "data/users/" + subject_address;
          if (directories.indexOf(directory) < 0) directories.push(directory);
          if (row.auth_address) all_addresses.push(row.auth_address);
          if (subject_address) all_addresses.push(subject_address);
        }
        Page.cmd("dbQuery", ["SELECT * FROM json WHERE ?", { directory: directories }], (subject_rows) => {
          var subject_db = {};
          for (var j = 0; j < subject_rows.length; j++) {
            var subject_row = subject_rows[j];
            subject_row.auth_address = subject_row.directory.replace("data/users/", "");
            subject_db[subject_row.auth_address] = subject_row;
          }
          for (var k = 0; k < rows.length; k++) {
            var row = rows[k];
            row.subject = subject_db[row.subject_address];
            if (row.subject == null) row.subject = {};
            if (row.subject.auth_address == null) row.subject.auth_address = row.subject_auth_address;
            if (row.subject.hub == null) row.subject.hub = row.subject_hub;
            if (row.subject.user_name == null) row.subject.user_name = row.subject_user_name;
          }
          var last_row = null;
          var row_group = [];
          var row_groups = [];
          for (var l = 0; l < rows.length; l++) {
            var row = rows[l];
            if (!last_row || (row.auth_address === (last_row != null ? last_row.auth_address : void 0) && row.type === (last_row != null ? last_row.type : void 0) && (row.type === "post_like" || row.type === "follow"))) {
              row_group.push(row);
            } else {
              row_groups.push(row_group);
              row_group = [row];
            }
            last_row = row;
          }
          if (row_group.length) row_groups.push(row_group);
          this.found = rows.length;
          this.logEnd("Update");
          Page.resolveXidProfiles(all_addresses, function() { cb(row_groups); });
        });
      });
    }

    handleMoreClick() {
      this.limit += 20;
      this.update(0);
      return false;
    }

    renderActivity(activity_group) {
      var back = [];
      var now = Time.timestamp();
      var activity = activity_group[0];
      var ref;
      if (!activity.subject.user_name && !((ref = Page.xid_profiles[activity.subject.auth_address]) != null ? ref.name : void 0)) {
        return back;
      }
      var activity_user_link = "?Profile/" + activity.hub + "/" + activity.auth_address + "/" + activity.cert_user_id;
      var subject_user_link = "?Profile/" + activity.subject.hub + "/" + activity.subject.auth_address + "/" + (activity.subject.cert_user_id || '');
      var subject_post_link = "?Post/" + activity.subject.hub + "/" + activity.subject.auth_address + "/" + activity.post_id;
      var activity_display_name = Page.getXidDisplayName(activity.auth_address, activity.user_name);
      var subject_display_name = Page.getXidDisplayName(activity.subject.auth_address, activity.subject.user_name);
      var body;
      if (activity.type === "post_like") {
        body = [
          h("a.link", { href: activity_user_link, onclick: Page.handleLinkClick }, activity_display_name),
          " liked ",
          h("a.link", { href: subject_user_link, onclick: Page.handleLinkClick }, subject_display_name),
          "'s ",
          h("a.link", { href: subject_post_link, onclick: Page.handleLinkClick }, _("post", "like post"))
        ];
        if (activity_group.length > 1) {
          var more_items = activity_group.slice(1, 11);
          for (var i = 0; i < more_items.length; i++) {
            var activity_more = more_items[i];
            var s_user_link = "?Profile/" + activity_more.subject.hub + "/" + activity_more.subject.auth_address + "/" + (activity_more.subject.cert_user_id || '');
            var s_post_link = "?Post/" + activity_more.subject.hub + "/" + activity_more.subject.auth_address + "/" + activity_more.post_id;
            body.push(", ");
            body.push(h("a.link", { href: s_user_link, onclick: Page.handleLinkClick }, Page.getXidDisplayName(activity_more.subject.auth_address, activity_more.subject.user_name)));
            body.push("'s ");
            body.push(h("a.link", { href: s_post_link, onclick: Page.handleLinkClick }, _("post", "like post")));
          }
        }
      } else if (activity.type === "comment") {
        body = [
          h("a.link", { href: activity_user_link, onclick: Page.handleLinkClick }, activity_display_name),
          " commented on ",
          h("a.link", { href: subject_user_link, onclick: Page.handleLinkClick }, subject_display_name),
          "'s ",
          h("a.link", { href: subject_post_link, onclick: Page.handleLinkClick }, _("post", "comment post")),
          ": " + activity.body.slice(0, 101)
        ];
      } else if (activity.type === "follow") {
        body = [
          h("a.link", { href: activity_user_link, onclick: Page.handleLinkClick }, activity_display_name),
          " started following ",
          h("a.link", { href: subject_user_link, onclick: Page.handleLinkClick }, subject_display_name)
        ];
        if (activity_group.length > 1) {
          var more_items = activity_group.slice(1, 11);
          for (var j = 0; j < more_items.length; j++) {
            var activity_more = more_items[j];
            var s_user_link = "?Profile/" + activity_more.subject.hub + "/" + activity_more.subject.auth_address + "/" + (activity_more.subject.cert_user_id || '');
            body.push(", ");
            body.push(h("a.link", { href: s_user_link, onclick: Page.handleLinkClick }, Page.getXidDisplayName(activity_more.subject.auth_address, activity_more.subject.user_name)));
          }
        }
      } else {
        body = activity.body;
      }
      var title;
      if (activity.body) {
        title = Time.since(activity.date_added) + " - " + (activity.body.length > 500 ? activity.body.slice(0, 501) + "..." : activity.body);
      } else {
        title = Time.since(activity.date_added);
      }
      back.push(h("div.activity", {
        key: activity.cert_user_id + "_" + activity.date_added + "_" + activity_group.length,
        title: title,
        classes: { latest: now - activity.date_added < 600 },
        enterAnimation: Animation.slideDown,
        exitAnimation: Animation.slideUp
      }, [h("div.circle"), h("div.body", body)]));
      return back;
    }

    render() {
      if (this.need_update) {
        this.need_update = false;
        this.queryActivities((res) => {
          this.activities = res;
          Page.projector.scheduleRender();
        });
      }
      if (this.activities === null) return null;
      return h("div.activity-list", [
        this.activities.length > 0 ? h("h2", {
          enterAnimation: Animation.slideDown,
          exitAnimation: Animation.slideUp
        }, "Activity feed") : void 0,
        h("div.items", [
          h("div.bg-line"),
          this.activities.slice(0, this.limit).map(this.renderActivity)
        ]),
        this.found > this.limit ? h("a.more.small", {
          href: "#More", onclick: this.handleMoreClick,
          enterAnimation: Animation.slideDown, exitAnimation: Animation.slideUp
        }, "Show more...") : void 0
      ]);
    }

    update(delay) {
      if (delay == null) delay = 600;
      clearInterval(this.update_timer);
      if (!this.need_update) {
        this.update_timer = setTimeout(() => {
          this.need_update = true;
          Page.projector.scheduleRender();
        }, delay);
      }
    }
  }

  Object.assign(ActivityList.prototype, LogMixin);
  window.ActivityList = ActivityList;

})();
