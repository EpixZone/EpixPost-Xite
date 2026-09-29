const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// A small DOM adapter lets the bundled Maquette renderer enforce its real
// property-update rules without introducing a browser dependency to the suite.
class Element {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.style = {};
    this.attributes = {};
    this.value = "";
    this.offsetHeight = 100;
    const classes = new Set();
    this.classList = {
      add: name => classes.add(name), remove: name => classes.delete(name),
      contains: name => classes.has(name)
    };
  }
  appendChild(node) { return this.insertBefore(node); }
  insertBefore(node, before) {
    if (node.parentNode) node.parentNode.removeChild(node);
    const index = before ? this.childNodes.indexOf(before) : this.childNodes.length;
    this.childNodes.splice(index, 0, node);
    node.parentNode = this;
    return node;
  }
  removeChild(node) {
    this.childNodes.splice(this.childNodes.indexOf(node), 1);
    node.parentNode = null;
    return node;
  }
  replaceChild(node, old) { this.insertBefore(node, old); this.removeChild(old); }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener() {}
  removeEventListener() {}
  getBoundingClientRect() { return { top: 0, height: this.offsetHeight }; }
  get textContent() { return this.text || this.childNodes.map(node => node.textContent).join(""); }
  set textContent(value) { this.text = String(value); this.childNodes.length = 0; }
}

function fixture() {
  const frames = [];
  const document = {
    createElement: tag => new Element(tag),
    createTextNode: text => ({ textContent: text, parentNode: null }),
    body: { scrollHeight: 1000 }, activeElement: null,
    querySelector: () => null
  };
  const context = vm.createContext({
    console, document,
    window: { scrollY: 0, getComputedStyle: () => ({}) },
    requestAnimationFrame: cb => { frames.push(cb); return frames.length; },
    cancelAnimationFrame() {}, setTimeout() {}, clearTimeout() {}, clearInterval() {},
    LogMixin: { log() {}, logStart() {}, logEnd() {} }, _: value => value,
    Time: { timestamp: () => 100, since: () => "now", date: () => "today" },
    Text: { renderMarked: value => value }, Maxheight: { apply() {} },
    User: class { constructor(row) { Object.assign(this, row); } },
    Page: {
      user: { auth_address: "alice", likes: {}, comment_likes: {}, getDisplayName: () => "Alice" },
      handleLinkClick() {}, xid_profiles: {},
      getXidDisplayName: (address, fallback) => fallback || address
    }
  });
  for (const name of ["lib/maquette", "lib/clone", "utils/Animation", "utils/Autosize", "Post", "ActivityList"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", name + ".js"), "utf8"), context);
    const exported = name.split("/").pop();
    if (context.window[exported]) context[exported] = context.window[exported];
  }
  context.h = context.maquette.h;
  context.Page.projector = context.maquette.createProjector();
  const mount = new Element("main");
  let clicks = 0;
  const click = () => { clicks += 1; return false; };
  return {
    context,
    mount(render) {
      context.Page.projector.append(mount, () => context.h("div", [
        context.h("button", { onclick: click }, "Clicks: " + clicks), render()
      ]));
    },
    render() {
      context.Page.projector.scheduleRender();
      while (frames.length) frames.shift()();
    },
    assertResponsive() {
      mount.childNodes[0].childNodes[0].onclick();
      this.render();
      assert.equal(mount.childNodes[0].childNodes[0].textContent, "Clicks: 1");
    }
  };
}

function post(f, noanim = false) {
  const row = {
    key: "bob_1", post_id: 1, site: "epix1hub", directory: "data/users/bob",
    body: "A post", date_added: 50, comments: []
  };
  const item = new f.context.Post(row, { noanim });
  // Keep unrelated header/profile lookups out of this renderer regression.
  item.renderHeader = () => f.context.h("div.header", "Bob");
  item.renderActions = () => f.context.h("div.actions", "Actions");
  return item;
}

function comment(id) {
  return {
    directory: "data/users/bob", hub: "epix1hub", cert_user_id: "bob@xid.epix",
    user_name: "Bob", comment_id: id, body: "Reply " + id, date_added: id
  };
}

function exerciseRefresh(f, setMode) {
  // A normal frame, background sync, then a post submission's normal refresh.
  f.render();
  setMode(true);
  f.render();
  setMode(false);
  assert.doesNotThrow(() => f.render());
  // A failed Maquette render permanently stops subsequent UI updates.
  f.assertResponsive();
}

for (const initiallyQuiet of [false, true]) {
  const suffix = initiallyQuiet ? " (mounted during background sync)" : "";
  test("post cards remain interactive after background sync followed by posting" + suffix, () => {
    const f = fixture();
    const item = post(f, initiallyQuiet);
    f.mount(item.render);
    exerciseRefresh(f, value => { item.item_list.noanim = value; });
  });

  test("comments and open reply fields survive the post refresh" + suffix, () => {
    const f = fixture();
    const item = post(f, initiallyQuiet);
    const row = comment(1);
    item.getCommentState(item.getCommentUri(row)).open = true;
    f.mount(() => item.renderComment(row, { children: {} }));
    exerciseRefresh(f, value => { item.item_list.noanim = value; });
  });

  test("pending comments survive the post refresh" + suffix, () => {
    const f = fixture();
    const item = post(f, initiallyQuiet);
    f.mount(() => item.renderPendingComment({ uri: "alice_2", body: "Sending", date_added: 2 }));
    exerciseRefresh(f, value => { item.item_list.noanim = value; });
  });

  test("comment lists, their editor and more button survive the post refresh" + suffix, () => {
    const f = fixture();
    const item = post(f, initiallyQuiet);
    item.row.comments = [comment(1), comment(2), comment(3), comment(4)];
    item.commenting = true;
    f.mount(item.renderComments);
    exerciseRefresh(f, value => { item.item_list.noanim = value; });
  });

  test("activity rows remain interactive after background sync followed by posting" + suffix, () => {
    const f = fixture();
    const list = new f.context.ActivityList();
    list.need_update = false;
    list.noanim = initiallyQuiet;
    list.activities = [[{
      type: "comment", site: "epix1hub", auth_address: "bob", user_name: "Bob",
      cert_user_id: "bob@xid.epix", post_id: 1, body: "A reply", date_added: 50,
      subject: { hub: "epix1hub", auth_address: "alice", user_name: "Alice" }
    }]];
    f.mount(list.render);
    exerciseRefresh(f, value => { list.noanim = value; });
  });
}

test("background entry does not read layout or change styles", () => {
  const f = fixture();
  const untouched = new Proxy({}, {
    get() { assert.fail("Disabled entry animation touched its element"); },
    set() { assert.fail("Disabled entry animation changed its element"); }
  });
  f.context.window.getComputedStyle = () => assert.fail("Disabled entry animation measured styles");
  f.context.setTimeout = () => assert.fail("Disabled entry animation scheduled a timer");
  f.context.Animation.slideDown(untouched, { animate_noanim: true });
});

test("background exit removes the element immediately without measuring or animating", () => {
  const f = fixture();
  const untouched = new Proxy({}, {
    get() { assert.fail("Disabled exit animation touched its element"); },
    set() { assert.fail("Disabled exit animation changed its element"); }
  });
  f.context.setTimeout = () => assert.fail("Disabled exit animation scheduled a timer");
  let removals = 0;
  f.context.Animation.slideUp(untouched, () => { removals += 1; }, { animate_noanim: true });
  assert.equal(removals, 1);
});

function animationFixture() {
  const f = fixture();
  const node = new Element("div");
  const timers = [];
  const listeners = {};
  node.addEventListener = (name, listener) => { listeners[name] = listener; };
  node.removeEventListener = name => { delete listeners[name]; };
  f.context.setTimeout = cb => { timers.push(cb); };
  f.context.window.getComputedStyle = () => ({
    marginTop: "10px", marginBottom: "10px", paddingTop: "10px", paddingBottom: "10px",
    borderTopWidth: "1px", borderBottomWidth: "1px"
  });
  return { ...f, node, timers, listeners };
}

for (const props of [{}, { animate_noanim: false }]) {
  const suffix = Object.keys(props).length ? " with animations explicitly enabled" : " without an animation flag";
  test("normal entry still animates and clears temporary styles" + suffix, () => {
    const f = animationFixture();
    f.context.Animation.slideDown(f.node, props);
    assert.equal(f.node.style.height, "0px");
    assert.equal(f.node.style.opacity, "0");
    f.timers.shift()();
    assert.equal(f.node.style.height, "100px");
    assert.equal(f.node.style.opacity, "1");
    f.listeners.transitionend();
    assert.equal(f.node.style.height, null);
    assert.equal(f.node.style.opacity, null);
    assert.equal(f.listeners.transitionend, undefined);
  });

  test("normal exit waits for the transition before removal" + suffix, () => {
    const f = animationFixture();
    let removals = 0;
    f.context.Animation.slideUp(f.node, () => { removals += 1; }, props);
    assert.equal(f.node.style.height, "100px");
    assert.equal(removals, 0);
    f.timers.shift()();
    assert.equal(f.node.style.height, "0px");
    assert.equal(f.node.style.opacity, "0");
    assert.equal(removals, 0);
    f.listeners.transitionend({ propertyName: "opacity", elapsedTime: 0.6 });
    assert.equal(removals, 0);
    f.timers.shift()();
    assert.equal(removals, 1);
    assert.equal(f.listeners.transitionend, undefined);
  });
}
