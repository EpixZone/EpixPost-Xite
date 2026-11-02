const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("xID profile cards reuse a thumbnail while hub-owned photos keep their own URL", { timeout: 3000 }, async () => {
  const calls = [], Page = {
    xid_profiles: {},
    cmd(name, params, cb) { assert.equal(name, "wrapperAvatarThumbnailVersion"); cb(1); },
  };
  const parent = { postMessage(message, target, [port]) {
    calls.push({ name: message.cmd, params: message.params, cb(value) { port.postMessage(value); port.close(); } });
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
