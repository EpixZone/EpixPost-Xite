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
    LogMixin: {}, _: value => value, setTimeout() {}, RateLimit() {},
    Animation: { slideDown() {}, slideUp() {} }, Text: { renderMarked: value => value },
    Uploadable: class {}, ImagePreview: class {},
    User: class { constructor(row) { Object.assign(this, row); } },
    Page: {
      projector: { scheduleRender() {} }, local_storage: { settings: {} }, user_hubs: { hub: {} },
      user: { auth_address: "alice", hub: "hub", likes: {}, renderAvatar() {},
        editPost(id, changes, cb) { cb(true); } },
      cmd(name, params, cb) {
        assert.equal(name, "feedListFollow");
        cb({});
      }
    }
  });
  for (const file of ["lib/maquette", "utils/Autosize", "utils/Editable", "utils/Menu", "Post", "ComposerModal"]) {
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
