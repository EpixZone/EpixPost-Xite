const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const HUB = "epix12fdtj0j77kltvdw2eqfzw392mr34r2al22mqrf";

// Load EpixPost.js with a recording EpixFrame and stub components. Every
// identifier the page reaches for that is not defined here resolves to a
// stub class, so construction succeeds without the real UI.
function page() {
  const calls = [], timers = [];
  class Deferred {
    constructor() { this.done = false; this.cbs = []; }
    then(cb) { if (this.done) cb(); else this.cbs.push(cb); return this; }
    resolve() { this.done = true; this.cbs.splice(0).forEach((cb) => cb()); }
  }
  // The frame base class: records every node command; any other frame
  // method the page calls (log, logStart, setLoadingProgress, ...) is a no-op.
  class EpixFrame {
    constructor() {
      const page = new Proxy(this, {
        get: (t, k) => (k in t || typeof k === "symbol" ? t[k] : () => undefined),
      });
      page.history_state = {};
      page.waiting_cb = {};
      if (typeof page.init === "function") page.init();
      return page;
    }
    cmd(cmd, params, cb) { calls.push({ cmd, params, cb }); }
  }
  // A value that is callable, constructible, and has any property (itself
  // another such value), so static helpers like Time.timestamp() and
  // component constructors both resolve during construction.
  const anything = () => new Proxy(function () {}, {
    get: (t, k) => {
      if (k === "prototype") return t.prototype;
      if (typeof k === "symbol" || k === "then") return undefined;
      return anything();
    },
    apply: () => anything(),
    construct: () => anything(),
    has: () => false,
  });
  const Stub = anything();
  const base = {
    window: { EpixFrame, innerHeight: 800, location: { search: "", hash: "" }, addEventListener() {} },
    document: { body: { classList: { add() {}, remove() {} } }, addEventListener() {}, querySelector: () => null, getElementById: () => null, documentElement: {} },
    maquette: { h: () => ({}), createProjector: () => Stub() },
    Deferred,
    setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    requestAnimationFrame(fn) { return 0; },
    console,
    _: (s) => s,
    loadLanguage: (lang, cb) => cb(),
    localStorage: { getItem: () => null, setItem() {} },
    // The page's <base id="base"> element, reached as a global by id.
    base: { href: "https://post.epix/index.html" },
    $: () => Stub(),
  };
  // Every component the page reaches for (`new Shell()`, `Time.timestamp()`)
  // gets a stub; JavaScript's own globals stay real.
  const source = fs.readFileSync(path.join(__dirname, "../js/EpixPost.js"), "utf8");
  for (const m of source.matchAll(/(?:^|[^A-Za-z0-9_$.])(?:new\s+)?([A-Z][A-Za-z0-9_]+)\s*[.(]/g)) {
    const name = m[1];
    if (!(name in base) && !(name in globalThis)) base[name] = Stub;
  }
  const context = vm.createContext(base);
  vm.runInContext(source, context);
  const Page = base.window.Page;
  Page.params = { urls: [""] };
  Page.local_storage = { settings: {} };
  Page.on_local_storage = new Deferred();
  Page.on_local_storage.resolve();
  const answer = (cmd, result) => {
    const call = calls.find((c) => c.cmd === cmd && !c.answered);
    assert.ok(call, `expected a pending ${cmd} call`);
    call.answered = true;
    call.cb(result);
  };
  const siteInfo = () => ({
    address: "epix1p0st",
    cert_user_id: "dice@xid.epix",
    settings: { permissions: ["Merger:EpixPost"] },
    content: { settings: { default_hubs: { [HUB]: { title: "Epix Post Hub" } } } },
  });
  return { Page, calls, timers, answer, siteInfo };
}

test("a hub list the node could not answer yet is retried, not stored", () => {
  const { Page, calls, timers, answer, siteInfo } = page();
  Page.updateSiteInfo();
  const scheduled = timers.length;
  // The boot race: the xite's content.json has not landed, so the node says
  // it is not a merger xite. That used to become the hub list for good.
  answer("mergerSiteList", { error: "Not a merger xite" });
  answer("siteInfo", siteInfo());
  assert.equal(Object.keys(Page.merged_sites).length, 0, "the error must not become the hub list");
  assert.equal(Page.merged_sites.error, undefined);
  assert.equal(timers.length, scheduled + 1, "a retry is scheduled");
  const retry = timers[timers.length - 1];
  assert.equal(retry.delay, 2000);

  retry.fn();
  answer("mergerSiteList", { [HUB]: { address: HUB, content: { title: "Epix Post Hub" } } });
  answer("siteInfo", siteInfo());
  assert.ok(Page.merged_sites[HUB], "the hub is listed once the node answers");
  assert.equal(Page.merged_sites_retry, null, "backoff resets on success");
  assert.equal(calls.filter((c) => c.cmd === "mergerSiteAdd").length, 0, "a listed hub is not re-added");
});

test("the backoff grows and caps while the node keeps refusing", () => {
  const { Page, timers, answer, siteInfo } = page();
  Page.updateSiteInfo();
  const delays = [];
  for (let round = 0; round < 6; round++) {
    answer("mergerSiteList", { error: "Not a merger xite" });
    answer("siteInfo", siteInfo());
    delays.push(timers[timers.length - 1].delay);
    timers[timers.length - 1].fn();
  }
  assert.deepEqual(delays, [2000, 4000, 8000, 15000, 15000, 15000]);
});

test("a reopened websocket refreshes the site info instead of doing nothing", () => {
  const { Page, calls, answer, siteInfo } = page();
  Page.onOpenWebsocket();
  answer("serverInfo", { user_settings: {} });
  answer("mergerSiteList", { [HUB]: { address: HUB } });
  answer("siteInfo", siteInfo());
  assert.equal(Page.content_started, true);
  const before = calls.length;

  // The node restarted: the wrapper reconnects and reopens the socket.
  Page.onOpenWebsocket();
  const after = calls.slice(before).map((c) => c.cmd);
  assert.ok(after.includes("mergerSiteList"), `reconnect must reload the hub list, got ${after}`);
  assert.ok(after.includes("siteInfo"));
  assert.ok(!after.includes("serverInfo"), "the boot path itself still runs once");
});


