const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const hub = "epix1activityhub", otherHub = "epix1otherhub";

function fixture() {
  const calls = [];
  const context = vm.createContext({
    window: {}, setTimeout, clearTimeout, clearInterval,
    LogMixin: { log() {}, logStart() {}, logEnd() {} },
    Time: { timestamp: () => 100, since: () => "now" },
    Text: { sqlIn: value => JSON.stringify(value) },
    Animation: {}, _: value => value,
    h(tag, props, children) {
      if (Array.isArray(props) || typeof props === "string") {
        children = props; props = {};
      }
      return { tag, props: props || {}, children };
    },
    Post: class {},
    Page: {
      cmd: (command, params, cb) => calls.push({ command, params, cb }),
      projector: { scheduleRender() {} }, handleLinkClick() {},
      resolveXidProfiles: (addresses, cb) => cb(),
      xid_profiles: { "alice.epix": { name: "Alice" } },
      getXidDisplayName: (address, fallback) => fallback || address,
      site_info: {}, merged_sites: { [hub]: {}, [otherHub]: {} },
      local_storage: { settings: { feed_hub: otherHub } },
      on_loaded: { resolved: true },
    },
  });
  for (const name of ["utils/Deferred", "utils/ItemList", "utils/QueryRows", "ActivityList", "PostList", "ContentThread"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", name + ".js"), "utf8"), context);
    context[name.split("/").pop()] = context.window[name.split("/").pop()];
  }
  return { context, calls };
}

function activity(type = "comment", site = hub, postId = 1) {
  return { type, site, hub: null, directory: "data/users/bob.epix", user_name: "Bob",
    cert_user_id: "bob@xid.epix", subject: site + "/alice.epix_" + postId,
    subject_hub: null, subject_auth_address: null, subject_user_name: null,
    body: type === "comment" ? "A reply" : "", date_added: 50 };
}

function profile(site = hub, preferredHub = null) {
  return { site, hub: preferredHub, directory: "data/users/alice.epix", user_name: "Alice",
    cert_user_id: "alice@xid.epix" };
}

function load(f, rows, profiles) {
  const list = new f.context.ActivityList();
  let groups;
  list.queryActivities(value => { groups = value; });
  f.calls.shift().cb(rows);
  f.calls.shift().cb(profiles);
  return { list, groups };
}

function links(node) {
  if (Array.isArray(node)) return node.flatMap(links);
  if (!node || typeof node !== "object") return [];
  return [node.props?.href, ...links(node.children)].filter(Boolean);
}

for (const type of ["comment", "post_like"]) {
  test(type + " post links retain the actual hub when profile hub metadata is null", () => {
    const f = fixture();
    const { list, groups } = load(f, [activity(type)], [profile()]);
    const hrefs = links(list.renderActivity(groups[0]));
    assert.ok(hrefs.includes("?Post/" + hub + "/alice.epix/1"), JSON.stringify(hrefs));
    assert.ok(hrefs.includes("?Profile/" + hub + "/bob.epix/bob@xid.epix"));
    assert.ok(hrefs.every(href => !href.includes("/null/") && !href.includes("/undefined/")));
  });
}

test("a profile on another hub cannot redirect an activity post to that hub", () => {
  const f = fixture();
  const { list, groups } = load(f, [activity()], [profile(hub, otherHub), profile(otherHub, otherHub)]);
  const hrefs = links(list.renderActivity(groups[0]));
  assert.ok(hrefs.includes("?Post/" + hub + "/alice.epix/1"), JSON.stringify(hrefs));
  assert.ok(hrefs.includes("?Profile/" + hub + "/alice.epix/alice@xid.epix"));
});

test("grouped likes retain each post's own hub", () => {
  const f = fixture();
  const { list, groups } = load(f, [activity("post_like"), activity("post_like", otherHub, 2)],
    [profile(hub), profile(otherHub)]);
  assert.equal(groups.length, 1);
  const hrefs = links(list.renderActivity(groups[0]));
  assert.ok(hrefs.includes("?Post/" + hub + "/alice.epix/1"));
  assert.ok(hrefs.includes("?Post/" + otherHub + "/alice.epix/2"));
});

test("xID-only subjects still have a valid post target while profile data downloads", () => {
  const f = fixture();
  const { list, groups } = load(f, [activity()], []);
  assert.ok(links(list.renderActivity(groups[0])).includes("?Post/" + hub + "/alice.epix/1"));
});

test("follow activities retain the followed hub even without matching profile data", () => {
  const f = fixture();
  const row = { ...activity("follow"), subject: otherHub + "/alice.epix",
    subject_hub: otherHub, subject_auth_address: "alice.epix", subject_user_name: "Alice" };
  const { list, groups } = load(f, [row], [profile(hub, hub)]);
  assert.ok(links(list.renderActivity(groups[0])).includes("?Profile/" + otherHub + "/alice.epix/"));
});

test("activity fingerprints change when the linked post target changes", () => {
  const f = fixture();
  const first = load(f, [activity()], [profile()]);
  const second = load(f, [activity("comment", otherHub, 2)], [profile(otherHub)]);
  assert.notEqual(first.list.getContentKey(first.groups), second.list.getContentKey(second.groups));
});

test("thread queries use the linked hub independently of the home feed filter", () => {
  const f = fixture();
  const thread = new f.context.ContentThread();
  thread.setPost(hub, "alice.epix", "1");
  thread.post_list.update();
  const query = f.calls.shift();
  assert.match(query.params[0], /json\.site = :feed_hub/);
  assert.equal(query.params[1].feed_hub, hub);
  thread.setPost(otherHub, "alice.epix", "1");
  thread.post_list.update();
  assert.equal(f.calls.shift().params[1].feed_hub, otherHub);
});
