const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const HUB = 'epix12fdtj0j77kltvdw2eqfzw392mr34r2al22mqrf';
const OTHER = 'epix1p0stmcza0xjkvv0vnjlk0ypr7xsunt4lxkhgcm';

function setup() {
  const calls = [];
  const page = {
    local_storage: {settings: {}}, merged_sites: {}, user: null,
    site_info: {content: {settings: {default_hubs: {}}}},
    on_user_info: {then() {}}, on_loaded: {resolved: true},
    projector: {scheduleRender() {}}, saveLocalStorage() { calls.push({command: 'saveLocalStorage'}); },
    getUserIdentity() { return JSON.stringify([this.site_info.cert_user_id, this.site_info.xid_directory]); },
    cmd(command, params, cb) { calls.push({command, params, cb}); },
    retryHubDownload(address, cb) { calls.push({command: 'download', address, allowed: this.content_hubs.canDownload(address)}); if (cb) cb('ok'); },
    getHubDownload() { return {state: 'idle'}; },
    isHubReady(site) { return !site.bad_files && !site.tasks; },
    getHubTitle(address) { return address; }, returnFalse() { return false; }
  };
  const context = vm.createContext({
    window: {}, Page: page, _: s => s, console, Date, setTimeout: () => 0, clearTimeout() {},
    Time: {timestamp: () => Math.floor(Date.now()/1000), since: () => 'recently'},
    Text: {formatUsername: s => s}, LogMixin: {}, Animation: {},
    h(selector, props, children) {
      if (children === undefined && (Array.isArray(props) || typeof props !== 'object' || props === null)) { children = props; props = {}; }
      return {selector, properties: props || {}, children: (Array.isArray(children) ? children : [children]).flat().filter(x => x != null)};
    }
  });
  for (const file of ['js/utils/HubCommunity.js','js/HubCommunityView.js','js/ContentHubs.js','js/ContentCreateProfile.js','js/Onboarding.js']) {
    require("./helpers/removal-fixture.cjs")(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'), context);
    Object.assign(context, context.window);
  }
  const owner = page.content_hubs = new context.ContentHubs();
  owner.need_update = false;
  owner.community.loaded = true;
  const event = (address, extra={}) => ({currentTarget: {attributes:{address:{value:address}},getAttribute: key => key === 'address' ? address : extra[key],...extra}});
  const texts = node => typeof node === 'string' ? node : node && node.children ? node.children.map(texts).join(' ') : '';
  const walk = node => !node || typeof node !== 'object' ? [] : [node,...(node.children || []).flatMap(walk)];
  return {page,owner,view:owner.community,model:context.HubCommunity,calls,event,texts,walk,context};
}

function report(model, address, fields={}) {
  model.summaries = model.summarize([{
    address,source:OTHER,directory:'data/users/reviewer.epix',cert_auth_type:'xid',cert_user_id:'reviewer@xid.epix',
    date_added:Math.floor(Date.now()/1000),...fields
  }]);
  model.latest = Object.fromEntries(Object.values(model.summaries).flatMap(summary =>
    summary.evidence.map(row => [row.identity + '/' + row.address, row])));
}

test('adult and unavailable reports filter before download; preferences and evidence never fetch a hub', () => {
  const {model,view,owner,page,event,calls} = setup();
  report(model,HUB,{rating:'a',availability:'unavailable'});
  assert.equal(owner.canDownload(HUB),false);
  assert.equal(view.reasons(HUB).length,2);
  owner.handleDownloadClick(event(HUB));
  view.handleReview(event(HUB));
  view.handleFilter(event(null,{'data-filter':'politics',checked:true}));
  view.handleShowFiltered();
  assert.equal(page.local_storage.settings.hub_filters.politics,true);
  assert.equal(calls.some(c => c.command === 'download' || c.command === 'mergerSiteAdd' || c.command === 'fileGet'),false);
  assert.equal(owner.canDownload(HUB),false,'showing metadata is not download consent');
});

test('explicit override applies to one synchronous request without changing filters', () => {
  const {model,view,owner,event,calls} = setup();
  report(model,HUB,{rating:'a'});
  view.handleOverride(event(HUB));
  const attempts = calls.filter(c => c.command === 'download');
  assert.equal(attempts.length,1);
  assert.equal(attempts[0].allowed,true);
  assert.equal(owner.canDownload(HUB),false);
  assert.equal(view.preferences().adult,true);
});

test('previewing a valid manual address does not acquire it and malformed addresses are rejected', () => {
  const {owner,calls} = setup();
  owner.add_value = HUB;
  owner.handleAddClick();
  assert.equal(owner.manual_hubs[HUB].address,HUB);
  owner.add_value = 'https://evil.invalid/epix1foo';
  owner.handleAddClick();
  assert.equal(Object.keys(owner.manual_hubs).length,1);
  assert.equal(calls.filter(c => /download|mergerSiteAdd|fileGet/.test(c.command)).length,0);
});

test('hidden seeded hubs remain manageable while filtered discovery is excluded', () => {
  const {owner,view,page,event,texts} = setup();
  owner.hubs=[{address:HUB,type:'seeded',content:{title:'Seeded',admin_xid:'reviewer.epix'},users:[]}];
  page.merged_sites[HUB]={};
  owner.discover=[{address:OTHER,title:'Hidden discovery'}];
  view.handleHide(event(HUB)); view.handleHide(event(OTHER));
  let output = texts(owner.render());
  assert.match(output,/Seeded/);
  assert.doesNotMatch(output,/Hidden discovery/);
  assert.match(output,/Already downloaded/);
  view.handleShowFiltered();
  output = texts(owner.render());
  assert.match(output,/Hidden discovery/);
  assert.equal(view.canDownload(OTHER),false);
});

test('a query failure preserves the hub list and renders a retry instead of crashing', () => {
  const {owner,calls,texts} = setup();
  owner.hubs=[{address:HUB,type:'seeded',content:{title:'Retained',admin_xid:'reviewer.epix'},users:[]}];
  owner.updateHubs();
  calls.find(c=>c.command==='mergerSiteList').cb({error:'busy'});
  assert.equal(owner.hubs.length,1);
  assert.match(texts(owner.render()),/Hub list could not be loaded/);
});

test('community evidence and publisher text remain text nodes, with no remote images', () => {
  const {view,model,event,walk,texts} = setup();
  report(model,HUB,{rating:'a',reason:'spam',topics:['politics'],note:'<img src="https://invalid/" onerror="alert(1)">'});
  view.handleReview(event(HUB));
  const tree=view.renderDialog();
  assert.match(texts(tree),/<img src=/);
  assert.equal(walk(tree).some(n=>n.selector.startsWith('img') || n.properties.innerHTML),false);
});

test('review drafts from the previous account cannot be submitted', () => {
  const {page,view,model,event,calls} = setup();
  page.site_info={cert_user_id:'alice@xid.epix',xid_directory:'alice.epix'};page.user={hub:OTHER};
  view.handleReview(event(HUB));
  page.site_info={cert_user_id:'bob@xid.epix',xid_directory:'bob.epix'};
  let saves=0;model.saveReview=()=>{saves++;};
  view.handleSave();
  assert.equal(saves,0);
  assert.match(view.dialog.error,/account changed/);
  assert.equal(calls.length,0);
});

test('publishing errors retain the review form and never look successful', () => {
  const {page,view,model,event} = setup();
  page.site_info={cert_user_id:'alice@xid.epix',xid_directory:'alice.epix'};page.user={hub:OTHER};
  view.handleReview(event(HUB));
  view.dialog.rating='m';
  model.saveReview=(address,fields,cb)=>cb({error:'Publication failed'});
  view.handleSave();
  assert.equal(view.saving,false);
  assert.match(view.dialog.error,/Publication failed/);
});

test('new community controls give repeated Maquette selectors distinct sibling keys', () => {
  const {page,view,owner,model,event,walk} = setup();
  page.site_info={cert_user_id:'alice@xid.epix',xid_directory:'alice.epix'};page.user={hub:OTHER};
  report(model,HUB,{rating:'a',availability:'unavailable',topics:['politics'],reason:'spam',note:'A note'});
  view.handleReview(event(HUB));
  const roots=[view.renderSummary(HUB),view.renderDialog(),view.renderFilters()];
  for (const node of roots.flatMap(walk)) {
    const groups=new Map();
    for (const child of node.children.filter(x=>x && typeof x==='object')) {
      const items=groups.get(child.selector)||[];items.push(child);groups.set(child.selector,items);
    }
    for (const [selector,children] of groups) {
      if (children.length<2) continue;
      assert.ok(children.every(c=>c.properties.key!=null),`${node.selector}: ${selector} needs keys`);
      assert.equal(new Set(children.map(c=>c.properties.key)).size,children.length);
    }
  }
});

test('a late successful report request cannot undo a newer failure', () => {
  const {view,model} = setup();
  const responses=[];
  model.load=cb=>responses.push(cb);
  view.load();view.load();
  responses[1]({error:'database unavailable'});
  responses[0]('ok');
  assert.equal(view.loaded,false);
  assert.match(view.error,/could not be loaded/);
  assert.equal(view.canDownload(HUB),false);
});

test('a superseded or incomplete model load never enables downloads', () => {
  for (const response of [{error:'Report load superseded'}, {superseded:true}, null]) {
    const {view,model} = setup();
    model.load=cb=>cb(response);
    view.load();
    assert.equal(view.loaded,false);
    assert.match(view.error,/could not be loaded/);
    assert.equal(view.canDownload(HUB),false);
  }
});

test('a lost publication response does not trap the reader in a modal', () => {
  const {page,view,model,event} = setup();
  page.site_info={cert_user_id:'alice@xid.epix',xid_directory:'alice.epix'};page.user={hub:OTHER};
  view.handleReview(event(HUB));view.dialog.rating='g';
  let reply;model.saveReview=(address,fields,cb)=>{reply=cb;};
  view.handleSave();
  assert.equal(view.saving,true);
  view.handleClose();
  assert.equal(view.dialog,null);
  view.handleReview(event(OTHER));
  reply('ok');
  assert.equal(view.dialog.address,OTHER,'a late save cannot close a different review');
  assert.equal(view.saving,false);
});

test('an incomplete seeded hub has Retry instead of Join', () => {
  const {page,owner,texts} = setup();
  page.getHubDownload=()=>({state:'unavailable',message:'Missing files'});
  const card=owner.renderHub({address:HUB,type:'seeded',content:{title:'Partial',admin_xid:'alice.epix'},users:[],bad_files:3});
  assert.match(texts(card),/Retry download/);
  assert.doesNotMatch(texts(card),/Join/);
});

test('partial hubs cannot advance onboarding or be joined from the profile picker', () => {
  const {page,context,calls} = setup();
  const partial={address:HUB,content:{title:'Incomplete'},bad_files:2};
  const ready={address:OTHER,content:{title:'Complete'},bad_files:0};
  page.merged_sites={[HUB]:partial};
  const onboarding=new context.Onboarding();
  assert.equal(onboarding.isHubConnected(),false);
  page.merged_sites[OTHER]=ready;
  assert.equal(onboarding.isHubConnected(),true);
  const picker=new context.ContentCreateProfile();
  page.content_hubs.community.load=()=>{};
  picker.updateHubs();
  calls.find(c=>c.command==='mergerSiteList').cb(page.merged_sites);
  calls.find(c=>c.command==='dbQuery').cb([]);
  assert.equal(picker.hubs.length,1);
  assert.equal(picker.hubs[0].address,OTHER);
  let route;
  page.setUrl=value=>{route=value;};
  picker.joinHub(HUB);
  assert.equal(route,'?Hubs');
});
