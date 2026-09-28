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
    _: (value) => value,
    Page: null,
  });
  for (const file of ["utils/Deferred.js", "User.js", "AnonUser.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", file), "utf8"), context);
    Object.assign(context, context.window);
  }
  context.User.prototype.randNonce = () => "nonce";
  const source = fs.readFileSync(path.join(__dirname, "../js/EpixPost.js"), "utf8");
  vm.runInContext(source.replace("window.Page = new EpixPost();", "window.EpixPost = EpixPost;")
    .replace("window.Page.createProjector();", ""), context);
  const Page = Object.create(context.window.EpixPost.prototype);
  Object.assign(Page, {
    address: "post",
    user: false,
    user_hubs: {},
    user_check_generation: 0,
    user_check_callbacks: [],
    xid_profiles: {},
    local_storage: { settings: {}, followed_users: {} },
    merged_sites: { "default-hub": {} },
    projector: { scheduleRender() {} },
    content: { update() {} },
    shell: { follows: {}, saveFollows() {} },
    on_local_storage: new context.Deferred(),
    on_site_info: new context.Deferred(),
    noteHubProgress() {},
    log() {},
    cmd(command, params, cb) { calls.push({ command, params, cb }); },
  });
  Page.on_local_storage.resolve();
  context.Page = Page;
  const take = (command, match = () => true) => {
    const index = calls.findIndex((call) => call.command === command && match(call));
    assert.notEqual(index, -1, `Expected pending ${command}`);
    return calls.splice(index, 1)[0];
  };
  const info = (name) => ({
    address: "post",
    auth_address: "epix1" + (name || "anonymous"),
    xid_directory: name ? name + ".epix" : null,
    cert_user_id: name ? name + "@xid.epix" : null,
    settings: { permissions: ["Merger:EpixPost"] },
    content: { settings: { default_hubs: { "default-hub": {} } } },
    event: ["cert_changed", name],
  });
  const row = (name) => ({
    site: name + "-hub", hub: name + "-hub", json_id: name === "alice" ? 1 : 2,
    directory: "data/users/" + name + ".epix", user_name: name,
    cert_user_id: name + "@xid.epix",
  });
  const resolveXid = (name) => {
    take("xidResolveBatch", (call) => call.params[0][0] === "epix1" + name)
      .cb({ ["epix1" + name]: { name, tld: "epix" } });
  };
  const resolveInfo = () => {
    for (let i = 0; i < 3; i++) take("dbQuery").cb([]);
  };
  const finishProfile = (name) => {
    take("dbQuery").cb([row(name)]);
    resolveXid(name);
    resolveInfo();
  };
  return { Page, calls, take, info, row, resolveXid, resolveInfo, finishProfile };
}

test("late profile queries cannot replace the selected account and boot callbacks finish", () => {
  const { Page, calls, take, info, row, finishProfile } = fixture();
  const completed = [];
  Page.site_info = info("alice");
  Page.checkUser((found) => completed.push([Page.user.auth_address, found]));
  const alice = take("dbQuery");
  Page.setSiteInfo(info("bob"));
  finishProfile("bob");
  assert.equal(Page.user.row.user_name, "bob");
  assert.deepEqual(completed, [["bob.epix", true]]);
  const before = calls.length;
  alice.cb([row("alice")]);
  assert.equal(Page.user.hub, "bob-hub");
  assert.equal(Page.user.auth_address, "bob.epix");
  assert.deepEqual(Object.keys(Page.user_hubs), ["bob-hub"]);
  assert.equal(calls.length, before, "stale lookup launches no profile work");
});

test("a logout clears the active account before pending profile replies return", () => {
  const { Page, take, info, row } = fixture();
  let completed = 0;
  Page.site_info = info("alice");
  Page.checkUser(() => completed++);
  const alice = take("dbQuery");
  Page.setSiteInfo(info(null));
  alice.cb([row("alice")]);
  assert.equal(Page.user.auth_address, null);
  assert.equal(Page.user.hub, null);
  assert.deepEqual(Object.keys(Page.user_hubs), []);
  assert.equal(completed, 1);
});

test("an old xID resolution cannot start profile reads for a newer account", () => {
  const { Page, calls, take, info, row, resolveXid, finishProfile } = fixture();
  Page.site_info = info("alice");
  Page.checkUser();
  take("dbQuery").cb([row("alice")]);
  Page.setSiteInfo(info("bob"));
  finishProfile("bob");
  resolveXid("alice");
  assert.equal(Page.user.xid_profile.name, "bob");
  assert.equal(Page.user.row.user_name, "bob");
  assert.equal(calls.filter((call) => call.command === "dbQuery").length, 0);
});

test("late follow and like reads cannot complete a superseded profile", () => {
  const { Page, calls, take, info, row, resolveXid, finishProfile } = fixture();
  Page.site_info = info("alice");
  Page.checkUser();
  take("dbQuery").cb([row("alice")]);
  resolveXid("alice");
  const oldInfo = [take("dbQuery"), take("dbQuery"), take("dbQuery")];
  Page.setSiteInfo(info("bob"));
  finishProfile("bob");
  const before = calls.length;
  oldInfo.forEach((call) => call.cb([]));
  assert.equal(Page.user.auth_address, "bob.epix");
  assert.equal(calls.length, before, "no old migrations start");
});

test("newer checks of the same account win even when its identity has not changed", () => {
  const { Page, take, info, row, finishProfile } = fixture();
  let completed = 0;
  Page.site_info = info("alice");
  Page.checkUser(() => completed++);
  const old = take("dbQuery");
  Page.checkUser(() => completed++);
  finishProfile("alice");
  old.cb([{ ...row("alice"), hub: "old-hub", site: "old-hub" }]);
  assert.equal(Page.user.hub, "alice-hub");
  assert.equal(completed, 2);
});

test("a full siteInfo refresh detects a switch without a cert_changed event", () => {
  const { Page, take, info, finishProfile } = fixture();
  Page.site_info = info("alice");
  Page.checkUser();
  const old = take("dbQuery");
  const bob = info("bob");
  delete bob.event;
  Page.setSiteInfo(bob);
  finishProfile("bob");
  old.cb([]);
  assert.equal(Page.user.auth_address, "bob.epix");
});

test("profile creation does not write after its file check outlives an account switch", () => {
  const { Page, calls, take, info } = fixture();
  Page.site_info = info("alice");
  Page.checkUser();
  take("dbQuery").cb([]);
  const existing = take("fileGet");
  assert.equal(existing.params.inner_path, "merged-EpixPost/default-hub/data/users/alice.epix/data.json");
  Page.setSiteInfo(info("bob"));
  existing.cb(null);
  assert.equal(calls.some((call) => call.command === "fileWrite"), false);
});

test("profile creation does not publish if the account switches during the write", () => {
  const { Page, calls, take, info } = fixture();
  Page.site_info = info("alice");
  Page.checkUser();
  take("dbQuery").cb([]);
  take("fileGet").cb(null);
  const write = take("fileWrite");
  Page.setSiteInfo(info(null));
  write.cb("ok");
  assert.equal(calls.some((call) => call.command === "sitePublish"), false);
  assert.equal(Page.user.auth_address, null);
});

test("a new profile still writes, publishes, and resolves its original boot callback", () => {
  const { Page, take, info, row, resolveXid, resolveInfo } = fixture();
  let completed = 0;
  Page.site_info = info("alice");
  Page.checkUser(() => completed++);
  take("dbQuery").cb([]);
  take("fileGet").cb(null);
  take("fileWrite").cb("ok");
  const publish = take("sitePublish");
  assert.equal(publish.params.inner_path, "merged-EpixPost/default-hub/data/users/alice.epix/data.json");
  publish.cb("ok");
  take("dbQuery").cb([row("alice")]);
  resolveXid("alice");
  resolveInfo();
  assert.equal(Page.user.auth_address, "alice.epix");
  assert.equal(completed, 1);
});

for (const kind of ["post", "comment"]) {
  test(`a delayed legacy ${kind} read cannot sign records after switching accounts`, () => {
    const { Page, calls, take, info, finishProfile } = fixture();
    Page.site_info = info("alice");
    Page.checkUser();
    finishProfile("alice");
    const reads = [take("fileGet"), take("fileGet")];
    Page.setSiteInfo(info("bob"));
    reads[kind === "post" ? 0 : 1].cb(JSON.stringify({ [kind]: [{ post_id: 1, comment_id: 2, body: "legacy" }] }));
    assert.equal(calls.some((call) => call.command === "recordSign"), false);
    assert.equal(calls.some((call) => call.command === "fileGet"), false);
  });
}


test("a siteInfo reply requested before a switch cannot restore the old certificate", () => {
  const { Page, take, info, finishProfile } = fixture();
  Page.site_info = info("alice");
  Page.checkUser();
  finishProfile("alice");
  Page.updateSiteInfo();
  const oldInfo = take("siteInfo");
  Page.setSiteInfo(info("bob"));
  finishProfile("bob");
  oldInfo.cb(info("alice"));
  assert.equal(Page.site_info.cert_user_id, "bob@xid.epix");
  assert.equal(Page.user.auth_address, "bob.epix");
});

test("a same-account refresh during profile creation still allows its publish", () => {
  const { Page, take, info } = fixture();
  Page.site_info = info("alice");
  Page.checkUser();
  take("dbQuery").cb([]);
  take("fileGet").cb(null);
  const write = take("fileWrite");
  Page.checkUser();
  write.cb("ok");
  const publish = take("sitePublish");
  assert.equal(publish.params.inner_path, "merged-EpixPost/default-hub/data/users/alice.epix/data.json");
});

for (const kind of ["post", "comment"]) {
  test(`an in-flight legacy ${kind} signature is discarded after an account switch`, () => {
    const { Page, calls, take, info, finishProfile } = fixture();
    Page.site_info = info("alice");
    Page.checkUser();
    finishProfile("alice");
    const reads = [take("fileGet"), take("fileGet")];
    reads[kind === "post" ? 0 : 1].cb(JSON.stringify({ [kind]: [{ post_id: 1, comment_id: 2, body: "legacy" }] }));
    take("fileGet").cb(null);
    const sign = take("recordSign");
    Page.setSiteInfo(info("bob"));
    sign.cb({ ...sign.params[0], signature: "signed" });
    assert.equal(calls.some((call) => call.command === "fileWrite"), false);
    assert.equal(calls.some((call) => call.command === "sitePublish"), false);
  });
}

test("a profile publish failure completes boot without reporting a selected profile", () => {
  const { Page, calls, take, info } = fixture();
  const completed = [];
  Page.site_info = info("alice");
  Page.checkUser((found) => completed.push(found));
  take("dbQuery").cb([]);
  take("fileGet").cb(null);
  take("fileWrite").cb("ok");
  take("sitePublish").cb({ error: "Signing failed" });
  assert.deepEqual(completed, [false]);
  assert.equal(Page.user.auth_address, null);
  assert.equal(calls.some((call) => call.command === "dbQuery"), false);
});
