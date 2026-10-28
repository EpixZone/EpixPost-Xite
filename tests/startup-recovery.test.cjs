const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// The current node wrapper (EpixNet 2fd8b7c, ui/media/all.js) sends an
// open notification on innerReady only if !wrapperWsInited. That flag can
// stay true when the iframe is recreated while the wrapper remains alive.
function fixture({ announced = true, connected = true, languageReady = true, serverReady = true } = {}) {
  const messages = [], calls = [], timers = [], listeners = [], languageCallbacks = [], queuedReads = [];
  const classes = new Set(), loading = { textContent: "Connecting..." };
  let languageLoads = 0, siteUpdates = 0, contentUpdates = 0;
  const context = {
    console: { log() {} },
    location: { href: "http://post.epix/index.html?wrapper_nonce=test", pathname: "/index.html" },
    document: { location: { href: "http://post.epix/index.html?wrapper_nonce=test", host: "post.epix" },
      documentElement: {}, body: { classList: { add: value => classes.add(value) } },
      getElementById(id) { return id === "loading-step" ? loading : null; } },
    base: { href: "http://post.epix/" },
    addEventListener(event, cb) { if (event === "message") listeners.push(cb); },
    parent: { postMessage(message) { calls.push(message.cmd); messages.push(message); } },
    Time: { timestamp: () => 100 }, _: value => value,
    marked: { Renderer: class {} },
    setTimeout(fn, delay) { const timer = { fn, delay }; timers.push(timer); return timer; },
    setInterval() {}, clearTimeout() {},
    requestAnimationFrame(cb) { cb(); },
    $() { return {}; }, scroll() {},
    loadLanguage(language, cb) {
      languageLoads++;
      if (languageReady) cb(); else languageCallbacks.push(cb);
    },
    maquette: {
      h() {},
      createProjector() {
        return { detach() {}, replace(target, render) { render(); },
          scheduleRender() { context.Page.content.render(); } };
      }
    }
  };
  context.window = context;
  class View {
    constructor() {
      this.render = () => {
        const page = context.Page;
        if (page.on_user_info.resolved && !page.on_loaded.resolved) page.on_loaded.resolve();
      };
    }
    update() { contentUpdates++; context.Page.projector.scheduleRender(); }
  }
  for (const name of ["Shell", "Overlay", "ContentFeed", "ContentUsers", "ContentProfile", "ContentThread",
    "ContentCreateProfile", "ContentHubs", "ContentSettings", "Scrollwatcher"]) context[name] = View;
  vm.createContext(context);
  for (const file of ["lib/epixframe.js", "utils/Deferred.js", "utils/Text.js"]) {
    require("./helpers/removal-fixture.cjs")(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", file), "utf8"), context);
  }
  const source = fs.readFileSync(path.join(__dirname, "../js/EpixPost.js"), "utf8");
  vm.runInContext(source.replace("window.Page = new EpixPost();", "window.EpixPost = EpixPost;")
    .replace("window.Page.createProjector();", ""), context);
  // Account and feed data are outside this startup test. Retain the real
  // constructor, frame connection, startup methods, deferreds and projector setup.
  context.EpixPost.prototype.checkUser = callback => callback();
  context.EpixPost.prototype.updateSiteInfo = function (callback) {
    siteUpdates++;
    this.cmd("siteInfo", {}, info => {
      this.site_info = info;
      this.on_site_info.resolve();
      if (callback) callback();
    });
  };
  const page = context.Page = new context.EpixPost();
  page.createProjector();
  function deliver(data) { listeners.forEach(listener => listener({ data })); }
  function answer(message, result) { deliver({ cmd: "response", to: message.id, result }); }
  const heldServer = [];
  function drain() {
    let remaining = 100;
    while (messages.length && remaining--) {
      const message = messages.shift();
      if (!connected && (message.cmd === "serverInfo" || message.cmd === "siteInfo")) {
        queuedReads.push(message);
        continue;
      }
      if (message.cmd === "innerReady") {
        if (connected && !announced) { announced = true; deliver({ cmd: "wrapperOpenedWebsocket" }); }
      } else if (message.cmd === "wrapperGetState") answer(message, null);
      else if (message.cmd === "serverInfo") {
        if (serverReady) answer(message, { user_settings: { language: "en" } });
        else heldServer.push(message);
      } else if (message.cmd === "siteInfo") answer(message, { settings: { permissions: ["Merger:EpixPost"] } });
      else if (message.cmd === "wrapperGetLocalStorage") answer(message, {});
    }
    assert.ok(remaining > 0, "startup must not enqueue an unbounded command loop");
  }
  return { page, calls, classes, loading, timers, drain,
    open() { deliver({ cmd: "wrapperOpenedWebsocket" }); },
    connect() {
      connected = true;
      messages.push(...queuedReads.splice(0));
      if (!announced) { announced = true; deliver({ cmd: "wrapperOpenedWebsocket" }); }
    },
    finishLanguage() { languageCallbacks.splice(0).forEach(callback => callback()); },
    finishServer() { heldServer.splice(0).forEach(message => answer(message, { user_settings: { language: "en" } })); },
    get languageLoads() { return languageLoads; }, get siteUpdates() { return siteUpdates; },
    get contentUpdates() { return contentUpdates; } };
}

test("a fresh iframe boots when its connected wrapper does not repeat the open notification", () => {
  const f = fixture();
  f.drain();
  assert.equal(f.loading.textContent, "Ready!", "the recreated iframe must not remain at Connecting...");
  assert.equal(f.page.content_started, true);
  assert.ok(f.classes.has("loaded"));
  assert.equal(f.languageLoads, 1);
  assert.equal(f.siteUpdates, 1);
});

test("normal startup and duplicate open events request server info and language only once", () => {
  const f = fixture({ announced: false, languageReady: false });
  f.drain();
  f.open();
  f.drain();
  assert.equal(f.calls.filter(command => command === "serverInfo").length, 1);
  assert.equal(f.languageLoads, 1);
  assert.equal(f.page.content_started, false, "wait for the initial language load");
  f.finishLanguage();
  f.drain();
  assert.equal(f.siteUpdates, 1);
  assert.ok(f.classes.has("loaded"));
});

test("a real reconnect refreshes current data without loading language again", () => {
  const f = fixture({ announced: false });
  f.drain();
  const initialUpdates = f.siteUpdates;
  f.open();
  f.drain();
  assert.equal(f.siteUpdates, initialUpdates + 1);
  assert.equal(f.contentUpdates, 1);
  assert.equal(f.languageLoads, 1);
});

test("startup reads wait for a delayed connection and do not duplicate when it opens", () => {
  const f = fixture({ announced: false, connected: false });
  f.drain();
  assert.equal(f.page.content_started, false);
  assert.equal(f.languageLoads, 0);
  f.connect();
  f.drain();
  assert.equal(f.calls.filter(command => command === "serverInfo").length, 1);
  assert.equal(f.languageLoads, 1);
  assert.equal(f.siteUpdates, 1);
  assert.ok(f.classes.has("loaded"));
});

test("the existing startup fallback and a late server reply cannot start content twice", () => {
  const f = fixture({ serverReady: false });
  f.drain();
  assert.equal(f.siteUpdates, 0);
  const fallbacks = f.timers.filter(timer => timer.delay === 5000);
  assert.equal(fallbacks.length, 1, "projector readiness starts the existing bounded fallback");
  fallbacks[0].fn();
  f.drain();
  assert.ok(f.classes.has("loaded"));
  f.finishServer();
  f.drain();
  assert.equal(f.siteUpdates, 1);
  assert.equal(f.languageLoads, 1);
});
