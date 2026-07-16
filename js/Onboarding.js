(function() {

  // Setup card rendered by ContentFeed above the timeline until the visitor
  // has everything needed to post: the Merger permission, an account
  // certificate and a profile on a hub. State is derived fresh on every
  // render, so the card reacts to siteInfo pushes without any reload.
  class Onboarding {
    constructor() {
      this.getState = this.getState.bind(this);
      this.isHubConnected = this.isHubConnected.bind(this);
      this.handleCtaClick = this.handleCtaClick.bind(this);
      this.handleXidInfoClick = this.handleXidInfoClick.bind(this);
      this.renderStep = this.renderStep.bind(this);
      this.render = this.render.bind(this);
    }

    // Setup state machine:
    //  step 1: "Merger:EpixPost" permission not granted yet
    //  step 2: permission ok, but no certificate selected
    //  step 3: certificate ok, but no profile on any hub
    //  step 4: everything ready, the card renders nothing
    getState() {
      if (!Page.site_info || !Page.site_info.settings) {
        return null;
      }
      var state = {};
      state.perm = Page.site_info.settings.permissions.indexOf("Merger:EpixPost") >= 0;
      state.cert = Page.site_info.cert_user_id;
      state.cert_is_xid = state.cert ? /@xid$/.test(state.cert) : false;
      state.profile = (Page.user != null ? Page.user.hub : void 0) ? true : false;
      state.hub_connected = this.isHubConnected();
      if (!state.perm) {
        state.step = 1;
      } else if (!state.cert) {
        state.step = 2;
      } else if (!state.profile) {
        state.step = 3;
      } else {
        state.step = 4;
      }
      return state;
    }

    // True when at least one default hub is already merged. When no default
    // hub is configured there is nothing to wait for, so it counts as ready.
    isHubConnected() {
      var ref = Page.site_info.content;
      var default_hubs = (ref != null ? (ref.settings != null ? ref.settings.default_hubs : void 0) : void 0) || {};
      var has_default = false;
      for (var address in default_hubs) {
        has_default = true;
        if (Page.merged_sites[address]) {
          return true;
        }
      }
      return !has_default;
    }

    // Background work the user only has to wait for; shown as a spinner row.
    getStatus(state) {
      if (state.perm && !state.hub_connected) {
        return _("Connecting to Epix Post Hub...");
      }
      if (state.step === 3 && state.cert_is_xid) {
        // checkUser() -> autoCreateXidProfile() is creating the profile
        return _("Creating your profile...");
      }
      return null;
    }

    // One stable handler for the primary CTA (maquette requires the handler
    // identity to stay the same between renders), branching at click time.
    handleCtaClick() {
      var state = this.getState();
      if (!state) {
        return false;
      }
      if (!state.perm) {
        Page.cmd("wrapperPermissionAdd", "Merger:EpixPost", () => {
          // Always re-query: older nodes do not push siteInfo on grant
          Page.updateSiteInfo(() => {
            if (Page.site_info.cert_user_id && !(Page.user != null ? Page.user.hub : void 0)) {
              // A certificate was selected before the grant: re-run the user
              // check so xID profiles get auto-created on the fresh hub data
              Page.checkUser(() => {
                Page.content.update();
              });
            } else {
              Page.content.update();
            }
          });
        });
      } else if (!state.cert) {
        Page.cmd("certXid", {});
      } else if (!state.profile && !state.cert_is_xid) {
        Page.setUrl("?Create+profile");
      }
      return false;
    }

    handleXidInfoClick() {
      Page.cmd("wrapperOpenWindow", ["/" + Page.xid_site + "/"]);
      return false;
    }

    renderStep(num, title, state) {
      return h("div.onboarding-step", {
        key: "step-" + num,
        classes: {
          done: num < state.step,
          active: num === state.step,
          pending: num > state.step
        }
      }, [
        h("span.onboarding-step-marker", num < state.step ? "✓" : String(num)),
        h("span.onboarding-step-title", title)
      ]);
    }

    render() {
      var state = this.getState();
      if (!state || state.step === 4) {
        return null;
      }
      var status = this.getStatus(state);
      var show_cta = !(state.step === 3 && state.cert_is_xid);
      return h("div.onboarding", [
        h("div.onboarding-head", [
          h("img.onboarding-logo", {src: "img/logo.svg", alt: ""}),
          h("h2.onboarding-title", _("Welcome to Epix Post"))
        ]),
        h("p.onboarding-intro", [
          _("Epix Post is a decentralized social network with no central server."), " ",
          _("Your posts live on hubs: shared sites that you and other users seed together.")
        ]),
        h("div.onboarding-steps", [
          this.renderStep(1, _("Enable data merging"), state),
          this.renderStep(2, _("Choose your xID"), state),
          this.renderStep(3, _("Create profile"), state)
        ]),
        status ? h("div.onboarding-status", [
          h("span.spinner"),
          h("span.onboarding-status-text", status)
        ]) : void 0,
        h("div.onboarding-actions", [
          show_cta ? h("a.button.button-submit.onboarding-cta", {
            key: "cta",
            href: "#Get+started",
            onclick: this.handleCtaClick
          }, _("Get started")) : void 0,
          state.step === 3 && !state.cert_is_xid ? h("a.link.onboarding-link", {
            key: "create-profile",
            href: "?Create+profile",
            onclick: Page.handleLinkClick
          }, _("Create profile")) : void 0,
          h("a.link.onboarding-link", {
            key: "xid-info",
            href: "#What+is+an+xID",
            onclick: this.handleXidInfoClick
          }, _("What is an xID?"))
        ])
      ]);
    }
  }

  Object.assign(Onboarding.prototype, LogMixin);
  window.Onboarding = Onboarding;

})();
