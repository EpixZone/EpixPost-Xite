const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const root = path.join(__dirname, "..");
const databaseError = { error: "database is rebuilding" };

function fixture({ deferProfiles = false } = {}) {
  const calls = [], profiles = [], progress = [], timers = new Map();
  const retryButton = { hidden: true };
  let nextTimer = 0, now = 0, renders = 0;
  function setTimeout(fn, delay) {
    const id = ++nextTimer;
    timers.set(id, { fn, delay, due: now + delay });
    return id;
  }
  const context = vm.createContext({
    window: {}, console,
    document: { getElementById: id => id === "loading-retry" ? retryButton : null },
    LogMixin: { log() {}, logStart() {}, logEnd() {} },
    Time: { timestamp: () => 1000, since: () => "now" },
    Text: { sqlIn: values => JSON.stringify(values) },
    Animation: {}, Debug: { formatException: error => { throw error; } },
    _: value => value,
    h: (tag, ...children) => ({ tag, children }),
    Post: class {
      constructor(row) { this.row = row; }
      render() { return this.row; }
    },
    setTimeout, clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
    Page: {
      cmd: (command, params, cb) => calls.push({ command, params, cb }),
      projector: { scheduleRender() { renders++; } },
      resolveXidProfiles: (addresses, cb) => deferProfiles ? profiles.push(cb) : cb(),
      setLoadingProgress: (...args) => progress.push(args),
      on_loaded: { resolved: false },
      handleLinkClick() {}, local_storage: { settings: {} }, merged_sites: {},
      xid_profiles: {}, getXidDisplayName: (address, fallback) => fallback || address,
      scrollwatcher: { items: [], add() {} },
    },
  });
  for (const name of ["utils/Deferred", "utils/ItemList", "utils/QueryRows", "PostList", "ActivityList"]) {
    vm.runInContext(fs.readFileSync(path.join(root, "js", name + ".js"), "utf8"), context);
    const exported = name.split("/").pop();
    context[exported] = context.window[exported];
  }
  function kind(call) {
    const sql = call.params[0];
    if (sql.startsWith("SELECT * FROM post ")) return "posts";
    if (sql.startsWith("SELECT post_uri, comment.body")) return "comments";
    if (sql.startsWith("SELECT comment_uri,")) return "commentLikes";
    if (sql.startsWith("SELECT post_uri, COUNT")) return "likes";
    if (sql.startsWith("SELECT * FROM json WHERE")) return "subjects";
    if (sql.startsWith("SELECT\n 'comment' AS type")) return "activities";
    throw new Error("Unexpected query: " + sql);
  }
  function take(type) {
    const index = calls.findIndex(call => kind(call) === type);
    assert.notEqual(index, -1, "Expected a pending " + type + " query");
    const call = calls.splice(index, 1)[0];
    assert.equal(call.command, "dbQuery");
    return call;
  }
  function reply(type, value) { take(type).cb(value); }
  function tick(expectedDelay) {
    assert.ok(timers.size, "Expected a pending timer");
    const [id, timer] = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
    if (expectedDelay !== undefined) assert.equal(timer.delay, expectedDelay);
    timers.delete(id);
    now = timer.due;
    timer.fn();
  }
  function exhaust(type, error = databaseError) {
    reply(type, error);
    for (const delay of [2000, 4000, 8000, 15000, 15000]) {
      tick(delay);
      reply(type, error);
    }
  }
  return { context, calls, profiles, progress, timers, retryButton, take, reply, tick, exhaust,
    get renders() { return renders; } };
}

function post(body = "Existing post", site = "epix1hub") {
  return { site, directory: "data/users/alice.epix", post_id: 1, date_added: 10, body };
}
function comment() {
  return { site: "epix1hub", directory: "data/users/bob.epix", post_uri: "alice.epix_1",
    comment_id: 2, date_added: 20, body: "Existing reply" };
}
function activity(body = "Existing activity") {
  return { type: "comment", site: "epix1hub", hub: "epix1hub", directory: "data/users/bob.epix",
    subject: "epix1hub/alice.epix_1", date_added: 20, body, user_name: "Bob" };
}
function finishPost(f, row = post(), comments = []) {
  f.reply("posts", Array.isArray(row) ? row : [row]);
  f.reply("comments", comments);
  f.reply("likes", [{ post_uri: "alice.epix_1", likes: 3 }]);
  if (comments.length) f.reply("commentLikes", [{ comment_uri: "bob.epix_2", likes: 2 }]);
}
function finishActivity(f, row = activity()) {
  f.reply("activities", [row]);
  f.reply("subjects", [{ directory: "data/users/alice.epix", hub: "epix1hub", user_name: "Alice" }]);
}
function loadedPost(f) {
  const list = new f.context.PostList();
  list.directories = "all";
  list.update();
  finishPost(f, post(), [comment()]);
  return list;
}
function loadedActivity(f) {
  const list = new f.context.ActivityList();
  list.directories = "all";
  list.render();
  finishActivity(f);
  return list;
}

test("an initial post query retries malformed replies and loads without showing an empty feed", () => {
  const f = fixture();
  const list = new f.context.PostList();
  list.directories = "all";
  list.update();
  f.reply("posts", databaseError);
  assert.equal(list.loaded, false);
  assert.doesNotMatch(JSON.stringify(list.render()), /No posts yet/);
  f.tick(2000);
  f.reply("posts", null);
  f.tick(4000);
  finishPost(f);
  assert.equal(list.loaded, true);
  assert.equal(list.posts[0].row.body, "Existing post");
  assert.equal(f.timers.size, 0);
});

test("a post query failure preserves the committed rows and pagination", () => {
  const f = fixture();
  const list = loadedPost(f);
  const before = list.posts[0].row;
  list.update();
  f.reply("posts", databaseError);
  assert.equal(list.posts[0].row, before);
  assert.equal(list.has_more, false);
  f.tick(2000);
  finishPost(f, post("A newer post"));
  assert.equal(list.posts[0].row.body, "A newer post");
});

for (const failedQuery of ["comments", "likes"]) {
  test("a failed " + failedQuery + " query cannot commit partial post data", () => {
    const f = fixture();
    const list = loadedPost(f);
    const before = list.posts[0].row;
    list.update();
    f.reply("posts", [post("Changed post")]);
    f.reply(failedQuery, databaseError);
    f.reply(failedQuery === "comments" ? "likes" : "comments", []);
    assert.equal(list.posts[0].row, before);
    assert.equal(list.posts[0].row.comments[0].likes, 2);
    assert.equal(list.posts[0].row.likes, 3);
    f.tick(2000);
    f.reply(failedQuery, []);
    assert.equal(list.posts[0].row.body, "Changed post");
  });
}

test("only a missing comment_like table is optional; other errors retry", () => {
  for (const error of [
    { error: "no such table: comment_like" },
    { error: "no such table: comment_like_backup" },
    { error: "no such table: post_like" },
    databaseError,
  ]) {
    const f = fixture();
    const list = new f.context.PostList();
    list.update();
    f.reply("posts", [post()]);
    f.reply("comments", [comment()]);
    f.reply("likes", []);
    f.reply("commentLikes", error);
    if (error.error === "no such table: comment_like") {
      assert.equal(list.loaded, true);
      assert.equal(list.posts[0].row.comments[0].likes, 0);
      assert.equal(f.timers.size, 0);
    } else {
      assert.equal(list.loaded, false);
      f.tick(2000);
      f.reply("commentLikes", [{ comment_uri: "bob.epix_2", likes: 9 }]);
      assert.equal(list.posts[0].row.comments[0].likes, 9);
    }
  }
});

test("five retries are bounded and an initial permanent error exposes the overlay retry button", () => {
  const f = fixture();
  const list = new f.context.PostList();
  list.update();
  f.exhaust("posts");
  assert.equal(list.loaded, false);
  assert.equal(list.query_failed, true);
  assert.equal(f.retryButton.hidden, false);
  assert.match(f.progress[0][1], /Retry loading/);
  assert.match(JSON.stringify(list.render()), /Could not update the feed/);
  assert.doesNotMatch(JSON.stringify(list.render()), /No posts yet/);
  assert.equal(f.timers.size, 0);
  assert.equal(f.calls.length, 0);
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /<button[^>]*id="loading-retry"[^>]*onclick="window\.location\.reload\(\)"/);
});

test("manual retry clears a permanent error even when the successful data is unchanged", () => {
  const f = fixture();
  const list = loadedPost(f);
  const before = list.posts[0];
  list.update();
  f.exhaust("posts");
  assert.match(JSON.stringify(list.render()), /Could not update the feed/);
  assert.equal(list.handleRetryClick(), false);
  finishPost(f, post(), [comment()]);
  assert.equal(list.query_failed, false);
  assert.equal(list.posts[0], before);
  assert.doesNotMatch(JSON.stringify(list.render()), /Could not update the feed/);
});

test("unchanged post rows still update pagination after showing more posts", () => {
  const f = fixture();
  const list = new f.context.PostList();
  const rows = () => Array.from({ length: 11 }, (_, index) => ({ ...post(), post_id: index + 1 }));
  list.update();
  finishPost(f, rows());
  assert.equal(list.has_more, true);
  const previousRenders = f.renders;
  list.handleMoreClick();
  finishPost(f, rows());
  assert.equal(list.has_more, false);
  assert.ok(f.renders > previousRenders, "Pagination changes must update the rendered More control");
});

test("a replacement post update cancels retries and ignores superseded database responses", () => {
  const f = fixture();
  const list = new f.context.PostList();
  list.update();
  f.reply("posts", databaseError);
  assert.equal(f.timers.size, 1);
  list.update();
  assert.equal(f.timers.size, 0);
  const old = f.take("posts");
  list.update();
  old.cb([post("Stale post")]);
  assert.equal(f.calls.length, 1);
  finishPost(f, post("Current post"));
  assert.equal(list.posts[0].row.body, "Current post");
});

test("a late profile resolution cannot replace a newer committed post list", () => {
  const f = fixture({ deferProfiles: true });
  const list = new f.context.PostList();
  list.update();
  finishPost(f, post("Stale post"));
  assert.equal(list.loaded, false);
  list.update();
  finishPost(f, post("Current post"));
  f.profiles[1]();
  f.profiles[0]();
  assert.equal(list.posts[0].row.body, "Current post");
});

test("activity queries retry instead of throwing and preserve existing activity on later errors", () => {
  const f = fixture();
  const list = new f.context.ActivityList();
  list.render();
  assert.doesNotThrow(() => f.reply("activities", databaseError));
  assert.equal(list.activities, null);
  f.tick(2000);
  finishActivity(f);
  const before = list.activities;
  list.update(0);
  f.tick(0);
  list.render();
  f.reply("activities", databaseError);
  assert.equal(list.activities, before);
  f.tick(2000);
  finishActivity(f, activity("Changed activity"));
  assert.equal(list.activities[0][0].body, "Changed activity");
});

test("failed activity subject lookups preserve the prior feed until a complete successful retry", () => {
  const f = fixture();
  const list = loadedActivity(f);
  const before = list.activities;
  list.update(0);
  f.tick(0);
  list.render();
  f.reply("activities", [activity("New activity")]);
  f.exhaust("subjects");
  assert.equal(list.activities, before);
  assert.equal(list.found, 1);
  assert.match(JSON.stringify(list.render()), /Could not update activity/);
  list.handleRetryClick();
  f.tick(0);
  list.render();
  finishActivity(f, activity("New activity"));
  assert.equal(list.query_failed, false);
  assert.equal(list.activities[0][0].body, "New activity");
});

test("requesting a debounced activity update immediately cancels old queries and profile callbacks", () => {
  const f = fixture({ deferProfiles: true });
  const list = new f.context.ActivityList();
  list.render();
  const old = f.take("activities");
  list.update();
  old.cb([activity("Old database result")]);
  assert.equal(f.calls.length, 0);
  f.tick(600);
  list.render();
  finishActivity(f, activity("Old profile result"));
  list.update();
  f.profiles[0]();
  assert.equal(list.activities, null);
  f.tick(600);
  list.render();
  finishActivity(f, activity("Current activity"));
  f.profiles[1]();
  assert.equal(list.activities[0][0].body, "Current activity");
});

test("feed hub filters remain bound and a late prior-hub response is ignored", () => {
  const f = fixture();
  f.context.Page.merged_sites = { epix1first: {}, epix1second: {} };
  f.context.Page.local_storage.settings.feed_hub = "epix1first";
  const posts = new f.context.PostList();
  posts.is_feed = true;
  posts.update();
  finishPost(f, post("First hub", "epix1first"));
  posts.update();
  const old = f.take("posts");
  assert.equal(old.params[1].feed_hub, "epix1first");
  assert.match(old.params[0], /json\.site = :feed_hub/);
  f.context.Page.local_storage.settings.feed_hub = "epix1second";
  posts.update();
  assert.equal(f.calls[0].params[1].feed_hub, "epix1second");
  f.reply("posts", databaseError);
  assert.equal(posts.loaded, false);
  assert.equal(posts.posts.length, 0, "The first hub must not appear under the second hub filter");
  f.tick(2000);
  finishPost(f, post("Second hub", "epix1second"));
  old.cb([post("First hub", "epix1first")]);
  assert.equal(posts.posts[0].row.site, "epix1second");
  const activities = new f.context.ActivityList();
  activities.is_feed = true;
  activities.render();
  const call = f.take("activities");
  assert.equal(call.params[1].feed_hub, "epix1second");
  assert.equal((call.params[0].match(/json\.site = :feed_hub/g) || []).length, 3);
});

test("exhausting one required query cancels sibling retries and late sibling callbacks", () => {
  const f = fixture();
  const list = loadedPost(f);
  const before = list.posts[0].row;
  list.update();
  f.reply("posts", [post("Incomplete update")]);
  const lateLikes = f.take("likes");
  f.exhaust("comments");
  lateLikes.cb(databaseError);
  assert.equal(list.query_failed, true);
  assert.equal(list.posts[0].row, before);
  assert.equal(f.timers.size, 0);
  assert.equal(f.calls.length, 0);
});
