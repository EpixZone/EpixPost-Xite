const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const wrapperOrigin = "https://post.epix";

test("xID profile cards reuse a thumbnail while hub-owned photos keep their own URL", { timeout: 3000 }, async () => {
  const calls = [], Page = {
    xid_profiles: {},
    cmd(name, params, cb) { assert.equal(name, "wrapperAvatarThumbnailVersion"); cb({ version: 1, origin: wrapperOrigin }); },
  };
  const parent = { postMessage(message, target, [port]) {
    calls.push({ name: message.cmd, params: message.params, target, cb(value) { port.postMessage(value); port.close(); } });
  } };
  const context = vm.createContext({
    window: { Page, parent }, Page, URL, MessageChannel, setTimeout, clearTimeout, LogMixin: {},
    h: (selector, properties) => ({ selector, properties }), PostRemoval: { allowed: () => true },
  });
  function load(relative) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", relative), "utf8"), context);
  }
  load("js/lib/epix-avatar.js");
  context.EpixAvatar = context.window.EpixAvatar;
  load("js/User.js");
  const user = new context.window.User({ hub: "hub", auth_address: "alice.epix", avatar: "https://images.example/hub.jpg" });
  user.xid_profile = { avatar: "https://images.example/xid.png" };
  const { properties } = user.renderAvatar({}, 80);
  assert.equal(properties.style, undefined);
  const first = { style: {} };
  let painted;
  const second = { style: { set backgroundImage(value) { painted(value); } } };
  const secondPaint = new Promise(resolve => { painted = resolve; });
  properties.afterCreate(first, null, "a.avatar", properties);
  properties.afterUpdate(first, null, "a.avatar", properties);
  properties.afterCreate(second, null, "a.avatar", properties);
  await new Promise(setImmediate);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "wrapperGetAvatarThumbnail");
  assert.equal(calls[0].target, wrapperOrigin);
  assert.equal(calls[0].params.url, user.xid_profile.avatar);
  assert.equal(calls[0].params.size, 80);
  const thumbnail = "data:image/png;base64,QQ==";
  calls[0].cb({ thumbnail });
  assert.equal(await secondPaint, 'url("' + thumbnail + '")');
  assert.equal(first.style.backgroundImage, 'url("' + thumbnail + '")');

  user.xid_profile = null;
  const hub = user.renderAvatar({}, 80);
  assert.notEqual(hub.properties.key, properties.key);
  assert.equal(hub.properties.afterCreate, undefined);
  assert.match(hub.properties.style, /https:\/\/images\.example\/hub\.jpg/);
});

test("the rail and top bar show the account initial when no photo is available", () => {
  const Page = {xid_profiles: {}, merged_sites: {}};
  const context = vm.createContext({
    window: {}, Page, LogMixin: {}, PostRemoval: {allowed: () => true},
    _: text => text, Text: {toColor: () => "navy"},
    h: (selector, attrs, text) => ({selector, attrs, text})
  });
  for (const name of ["User", "Shell"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", name + ".js"), "utf8"), context);
  }
  Page.user = new context.window.User({hub: "hub", auth_address: "alice.epix"});
  const shell = Object.create(context.window.Shell.prototype);
  for (const selector of ["a.avatar", "span.avatar"]) {
    const avatar = shell.renderAccountAvatar(selector, 36);
    assert.equal(avatar.selector, selector + ".letter");
    assert.equal(avatar.text, "A");
  }
});
