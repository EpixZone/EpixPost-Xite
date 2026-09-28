const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function fixture() {
  const calls = [];
  const context = vm.createContext({
    window: { EpixFrame: class {} },
    maquette: { h() {} },
    LogMixin: { log() {}, logStart() {}, logEnd() {} },
    Text: { fileEncode: JSON.stringify },
    ImageDownload: { forPath: () => ({}) },
    _: (value) => value,
    Page: null,
  });
  for (const file of ["utils/Deferred.js", "User.js", "AnonUser.js", "PostMeta.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", file), "utf8"), context);
    Object.assign(context, context.window);
  }
  const source = fs.readFileSync(path.join(__dirname, "../js/EpixPost.js"), "utf8");
  vm.runInContext(source.replace("window.Page = new EpixPost();", "window.EpixPost = EpixPost;")
    .replace("window.Page.createProjector();", ""), context);
  const Page = Object.create(context.window.EpixPost.prototype);
  Object.assign(Page, {
    user: false,
    user_hubs: {},
    xid_profiles: {},
    local_storage: { settings: {}, followed_users: {} },
    projector: { scheduleRender() {} },
    content_profile: { update() {} },
    on_local_storage: new context.Deferred(),
    log() {}, logStart() {}, logEnd() {},
    cmd(command, params, cb) { calls.push({ command, params, cb }); },
  });
  Page.on_local_storage.resolve();
  context.Page = Page;
  const info = (name = "alice") => ({
    auth_address: "epix1" + (name || "anonymous"),
    xid_directory: name ? name + ".epix" : null,
    cert_user_id: name ? name + "@xid.epix" : null,
  });
  Page.site_info = info();
  const take = (command, match = () => true) => {
    const index = calls.findIndex((call) => call.command === command && match(call));
    assert.notEqual(index, -1, `Expected pending ${command}`);
    return calls.splice(index, 1)[0];
  };
  const load = (hubs = ["hub-a", "hub-b"]) => {
    Page.checkUser();
    take("dbQuery").cb(hubs.map((hub, i) => ({
      site: hub, hub, json_id: i + 1,
      directory: "data/users/" + Page.site_info.xid_directory,
      user_name: "alice", cert_user_id: Page.site_info.cert_user_id,
    })));
    take("xidResolveBatch").cb({});
    for (let i = 0; i < 3; i++) take("dbQuery").cb([]);
  };
  const menu = (directory = "alice.epix", hub = "hub-a") => {
    const user = new context.User({ hub, auth_address: directory, user_name: directory });
    return new context.PostMeta({ user, row: { post_id: "photo" } }, {});
  };
  return { Page, calls, take, load, menu, info };
}

test("login enables image distribution for the user's profiles on every hub", () => {
  const { Page, calls, take, load } = fixture();
  load();
  for (const hub of ["hub-a", "hub-b"]) {
    take("OptionalHelpList", (call) => call.params[0] === hub).cb({});
    const enable = take("OptionalHelp");
    assert.deepEqual(Array.from(enable.params), ["data/users/alice.epix", "alice.epix's new images", hub]);
    enable.cb({ num: 2, size: 100 });
    assert.equal(Page.local_storage.settings.own_image_help[hub + "/alice.epix"], true);
  }
  assert.equal(calls.filter((call) => call.command === "wrapperSetLocalStorage").length, 2);
});

test("existing commitments are retained without enabling or downloading them twice", () => {
  const { Page, calls, take, load } = fixture();
  load(["hub-a"]);
  take("OptionalHelpList").cb({ "data/users/alice.epix": "" });
  assert.equal(calls.some((call) => call.command === "OptionalHelp"), false);
  assert.equal(Page.local_storage.settings.own_image_help["hub-a/alice.epix"], true);
  load(["hub-a"]);
  assert.equal(calls.some((call) => call.command === "OptionalHelpList"), false);
});

test("an explicit opt-out survives profile checks and does not affect other hubs", () => {
  const { Page, calls, take, load } = fixture();
  Page.local_storage.settings.own_image_help = { "hub-a/alice.epix": false };
  load();
  assert.equal(calls.some((call) => call.command === "OptionalHelpList" && call.params[0] === "hub-a"), false);
  take("OptionalHelpList").cb({});
  assert.equal(take("OptionalHelp").params[2], "hub-b");
});

test("failed list or enable commands leave the default eligible for a later retry", () => {
  for (const failing of ["list", "enable"]) {
    const { Page, take, load } = fixture();
    load(["hub-a"]);
    take("OptionalHelpList").cb(failing === "list" ? { error: "offline" } : {});
    if (failing === "enable") take("OptionalHelp").cb({ error: "offline" });
    assert.equal(Object.hasOwn(Page.local_storage.settings.own_image_help, "hub-a/alice.epix"), false);
    load(["hub-a"]);
    take("OptionalHelpList").cb({});
    take("OptionalHelp").cb({ num: 0, size: 0 });
    assert.equal(Page.local_storage.settings.own_image_help["hub-a/alice.epix"], true);
  }
});

test("a delayed default lookup cannot enable a former account after switching", () => {
  const { Page, calls, take, load, info } = fixture();
  load(["hub-a"]);
  const lookup = take("OptionalHelpList");
  Page.site_info = info("bob");
  Page.checkUser();
  lookup.cb({});
  assert.equal(calls.some((call) => call.command === "OptionalHelp"), false);
  assert.equal(Object.keys(Page.local_storage.settings.own_image_help).length, 0);
});

test("a stale enable completion does not save settings for another account", () => {
  const { Page, calls, take, load, info } = fixture();
  load(["hub-a"]);
  take("OptionalHelpList").cb({});
  const enable = take("OptionalHelp");
  Page.site_info = info(null);
  Page.checkUser();
  enable.cb({ num: 1, size: 100 });
  assert.equal(calls.some((call) => call.command === "wrapperSetLocalStorage"), false);
});

test("anonymous visits never enable image distribution", () => {
  const { Page, calls, info } = fixture();
  Page.site_info = info(null);
  Page.checkUser();
  assert.equal(calls.length, 0);
});

test("the own-image menu saves opt-outs and pending defaults cannot undo the choice", () => {
  const { Page, calls, take, load, menu } = fixture();
  load(["hub-a"]);
  const defaultLookup = take("OptionalHelpList");
  const image = menu();
  image.handleOptionalHelpClick();
  take("OptionalHelpList").cb({ "data/users/alice.epix": "Alice" });
  const disable = take("OptionalHelpRemove");
  assert.deepEqual(Array.from(disable.params), ["data/users/alice.epix", "hub-a"]);
  defaultLookup.cb({});
  assert.equal(calls.some((call) => call.command === "OptionalHelp"), false);
  disable.cb("ok");
  assert.equal(image.optional_helping, false);
  assert.equal(Page.local_storage.settings.own_image_help["hub-a/alice.epix"], false);
  load(["hub-a"]);
  assert.equal(calls.some((call) => call.command === "OptionalHelpList"), false);
});

test("the menu does not record a choice when a lookup or update fails", () => {
  for (const failing of ["list", "update"]) {
    const { Page, calls, take, menu } = fixture();
    const image = menu();
    image.optional_helping = true;
    image.handleOptionalHelpClick();
    take("OptionalHelpList").cb(failing === "list" ? { error: "offline" } : { "data/users/alice.epix": "Alice" });
    if (failing === "update") take("OptionalHelpRemove").cb({ error: "offline" });
    assert.equal(image.optional_helping, true);
    assert.equal(calls.some((call) => call.command === "wrapperSetLocalStorage"), false);
    assert.equal(Object.keys(Page.local_storage.settings.own_image_help || {}).length, 0);
  }
});

test("manual changes for other people's images do not create own-profile defaults", () => {
  const { Page, calls, take, menu } = fixture();
  const image = menu("bob.epix");
  image.handleOptionalHelpClick();
  take("OptionalHelpList").cb({});
  const enable = take("OptionalHelp");
  assert.deepEqual(Array.from(enable.params), ["data/users/bob.epix", "bob.epix's new images", "hub-a"]);
  enable.cb({ num: 1, size: 100 });
  assert.equal(image.optional_helping, true);
  assert.equal(calls.some((call) => call.command === "wrapperSetLocalStorage"), false);
  assert.equal(Page.local_storage.settings.own_image_help, undefined);
});

test("a manual toggle waiting on a list does nothing after an account switch", () => {
  const { Page, calls, take, menu, info } = fixture();
  menu().handleOptionalHelpClick();
  const lookup = take("OptionalHelpList");
  Page.site_info = info("bob");
  lookup.cb({});
  assert.equal(calls.some((call) => call.command === "OptionalHelp"), false);
});

test("the menu targets the resolved xID directory even when the post stores an address", () => {
  const { Page, take, menu } = fixture();
  const image = menu(Page.site_info.auth_address);
  image.handleOptionalHelpClick();
  take("OptionalHelpList").cb({ "data/users/alice.epix": "Alice" });
  const disable = take("OptionalHelpRemove");
  assert.deepEqual(Array.from(disable.params), ["data/users/alice.epix", "hub-a"]);
  disable.cb("ok");
  assert.equal(Page.local_storage.settings.own_image_help["hub-a/alice.epix"], false);
});

test("an old menu completion cannot save a choice after switching accounts", () => {
  const { Page, calls, take, menu, info } = fixture();
  const image = menu();
  image.handleOptionalHelpClick();
  take("OptionalHelpList").cb({ "data/users/alice.epix": "Alice" });
  const disable = take("OptionalHelpRemove");
  Page.site_info = info("bob");
  disable.cb("ok");
  assert.equal(calls.some((call) => call.command === "wrapperSetLocalStorage"), false);
  assert.equal(Object.keys(Page.local_storage.settings.own_image_help).length, 0);
  assert.equal(Object.keys(Page.own_image_help_pending).length, 0);
});
