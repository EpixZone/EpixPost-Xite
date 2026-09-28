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
  const calls = [], timers = [], errors = [];
  let now = Date.now();
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
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn, delay) { timers.push({ fn, delay }); return timers.length; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    requestAnimationFrame(fn) { return 0; },
    console: { ...console, error: (...args) => errors.push(args) },
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
  const thread = () => {
    base.Page = Page;
    base.LogMixin = { log() {} };
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/ContentThread.js"), "utf8"), context);
    return new base.window.ContentThread();
  };
  return { Page, calls, timers, errors, answer, siteInfo, thread, advance: (ms) => { now += ms; } };
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

test("a default hub whose add is in flight is not asked for again", () => {
  const { Page, calls, answer, siteInfo, advance } = page();
  const adds = () => calls.filter((c) => c.cmd === "mergerSiteAdd").length;
  // Boot: the hub is not merged yet, so the page asks the node to add it.
  Page.updateSiteInfo();
  answer("mergerSiteList", {});
  answer("siteInfo", siteInfo());
  assert.equal(adds(), 1, "the first refresh adds the default hub");
  assert.equal(Page.hubAddInFlight(HUB), true);

  // Each hub file landing re-runs the refresh; the hub is still not listed.
  for (let i = 0; i < 3; i++) {
    Page.updateSiteInfo();
    answer("mergerSiteList", {});
    answer("siteInfo", siteInfo());
  }
  assert.equal(adds(), 1, "an add in flight is not repeated");
  assert.equal(Page.needSite(HUB, () => {}), undefined);
  assert.equal(adds(), 1, "needSite does not repeat it either");

  // The node reports the add finished: the in-flight state ends, and the
  // refresh that follows must not immediately re-add a failed hub.
  Page.noteHubProgress({ address: HUB, event: ["site_done", HUB] });
  assert.equal(Page.hubAddInFlight(HUB), true, "the completed attempt gets a short cooldown");
  answer("mergerSiteList", {});
  answer("siteInfo", siteInfo());
  assert.equal(adds(), 1, "the completion refresh does not loop on a missing hub");
  advance(30001);
  Page.updateSiteInfo();
  answer("mergerSiteList", {});
  answer("siteInfo", siteInfo());
  assert.equal(adds(), 2, "a later refresh can retry the missing hub");
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



// The hub sync banner. Peers hint a hub about once a minute; a pass that
// lands nothing must not keep the bar up past one wait window in total.
function hubEvent(kind, extra) {
  return Object.assign({ address: HUB, event: [kind, "data/users/x.epix/data.json"], peers: 3 }, extra || {});
}

test("a pass that starts and lands nothing keeps the bar up for one wait window only", () => {
  const { Page } = page();
  Page.noteHubProgress(hubEvent("file_added"));
  assert.equal(Page.hubSyncActive(), true, "a starting pass shows the bar");
  assert.equal(Page.hubSyncWindow(), Page.HUB_SYNC_WAIT);
  // Another hint-driven pass starts after the wait window with nothing landed.
  Page.hub_sync.dialing_since = Date.now() - Page.HUB_SYNC_WAIT - 1000;
  Page.noteHubProgress(hubEvent("file_added"));
  assert.equal(Page.hubSyncWindow(), 0, "the silence is measured from the first idle pass");
  assert.equal(Page.hubSyncActive(), false, "the bar comes down");
});

test("a file landing resets the idle measurement", () => {
  const { Page } = page();
  Page.noteHubProgress(hubEvent("file_added"));
  Page.hub_sync.dialing_since = Date.now() - Page.HUB_SYNC_WAIT - 1000;
  Page.noteHubProgress(hubEvent("file_done", { started_task_num: 4, tasks: 3 }));
  assert.equal(Page.hub_sync.dialing_since, null);
  assert.equal(Page.hub_sync.files, 1);
  assert.equal(Page.hubSyncActive(), true, "a live download stays up");
  Page.noteHubProgress(hubEvent("file_added"));
  assert.equal(Page.hubSyncWindow(), Page.HUB_SYNC_WAIT, "a fresh pass after a landing waits again");
});

test("a failed file ends the dialing state so the short idle window applies", () => {
  const { Page } = page();
  Page.noteHubProgress(hubEvent("file_added"));
  assert.equal(Page.hubSyncWindow(), Page.HUB_SYNC_WAIT);
  Page.noteHubProgress(hubEvent("file_failed"));
  assert.equal(Page.hub_sync.dialing, false);
  assert.equal(Page.hubSyncWindow(), Page.HUB_SYNC_IDLE);
});


test("null and malformed hub targets never reach the node", () => {
  const { Page, calls } = page();
  const results = [];
  for (const target of [null, "null", undefined, "undefined", "", {}, [], [HUB, null], [[HUB, "null"]]]) {
    Page.cmd("mergerSiteAdd", target, (result) => results.push(result));
  }
  assert.equal(calls.filter((call) => call.cmd === "mergerSiteAdd").length, 0);
  assert.equal(results.length, 9, "every caller receives a result");
  assert.ok(results.every((result) => result && result.error));
});

test("13 rapid hub downloads share one real response", () => {
  const { Page, calls, answer } = page();
  const results = [];
  for (let i = 0; i < 13; i++) Page.cmd("mergerSiteAdd", HUB, (result) => results.push(result));
  assert.equal(calls.filter((call) => call.cmd === "mergerSiteAdd").length, 1);
  assert.equal(results.length, 0, "a duplicate must not pretend the node already answered");
  answer("mergerSiteAdd", "ok");
  assert.deepEqual(results, Array(13).fill("ok"));
  Page.cmd("mergerSiteAdd", HUB, (result) => results.push(result));
  assert.equal(calls.filter((call) => call.cmd === "mergerSiteAdd").length, 1);
  assert.equal(results.length, 14, "later callers receive the same accepted response");
});

test("each hub remains deduplicated when downloads overlap", () => {
  const { Page, calls } = page();
  const other = "epix1otherhub";
  for (let i = 0; i < 13; i++) {
    Page.cmd("mergerSiteAdd", i % 2 ? HUB : other, () => {});
  }
  assert.equal(calls.filter((call) => call.cmd === "mergerSiteAdd").length, 2);
  assert.equal(Page.hubAddInFlight(HUB), true);
  assert.equal(Page.hubAddInFlight(other), true);
});

test("overlapping array requests add each hub once and preserve errors", () => {
  const { Page, calls, answer } = page();
  const other = "epix1otherhub";
  const results = [];
  Page.cmd("mergerSiteAdd", [HUB, HUB], (result) => results.push(result));
  Page.cmd("mergerSiteAdd", [[HUB, other]], (result) => results.push(result));
  const adds = calls.filter((call) => call.cmd === "mergerSiteAdd");
  assert.equal(adds.length, 2);
  assert.equal(adds[0].params, HUB);
  assert.equal(adds[1].params, other);
  answer("mergerSiteAdd", "ok");
  assert.deepEqual(results, ["ok"]);
  const failure = { error: "Permission denied" };
  answer("mergerSiteAdd", failure);
  assert.equal(results[1], failure);
});

test("an add error is shared during a cooldown and can then be retried", () => {
  const { Page, calls, answer, advance } = page();
  const results = [];
  Page.cmd("mergerSiteAdd", HUB, (result) => results.push(result));
  const failure = { error: "Not a merger xite" };
  answer("mergerSiteAdd", failure);
  for (let i = 0; i < 12; i++) Page.cmd("mergerSiteAdd", HUB, (result) => results.push(result));
  assert.equal(calls.filter((call) => call.cmd === "mergerSiteAdd").length, 1);
  assert.equal(results.length, 13);
  assert.ok(results.every((result) => result === failure));
  assert.equal(Page.hubSyncActive(), false, "a rejected command does not leave the download banner active");
  advance(30001);
  Page.cmd("mergerSiteAdd", HUB, () => {});
  assert.equal(calls.filter((call) => call.cmd === "mergerSiteAdd").length, 2);
});

test("a missing completion event eventually permits another attempt", () => {
  const { Page, calls, answer, advance } = page();
  Page.cmd("mergerSiteAdd", HUB, () => {});
  answer("mergerSiteAdd", "ok");
  advance(Page.HUB_SYNC_MAX + 1);
  Page.cmd("mergerSiteAdd", HUB, () => {});
  assert.equal(calls.filter((call) => call.cmd === "mergerSiteAdd").length, 2);
});

test("Promise callers share the accepted result and reject the real error", async () => {
  const { Page, calls, answer } = page();
  const first = Page.cmd("mergerSiteAdd", HUB);
  const second = Page.cmd("mergerSiteAdd", HUB);
  assert.ok(first && typeof first.then === "function");
  assert.equal(calls.filter((call) => call.cmd === "mergerSiteAdd").length, 1);
  answer("mergerSiteAdd", "ok");
  assert.deepEqual(await Promise.all([first, second]), ["ok", "ok"]);
  const other = Page.cmd("mergerSiteAdd", "epix1otherhub");
  const failure = { error: "Permission denied" };
  answer("mergerSiteAdd", failure);
  await assert.rejects(other, (error) => error === failure);
  await assert.rejects(Page.cmd("mergerSiteAdd", "null"), (error) => !!error.error);
});


test("a new multi-hub batch keeps the positional list wire format", () => {
  const { Page, calls, answer } = page();
  const targets = [HUB, "epix1otherhub"];
  let result;
  Page.cmd("mergerSiteAdd", targets, (value) => { result = value; });
  const add = calls.find((call) => call.cmd === "mergerSiteAdd");
  assert.deepEqual(JSON.parse(JSON.stringify(add.params)), [targets]);
  answer("mergerSiteAdd", "ok");
  assert.equal(result, "ok");
});

test("the callback-only overload reports missing addresses to its callback", () => {
  const { Page, calls } = page();
  let result;
  const returned = Page.cmd("mergerSiteAdd", (value) => { result = value; });
  assert.equal(returned, undefined);
  assert.ok(result && result.error);
  assert.equal(calls.filter((call) => call.cmd === "mergerSiteAdd").length, 0);
});

test("removing a hub permits an immediate explicit re-add", () => {
  const { Page, calls, answer } = page();
  Page.cmd("mergerSiteAdd", HUB, () => {});
  answer("mergerSiteAdd", "ok");
  Page.cmd("mergerSiteDelete", HUB, () => {});
  answer("mergerSiteDelete", "ok");
  Page.cmd("mergerSiteAdd", HUB, () => {});
  assert.equal(calls.filter((call) => call.cmd === "mergerSiteAdd").length, 2);
});

test("expired hub attempts are removed when another add starts", () => {
  const { Page, answer, advance } = page();
  Page.cmd("mergerSiteAdd", HUB, () => {});
  answer("mergerSiteAdd", "ok");
  advance(Page.HUB_SYNC_MAX + 1);
  Page.cmd("mergerSiteAdd", "epix1otherhub", () => {});
  assert.equal(Page.hub_adds.size, 1);
  assert.equal(Page.hub_adds.has(HUB), false);
});

test("fire-and-forget automatic adds consume command errors", () => {
  const { Page, answer, siteInfo } = page();
  Page.updateSiteInfo();
  answer("mergerSiteList", {});
  answer("siteInfo", siteInfo());
  answer("mergerSiteAdd", { error: "Not a merger xite" });
  assert.equal(Page.hubSyncActive(), false);
  assert.equal(Page.needSite("null"), undefined);
});


test("repeated downloads from a null-hub thread do not send invalid adds", () => {
  const { calls, thread } = page();
  const content = thread();
  content.hub = "null";
  for (let i = 0; i < 13; i++) content.handleDownloadClick();
  assert.equal(calls.filter((call) => call.cmd === "mergerSiteAdd").length, 0);
});


test("one throwing add callback cannot strand other subscribers", async () => {
  const { Page, answer, errors } = page();
  const failure = new Error("Broken subscriber");
  let received;
  Page.cmd("mergerSiteAdd", HUB, () => { throw failure; });
  Page.cmd("mergerSiteAdd", HUB, (result) => { received = result; });
  const pending = Page.cmd("mergerSiteAdd", HUB);
  assert.doesNotThrow(() => answer("mergerSiteAdd", "ok"));
  assert.equal(received, "ok");
  assert.equal(await pending, "ok");
  assert.equal(errors.length, 1, "the subscriber error is still reported");
  assert.equal(errors[0][1], failure);
});

test("a completed hub refreshes the feed while another hub keeps its banner", () => {
  const { Page, calls, answer, siteInfo } = page();
  const other = "epix1otherhub";
  Page.cmd("mergerSiteAdd", HUB, () => {});
  Page.cmd("mergerSiteAdd", other, () => {});
  answer("mergerSiteAdd", "ok");
  answer("mergerSiteAdd", "ok");
  const banner = Page.hub_sync;
  const bannerTimer = Page.hub_sync_timer;
  let updates = 0;
  Page.content = { update() { updates++; } };
  Page.noteHubProgress({ address: HUB, event: ["site_done", HUB] });
  assert.equal(calls.filter((call) => call.cmd === "mergerSiteList").length, 1);
  answer("mergerSiteList", { [HUB]: {}, [other]: {} });
  answer("siteInfo", siteInfo());
  assert.equal(updates, 1, "completed hub records become visible");
  assert.equal(Page.hub_sync, banner);
  assert.equal(Page.hub_sync.address, other);
  assert.equal(Page.hub_sync_timer, bannerTimer);
  assert.equal(Page.hubSyncActive(), true);
});
