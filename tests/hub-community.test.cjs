const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const crypto = require("node:crypto");

const SOURCE = "epix12fdtj0j77kltvdw2eqfzw392mr34r2al22mqrf";
const TARGET = "epix1searchd8hcnyfacvklmszzxwx9ptnf5rde04xf";
const OTHER = "epix1p0stmcza0xjkvv0vnjlk0ypr7xsunt4lxkhgcm";
const NOW = 1792699200;
const SIGNERS = {alice: OTHER, bob: TARGET, carol: SOURCE};
const KEYS = Object.fromEntries(Object.values(SIGNERS).map(address => [address,
  crypto.generateKeyPairSync("ec", {namedCurve: "secp256k1"})]));
function messageFor(record, identity) {
  const topics = ["politics", "religion", "violence"].filter(topic => (typeof record.topics === "string" ? record.topics.split(",") : []).includes(topic));
  return JSON.stringify(["EpixPost hub community review", 1, identity, record.signer, record.address.toLowerCase(),
    record.deleted ? null : record.rating || null, record.deleted ? null : record.availability || null,
    record.deleted ? [] : topics, record.deleted ? null : record.reason || null,
    record.deleted ? "" : record.note || "", record.date_added, !!record.deleted]);
}
function signMessage(message, signer) {
  return Buffer.concat([Buffer.from([27]), crypto.sign("sha256", Buffer.from(message),
    {key: KEYS[signer].privateKey, dsaEncoding: "ieee-p1363"})]).toString("base64");
}
function verifyMessage(message, signer, signature) {
  return !!KEYS[signer] && crypto.verify("sha256", Buffer.from(message),
    {key: KEYS[signer].publicKey, dsaEncoding: "ieee-p1363"}, Buffer.from(signature, "base64").subarray(1));
}
const plain = (value) => JSON.parse(JSON.stringify(value));

function fixture() {
  const calls = [];
  const timers = new Map();
  let timerId = 0, elapsed = 0;
  let rulesResolver = (innerPath) => {
    const identity = innerPath.split("/")[4];
    return {user_address: identity, cert_signers: {"xid.epix": ["chain"]}, signers: [identity]};
  };
  let snapshotResolver = (identity) => {
    const name = identity.replace(/\.epix$/, "");
    return {name, tld:"epix", identities:[{address:SIGNERS[name], active:true, revoked_at:0, revoked_at_time:0}]};
  };
  let verifyResolver = (params) => verifyMessage(...params);
  let signResolver = (params) => signMessage(params[0], Page.site_info.auth_address);
  const Page = {
    site_info: {auth_address: SIGNERS.alice, cert_user_id: "alice@xid.epix", xid_directory: "alice.epix",
      content: {settings: {default_hubs: {[SOURCE]: {}}}}},
    user_hubs: {[SOURCE]: {}}, merged_sites: {[SOURCE]: {}, [OTHER]: {}},
    user: {hub: SOURCE, getPath: (hub) => `merged-EpixPost/${hub}/data/users/${Page.site_info.xid_directory}`},
    cmd(cmd, params, cb) {
      const call = {cmd, params, cb};
      calls.push(call);
      if (cmd === "fileRules" && rulesResolver) { call.used = true; cb(rulesResolver(params[0])); }
      if (cmd === "xidResolveName" && snapshotResolver) { call.used = true; cb(snapshotResolver(params[0])); }
      if (cmd === "ecdsaVerify" && verifyResolver) { call.used = true; cb(verifyResolver(params)); }
      if (cmd === "ecdsaSign" && signResolver) { call.used = true; cb(signResolver(params)); }
    }
  };
  const context = {window: {}, Page,
    Date: class extends Date { static now() { return NOW * 1000 + elapsed; } },
    setTimeout(fn, delay) { timers.set(++timerId, {fn, due:elapsed + delay}); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    Text: {fileEncode: (value) => Buffer.from(JSON.stringify(value)).toString("base64")}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/utils/HubCommunity.js"), "utf8"), context);
  const community = context.window.HubCommunity;
  function take(cmd) {
    const call = calls.find((item) => !item.used && item.cmd === cmd);
    assert.ok(call, `Expected ${cmd}, got ${calls.filter((item) => !item.used).map((item) => item.cmd)}`);
    call.used = true;
    return call;
  }
  function answer(cmd, result) { take(cmd).cb(result); }
  function beginSave(fields = {rating: "g"}, rows = [], file = null) {
    const results = [];
    community.saveReview(TARGET, fields, (result) => results.push(plain(result)));
    answer("dbQuery", rows);
    answer("fileGet", file);
    return results;
  }
  function advance(ms) {
    elapsed += ms;
    for (const [id, timer] of [...timers]) if (timer.due <= elapsed) { timers.delete(id); timer.fn(); }
  }
  return {community, Page, calls, take, answer, beginSave, advance, setRulesResolver: (resolver) => { rulesResolver = resolver; },
    setSnapshotResolver: (resolver) => { snapshotResolver = resolver; },
    setVerifyResolver: (resolver) => { verifyResolver = resolver; },
    setSignResolver: (resolver) => { signResolver = resolver; }};
}

function row(identity = "alice", changes = {}) {
  const record = {source: SOURCE, directory: `data/users/${identity}.epix`, cert_auth_type: "xid", cert_user_id: `${identity}@xid.epix`,
    address: TARGET, rating: null, availability: null, topics: "", reason: null, note: "", date_added: NOW - 1, deleted: 0, signer:SIGNERS[identity] || SIGNERS.alice, signature_version:1, ...changes};
  if (!Object.hasOwn(changes, "signature")) record.signature = signMessage(messageFor(record, identity+".epix"), record.signer);
  return record;
}

test("hub targets use canonical checksum-checked addresses, never paths or URLs", () => {
  const {community} = fixture();
  assert.equal(community.normalizeAddress(` ${TARGET.toUpperCase()} `), TARGET);
  for (const address of [`/${TARGET}`, `https://post.epix/${TARGET}`, TARGET.slice(0, -1) + "q", "epix1bad", TARGET.slice(0, 8).toUpperCase() + TARGET.slice(8), null]) {
    assert.equal(community.normalizeAddress(address), null);
  }
});

test("classifications and topics inform opt-outs without claiming consensus", () => {
  const {community} = fixture();
  const summary = community.summarize([
    row("alice", {rating: "g", availability: "available"}),
    row("bob", {rating: "a", topics: "politics,violence", availability: "unavailable", reason: "scam", note: "Observed a misleading login."}),
    row("carol", {rating: "m", topics: "religion"})
  ], NOW)[TARGET];
  assert.equal(summary.rating, "a");
  assert.deepEqual(plain(summary.rating_counts), {g: 1, m: 1, a: 1});
  assert.equal(summary.availability, "mixed");
  assert.deepEqual(plain(summary.topics), ["politics", "religion", "violence"]);
  assert.equal(summary.review_count, 3);
  assert.equal(summary.report_count, 1);
  assert.equal(summary.reason_counts.scam, 1);
  assert.equal(summary.evidence.find((item) => item.identity === "bob.epix").note, "Observed a misleading login.");
});

test("one identity counts once across records and hubs, latest update reverses prior report", () => {
  const {community} = fixture();
  const rows = [row("alice", {rating: "a", availability: "unavailable", reason: "spam"}),
    row("alice", {source: OTHER, rating: "g", availability: "available", date_added: NOW})];
  rows.push({...rows[0]}, {...rows[1]});
  const summary = community.summarize(rows, NOW)[TARGET];
  assert.equal(summary.review_count, 1);
  assert.equal(summary.rating, "g");
  assert.equal(summary.availability, "available");
  assert.equal(summary.report_count, 0);
});

test("a newer or equal-timestamp withdrawal survives stale copies and query reordering", () => {
  const {community} = fixture();
  const live = row("alice", {rating: "a"});
  const tombstone = row("alice", {source: OTHER, deleted: 1});
  assert.deepEqual(plain(community.summarize([live, tombstone], NOW)), {});
  assert.deepEqual(plain(community.summarize([tombstone, live], NOW)), {});
  const tied = [row("alice", {rating: "g"}), row("alice", {rating: "a", source: OTHER})];
  assert.deepEqual(plain(community.summarize(tied, NOW)), plain(community.summarize(tied.reverse(), NOW)));
});

test("stale availability remains auditable without claiming current unavailability", () => {
  const {community} = fixture();
  const summary = community.summarize([row("alice", {rating: "m", availability: "unavailable", date_added: NOW - 31 * 86400})], NOW)[TARGET];
  assert.equal(summary.availability, "unknown");
  assert.equal(summary.stale_availability_count, 1);
  assert.equal(summary.evidence[0].availability_stale, true);
  assert.equal(summary.rating, "m");
});

test("forged identities, malformed data, unknown fields, and future dates cannot add votes", () => {
  const {community} = fixture();
  const bad = [
    {cert_auth_type: "web"}, {cert_user_id: null}, {directory: "data/users/bob.epix"},
    {directory: "data/users/epix1raw"}, {cert_user_id: "alice@attacker.epix"},
    {address: TARGET.slice(0, -1) + "q"}, {source: "../../other"}, {date_added: NOW + 121},
    {date_added: "1792699200"}, {date_added: Infinity}, {date_added: 0},
    {rating: "x"}, {availability: "dead"}, {topics: "politics,unknown"}, {topics: {}},
    {reason: "illegal"}, {note: "x".repeat(281)}, {deleted: "true"}
  ];
  assert.deepEqual(plain(community.summarize(bad.map((changes) => row("alice", {rating: "a", ...changes})), NOW)), {});
  assert.equal(community.getIdentity(row("alice", {directory: "data/users/alice.foo", cert_user_id: "alice.foo@xid.epix"})), "alice.foo");
});

test("load queries signed metadata and own-review lookup follows the selected identity", () => {
  const {community, Page, take} = fixture();
  const results = [];
  community.load((result) => results.push(result));
  const query = take("dbQuery");
  assert.match(query.params, /json\.cert_auth_type, json\.cert_user_id/);
  query.cb([row("alice", {rating: "m"}), row("bob", {rating: "a"})]);
  assert.equal(results[0], "ok");
  assert.equal(community.getOwnReview(TARGET).rating, "m");
  Page.site_info.cert_user_id = "bob@xid.epix";
  Page.site_info.xid_directory = "bob.epix";
  assert.equal(community.getOwnReview(TARGET).rating, "a");
  assert.equal(community.getSummary(OTHER).review_count, 0);
});

test("untrusted source rules cannot impersonate an xId or contribute community votes", () => {
  const maliciousRules = [
    {user_address: "alice.epix", cert_signers: {"xid.epix": ["attacker-key"]}, signers: ["alice.epix"]},
    {user_address: "alice.epix", cert_signers: {"xid.epix": ["chain", "attacker-key"]}, signers: ["alice.epix"]},
    {user_address: "bob.epix", cert_signers: {"xid.epix": ["chain"]}, signers: ["alice.epix"]},
    {user_address: "alice.epix", cert_signers: {"xid.epix": ["chain"]}, signers: ["alice.epix"], cert_signers_pattern: ".*"},
    null
  ];
  for (const rules of maliciousRules) {
    const {community, answer, setRulesResolver, calls} = fixture();
    setRulesResolver(() => rules);
    let result;
    community.load((value) => { result = value; });
    answer("dbQuery", [row("alice", {rating: "a"})]);
    assert.equal(result, "ok");
    assert.equal(community.getSummary(TARGET).review_count, 0);
    assert.match(community.warning, /could not be verified/);
    assert.equal(community.rejected_source_count, 1);
    assert.equal(calls.find((call) => call.cmd === "fileRules").params[0], `merged-EpixPost/${SOURCE}/data/users/alice.epix/content.json`);
    assert.equal(calls.some((call) => JSON.stringify(call.params).includes(TARGET)), false);
  }
});

test("unjoined source data and forged certificate rows cause no source or target fetch", () => {
  const {community, Page, calls, answer} = fixture();
  delete Page.merged_sites[SOURCE];
  community.load();
  answer("dbQuery", [row("alice", {rating: "a"}), row("bob", {cert_user_id: "alice@xid.epix", rating: "a"})]);
  assert.equal(community.getSummary(TARGET).review_count, 0);
  assert.match(community.warning, /incomplete/);
  assert.equal(calls.length, 1);
});

test("a rejected source does not erase valid community evidence from a different source", () => {
  const {community, answer, setRulesResolver} = fixture();
  setRulesResolver((innerPath) => innerPath.includes("bob.epix") ? {cert_signers: {}} :
    {user_address: "alice.epix", cert_signers: {"xid.epix": ["chain"]}, signers: ["alice.epix"]});
  community.load();
  answer("dbQuery", [row("alice", {rating: "m"}), row("bob", {rating: "a"})]);
  assert.equal(community.getSummary(TARGET).rating, "m");
  assert.match(community.warning, /incomplete/);
});

test("out-of-order source verification cannot overwrite a newer load", () => {
  const {community, answer, take, setRulesResolver} = fixture();
  setRulesResolver(null);
  community.load(); answer("dbQuery", [row("alice", {rating: "a"})]);
  const oldRules = take("fileRules");
  community.load(); answer("dbQuery", [row("alice", {rating: "g", date_added: NOW})]);
  const newRules = take("fileRules");
  const rules = {user_address: "alice.epix", cert_signers: {"xid.epix": ["chain"]}, signers: ["alice.epix"]};
  newRules.cb(rules);
  oldRules.cb(rules);
  assert.equal(community.getSummary(TARGET).rating, "g");
});

test("database errors preserve known reviews and never masquerade as an empty directory", () => {
  const {community, answer} = fixture();
  community.load(); answer("dbQuery", [row("alice", {rating: "m"})]);
  let result;
  community.load((value) => { result = value; }); answer("dbQuery", {error: "SQL failure"});
  assert.match(result.error, /SQL failure/);
  assert.equal(community.getSummary(TARGET).rating, "m");
});

test("save uses an existing joined hub, preserves unrelated data, and waits for publication", () => {
  const {beginSave, take, answer, calls} = fixture();
  const unrelated = {address: OTHER, rating: "m", availability: null, topics: "", date_added: NOW - 9};
  const results = beginSave({rating: "a", topics: ["politics"], note: "Classification"}, [], JSON.stringify({custom: 7, hub_review: [unrelated]}));
  const write = take("fileWrite");
  assert.equal(write.params[0], `merged-EpixPost/${SOURCE}/data/users/alice.epix/hub_reviews.json`);
  const body = JSON.parse(Buffer.from(write.params[1], "base64").toString());
  assert.equal(body.custom, 7);
  assert.deepEqual(body.hub_review[0], unrelated);
  assert.equal(body.hub_review[1].address, TARGET);
  assert.equal(body.hub_review[1].topics, "politics");
  assert.deepEqual(results, []);
  write.cb("ok");
  const publish = take("sitePublish");
  assert.equal(publish.params.inner_path, `merged-EpixPost/${SOURCE}/data/users/alice.epix/content.json`);
  assert.deepEqual(results, []);
  publish.cb("ok"); answer("dbQuery", [row("alice", body.hub_review[1])]);
  assert.deepEqual(results, ["ok"]);
  assert.equal(calls.some((call) => /mergerSiteAdd|siteDownload|fileNeed/.test(call.cmd)), false);
});

test("clear publishes a persistent tombstone newer than the user's copies on other hubs", () => {
  const {community, answer, take} = fixture();
  const results = [];
  community.clearReview(TARGET, (result) => results.push(plain(result)));
  answer("dbQuery", [row("alice", {source: OTHER, rating: "a", date_added: NOW})]);
  answer("fileGet", JSON.stringify({hub_review: [row("alice", {rating: "a"})]}));
  const write = take("fileWrite");
  const body = JSON.parse(Buffer.from(write.params[1], "base64").toString());
  assert.equal(body.hub_review.length, 1);
  assert.equal(body.hub_review[0].deleted, 1);
  assert.equal(body.hub_review[0].date_added, NOW + 1);
  write.cb("ok"); answer("sitePublish", "ok"); answer("dbQuery", [row("alice", body.hub_review[0])]);
  assert.deepEqual(results, ["ok"]);
  assert.equal(community.getOwnReview(TARGET), null);
});

test("same-page writes serialize and reread the file so updating another hub does not lose reviews", () => {
  const {community, calls, answer, take} = fixture();
  const results = [];
  community.saveReview(TARGET, {rating: "a"}, (result) => results.push(result));
  community.saveReview(OTHER, {rating: "m"}, (result) => results.push(result));
  assert.equal(calls.filter((call) => call.cmd === "dbQuery").length, 1);
  answer("dbQuery", []); answer("fileGet", null);
  const first = take("fileWrite");
  const stored = Buffer.from(first.params[1], "base64").toString();
  first.cb("ok"); answer("sitePublish", "ok"); answer("dbQuery", []);
  answer("dbQuery", []); answer("fileGet", stored);
  const second = take("fileWrite");
  const body = JSON.parse(Buffer.from(second.params[1], "base64").toString());
  assert.deepEqual(body.hub_review.map((review) => review.address), [TARGET, OTHER]);
  second.cb("ok"); answer("sitePublish", "ok"); answer("dbQuery", []);
  assert.deepEqual(results, ["ok", "ok"]);
});

test("write and publish failures are surfaced and never reported as success", () => {
  const failedWrite = fixture();
  const writes = failedWrite.beginSave();
  failedWrite.answer("fileWrite", {error: "Read-only hub"});
  assert.deepEqual(writes, [{error: "Read-only hub"}]);
  assert.equal(failedWrite.calls.some((call) => call.cmd === "sitePublish"), false);
  const failedPublish = fixture();
  const publishes = failedPublish.beginSave();
  failedPublish.answer("fileWrite", "ok");
  failedPublish.answer("sitePublish", {error: "Signing failed"});
  assert.deepEqual(publishes, [{error: "Signing failed"}]);
});

test("malformed existing reviews are not overwritten", () => {
  for (const raw of ["{", "[]", JSON.stringify({hub_review: {}}), {error: "Read failed"}]) {
    const {beginSave, calls} = fixture();
    const results = beginSave({rating: "g"}, [], raw);
    assert.equal(typeof results[0].error, "string");
    assert.equal(calls.some((call) => call.cmd === "fileWrite"), false);
  }
});

test("identity changes before reading or writing cannot publish using the next identity", () => {
  for (const phase of ["dbQuery", "fileGet", "fileWrite"]) {
    const {community, Page, answer, calls} = fixture();
    const results = [];
    community.saveReview(TARGET, {rating: "a"}, (result) => results.push(result));
    if (phase !== "dbQuery") answer("dbQuery", []);
    if (phase === "fileWrite") answer("fileGet", null);
    Page.site_info.cert_user_id = "bob@xid.epix";
    Page.site_info.xid_directory = "bob.epix";
    answer(phase, phase === "dbQuery" ? [] : phase === "fileGet" ? null : "ok");
    assert.match(results[0].error, /identity or joined hubs changed/);
    assert.equal(calls.some((call) => call.cmd === "sitePublish"), false);
  }
});

test("reviewing a hub never joins it and cannot publish without an existing profile hub", () => {
  const {community, Page, calls} = fixture();
  Page.user_hubs = {};
  let result;
  community.saveReview(TARGET, {availability: "unavailable"}, (value) => { result = value; });
  assert.match(result.error, /Join a hub/);
  assert.equal(calls.length, 0);
});

test("saving refuses unsupported destination certificate rules before reading or writing reviews", () => {
  const {community, answer, calls, setRulesResolver} = fixture();
  setRulesResolver(() => ({user_address: "alice.epix", cert_signers: {"xid.epix": ["attacker-key"]}, signers: ["alice.epix"]}));
  let result;
  community.saveReview(TARGET, {rating: "a"}, (value) => { result = value; });
  answer("dbQuery", []);
  assert.match(result.error, /supported xId certificate rules/);
  assert.equal(calls.some((call) => ["fileGet", "fileWrite", "sitePublish"].includes(call.cmd)), false);
});

test("missing load and provenance responses terminate with visible errors or incomplete evidence", () => {
  const first = fixture();
  let result;
  first.community.load((value) => { result = value; });
  const lateQuery = first.take("dbQuery");
  first.advance(15000);
  assert.match(result.error, /timed out/);
  lateQuery.cb([row("alice", {rating: "a"})]);
  assert.equal(first.community.getSummary(TARGET).review_count, 0);
  const second = fixture();
  second.setRulesResolver(null);
  second.community.load((value) => { result = value; });
  second.answer("dbQuery", [row("alice", {rating: "a"})]);
  const lateRules = second.take("fileRules");
  second.advance(15000);
  assert.match(result.error, /timed out/);
  lateRules.cb({user_address:"alice.epix", cert_signers:{"xid.epix":["chain"]}, signers:["alice.epix"]});
  assert.equal(second.community.getSummary(TARGET).review_count, 0);
});

test("lost save callback releases the queue and late replies cannot publish or succeed", () => {
  const {community, answer, take, calls, advance} = fixture();
  const results = [];
  community.saveReview(TARGET, {rating:"a"}, (value) => results.push(plain(value)));
  community.saveReview(OTHER, {rating:"m"}, (value) => results.push(plain(value)));
  answer("dbQuery", []); answer("fileGet", null);
  const abandonedWrite = take("fileWrite");
  advance(15000);
  assert.match(results[0].error, /timed out/);
  abandonedWrite.cb("ok");
  assert.equal(calls.some((call) => call.cmd === "sitePublish"), false);
  answer("dbQuery", []); answer("fileGet", null);
  answer("fileWrite", "ok"); answer("sitePublish", "ok"); answer("dbQuery", []);
  assert.equal(results.length, 2);
  assert.equal(results[1], "ok");
  assert.equal(community.saving, false);
});

test("an uncertain publication reports uncertainty once and ignores its late success", () => {
  const {beginSave, answer, take, advance, calls} = fixture();
  const results = beginSave();
  answer("fileWrite", "ok");
  const latePublish = take("sitePublish");
  advance(15000);
  assert.match(results[0].error, /may have succeeded/);
  assert.match(results[0].error, /Reload/);
  latePublish.cb("ok");
  assert.equal(results.length, 1);
  assert.equal(calls.filter((call) => call.cmd === "dbQuery").length, 1);
});

test("total save deadline fences a long pipeline even while individual requests answer", () => {
  const {community, answer, take, advance, calls} = fixture();
  let result;
  community.saveReview(TARGET, {rating:"a"}, (value) => { result = value; });
  advance(14000); answer("dbQuery", []);
  advance(14000); answer("fileGet", null);
  advance(14000); answer("fileWrite", "ok");
  const latePublish = take("sitePublish");
  advance(3000);
  assert.match(result.error, /may have succeeded/);
  assert.equal(community.saving, false);
  latePublish.cb("ok");
  assert.equal(calls.filter((call) => call.cmd === "dbQuery").length, 1);
});

test("new schema indexes reviews alongside signed certificate metadata without a hub permission migration", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, "../dbschema.json"), "utf8"));
  // Version 3 selects the merger DB protocol in the node. Table migrations
  // use schema_changed; raising version turns this into a non-merger DB.
  assert.equal(schema.version, 3);
  const mapping = schema.maps[".+/data/users/.+/hub_reviews.json"];
  assert.deepEqual(mapping.to_table, ["hub_review"]);
  assert.equal(mapping.file_name, "data.json");
  assert.equal(mapping.fold_crdt, undefined);
  assert.ok(schema.tables.hub_review.cols.some(([name]) => name === "deleted"));
  const include = JSON.parse(fs.readFileSync(path.join(__dirname, "../hub-xite/data-default/users/content-default.json"), "utf8"));
  assert.equal(include.user_contents.permission_rules[".*"].files_allowed, ".*");
  assert.equal(include.user_contents.permission_rules[".*"].merge_files["hub_reviews.json"], undefined);
});

test("copied genuine certificate metadata and owner-signed manifests cannot forge review authors", () => {
  const {community, answer, setRulesResolver} = fixture();
  setRulesResolver(() => ({user_address:"alice.epix", cert_signers:{"xid.epix":["chain"]}, signers:["alice.epix", SOURCE]}));
  const genuine = row("alice", {rating:"m"});
  const forged = row("alice", {address:OTHER, rating:"a", signer:SOURCE});
  // Both records have the same genuine-looking cert metadata and could sit
  // in an owner-signed child manifest. Only the xId-author signature counts.
  community.load(); answer("dbQuery", [genuine, forged]);
  assert.equal(community.getSummary(TARGET).rating, "m");
  assert.equal(community.getSummary(OTHER).review_count, 0);
  assert.match(community.warning, /incomplete/);
});

test("independent signatures bind every decision field, identity, timestamp and withdrawal", () => {
  const changes = [{address:OTHER}, {rating:"a"}, {availability:"unavailable"}, {topics:"politics"},
    {reason:"scam"}, {note:"Changed"}, {date_added:NOW}, {deleted:1}, {signer:SIGNERS.bob},
    {directory:"data/users/bob.epix", cert_user_id:"bob@xid.epix"}];
  for (const change of changes) {
    const {community, answer} = fixture();
    const modified = {...row("alice", {rating:"g"}), ...change};
    community.load(); answer("dbQuery", [modified]);
    assert.equal(Object.keys(community.summaries).length, 0);
    assert.match(community.warning, /incomplete/);
  }
});

test("unsigned or unsupported signature versions never count and do not request chain proofs", () => {
  for (const change of [{signature:null}, {signature_version:2}, {signer:null}, {signature:"garbage"}]) {
    const {community, calls, answer} = fixture();
    community.load(); answer("dbQuery", [{...row("alice", {rating:"a"}), ...change}]);
    assert.equal(community.getSummary(TARGET).review_count, 0);
    assert.equal(calls.length, 1);
  }
});

test("forward name membership rejects wrong-name, inactive, revoked, and owner-only keys", () => {
  const snapshots = [
    {name:"bob",tld:"epix",identities:[{address:SIGNERS.alice,active:true}]},
    {name:"alice",tld:"other",identities:[{address:SIGNERS.alice,active:true}]},
    {name:"alice",tld:"epix",owner:SIGNERS.alice,identities:[]},
    ...[{active:false}, {active:true,revoked_at:100}, {active:true,revoked_at_time:NOW-1}, {active:true,address:SIGNERS.bob}]
      .map(entry => ({name:"alice",tld:"epix",identities:[{address:SIGNERS.alice,...entry}]}))
  ];
  for (const snapshot of snapshots) {
    const {community, answer, setSnapshotResolver} = fixture();
    setSnapshotResolver(() => snapshot);
    community.load(); answer("dbQuery", [row("alice", {rating:"a"})]);
    assert.equal(community.getSummary(TARGET).review_count, 0);
  }
});

test("operational proof and crypto failures preserve prior evidence and fail the load", () => {
  for (const phase of ["rules", "snapshot", "verify"]) {
    const state = fixture();
    state.community.load(); state.answer("dbQuery", [row("alice", {rating:"a"})]);
    if (phase === "rules") state.setRulesResolver(() => ({error:"Rules unavailable"}));
    if (phase === "snapshot") state.setSnapshotResolver(() => ({error:"Chain verification unavailable"}));
    if (phase === "verify") state.setVerifyResolver(() => ({error:"Verifier unavailable"}));
    let result;
    state.community.load(value => { result = value; });
    state.answer("dbQuery", [row("alice", {rating:"g", date_added:NOW})]);
    assert.match(result.error, /unavailable/);
    assert.equal(state.community.getSummary(TARGET).rating, "a");
  }
});

test("verification runs at most four source pipelines and deduplicates names across sources", () => {
  const state = fixture();
  state.setSnapshotResolver(null);
  state.community.load();
  state.answer("dbQuery", Array.from({length:10}, (_, index) => row("alice"+index, {rating:"a"})));
  assert.equal(state.calls.filter(call => call.cmd === "xidResolveName").length, 4);
  for (let index=0; index<10; index++) state.answer("xidResolveName", {name:"other",tld:"epix",identities:[]});
  assert.equal(state.community.getSummary(TARGET).review_count, 0);
  const dedup = fixture();
  dedup.community.load();
  dedup.answer("dbQuery", [row("alice", {rating:"a"}), row("alice", {source:OTHER,rating:"a"})]);
  assert.equal(dedup.calls.filter(call => call.cmd === "xidResolveName").length, 1);
  assert.equal(dedup.community.getSummary(TARGET).review_count, 1);
});

test("one verification timeout stops queued reviews and sources and ignores late replies", () => {
  const state = fixture();
  state.community.load(); state.answer("dbQuery", [row("alice", {rating:"a"})]);
  state.setSnapshotResolver(null);
  state.setVerifyResolver(null);
  const rows = Array.from({length:6}, (_, index) => {
    const review = row("reviewer" + index, {rating:"g"});
    return Array.from({length:84}, () => ({...review}));
  }).flat();
  const results = [];
  state.community.load(result => results.push(result));
  state.answer("dbQuery", rows);
  const proofs = Array.from({length:4}, () => state.take("xidResolveName"));
  const answerProof = call => call.cb({name:call.params[0].replace(/\.epix$/, ""), tld:"epix",
    identities:[{address:SIGNERS.alice, active:true}]});
  answerProof(proofs[0]);
  state.advance(1000);
  proofs.slice(1).forEach(answerProof);
  const pending = Array.from({length:4}, () => state.take("ecdsaVerify"));
  const requestCount = state.calls.length;
  // Only the first verifier has timed out; the other three can still reply.
  state.advance(14000);
  assert.equal(results.length, 1);
  assert.match(results[0].error, /timed out/);
  assert.equal(state.calls.length, requestCount);
  assert.equal(state.community.getSummary(TARGET).rating, "a");
  pending.forEach(call => call.cb(true));
  state.advance(15000);
  assert.equal(results.length, 1);
  assert.equal(state.calls.length, requestCount);
  assert.equal(state.community.getSummary(TARGET).rating, "a");
});

test("a superseded view load never claims success while a save refresh is pending", () => {
  const state = fixture();
  state.setRulesResolver(null);
  let first;
  state.community.load(value => { first = value; });
  state.answer("dbQuery", [row("alice", {rating:"a", availability:"unavailable"})]);
  const stale = state.take("fileRules");
  let saved;
  state.community.saveReview(OTHER, {rating:"g"}, value => { saved = value; });
  stale.cb({user_address:"alice.epix",cert_signers:{"xid.epix":["chain"]},signers:["alice.epix"]});
  assert.equal(first.superseded, true);
  assert.notEqual(first, "ok");
  state.answer("dbQuery", {error:"Database unavailable"});
  assert.match(saved.error, /Database unavailable/);
});

test("availability expires while the page stays open without another database request", () => {
  const {community, answer, advance, calls} = fixture();
  community.load(); answer("dbQuery", [row("alice", {availability:"unavailable",date_added:NOW-30*86400+5})]);
  assert.equal(community.getSummary(TARGET).availability, "unavailable");
  const count = calls.length;
  advance(5000);
  assert.equal(community.getSummary(TARGET).availability, "unknown");
  assert.equal(community.getSummary(TARGET).stale_availability_count, 1);
  assert.equal(calls.length, count);
});

test("saving requires a verified active signing key and signature before any file mutation", () => {
  for (const phase of ["snapshot", "sign", "verify"]) {
    const state = fixture();
    if (phase === "snapshot") state.setSnapshotResolver(() => ({error:"Chain unavailable"}));
    if (phase === "sign") state.setSignResolver(() => ({error:"Signing unavailable"}));
    if (phase === "verify") state.setVerifyResolver(() => false);
    const results = state.beginSave();
    assert.equal(typeof results[0].error, "string");
    assert.equal(state.calls.some(call => call.cmd === "fileWrite" || call.cmd === "sitePublish"), false);
  }
});

test("lost proof/sign replies terminate and cannot write after timeout or identity change", () => {
  for (const phase of ["xidResolveName", "ecdsaSign", "ecdsaVerify"]) {
    const state = fixture();
    if (phase === "xidResolveName") state.setSnapshotResolver(null);
    if (phase === "ecdsaSign") state.setSignResolver(null);
    if (phase === "ecdsaVerify") state.setVerifyResolver(null);
    const results = state.beginSave();
    const late = state.take(phase);
    state.advance(15000);
    assert.equal(typeof results[0].error, "string");
    late.cb(phase === "xidResolveName" ? {name:"alice",tld:"epix",identities:[{address:SIGNERS.alice,active:true}]} :
      phase === "ecdsaSign" ? signMessage(late.params[0], SIGNERS.alice) : true);
    assert.equal(state.calls.some(call => call.cmd === "fileWrite" || call.cmd === "sitePublish"), false);
    assert.equal(results.length, 1);
  }
});

const HEIGHT_BEFORE_PIN = "finality not verified: finality proof rejected: HeightBeforePin";
function activeSnapshot(name = "alice") {
  return {name, tld:"epix", identities:[{address:SIGNERS[name], active:true, revoked_at:0, revoked_at_time:0}]};
}
function proofCalls(state) { return state.calls.filter(call => call.cmd === "xidResolveName"); }
function assertNoSignedMutation(state) {
  assert.equal(state.calls.some(call => ["ecdsaSign", "ecdsaVerify", "fileWrite", "sitePublish"].includes(call.cmd)), false);
}

test("an unavailable-only review retries HeightBeforePin once before verifying, writing and publishing", () => {
  const state = fixture();
  let attempts = 0;
  state.setSnapshotResolver(() => ++attempts === 1 ? {error:HEIGHT_BEFORE_PIN} : activeSnapshot());
  const results = state.beginSave({availability:"unavailable"});
  assert.deepEqual(results, [], "a transient proof error must wait for the bounded retry");
  assertNoSignedMutation(state);
  state.advance(5999);
  assert.equal(proofCalls(state).length, 1);
  state.advance(1);
  assert.equal(proofCalls(state).length, 2);
  assert.ok(proofCalls(state).every(call => call.params[0] === "alice.epix"));
  assert.equal(state.calls.filter(call => call.cmd === "ecdsaSign").length, 1);
  assert.equal(state.calls.filter(call => call.cmd === "ecdsaVerify").length, 1);
  const write = state.take("fileWrite");
  const stored = JSON.parse(Buffer.from(write.params[1], "base64").toString());
  const review = stored.hub_review[0];
  assert.equal(review.availability, "unavailable");
  assert.equal(review.rating, null);
  assert.equal(review.address, TARGET);
  assert.equal(review.signer, SIGNERS.alice);
  assert.equal(verifyMessage(messageFor(review, "alice.epix"), SIGNERS.alice, review.signature), true);
  assert.deepEqual(results, []);
  write.cb("ok");
  state.answer("sitePublish", "ok");
  state.answer("dbQuery", [row("alice", review)]);
  assert.deepEqual(results, ["ok"]);
  assert.equal(state.community.getSummary(TARGET).availability, "unavailable");
});

test("a repeated HeightBeforePin error stops after two proofs and preserves its cause", () => {
  const state = fixture();
  state.setSnapshotResolver(() => ({error:HEIGHT_BEFORE_PIN}));
  const results = state.beginSave({availability:"unavailable"});
  state.advance(6000);
  assert.equal(proofCalls(state).length, 2);
  assert.equal(results.length, 1);
  assert.match(results[0].error, /chain verification/i);
  assert.ok(results[0].error.includes(HEIGHT_BEFORE_PIN));
  assertNoSignedMutation(state);
  state.advance(45000);
  assert.equal(proofCalls(state).length, 2);
  assert.equal(results.length, 1);
  assert.equal(state.community.saving, false);
});

test("other proof failures and unknown API errors remain visible without automatic retries", () => {
  for (const message of [
    "Unknown command: xidResolveName",
    "finality not verified: finality proof rejected: InvalidSignature",
    "finality not verified: finality proof rejected: FinalityAdvanced",
    "The chain proof request timed out"
  ]) {
    const state = fixture();
    state.setSnapshotResolver(() => ({error:message}));
    const results = state.beginSave({availability:"unavailable"});
    assert.equal(results.length, 1);
    assert.match(results[0].error, /chain verification/i);
    assert.ok(results[0].error.includes(message), results[0].error);
    state.advance(6000);
    assert.equal(proofCalls(state).length, 1);
    assertNoSignedMutation(state);
  }
});

test("a missing signing-key proof reports its timeout and ignores a late valid reply", () => {
  const state = fixture();
  state.setSnapshotResolver(null);
  const results = state.beginSave({availability:"unavailable"});
  const lateProof = state.take("xidResolveName");
  state.advance(15000);
  assert.equal(results.length, 1);
  assert.match(results[0].error, /chain verification/i);
  assert.match(results[0].error, /timed out/);
  lateProof.cb(activeSnapshot());
  state.advance(6000);
  assert.equal(proofCalls(state).length, 1);
  assertNoSignedMutation(state);
  assert.equal(results.length, 1);
});

test("missing active key membership is a linkage error and never retries or signs", () => {
  const snapshots = [
    {}, {name:"alice", tld:"epix", owner:SIGNERS.alice, identities:[]},
    activeSnapshot("bob"), {...activeSnapshot(), tld:"other"},
    ...[{active:false}, {revoked_at:1}, {revoked_at_time:NOW-1}, {address:SIGNERS.bob}]
      .map(change => ({...activeSnapshot(), identities:[{address:SIGNERS.alice, active:true, ...change}]}))
  ];
  for (const snapshot of snapshots) {
    const state = fixture();
    state.setSnapshotResolver(() => snapshot);
    const results = state.beginSave({availability:"unavailable"});
    assert.equal(results.length, 1);
    assert.match(results[0].error, /not an active signing key/i);
    state.advance(6000);
    assert.equal(proofCalls(state).length, 1);
    assertNoSignedMutation(state);
  }
});

test("a retry must return fresh active membership before any signing is allowed", () => {
  const state = fixture();
  let attempts = 0;
  state.setSnapshotResolver(() => ++attempts === 1 ? {error:HEIGHT_BEFORE_PIN} :
    {...activeSnapshot(), identities:[{address:SIGNERS.alice, active:false}]});
  const results = state.beginSave({availability:"unavailable"});
  state.advance(6000);
  assert.equal(proofCalls(state).length, 2);
  assert.match(results[0].error, /not an active signing key/i);
  assertNoSignedMutation(state);
});

test("identity changes and unjoined source hubs cancel a pending save proof retry", () => {
  for (const change of [
    state => { state.Page.site_info.auth_address = SIGNERS.bob; state.Page.site_info.cert_user_id = "bob@xid.epix"; state.Page.site_info.xid_directory = "bob.epix"; },
    state => { delete state.Page.user_hubs[SOURCE]; },
    state => { delete state.Page.merged_sites[SOURCE]; }
  ]) {
    const state = fixture();
    let attempts = 0;
    state.setSnapshotResolver(() => ++attempts === 1 ? {error:HEIGHT_BEFORE_PIN} : activeSnapshot());
    const results = state.beginSave({availability:"unavailable"});
    assert.deepEqual(results, []);
    change(state);
    state.advance(6000);
    assert.equal(proofCalls(state).length, 1);
    assertNoSignedMutation(state);
    state.advance(45000);
    assert.equal(results.length, 1);
    assert.equal(typeof results[0].error, "string");
    assert.equal(state.community.saving, false);
  }
});

test("the overall save deadline prevents a scheduled proof retry from starting late", () => {
  const state = fixture();
  state.setSnapshotResolver(null);
  const results = [];
  state.community.saveReview(TARGET, {availability:"unavailable"}, value => results.push(plain(value)));
  state.advance(14000); state.answer("dbQuery", []);
  state.advance(14000); state.answer("fileGet", null);
  const proof = state.take("xidResolveName");
  state.advance(14000); proof.cb({error:HEIGHT_BEFORE_PIN});
  assert.deepEqual(results, []);
  state.advance(3000);
  assert.equal(results.length, 1);
  assert.match(results[0].error, /timed out/);
  state.advance(6000);
  assert.equal(proofCalls(state).length, 1);
  assertNoSignedMutation(state);
  assert.equal(results.length, 1);
});

test("loading community reviews retries the transient proof once and shares the verified result", () => {
  const state = fixture();
  let attempts = 0;
  state.setSnapshotResolver(() => ++attempts === 1 ? {error:HEIGHT_BEFORE_PIN} : activeSnapshot());
  const results = [];
  state.community.load(value => results.push(plain(value)));
  state.answer("dbQuery", [row("alice", {rating:"g"}), row("alice", {source:OTHER, rating:"g"})]);
  assert.deepEqual(results, []);
  assert.equal(proofCalls(state).length, 1);
  state.advance(5999);
  assert.equal(proofCalls(state).length, 1);
  state.advance(1);
  assert.equal(proofCalls(state).length, 2);
  assert.deepEqual(results, ["ok"]);
  assert.equal(state.community.getSummary(TARGET).review_count, 1);
  assert.equal(state.community.getSummary(TARGET).rating, "g");
});

test("a superseded load cancels its delayed proof retry and cannot replace newer evidence", () => {
  const state = fixture();
  let attempts = 0;
  state.setSnapshotResolver(() => ++attempts === 1 ? {error:HEIGHT_BEFORE_PIN} : activeSnapshot());
  const oldResults = [], newResults = [];
  state.community.load(value => oldResults.push(plain(value)));
  state.answer("dbQuery", [row("alice", {rating:"a"})]);
  assert.deepEqual(oldResults, []);
  state.community.load(value => newResults.push(plain(value)));
  state.answer("dbQuery", []);
  state.advance(6000);
  assert.equal(proofCalls(state).length, 1);
  assert.deepEqual(newResults, ["ok"]);
  assert.equal(oldResults.length, 1);
  assert.equal(oldResults[0].superseded, true);
  assert.equal(state.community.getSummary(TARGET).review_count, 0);
  assertNoSignedMutation(state);
});

test("a source unjoined while a load waits for a proof retry is not queried or verified again", () => {
  const state = fixture();
  let attempts = 0;
  state.setSnapshotResolver(() => ++attempts === 1 ? {error:HEIGHT_BEFORE_PIN} : activeSnapshot());
  const results = [];
  state.community.load(value => results.push(plain(value)));
  state.answer("dbQuery", [row("alice", {rating:"a"})]);
  assert.deepEqual(results, []);
  delete state.Page.merged_sites[SOURCE];
  state.advance(6000);
  assert.equal(proofCalls(state).length, 1);
  assert.equal(state.community.getSummary(TARGET).review_count, 0);
  assertNoSignedMutation(state);
});
