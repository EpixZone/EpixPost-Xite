const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const HUB = "epix1fixturehub";
const OTHER = "epix1otherhub";
const complete = () => ({content: {merged_type: "EpixPost"}, bad_files: 0, tasks: 0});

function fixture() {
  const calls = [], timers = new Map();
  let now = 1000000, sequence = 0, refreshes = 0;
  class EpixFrame {
    cmd(name, params, cb) { calls.push({name, params, cb}); }
  }
  const context = vm.createContext({
    window: {EpixFrame}, maquette: {},
    Date: class extends Date { static now() { return now; } },
    Time: {timestamp: () => now / 1000}, _: value => value,
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, {fn, at: now + delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
    RateLimit(delay, cb) { cb(); },
    console,
  });
  require("./helpers/removal-fixture.cjs")(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/utils/Deferred.js"), "utf8"), context);
  context.Deferred = context.window.Deferred;
  let source = fs.readFileSync(path.join(__dirname, "../js/EpixPost.js"), "utf8");
  source = source.replace("window.Page = new EpixPost();", "window.EpixPost = EpixPost;").replace("window.Page.createProjector();", "");
  vm.runInContext(source, context);
  const Page = Object.create(context.window.EpixPost.prototype);
  Page.init();
  Object.assign(Page, {
    address: "epix1app", local_storage: {settings: {}},
    content_hubs: {canDownload: () => true}, projector: {scheduleRender() {}},
    content: {update() {}}, log() {}, logStart() {}, logEnd() {},
    updateSiteInfo(cb) { refreshes++; if (cb) cb(true); },
  });
  const take = name => {
    const call = calls.find(call => call.name === name && !call.taken);
    assert.ok(call, `Expected pending ${name}`);
    call.taken = true;
    return call;
  };
  const advance = elapsed => {
    const target = now + elapsed;
    for (let count = 0; count < 10000; count++) {
      let next;
      for (const [id, timer] of timers) if (timer.at <= target && (!next || timer.at < next[1].at)) next = [id, timer];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    now = target;
  };
  const done = address => Page.noteHubProgress({address, event: ["site_done", address]});
  const ack = (result = "ok") => take("mergerSiteAdd").cb(result);
  return {Page, calls, take, advance, done, ack, refreshes: () => refreshes};
}

test("acceptance is downloading, and site_done without a copy is unavailable", () => {
  const {Page, ack, done, take} = fixture();
  assert.equal(Page.getHubDownload(HUB).state, "idle");
  Page.needSite(HUB);
  assert.equal(Page.getHubDownload(HUB).state, "requesting");
  ack();
  assert.equal(Page.getHubDownload(HUB).state, "downloading");
  done(HUB);
  assert.equal(Page.getHubDownload(HUB).state, "downloading", "completion is not proof of success");
  take("mergerSiteList").cb({});
  assert.equal(Page.getHubDownload(HUB).state, "unavailable");
  assert.match(Page.getHubDownload(HUB).message, /complete copy/);
  assert.equal(Page.hubSyncActive(), false);
});

test("ready requires the expected hub content and no missing files", () => {
  for (const site of [{}, {content: {merged_type: "Other"}}, {...complete(), bad_files: 2}, complete()]) {
    const {Page, ack, done, take} = fixture();
    Page.needSite(HUB); ack(); done(HUB);
    take("mergerSiteList").cb({[HUB]: site});
    assert.equal(Page.getHubDownload(HUB).state, site.content?.merged_type === "EpixPost" && !site.bad_files ? "ready" : "unavailable");
  }
});

test("outstanding tasks stay downloading until a later check confirms readiness", () => {
  const {Page, ack, done, take, advance} = fixture();
  Page.needSite(HUB); ack(); done(HUB);
  take("mergerSiteList").cb({[HUB]: {...complete(), tasks: 1}});
  assert.equal(Page.getHubDownload(HUB).state, "downloading");
  advance(1000);
  take("mergerSiteList").cb({[HUB]: complete()});
  assert.equal(Page.getHubDownload(HUB).state, "ready");
});

test("list errors become a terminal error instead of a spinner", () => {
  const {Page, ack, done, take} = fixture();
  Page.needSite(HUB); ack(); done(HUB);
  take("mergerSiteList").cb({error: "Not a merger xite"});
  assert.equal(Page.getHubDownload(HUB).state, "error");
  assert.equal(Page.hubSyncActive(), false);
});

test("command errors and rejected responses are terminal", () => {
  for (const result of [{error: "Permission denied"}, null, false]) {
    const {Page, ack} = fixture();
    let response;
    Page.needSite(HUB, value => { response = value; });
    ack(result);
    assert.equal(Page.getHubDownload(HUB).state, "error");
    assert.ok(response.error);
    assert.equal(Page.hubSyncActive(), false);
  }
});

test("a missing command reply releases all callers and ignores a late reply", () => {
  const {Page, take, advance} = fixture();
  const results = [];
  Page.needSite(HUB, result => results.push(result));
  Page.needSite(HUB, result => results.push(result));
  const request = take("mergerSiteAdd");
  advance(Page.HUB_REQUEST_TIMEOUT);
  assert.equal(Page.getHubDownload(HUB).state, "error");
  assert.equal(results.length, 2);
  assert.ok(results.every(result => result.error));
  request.cb("ok");
  assert.equal(Page.getHubDownload(HUB).state, "error");
  assert.equal(Page.hubSyncActive(), false);
});

test("missing completion and missing verification replies are bounded", () => {
  for (const loseVerification of [false, true]) {
    const {Page, ack, done, advance} = fixture();
    Page.needSite(HUB); ack();
    if (loseVerification) done(HUB);
    advance(Page.HUB_SYNC_MAX);
    assert.equal(Page.getHubDownload(HUB).state, "unavailable");
    assert.match(Page.getHubDownload(HUB).message, /timed out/);
    assert.equal(Page.hubSyncActive(), false);
  }
});

test("late verification cannot overwrite a retried attempt", () => {
  const {Page, ack, done, take, advance} = fixture();
  Page.needSite(HUB); ack(); done(HUB);
  const oldCheck = take("mergerSiteList");
  advance(Page.HUB_SYNC_MAX);
  Page.retryHubDownload(HUB, () => {}); ack();
  oldCheck.cb({[HUB]: complete()});
  assert.equal(Page.getHubDownload(HUB).state, "downloading");
  done(HUB); take("mergerSiteList").cb({});
  assert.equal(Page.getHubDownload(HUB).state, "unavailable");
});

test("retry bypasses failure cooldown but deduplicates an active attempt", () => {
  const {Page, calls, ack} = fixture();
  Page.needSite(HUB); ack({error: "Offline"});
  Page.retryHubDownload(HUB, () => {});
  assert.equal(Page.getHubDownload(HUB).state, "requesting");
  Page.retryHubDownload(HUB, () => {});
  assert.equal(calls.filter(call => call.name === "mergerSiteAdd").length, 2);
  ack();
  assert.equal(Page.getHubDownload(HUB).state, "downloading");
});

test("an earlier completion event is checked after its acknowledgement arrives", () => {
  const {Page, calls, ack, done, take} = fixture();
  Page.needSite(HUB); done(HUB);
  assert.equal(calls.some(call => call.name === "mergerSiteList"), false);
  ack(); take("mergerSiteList").cb({[HUB]: complete()});
  assert.equal(Page.getHubDownload(HUB).state, "ready");
});

test("every entry point and an entire batch are gated before any fetch", () => {
  const {Page, calls} = fixture();
  Page.local_storage.settings.removed_hubs = {[HUB]: true};
  Page.content_hubs.canDownload = address => address !== HUB;
  const responses = [];
  Page.cmd("mergerSiteAdd", HUB, result => responses.push(result));
  Page.needSite(HUB, result => responses.push(result));
  Page.retryHubDownload(HUB, result => responses.push(result));
  Page.cmd("mergerSiteAdd", [[OTHER, HUB]], result => responses.push(result));
  assert.equal(calls.filter(call => call.name === "mergerSiteAdd").length, 0);
  assert.equal(responses.length, 4);
  assert.ok(responses.every(result => /Review this hub/.test(result.error)));
  assert.equal(Page.local_storage.settings.removed_hubs[HUB], true, "blocked actions do not undo removal");
  assert.equal(Page.getHubDownload(HUB).state, "idle");
});

test("terminal failures cannot be revived by late file events", () => {
  const {Page, ack, done, take} = fixture();
  Page.needSite(HUB); ack(); done(HUB); take("mergerSiteList").cb({});
  Page.noteHubProgress({address: HUB, event: ["file_added", "index.html"]});
  assert.equal(Page.getHubDownload(HUB).state, "unavailable");
  assert.equal(Page.hubSyncActive(), false);
});

test("each simultaneous attempt has its own deadline", () => {
  const {Page, ack, advance} = fixture();
  Page.needSite(HUB); ack();
  advance(5000);
  Page.needSite(OTHER); ack();
  advance(Page.HUB_SYNC_MAX - 5000);
  assert.equal(Page.getHubDownload(HUB).state, "unavailable");
  assert.equal(Page.getHubDownload(OTHER).state, "downloading");
  assert.equal(Page.hub_sync.address, OTHER);
  assert.equal(Page.hubSyncActive(), true);
  advance(5000);
  assert.equal(Page.getHubDownload(OTHER).state, "unavailable");
});

test("a callback can retry immediately without the old cleanup erasing the new banner", () => {
  const {Page, take, advance} = fixture();
  Page.needSite(HUB, () => Page.retryHubDownload(HUB, () => {}));
  const old = take("mergerSiteAdd");
  advance(Page.HUB_REQUEST_TIMEOUT);
  assert.equal(Page.getHubDownload(HUB).state, "requesting");
  assert.equal(Page.hubSyncActive(), true);
  old.cb("ok");
  assert.equal(Page.getHubDownload(HUB).state, "requesting");
  take("mergerSiteAdd").cb("ok");
  assert.equal(Page.getHubDownload(HUB).state, "downloading");
});

test("already complete hubs need no new download and removing one clears its state", () => {
  const {Page, calls, ack, done, take} = fixture();
  Page.merged_sites[HUB] = complete();
  assert.equal(Page.getHubDownload(HUB).state, "ready");
  let response;
  Page.needSite(HUB, value => { response = value; });
  assert.equal(response, true);
  assert.equal(calls.some(call => call.name === "mergerSiteAdd"), false);
  delete Page.merged_sites[HUB];
  Page.needSite(HUB); ack(); done(HUB); take("mergerSiteList").cb({});
  Page.cmd("mergerSiteDelete", HUB, () => {});
  assert.equal(Page.getHubDownload(HUB).state, "idle");
});
