const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// Model the real wrapper's history payload, verified in EpixNet at
// 2fd8b7c061f103ad77acd585118b9043b66cb03f, ui/media/all.js:
// {cmd: "wrapperPopState", params: {href: document.location.href, state: e.state}}.
// Use the vendored frame's actual message dispatcher and EpixPost's routing.
function fixture() {
  const entries = [{ href: "http://post.epix/", state: null }], calls = [];
  const classes = new Set(["loaded"]);
  let position = 0, rendered = "feed";
  const context = {
    console: { log() {} },
    location: { pathname: "/", href: entries[0].href },
    document: { location: { host: "post.epix" }, body: { classList: {
      add: value => classes.add(value), remove: value => classes.delete(value)
    } } },
    marked: { Renderer: class {} },
    maquette: { h() {} },
    setTimeout() {}, clearTimeout() {},
    pageXOffset: 0, pageYOffset: 0,
    scroll(x, y) { context.pageXOffset = x; context.pageYOffset = y; },
    requestAnimationFrame(cb) { cb(); },
    $() { return {}; }
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ["lib/epixframe.js", "utils/Deferred.js", "utils/Text.js"]) {
    require("./helpers/removal-fixture.cjs")(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", file), "utf8"), context);
  }
  const source = fs.readFileSync(path.join(__dirname, "../js/EpixPost.js"), "utf8");
  vm.runInContext(source.replace("window.Page = new EpixPost();", "window.EpixPost = EpixPost;")
    .replace("window.Page.createProjector();", ""), context);
  const page = Object.create(context.EpixPost.prototype);
  const clone = value => JSON.parse(JSON.stringify(value));
  Object.assign(page, {
    history_state: {}, params: { urls: [""] }, shell: {},
    on_loaded: new context.Deferred(), on_user_info: new context.Deferred(),
    log() {}, markLoaded() { classes.add("loaded"); },
    cmd(command, params) {
      calls.push({ command, params: clone(params) });
      if (command !== "wrapperPushState" && command !== "wrapperReplaceState") return;
      const href = params[2] == null ? entries[position].href : "http://post.epix/?" + params[2];
      const entry = { href, state: clone(params[0]) };
      if (command === "wrapperPushState") {
        entries.splice(position + 1);
        entries.push(entry);
        position++;
      } else entries[position] = entry;
    },
    projector: {
      detach() {},
      replace(target, render) { render(); },
      scheduleRender() { page.content.render(); }
    }
  });
  page.on_loaded.resolve();
  page.on_user_info.resolve();
  for (const name of ["feed", "hubs", "users", "settings", "profile", "thread", "create_profile"]) {
    page["content_" + name] = {
      render() { rendered = name; if (!page.on_loaded.resolved) page.on_loaded.resolve(); },
      update() { page.projector.scheduleRender(); },
      setUser(hub, address) { this.auth_address = address; return { filter() {} }; },
      setPost() { return true; }
    };
  }
  page.content = page.content_feed;
  context.Page = page;
  function pop(href, state) {
    page._onMessage({ data: { cmd: "wrapperPopState", params: { href, state: clone(state) } } });
  }
  function travel(delta) {
    position += delta;
    assert.ok(entries[position], "history entry exists");
    pop(entries[position].href, entries[position].state);
  }
  return { page, calls, entries, classes, context, pop, travel,
    get rendered() { return rendered; }, get position() { return position; } };
}

test("Back reaches the initial entry when browser history has null state", () => {
  const f = fixture();
  f.page.setUrl("?Hubs");
  assert.equal(f.rendered, "hubs");
  f.travel(-1);
  assert.equal(f.rendered, "feed");
  assert.equal(f.page.history_state.url, "");
  assert.ok(f.classes.has("loaded"));
});

test("Back adopts the destination state before the next link click", () => {
  const f = fixture();
  f.page.navigate("?Hubs");
  f.context.pageYOffset = 240;
  f.page.navigate("?Users");
  f.travel(-1);
  assert.equal(f.rendered, "hubs");
  assert.equal(f.page.history_state.url, "Hubs");
  assert.equal(f.page.history_state.scrollTop, 240);
  f.page.navigate("?Users");
  assert.equal(f.rendered, "users", "the old destination must not be mistaken for the current route");
  assert.equal(f.entries[f.position - 1].state.url, "Hubs");
});

test("Back and Forward route profiles and threads without creating history entries", () => {
  const f = fixture();
  f.page.navigate("?Profile/hub/alice.epix/Alice");
  f.page.navigate("?Post/hub/alice.epix/7");
  const calls = f.calls.length, length = f.entries.length;
  f.travel(-1);
  assert.equal(f.rendered, "profile");
  f.travel(1);
  assert.equal(f.rendered, "thread");
  assert.equal(f.page.history_state.url, "Post/hub/alice.epix/7");
  assert.equal(f.entries.length, length);
  assert.equal(f.calls.length, calls, "history traversal must not push or replace entries");
});

test("a null-state deep link routes from the wrapper URL without its fragment", () => {
  const f = fixture();
  f.pop("http://post.epix/?Settings#Account", null);
  assert.equal(f.rendered, "settings");
  assert.equal(f.page.history_state.url, "Settings");
});

test("an explicitly empty route is preserved and a queryless URL means the feed", () => {
  const f = fixture();
  f.page.navigate("?Users");
  f.pop("http://post.epix/?Settings", { url: "", scrollTop: 10 });
  assert.equal(f.rendered, "feed");
  assert.equal(f.page.history_state.url, "");
  f.pop("http://post.epix/#latest", { scrollTop: 80 });
  assert.equal(f.page.params.url, "");
  assert.equal(f.page.history_state.url, "");
  assert.equal(f.context.pageYOffset, 80);
});

test("Back between feed aliases renders again and restores scrolling", () => {
  const f = fixture();
  f.page.navigate("?Home");
  f.pop("http://post.epix/", { url: "", scrollTop: 120 });
  assert.ok(f.classes.has("loaded"), "the unchanged feed view must finish its loading cycle");
  assert.equal(f.context.pageYOffset, 120);
});
