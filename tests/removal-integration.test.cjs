const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const installRemoval = require('./helpers/removal-fixture.cjs');
const HUB = 'epix12fdtj0j77kltvdw2eqfzw392mr34r2al22mqrf';
const OTHER = 'epix1p0stmcza0xjkvv0vnjlk0ypr7xsunt4lxkhgcm';

function fixture() {
  const calls = [];
  class EpixFrame { cmd(command, params, cb) { calls.push({command, params, cb}); if (this.bridgeResponder) this.bridgeResponder(command, params, cb); } }
  const context = vm.createContext({
    window: {EpixFrame}, console, Date, setTimeout: () => 0, clearTimeout() {},
    _: value => value, Time: {timestamp: () => 100000, since: () => 'recently'},
    Text: {fileEncode: JSON.stringify, formatUsername: value => value},
    LogMixin: {log() {}}, maquette: {h: vnode}, Animation: {},
    h: vnode
  });
  function load(file) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    Object.assign(context, context.window);
  }
  load('js/utils/Deferred.js');
  const policy = installRemoval(context);
  let source = fs.readFileSync(path.join(__dirname, '../js/EpixPost.js'), 'utf8');
  source = source.replace('window.Page = new EpixPost();', 'window.EpixPost = EpixPost;').replace('window.Page.createProjector();', '');
  vm.runInContext(source, context);
  const Page = Object.create(context.window.EpixPost.prototype);
  Page.init();
  Object.assign(Page, {
    address: 'epix1app', site_info: {auth_address: 'epix1alice', xid_directory: 'alice.epix', cert_user_id: 'alice@xid.epix', content: {settings: {default_hubs: {}}}},
    local_storage: {settings: {}}, projector: {scheduleRender() {}}, content: {update() {}},
    log() {}, saveLocalStorage() {}, setLoadingProgress() {},
    merged_sites: {[HUB]: {content: {merged_type: 'EpixPost'}, bad_files: 0, tasks: 0}, [OTHER]: {content: {merged_type: 'EpixPost'}, bad_files: 0, tasks: 0}},
    updateSiteInfo(cb) { if (cb) cb(true); }
  });
  context.Page = context.window.Page = Page;
  ['js/utils/HubCommunity.js', 'js/HubCommunityView.js', 'js/ContentHubs.js', 'js/User.js',
    'js/ContentProfile.js', 'js/ContentThread.js', 'js/Post.js', 'js/ActivityList.js', 'js/Shell.js', 'js/utils/HubActions.js'].forEach(load);
  const owner = Page.content_hubs = new context.ContentHubs();
  owner.need_update = false;
  owner.community.loaded = true;
  const block = (address = HUB, status = 'removed') => policy.decisions.set(address, {status, removedKey: policy.key(address), reasonCode: 'malware'});
  const event = address => ({currentTarget: {attributes: {address: {value: address}}, getAttribute: name => name === 'address' ? address : null}});
  return {context, Page, owner, policy, calls, block, event};
}
function vnode(selector, properties, children) {
  if (children === undefined && (Array.isArray(properties) || typeof properties !== 'object' || properties == null)) {
    children = properties; properties = {};
  }
  return {selector, properties: properties || {}, children: (Array.isArray(children) ? children : [children]).flat().filter(value => value != null)};
}
function noDisclosure(tree, address = HUB) {
  const output = JSON.stringify(tree);
  assert.doesNotMatch(output, new RegExp(address));
  assert.doesNotMatch(output, /Original secret title|Identifying description|secret-avatar|secret-admin|Download anyway|Copy address/);
  assert.match(output, /Removal key/);
}

test('seeded, featured and announced removals render only policy information without target attributes', () => {
  const {owner, block, calls} = fixture(); block();
  for (const type of ['seeded', 'available']) {
    noDisclosure(owner.renderHub({address: HUB, type, content: {title: 'Original secret title', description: 'Identifying description', admin_xid: 'secret-admin'}, users: [{avatar: 'png', directory: 'secret-avatar'}]}));
  }
  noDisclosure(owner.renderDiscoverHub({address: HUB, title: 'Original secret title', description: 'Identifying description', directory: 'secret-admin'}));
  assert.equal(calls.length, 0, 'rendering a removal must not fetch the target');
});

test('manual preview, copy, join and ordinary-filter override cannot bypass a removal', () => {
  const {owner, block, calls, event} = fixture(); block();
  owner.add_value = HUB;
  owner.handleAddClick();
  owner.handleCopyClick(event(HUB));
  owner.handleJoinClick(event(HUB));
  owner.community.handleOverride(event(HUB));
  owner.community.handleReview(event(HUB));
  assert.equal(owner.add_value, '');
  assert.equal(Object.keys(owner.manual_hubs).length, 0);
  assert.equal(owner.community.dialog, null);
  assert.equal(owner.canDownload(HUB), false);
  assert.ok(calls.length >= 5);
  assert.ok(calls.every(call => call.command === 'wrapperNotification'));
  assert.doesNotMatch(JSON.stringify(calls), new RegExp(HUB));
});

test('a report dialog opened before removal immediately redacts evidence and cannot submit', () => {
  const {owner, block, event, Page, context, calls} = fixture();
  Page.user = {hub: OTHER};
  owner.community.handleReview(event(HUB));
  owner.community.dialog.note = 'Identifying description';
  block();
  noDisclosure(owner.community.renderDialog());
  let saved = 0; context.HubCommunity.saveReview = () => saved++;
  owner.community.handleSave();
  assert.equal(saved, 0);
  assert.equal(calls.some(call => call.command === 'fileWrite'), false);
});

test('central mergerSiteAdd rejects each batch shape atomically, even with ordinary filters bypassed', async () => {
  const {Page, block, calls} = fixture(); block();
  Page.content_hubs.canDownload = () => true;
  for (const params of [HUB, [HUB], [[OTHER, HUB]], [OTHER, HUB], {addresses: [OTHER, HUB]}, {address: HUB}]) {
    let result;
    Page.cmd('mergerSiteAdd', params, value => result = value);
    assert.equal(result.removal_status, 'removed');
    assert.doesNotMatch(JSON.stringify(result), new RegExp(HUB));
  }
  await assert.rejects(Page.cmd('mergerSiteAdd', HUB), error => error.removal_status === 'removed');
  assert.equal(calls.filter(call => call.command === 'mergerSiteAdd').length, 0);
  assert.equal(Page.hub_adds.size, 0);
});

test('unavailable verification fails mutations safely; local unseeding remains available', () => {
  const {Page, block, calls} = fixture(); block(HUB, 'verification_unavailable');
  for (const command of ['fileWrite', 'siteSign', 'sitePublish', 'fileNeed', 'optionalFilePin', 'bigfileUploadInit']) {
    let result;
    Page.cmd(command, {inner_path: `merged-EpixPost/${HUB}/data/users/alice.epix/content.json`}, value => result = value);
    assert.equal(result.removal_status, 'verification_unavailable');
  }
  Page.cmd('mergerSiteDelete', HUB, () => {});
  assert.deepEqual(calls.map(call => call.command), ['mergerSiteDelete']);
});

test('incoming rows and already-cached post, profile, thread and activity views honor removals', () => {
  const {Page, block, calls, context} = fixture(); block();
  let rows;
  Page.cmd('dbQuery', 'SELECT * FROM json', value => rows = value);
  calls.at(-1).cb([{site: HUB, body: 'Identifying description'}, {site: OTHER, body: 'Allowed'}]);
  assert.deepEqual(Array.from(rows, row => row.body), ['Allowed']);
  for (const Class of [context.ContentProfile, context.ContentThread]) {
    const view = Object.create(Class.prototype); view.hub = HUB;
    noDisclosure(view.render());
  }
  const post = Object.create(context.Post.prototype); post.row = {site: HUB, body: 'Identifying description'};
  assert.equal(post.render(), null);
  const user = new context.User({hub: HUB, auth_address: 'alice.epix'});
  assert.equal(user.renderGridCard(), null);
  assert.equal(user.renderList(), null);
  const avatarAttrs = {href: '?Profile/' + HUB + '/alice', title: HUB, 'data-hub': HUB, onclick() {}};
  const avatar = user.renderAvatar(avatarAttrs);
  assert.equal(avatar.selector, 'span.avatar');
  assert.doesNotMatch(JSON.stringify(avatar), new RegExp(HUB));
  assert.deepEqual(Object.keys(avatarAttrs), ['style']);
  const activity = Object.create(context.ActivityList.prototype);
  assert.equal(activity.renderActivity([{site: OTHER, subject: {hub: HUB}}]).length, 0);
  assert.equal(activity.renderActivity([{site: OTHER, subject_hub: HUB, subject: {}}]).length, 0);
});

test('hub announcement cannot start or complete after its target is removed', () => {
  const {Page, context, block, policy, calls} = fixture();
  const user = new context.User({hub: OTHER, auth_address: 'alice.epix'});
  Page.user = user; Page.user_hubs = {[OTHER]: {}};
  let read; user.getData = (site, cb) => { read = cb; };
  let result;
  block();
  user.announceHub(HUB, 'Original secret title', '', value => result = value);
  assert.ok(result.error); assert.equal(read, undefined);
  policy.decisions.delete(HUB); result = null;
  user.announceHub(HUB, 'Original secret title', '', value => result = value);
  block(); read({});
  assert.ok(result.error);
  assert.equal(calls.some(call => call.command === 'fileWrite'), false);
});

test('profile save drops removed announcements and rechecks source authority before publication', () => {
  const {Page, context, block, calls} = fixture();
  const user = new context.User({hub: OTHER, auth_address: 'alice.epix'});
  block();
  let published;
  user.save({hub_announce: [{address: HUB, title: 'Original secret title'}]}, OTHER, () => {}, value => published = value);
  const write = calls.find(call => call.command === 'fileWrite');
  assert.deepEqual(JSON.parse(write.params[1]).hub_announce, []);
  block(OTHER); write.cb('ok');
  assert.ok(published.error);
  assert.equal(calls.some(call => call.command === 'sitePublish'), false);
});

test('node notification queries exclude removed hubs and replace their own scope on refresh', () => {
  const {Page, block, policy, calls} = fixture(); block();
  const query = "SELECT '?Post/' || json.site || '/alice/1' AS url, body FROM post LEFT JOIN json USING(json_id)";
  Page.cmd('feedFollow', [{Posts: [query, ['']]}], () => {});
  const first = calls.at(-1).params;
  assert.doesNotMatch(first[0].Posts[0], new RegExp(HUB));
  assert.match(first[0].Posts[0], new RegExp(OTHER));
  policy.decisions.delete(HUB);
  Page.cmd('feedFollow', first, () => {});
  const second = calls.at(-1).params[0].Posts[0];
  assert.equal(second.match(/epix-removal-feed-v1/g).length, 1);
  assert.match(second, new RegExp(HUB));
});


test('real root-pinned adapter drives app gates, including uppercase and legacy merged targets', async () => {
  const Registry = require('../js/utils/RemovalRegistry.js');
  const PolicyClient = require('../js/utils/RemovalPolicy.js');
  const {context, Page, owner, calls} = fixture();
  const legacy = '17Ayo82FwgH2cL7HuFKNT8tdFfBSVLbPVR';
  const policyId = 'epix-xite-removal-v1';
  const snapshot = Registry.buildSnapshot({policyId, authority: OTHER, sequence: 1, issuedAt: 100, expiresAt: 0,
    records: [HUB, legacy].map((address, index) => ({
      removedKey: Registry.targetKey(policyId, 'address', address), policyId, subjectKind: 'address',
      action: 'remove', reasonCode: 'malware', decisionId: 'R-' + index, revision: 1, authority: OTHER
    }))});
  const client = new PolicyClient(() => Page, {now: () => 200, timeout: 100});
  context.window.RemovalPolicy = context.RemovalPolicy = client;
  Page.bridgeResponder = (command, params, cb) => {
    if (command === 'fileGet') cb(JSON.stringify(snapshot));
    else if (command === 'wrapperSetLocalStorage') cb(undefined);
  };
  Page.address = OTHER;
  Page.site_info = {content: {address: OTHER, settings: {removals: {policyId, snapshot: 'removals.json', checkpoint: snapshot.checkpoint}}}};
  Page.checkUser = cb => { if (cb) cb(); };
  Page.configureRemovalPolicy(Page.site_info);
  await client.ready();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.check(OTHER).status, 'allowed');
  noDisclosure(owner.renderHub({address: HUB, type: 'seeded', content: {title: 'Original secret title'}, users: []}));
  for (const target of [HUB.toUpperCase(), legacy, 'not-an-address']) {
    let result;
    Page.cmd('fileWrite', [`merged-EpixPost/${target}/data/users/alice.epix/data.json`, '{}'], value => result = value);
    assert.ok(result.error);
  }
  let rows;
  Page.cmd('dbQuery', 'SELECT * FROM json', value => rows = value);
  calls.at(-1).cb([{site: HUB.toUpperCase()}, {site: legacy}, {site: 'not-an-address'}, {site: OTHER}]);
  assert.deepEqual(Array.from(rows, row => row.site), [OTHER]);
  assert.equal(calls.some(call => call.command === 'fileWrite'), false);
});


test('policy refresh re-scopes persisted feeds when the removed hub was the only profile', async () => {
  const {Page, context, policy, block} = fixture();
  const shell = Page.shell = Object.create(context.Shell.prototype);
  shell.follows = {};
  Page.user = {hub: HUB, row: {user_name: 'Alice'}};
  Page.checkUser = () => { Page.user = {}; };
  let stored = {};
  Page.bridgeResponder = (command, params, cb) => {
    if (command === 'feedListFollow') cb(stored);
    if (command === 'feedFollow') stored = params[0];
  };
  const query = "SELECT '?Post/' || json.site || '/alice/1' AS url, body FROM post LEFT JOIN json USING(json_id)";
  Page.cmd('feedFollow', [{'Post follow': [query, ['alice_1']]}]);
  assert.match(stored['Post follow'][0], new RegExp(HUB));
  policy.configure = () => { block(); return Promise.resolve(); };
  Page.configureRemovalPolicy(Page.site_info);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(Page.user.row, undefined);
  assert.doesNotMatch(stored['Post follow'][0], new RegExp(HUB));
  assert.match(stored['Post follow'][0], new RegExp(OTHER));
  assert.deepEqual(Array.from(stored['Post follow'][1]), ['alice_1']);

  policy.decisions.delete(HUB);
  shell.refreshRemovalFeeds();
  assert.match(stored['Post follow'][0], new RegExp(HUB));
  policy.refresh = () => { block(); return Promise.resolve(); };
  context.PostRemoval.refresh();
  await new Promise(resolve => setImmediate(resolve));
  assert.doesNotMatch(stored['Post follow'][0], new RegExp(HUB), 'manual retry must update persisted feeds too');

  policy.decisions.delete(HUB);
  shell.refreshRemovalFeeds();
  let pendingRead;
  Page.bridgeResponder = (command, params, cb) => {
    if (command === 'feedListFollow') pendingRead = cb;
    if (command === 'feedFollow') stored = params[0];
  };
  block();
  shell.refreshRemovalFeeds();
  shell.saveFollows();
  pendingRead(stored);
  assert.doesNotMatch(stored['Post follow'][0], new RegExp(HUB), 'an anonymous save must not cancel a pending policy refresh');
});
