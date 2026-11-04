const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const css = fs.readFileSync(path.join(__dirname, "../css/all.css"), "utf8");
const composerLayer = Number(css.match(/\.composer-scrim\s*\{[^}]*z-index:\s*(\d+)/)[1]);

function fixture() {
  const listeners = {};
  const context = vm.createContext({
    window: {}, document: { body: { addEventListener: (name, fn) => { listeners[name] = fn; } } },
    LogMixin: { log() {} }, _: value => value, setTimeout() {}, RateLimit() {},
    Animation: { slideDown() {}, slideUp() {} }, Time: { timestamp: () => 100 },
    Text: { renderMarked: value => value, fileEncode: JSON.stringify },
    Uploadable: class {}, ImagePreview: class {},
    Page: {
      projector: { scheduleRender() {} }, local_storage: { settings: {} }, user_hubs: { hub: {} },
      user: { auth_address: "alice", hub: "hub", likes: {}, renderAvatar() {},
        editPost(id, changes, cb) { cb("ok", { body: changes.body, clock: 1 }); } },
      cmd(name, params, cb) {
        assert.equal(name, "feedListFollow");
        cb({});
      }
    }
  });
  for (const file of ["lib/maquette", "utils/Autosize", "utils/Editable", "utils/Menu", "User", "Post", "ComposerModal"]) {
    require("./helpers/removal-fixture.cjs")(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", file + ".js"), "utf8"), context);
    Object.assign(context, context.window);
  }
  context.h = context.maquette.h;
  const makePost = id => {
    const post = new context.Post({
      key: "hub-alice_" + id, post_id: id, site: "hub", directory: "data/users/alice",
      date_added: 1790700000 + id, body: "Original post", comments: []
    }, {});
    post.renderHeader = () => null;
    post.renderActions = () => null;
    return post;
  };
  const startEdit = post => {
    post.handleSettingsClick();
    post.menu.handleClick({ target: { textContent: "Edit" } });
    assert.equal(post.editable_body.editing, true);
    post.editable_body.field_edit.node = { value: "Original post", isConnected: false };
    post.editable_body.field_edit.attrs.value = "Updated post";
  };
  return { context, makePost, startEdit, listeners };
}

function stackLevel(post) {
  const style = post.render().properties.style || "";
  const match = style.match(/z-index:\s*(-?\d+)/);
  return match ? Number(match[1]) : 0;
}

// Drive the real editor and User through the bridge, keeping publication and
// index refreshes under test control.
function editFixture() {
  const f = fixture();
  const page = f.context.Page;
  const calls = [];
  page.user = new f.context.User({hub: "home", auth_address: "alice"});
  page.content = { update() {} };
  const post = f.makePost(1);
  f.startEdit(post);
  page.cmd = (name, args, cb) => calls.push({name, args, cb});
  post.editable_body.handleSaveClick();
  function take(name) {
    const call = calls.shift();
    assert.equal(call?.name, name);
    return call;
  }
  const read = take("fileGet");
  assert.equal(read.args[0], "merged-EpixPost/hub/data/users/alice/posts.json");
  read.cb(JSON.stringify({post: [{...post.row, nonce: "original", clock: 10}]}));
  const sign = take("recordSign");
  return {post, sign, take, calls, makePost: f.makePost};
}

test("a locally saved edit renders through stale reads until the index reaches its clock", () => {
  const {post, sign, take, calls, makePost} = editFixture();
  const record = {...sign.args[0], sign: "signed"};
  assert.equal(record.supersedes, 10);
  sign.cb(record);
  const write = take("fileWrite");
  assert.equal(write.args[0], "merged-EpixPost/hub/data/users/alice/posts.json");
  assert.equal(JSON.parse(write.args[1]).post[0].body, "Updated post");
  write.cb("ok");
  const publish = take("sitePublish");
  assert.equal(publish.args.inner_path, "merged-EpixPost/hub/data/users/alice/content.json");
  assert.equal(post.editable_body.editing, false);
  function body(card = post) {
    const editable = card.render().children.find(node => node.vnodeSelector === "div.editable");
    return editable.children[1].properties.innerHTML;
  }
  assert.equal(body(), "Updated post");
  assert.equal(body(makePost(1)), "Updated post", "a second view shares the saved edit");
  assert.equal(body(makePost(2)), "Original post", "other posts keep their own text");
  post.row = {...post.row, clock: 10, likes: 1};
  publish.cb({error: "offline"});
  assert.equal(body(), "Updated post");
  post.row = {...post.row, clock: record.clock, body: "Concurrent winner"};
  assert.equal(body(), "Concurrent winner");
  post.row = {...post.row, clock: record.clock + 1, body: "Original post"};
  assert.equal(body(), "Original post");
  assert.deepEqual(calls, []);
});

for (const failure of ["recordSign", "fileWrite"]) {
  test("a failed " + failure + " keeps the draft open for retry", () => {
    const {post, sign, take, calls} = editFixture();
    let failed = sign;
    if (failure === "fileWrite") {
      sign.cb(sign.args[0]);
      failed = take("fileWrite");
    }
    failed.cb({error: "denied"});
    assert.match(take("wrapperNotification").args[1], /denied/);
    assert.deepEqual(calls, []);
    assert.equal(post.editable_body.editing, true);
    assert.equal(post.editable_body.field_edit.attrs.value, "Updated post");
    assert.equal(post.row.body, "Original post");
  });
}

for (const action of ["save", "cancel"]) {
  test("a post returns below the composer after an edit is " + (action === "save" ? "saved" : "cancelled"), () => {
    const f = fixture();
    const post = f.makePost(1);
    const originalLayer = stackLevel(post);
    f.startEdit(post);
    if (action === "save") post.editable_body.handleSaveClick();
    else post.editable_body.handleCancelClick();
    assert.equal(post.editable_body.editing, false);
    const composer = new f.context.ComposerModal();
    composer.open();
    composer.handleInput({ target: { value: "A new post" } });
    assert.equal(composer.visible, true);
    assert.equal(stackLevel(post), originalLayer, "closed menu must restore the post's normal layer");
    assert.ok(stackLevel(post) < composerLayer, "the composer must cover the previously edited post");
  });
}

test("an open post menu sits above adjacent cards but below the composer", () => {
  const f = fixture();
  const post = f.makePost(1);
  const adjacent = f.makePost(2);
  post.handleSettingsClick();
  assert.ok(stackLevel(post) > stackLevel(adjacent), "the menu must clear adjacent cards");
  assert.ok(stackLevel(post) < composerLayer, "a menu must not lift its card above a modal");
  post.handleSettingsClick();
  assert.equal(stackLevel(post), stackLevel(adjacent), "toggling the menu off must restore the card");
});

test("opening another menu restores the previous post's normal layer", () => {
  const f = fixture();
  const first = f.makePost(1);
  const second = f.makePost(2);
  first.handleSettingsClick();
  second.handleSettingsClick();
  assert.equal(first.menu.visible, false);
  assert.equal(stackLevel(first), 0);
  assert.ok(stackLevel(second) > stackLevel(first));
});

test("dismissing a post menu outside its card restores the normal layer", () => {
  const f = fixture();
  const post = f.makePost(1);
  post.handleSettingsClick();
  post.menu.node = { contains: () => false, parentNode: { contains: () => false } };
  f.listeners.mouseup({ target: {} });
  assert.equal(post.menu.visible, false);
  assert.equal(stackLevel(post), 0);
});
