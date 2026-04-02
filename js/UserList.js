(function() {

  class UserList {
    constructor(type) {
      this.type = type != null ? type : "new";
      this.render = this.render.bind(this);
      this.item_list = new ItemList(User, "key");
      this.users = this.item_list.items;
      this.need_update = true;
      this.limit = 5;
      this.followed_by = null;
      this.search = null;
    }

    update() {
      var params, query, search_where;
      this.loading = true;
      params = {};
      if (this.search) {
        search_where = "AND (json.user_name LIKE :search_like OR json.cert_user_id LIKE :search_like)";
        params["search_like"] = "%" + this.search + "%";
      } else {
        search_where = "";
      }
      if (this.followed_by) {
        query = "SELECT json.user_name, follow.*, json.cert_user_id AS json_cert_user_id, json.directory AS json_directory, json.site AS json_site, json.hub AS json_hub, json.avatar AS json_avatar\nFROM follow\nLEFT JOIN json ON (json.directory = 'data/users/' || follow.auth_address AND json.file_name = 'data.json')\nWHERE\n follow.json_id = " + this.followed_by.row.json_id + " AND json.json_id IS NOT NULL AND\n follow.date_added < " + (Time.timestamp() + 120) + "\nORDER BY date_added DESC\nLIMIT " + this.limit;
      } else if (this.type === "suggested") {
        var followed_user_addresses = Object.keys(Page.user.followed_users).map(function(key) {
          return key.replace(/.*\//, "");
        });
        var followed_user_directories = followed_user_addresses.map(function(key) {
          return "data/users/" + key;
        });
        if (!followed_user_addresses.length) {
          return;
        }
        query = "SELECT\n COUNT(DISTINCT(json.directory)) AS num,\n GROUP_CONCAT(DISTINCT(json.user_name)) AS followed_by,\n follow.*,\n json_suggested.avatar\nFROM follow\n LEFT JOIN json USING (json_id)\n LEFT JOIN json AS json_suggested ON (json_suggested.directory = 'data/users/' || follow.auth_address AND json_suggested.avatar IS NOT NULL)\nWHERE\n json.directory IN " + (Text.sqlIn(followed_user_directories)) + " AND\n auth_address NOT IN " + (Text.sqlIn(followed_user_addresses)) + " AND\n auth_address != '" + Page.user.auth_address + "' AND\n date_added < " + (Time.timestamp() + 120) + "\nGROUP BY follow.auth_address\nORDER BY num DESC\nLIMIT " + this.limit;
      } else if (this.type === "active") {
        query = "SELECT\n json.*,\n json.site AS json_site,\n json.directory AS json_directory,\n json.file_name AS json_file_name,\n json.cert_user_id AS json_cert_user_id,\n json.hub AS json_hub,\n json.user_name AS json_user_name,\n json.avatar AS json_avatar,\n COUNT(*) AS posts\nFROM\n post LEFT JOIN json USING (json_id)\nWHERE\n post.date_added > " + (Time.timestamp() - 60 * 60 * 24 * 7) + "\nGROUP BY json_id\nORDER BY posts DESC\nLIMIT " + this.limit;
      } else {
        query = "SELECT\n json.*,\n json.site AS json_site,\n json.directory AS json_directory,\n json.file_name AS json_file_name,\n json.cert_user_id AS json_cert_user_id,\n json.hub AS json_hub,\n json.user_name AS json_user_name,\n json.avatar AS json_avatar,\n (SELECT COUNT(*) FROM post WHERE post.json_id = json.json_id) AS posts\nFROM\n json\nWHERE\n json.file_name = 'data.json' AND json.directory LIKE 'data/users/%'\n " + search_where + "\nORDER BY posts DESC\nLIMIT " + this.limit;
      }
      return Page.cmd("dbQuery", [query, params], (rows) => {
        var all_addresses, followed_by_displayed, key, row, rows_by_user, user_rows, val;
        rows_by_user = {};
        followed_by_displayed = {};
        all_addresses = [];
        for (var i = 0, len = rows.length; i < len; i++) {
          row = rows[i];
          if (row.json_cert_user_id) {
            row.cert_user_id = row.json_cert_user_id;
            row.auth_address = row.json_directory.replace("data/userdb/", "").replace("data/users/", "");
          }
          if (!row.auth_address) {
            continue;
          }
          if (row.followed_by) {
            row.followed_by = (row.followed_by.split(",").filter(function(username) {
              return !followed_by_displayed[username];
            }))[0];
            followed_by_displayed[row.followed_by] = true;
          }
          row.key = row.hub + "/" + row.auth_address;
          if (!rows_by_user[row.hub + row.auth_address]) {
            rows_by_user[row.hub + row.auth_address] = row;
          }
          if (row.auth_address) {
            all_addresses.push(row.auth_address);
          }
        }
        user_rows = [];
        for (key in rows_by_user) {
          val = rows_by_user[key];
          user_rows.push(val);
        }
        return Page.resolveXidProfiles(all_addresses, () => {
          this.item_list.sync(user_rows);
          this.loading = false;
          return Page.projector.scheduleRender();
        });
      });
    }

    render(type) {
      if (type == null) {
        type = "normal";
      }
      if (this.need_update) {
        this.need_update = false;
        setTimeout(() => {
          return this.update();
        }, 100);
      }
      if (!this.users.length) {
        return null;
      }
      return h("div.UserList.users" + type + "." + this.type, {
        afterCreate: Animation.show
      }, this.users.map((user) => {
        return user.renderList(type);
      }));
    }
  }

  Object.assign(UserList.prototype, LogMixin);
  window.UserList = UserList;

})();
