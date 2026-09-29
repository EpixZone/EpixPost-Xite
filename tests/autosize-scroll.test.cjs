const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/utils/Autosize.js"), "utf8");

// Model the browser's scroll-range clamp when layout reads a collapsed editor.
// The same behavior is checked with the real script and CSS in Chromium.
function fixture({ boxSizing = "border-box", contentHeight = 600, requiresLayout = false } = {}) {
  const pending = [];
  const view = { scrollTop: 1000 };
  const parent = { children: [], appendChild(node) { this.children.push(node); } };
  const computed = { width: "400px", boxSizing, borderTopWidth: "1px", borderBottomWidth: "1px",
    paddingTop: "10px", paddingBottom: "10px" };
  const node = {
    isConnected: true, style: { height: "600px" }, value: "A long post", parentNode: parent,
    scrollTop: 20, selectionStart: 9, selectionEnd: 9,
    cloneNode() {
      let laidOut = !requiresLayout;
      const copy = { style: {}, value: this.value, attributes: { id: "editor", name: "post" },
        removeAttribute(name) { delete this.attributes[name]; },
        setAttribute(name, value) { this.attributes[name] = value; },
        getBoundingClientRect() { laidOut = true; return { height: 20 }; },
        // Firefox 140 ESR initially reports only padding for a new clone.
        get scrollHeight() { return laidOut ? contentHeight : 20; },
        remove() { parent.children.splice(parent.children.indexOf(this), 1); } };
      return copy;
    },
    get offsetHeight() {
      // A zero-height editor shrinks the page/modal enough to clamp scrolling.
      view.scrollTop = Math.min(view.scrollTop, 400 + parseFloat(this.style.height));
      return parseFloat(this.style.height);
    },
    get scrollHeight() { return contentHeight; }
  };
  const document = { activeElement: node };
  const context = vm.createContext({
    window: { getComputedStyle: () => computed }, document, LogMixin: {},
    Page: { projector: { scheduleRender() {} } },
    RateLimit: (delay, cb) => pending.push(cb), setTimeout: cb => pending.push(cb),
    anime: ({ targets, height, scrollTop }) => {
      targets.style.height = height + "px";
      targets.scrollTop = scrollTop;
    }
  });
  vm.runInContext(source, context);
  const field = new context.window.Autosize();
  field.node = node;
  return { field, node, view, parent, pending, document };
}

test("typing in a long editor keeps its enclosing scroll position and caret", () => {
  const f = fixture();
  f.field.handleInput({ target: f.node });
  f.pending.shift()();
  assert.equal(f.view.scrollTop, 1000);
  assert.equal(f.node.selectionStart, 9);
  assert.equal(f.node.selectionEnd, 9);
  assert.equal(f.node.scrollTop, 20);
});

test("border-box editors include both borders when expanding to fit the text", () => {
  const f = fixture({ contentHeight: 720 });
  f.field.autoHeight();
  assert.equal(f.node.style.height, "722px");
  assert.equal(f.parent.children.length, 0);
});

test("multiline editors measure the clone's text after Firefox ESR lays it out", () => {
  const f = fixture({ contentHeight: 133, requiresLayout: true });
  f.node.value = "First line\nSecond line\nThird line\nFourth line\nFifth line";
  f.field.autoHeight();
  assert.equal(f.node.style.height, "135px");
  assert.equal(f.parent.children.length, 0);
  assert.equal(f.node.selectionStart, 9);
});

test("content-box editors exclude padding from their CSS height", () => {
  const f = fixture({ boxSizing: "content-box", contentHeight: 720 });
  f.field.autoHeight();
  assert.equal(f.node.style.height, "700px");
});

test("deleting text shrinks the field without a temporary collapse", () => {
  const f = fixture({ contentHeight: 120 });
  f.view.scrollTop = 400;
  f.field.autoHeight();
  assert.equal(f.node.style.height, "122px");
  assert.equal(f.view.scrollTop, 400);
});

test("measurement copies cannot receive focus or be submitted with the form", () => {
  const f = fixture();
  let measured = false;
  f.parent.appendChild = function(copy) {
    measured = true;
    assert.equal(copy.tabIndex, -1);
    assert.equal(copy.attributes["aria-hidden"], "true");
    assert.equal(copy.attributes.id, undefined);
    assert.equal(copy.attributes.name, undefined);
    assert.equal(copy.style.visibility, "hidden");
    assert.equal(copy.style.width, "400px");
    assert.equal(copy.value, f.node.value);
    this.children.push(copy);
  };
  f.field.autoHeight();
  assert.equal(measured, true);
  assert.equal(f.parent.children.length, 0);
});

test("delayed resizing after an editor closes leaves its detached node alone", () => {
  const f = fixture();
  f.field.handleInput({ target: f.node });
  f.node.isConnected = false;
  f.pending.shift()();
  assert.equal(f.node.style.height, "600px");
  assert.equal(f.parent.children.length, 0);
});

test("resizing before the textarea mounts is harmless", () => {
  const f = fixture();
  f.field.node = null;
  assert.doesNotThrow(() => f.field.autoHeight());
});

for (const scale of [1, 2]) {
  test("new lines keep the caret visible at " + scale * 100 + "% scale", () => {
    const f = fixture({ contentHeight: 720 });
    const outer = { scrollTop: 1000, offsetHeight: 700,
      getBoundingClientRect: () => ({ height: 700 }), parentElement: null };
    const inner = { offsetHeight: 300, getBoundingClientRect: () => ({ height: 300 * scale }),
      parentElement: outer, position: 40,
      get scrollTop() { return this.position; },
      set scrollTop(value) { this.position = Math.min(value, 60); } };
    f.node.parentElement = inner;
    f.node.getBoundingClientRect = () => ({ height: parseFloat(f.node.style.height) * scale });
    Object.defineProperty(f.node, "scrollTop", {
      get: () => Math.max(0, 120 - (parseFloat(f.node.style.height) - 600)),
      set() {}
    });
    f.field.autoHeight();
    assert.equal(inner.scrollTop, 60);
    assert.equal(outer.scrollTop, 1000 + 100 * scale);
    assert.equal(f.node.scrollTop, 0);
  });
}

test("background resizing does not move the page to an unfocused field", () => {
  const f = fixture({ contentHeight: 720 });
  f.document.activeElement = null;
  const parent = { scrollTop: 1000 };
  f.node.parentElement = parent;
  Object.defineProperty(f.node, "scrollTop", {
    get: () => Math.max(0, 120 - (parseFloat(f.node.style.height) - 600)),
    set() {}
  });
  f.field.autoHeight();
  assert.equal(parent.scrollTop, 1000);
});
