const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function fixture() {
  const calls = [], images = [], timers = new Map();
  let now = 0, next = 0;
  const context = vm.createContext({
    window: { innerHeight: 800 },
    Page: { cmd: (cmd, params, cb) => calls.push({ cmd, params, cb }),
      projector: { scheduleRender() {} }, local_storage: { settings: {} } },
    Image: class {
      constructor() { images.push(this); }
      set src(value) {
        assert.equal(typeof this.onload, "function");
        assert.equal(typeof this.onerror, "function");
        this.path = value;
      }
    },
    setTimeout(fn, delay) { const id = ++next; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    LogMixin: {},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/utils/ImageDownload.js"), "utf8"), context);
  context.ImageDownload = context.window.ImageDownload;
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/PostMeta.js"), "utf8"), context);
  const download = context.ImageDownload.forPath("merged-EpixPost/hub/data/users/author/photo.jpg");
  const tag = { isConnected: true, getBoundingClientRect: () => ({ top: 10, bottom: 300 }) };
  download.watch(tag, () => true);
  function advance(ms) {
    const end = now + ms;
    while (true) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at;
      timers.delete(due[0]);
      due[1].fn();
    }
    now = end;
  }
  return { context, calls, images, download, tag, advance };
}

test("a slow overlay stays pending and does not race an HTTP image fetch", () => {
  const f = fixture();
  f.download.start();
  f.advance(180000);
  assert.equal(f.download.loading, true);
  assert.equal(f.download.failed, false);
  assert.equal(f.calls.length, 1);
  assert.equal(f.images.length, 0);
  f.calls[0].cb("ok");
  assert.equal(f.images.length, 1);
  f.images[0].onload();
  assert.equal(f.download.loaded, true);
  assert.equal(f.download.loading, false);
});

test("recreated rows share one in-flight request and completion", () => {
  const f = fixture();
  const post = { user: { getPath: () => "merged-EpixPost/hub/data/users/author" }, row: { post_id: "photo" } };
  const first = new f.context.window.PostMeta(post, {});
  const second = new f.context.window.PostMeta(post, {});
  first.startDownload();
  second.startDownload();
  assert.equal(f.calls.length, 1);
  assert.equal(second.loading, true);
  f.calls[0].cb("ok");
  f.images[0].onload();
  assert.equal(first.loaded, true);
  assert.equal(second.loaded, true);
});

test("a failed visible image retries and can recover", () => {
  const f = fixture();
  f.download.start();
  f.calls[0].cb({ error: "no peers" });
  assert.equal(f.download.failed, true);
  f.download.start();
  assert.equal(f.calls.length, 1, "a rerender must respect the retry delay");
  f.advance(50000);
  assert.equal(f.calls.length, 2);
  f.calls[1].cb("ok");
  f.images[0].onload();
  f.advance(120000);
  assert.equal(f.download.loaded, true);
  assert.equal(f.calls.length, 2);
});

test("background completion overrides a failure and ignores a late reply", () => {
  const f = fixture();
  f.download.start();
  f.context.ImageDownload.fileDone(f.download.path);
  f.calls[0].cb({ error: "old request" });
  f.images[0].onload();
  f.advance(120000);
  assert.equal(f.download.loaded, true);
  assert.equal(f.download.failed, false);
  assert.equal(f.calls.length, 1);
});

test("detached, offscreen and data-saver images do not retry automatically", () => {
  for (const stop of [
    f => { f.tag.isConnected = false; },
    f => { f.tag.getBoundingClientRect = () => ({ top: 1000, bottom: 1300 }); },
    f => { f.download.watch(f.tag, () => false); },
  ]) {
    const f = fixture();
    f.download.start();
    f.calls[0].cb({ error: "offline" });
    stop(f);
    f.advance(120000);
    assert.equal(f.calls.length, 1);
  }
});

test("manual retry bypasses backoff without duplicating a pending request", () => {
  const f = fixture();
  f.download.start();
  f.calls[0].cb({ error: "offline" });
  f.download.start(true);
  f.download.start(true);
  assert.equal(f.calls.length, 2);
  f.calls[1].cb("ok");
  f.images[0].onerror();
  assert.equal(f.download.failed, true);
  f.download.start(true);
  assert.equal(f.calls.length, 3);
});

test("deleting an image invalidates old completion callbacks", () => {
  const f = fixture();
  f.download.start();
  f.calls[0].cb("ok");
  f.download.reset();
  f.images[0].onload();
  assert.equal(f.download.loaded, false);
  assert.equal(f.download.loading, false);
});

test("file events do not fetch an image the user has never requested", () => {
  const f = fixture();
  f.context.ImageDownload.fileDone(f.download.path);
  assert.equal(f.images.length, 0);
  assert.equal(f.calls.length, 0);
});

test("a background completion clears an already displayed failure", () => {
  const f = fixture();
  f.download.start();
  f.calls[0].cb({ error: "offline" });
  f.context.ImageDownload.fileDone(f.download.path);
  f.images[0].onload();
  f.advance(120000);
  assert.equal(f.download.loaded, true);
  assert.equal(f.download.failed, false);
  assert.equal(f.calls.length, 1);
});

test("the component respects data saver during its initial visibility check", () => {
  const f = fixture();
  f.context.Page.local_storage.settings.data_saver = true;
  f.context.Page.scrollwatcher = { add: (tag, cb) => cb(tag) };
  const post = { user: { getPath: () => "merged-EpixPost/hub/data/users/author" }, row: { post_id: "photo" } };
  const row = new f.context.window.PostMeta(post, {});
  row.image_preview = { getPreviewUri: () => "preview" };
  row.afterCreateImage(f.tag);
  assert.equal(f.calls[0].cmd, "optionalFileInfo");
  f.calls[0].cb({ is_downloaded: false });
  assert.equal(f.calls.length, 1);
  assert.equal(f.images.length, 0);
  row.handleRetryClick();
  assert.equal(f.calls[1].cmd, "fileNeed", "an explicit click still downloads");
});
