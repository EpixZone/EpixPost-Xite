(function() {
  // Metadata only: none of these views fetch the hub they describe.
  class HubCommunityView {
    constructor(owner) {
      this.owner = owner;
      this.loaded = false;
      this.error = null;
      this.show_filtered = false;
      this.dialog = null;
      this.saving = false;
      this.allowing = null;
      this.load_generation = 0;
      ["handleFilter", "handleShowFiltered", "handleHide", "handleReview", "handleClose", "handleField", "handleTopic", "handleSave", "handleClear", "handleOverride", "handleReload"].forEach((name) => {
        this[name] = this[name].bind(this);
      });
    }

    preferences() {
      var settings = Page.local_storage && Page.local_storage.settings;
      return Object.assign({adult: true, unavailable: true}, settings && settings.hub_filters);
    }

    hidden() {
      return (Page.local_storage && Page.local_storage.settings.hidden_hubs) || {};
    }

    load(cb) {
      var generation = ++this.load_generation;
      this.loaded = false;
      this.error = null;
      HubCommunity.load((result) => {
        if (generation !== this.load_generation) return;
        this.error = result !== "ok" ? _("Community reports could not be loaded. Try again before downloading a new hub.") : null;
        this.loaded = !this.error;
        Page.projector.scheduleRender();
        if (cb) cb(result);
      });
    }

    handleReload() {
      this.load();
      return false;
    }

    reasons(address) {
      var prefs = this.preferences();
      var summary = HubCommunity.getSummary(address);
      var reasons = [];
      if (this.hidden()[address]) reasons.push(_("Hidden by you"));
      if (prefs.adult && summary.rating === "a") reasons.push(_("Adult content reported"));
      if (prefs.mature && summary.rating === "m") reasons.push(_("Mature content reported"));
      if (prefs.unavailable && summary.availability_counts.unavailable > 0) reasons.push(_("Recently reported unavailable"));
      Object.keys(HubCommunity.TOPICS).forEach((topic) => {
        if (prefs[topic] && summary.topic_counts[topic] > 0) reasons.push(_(HubCommunity.TOPICS[topic]));
      });
      Object.keys(HubCommunity.REASONS).forEach((reason) => {
        if (prefs[reason] && summary.reason_counts[reason] > 0) reasons.push(_(HubCommunity.REASONS[reason]));
      });
      return reasons;
    }

    canDownload(address) {
      return this.allowing === address || (this.loaded && !this.error && !this.reasons(address).length);
    }

    handleFilter(e) {
      if (!Page.local_storage) return;
      var settings = Page.local_storage.settings;
      settings.hub_filters = this.preferences();
      settings.hub_filters[e.currentTarget.getAttribute("data-filter")] = e.currentTarget.checked;
      Page.saveLocalStorage();
      Page.projector.scheduleRender();
    }

    handleShowFiltered() {
      this.show_filtered = !this.show_filtered;
      Page.projector.scheduleRender();
      return false;
    }

    handleHide(e) {
      var address = e.currentTarget.getAttribute("address");
      var settings = Page.local_storage.settings;
      var hidden = settings.hidden_hubs || (settings.hidden_hubs = {});
      if (hidden[address]) delete hidden[address];
      else hidden[address] = true;
      Page.saveLocalStorage();
      Page.projector.scheduleRender();
      return false;
    }

    handleOverride(e) {
      var address = e.currentTarget.getAttribute("address");
      this.allowing = address;
      try {
        this.owner.downloadHub(address);
      } finally {
        this.allowing = null;
      }
      return false;
    }

    identity() {
      return Page.getUserIdentity ? Page.getUserIdentity() : JSON.stringify(Page.site_info || {});
    }

    handleReview(e) {
      var address = e.currentTarget.getAttribute("address");
      var own = HubCommunity.getOwnReview(address) || {};
      this.dialog = {
        address: address, identity: this.identity(), rating: own.rating || "", availability: own.availability || "",
        topics: (own.topics || []).slice(), reason: own.reason || "", note: own.note || "", error: null
      };
      Page.projector.scheduleRender();
      return false;
    }

    handleClose() {
      this.dialog = null;
      Page.projector.scheduleRender();
      return false;
    }

    handleField(e) {
      if (!this.dialog || this.saving) return;
      this.dialog[e.currentTarget.getAttribute("data-field")] = e.currentTarget.value;
    }

    handleTopic(e) {
      if (!this.dialog || this.saving) return;
      var topic = e.currentTarget.getAttribute("data-topic");
      var topics = this.dialog.topics.filter((item) => item !== topic);
      if (e.currentTarget.checked) topics.push(topic);
      this.dialog.topics = topics;
    }

    canReview() {
      return !!(Page.user && Page.user.hub && HubCommunity.currentIdentity());
    }

    submit(clear) {
      var dialog = this.dialog;
      if (!dialog || this.saving || !this.canReview()) return false;
      if (dialog.identity !== this.identity()) {
        dialog.error = _("Your account changed. Close this panel and open it again before submitting.");
        Page.projector.scheduleRender();
        return false;
      }
      this.saving = true;
      dialog.error = null;
      var done = (result) => {
        this.saving = false;
        Page.projector.scheduleRender();
        if (this.dialog !== dialog) return;
        if (result !== "ok") {
          dialog.error = (result && result.error) || _("Your review could not be published. Please retry.");
          Page.projector.scheduleRender();
          return;
        }
        this.dialog = null;
        this.owner.update();
      };
      if (clear) HubCommunity.clearReview(dialog.address, done);
      else HubCommunity.saveReview(dialog.address, {
        rating: dialog.rating || null, availability: dialog.availability || null, topics: dialog.topics.slice(),
        reason: dialog.reason || null, note: dialog.note.trim()
      }, done);
      Page.projector.scheduleRender();
      return false;
    }

    handleSave() { return this.submit(false); }
    handleClear() { return this.submit(true); }

    renderFilters() {
      var prefs = this.preferences();
      var filters = Object.assign({adult: "Adult", mature: "Mature", unavailable: "Reported unavailable"}, HubCommunity.TOPICS, HubCommunity.REASONS);
      return h("section.hub-community-filters", {key: "community-filters", "aria-label": _("Hub discovery filters")}, [
        h("h2", _("Choose what you download")),
        h("p", {key: "filter-intro"}, _("Hide hubs with these community labels. Browsing their reports does not download those hubs.")),
        h("div.hub-filter-options", Object.keys(filters).map((key) => h("label.hub-filter", {key: key}, [
          h("input", {type: "checkbox", checked: !!prefs[key], "data-filter": key, onchange: this.handleFilter}),
          h("span", _(filters[key]))
        ]))),
        h("p.hub-community-note", _("Reports come from hubs you already seed. They are community observations, not guarantees of safety or availability. Unrated hubs may contain any content.")),
        HubCommunity.warning ? h("p.hub-community-error", {key: "provenance-warning", role: "status"}, HubCommunity.warning) : void 0,
        this.error ? h("p.hub-community-error", {key: "load-error", role: "alert"}, [this.error, " ", h("button.button.button-small", {type: "button", onclick: this.handleReload}, _("Retry reports"))]) : void 0,
        !this.loaded && !this.error ? h("p", {key: "loading", role: "status"}, _("Loading community reports...")) : void 0
      ]);
    }

    renderSummary(address) {
      var s = HubCommunity.getSummary(address);
      var chips = [];
      chips.push(h("span.hub-badge", {key: "rating", classes: {"badge-warning": s.rating === "a" || s.rating === "m", "badge-unrated": !s.rating}}, s.rating ? _("Reported rating:") + " " + _(HubCommunity.RATINGS[s.rating]) : _("Unrated")));
      if (s.availability_counts.unavailable) chips.push(h("span.hub-badge.badge-warning", {key: "unavailable"}, _("Reported unavailable") + " · " + s.availability_counts.unavailable));
      if (s.availability_counts.available) chips.push(h("span.hub-badge", {key: "available"}, _("Reported available") + " · " + s.availability_counts.available));
      s.topics.forEach((topic) => chips.push(h("span.hub-badge", {key: "topic-" + topic}, _(HubCommunity.TOPICS[topic]) + " · " + s.topic_counts[topic])));
      Object.keys(s.reason_counts).forEach((reason) => {
        if (s.reason_counts[reason]) chips.push(h("span.hub-badge.badge-warning", {key: "reason-" + reason}, _(HubCommunity.REASONS[reason]) + " · " + s.reason_counts[reason]));
      });
      var reasons = this.reasons(address);
      var seeded = Page.merged_sites && Page.merged_sites[address];
      var download = Page.getHubDownload(address);
      var needsDownload = !seeded || !Page.isHubReady(seeded) || download.state === "unavailable" || download.state === "error";
      return h("div.hub-community", {key: "community-" + address}, [
        h("div.hub-badges", chips),
        s.availability === "mixed" ? h("p.hub-community-note", {key: "mixed"}, _("Availability reports disagree. A report does not prove that every peer is offline.")) : void 0,
        s.stale_availability_count ? h("p.hub-community-note", {key: "stale"}, _("Older availability reports are shown in the evidence but no longer affect filters.")) : void 0,
        reasons.length ? h("p.hub-community-note", {key: "filtered"}, _("Filtered:") + " " + reasons.join(", ") + (seeded ? ". " + _("Already downloaded. Use Stop seeding or Leave hub to manage it.") : "")) : void 0,
        h("div.hub-community-actions", [
          h("button.button.button-small", {key: "review", type: "button", address: address, onclick: this.handleReview}, _("Reports & rating") + " (" + s.review_count + ")"),
          h("button.button.button-small", {key: "hide", type: "button", address: address, onclick: this.handleHide}, this.hidden()[address] ? _("Unhide hub") : _("Hide hub")),
          needsDownload && reasons.length && this.loaded ? h("button.button.button-small", {key: "override", type: "button", address: address, onclick: this.handleOverride}, _("Download anyway")) : void 0
        ])
      ]);
    }

    renderFiltered(count) {
      if (!count) return void 0;
      return h("div.hub-filtered-count", {key: "filtered-count"}, [
        h("span", count + " " + _("hubs match your filters.")), " ",
        h("button.button.button-small", {type: "button", onclick: this.handleShowFiltered}, this.show_filtered ? _("Hide filtered hubs") : _("Show filtered hubs"))
      ]);
    }

    select(field, title, options) {
      return h("label.hub-review-field", {key: field}, [
        h("span", title),
        h("select.text", {value: this.dialog[field], "data-field": field, onchange: this.handleField, disabled: this.saving},
          Object.keys(options).map((value) => h("option", {key: value, value: value}, _(options[value]))))
      ]);
    }

    renderDialog() {
      var d = this.dialog;
      if (!d) return void 0;
      var s = HubCommunity.getSummary(d.address);
      var canReview = this.canReview();
      return h("div.composer-scrim.hub-review-scrim", {key: "hub-review"}, [
        h("section.composer-modal.hub-review-modal", {role: "dialog", "aria-modal": "true", "aria-labelledby": "hub-review-title"}, [
          h("div.composer-head", [h("h2#hub-review-title", _("Hub reports & rating")), h("button.button.button-small", {type: "button", onclick: this.handleClose}, _("Close"))]),
          h("p.hub-review-address", d.address),
          h("p.hub-community-note", {key: "review-explanation"}, _("Reviews are public under your xID and saved on a hub you already joined. Reporting a hub does not download it. Availability reports affect filters for 30 days.")),
          h("div.hub-evidence", s.evidence.length ? s.evidence.slice(0, 50).map((row) => h("article.hub-evidence-row", {key: row.identity}, [
            h("strong", row.identity),
            h("span.hub-community-note", " · " + Time.since(row.date_added)),
            h("div", {key: "classification"}, [row.rating ? _(HubCommunity.RATINGS[row.rating]) : _("No content rating"), " · ",
              row.availability ? (row.availability === "unavailable" ? _("Reported unavailable") : _("Reported available")) + (row.availability_stale ? " (" + _("older than 30 days") + ")" : "") : _("No availability report")].join("")),
            row.topics.length ? h("div", {key: "topics"}, row.topics.map((topic) => _(HubCommunity.TOPICS[topic])).join(", ")) : void 0,
            row.reason ? h("div", {key: "reason"}, _(HubCommunity.REASONS[row.reason])) : void 0,
            row.note ? h("p", row.note) : void 0
          ])) : [h("p", {key: "empty"}, _("No community reviews are available from the hubs you seed."))]),
          s.evidence.length > 50 ? h("p.hub-community-note", {key: "review-overflow"}, _("Showing the latest 50 reviews.")) : void 0,
          canReview ? h("div.hub-review-form", [
            this.select("rating", _("Content rating"), Object.assign({"": "No rating"}, HubCommunity.RATINGS)),
            this.select("availability", _("Your availability observation"), {"": "No observation", available: "Available when I tried", unavailable: "Unavailable when I tried"}),
            h("fieldset.hub-review-topics", [h("legend", _("Content topics")), Object.keys(HubCommunity.TOPICS).map((topic) => h("label.hub-filter", {key: topic}, [
              h("input", {type: "checkbox", "data-topic": topic, checked: d.topics.indexOf(topic) >= 0, onchange: this.handleTopic, disabled: this.saving}), h("span", _(HubCommunity.TOPICS[topic]))
            ]))]),
            this.select("reason", _("Report a problem"), Object.assign({"": "No problem report"}, HubCommunity.REASONS)),
            h("label.hub-review-field", {key: "note"}, [h("span", _("Public note (optional)")), h("textarea.text", {value: d.note, "data-field": "note", maxlength: 280, oninput: this.handleField, disabled: this.saving})]),
            d.error ? h("p.hub-community-error", {role: "alert"}, d.error) : void 0,
            h("div.hub-community-actions", [
              h("button.button.button-submit", {type: "button", onclick: this.handleSave, disabled: this.saving}, this.saving ? _("Publishing...") : _("Publish review")),
              HubCommunity.getOwnReview(d.address) ? h("button.button", {type: "button", onclick: this.handleClear, disabled: this.saving}, _("Withdraw my review")) : void 0
            ])
          ]) : h("p.hub-community-note", {key: "review-signin"}, _("Choose an xID and join a hub to publish a review. You can read reports and use personal filters without an account."))
        ])
      ]);
    }
  }
  window.HubCommunityView = HubCommunityView;
})();
