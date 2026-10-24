(function() {
  "use strict";

  var RATINGS = {g: "General", m: "Mature", a: "Adult"};
  var TOPICS = {politics: "Politics", religion: "Religion", violence: "Violence"};
  var REASONS = {spam: "Spam", scam: "Scam or phishing", malware: "Malware", abuse: "Abuse or exploitation"};
  var AVAILABILITY_DAYS = 30;
  var MAX_REVIEWS = 256;
  var SIGNATURE_VERSION = 1;
  var has = function(object, key) { return Object.prototype.hasOwnProperty.call(object, key); };

  // Same classic Bech32 format as the node: epix + a 20-byte address.
  // Validating the checksum prevents URLs, paths, and mistyped targets from
  // becoming distinct identities in the community directory.
  function normalizeAddress(value) {
    if (typeof value !== "string") return null;
    value = value.trim();
    if (value !== value.toLowerCase() && value !== value.toUpperCase()) return null;
    value = value.toLowerCase();
    if (!/^epix1[023456789acdefghjklmnpqrstuvwxyz]{38}$/.test(value)) return null;
    var alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    var expanded = [3, 3, 3, 3, 0, 5, 16, 9, 24];
    for (var i = 5; i < value.length; i++) expanded.push(alphabet.indexOf(value[i]));
    var check = 1;
    var generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    expanded.forEach(function(part) {
      var top = check >>> 25;
      check = ((check & 0x1ffffff) << 5) ^ part;
      for (var bit = 0; bit < 5; bit++) if ((top >>> bit) & 1) check ^= generators[bit];
    });
    return check === 1 ? value : null;
  }

  function nowSeconds() { return Math.floor(Date.now() / 1000); }

  function identityOf(row) {
    if (!row || row.cert_auth_type !== "xid" || typeof row.cert_user_id !== "string") return null;
    var match = /^([a-z0-9][a-z0-9.-]{0,62})@xid\.epix$/.exec(row.cert_user_id);
    if (!match) return null;
    var name = match[1].indexOf(".") === -1 ? match[1] + ".epix" : match[1];
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(name)) return null;
    // Read identity only from node-indexed signed content metadata, never a
    // review's self-declared author. Named directories must match the cert.
    return row.directory === "data/users/" + name ? name : null;
  }

  function fieldsOf(fields) {
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
    var rating = fields.rating == null || fields.rating === "" ? null : fields.rating;
    var availability = fields.availability == null || fields.availability === "" ? null : fields.availability;
    var reason = fields.reason == null || fields.reason === "" ? null : fields.reason;
    if (rating !== null && !has(RATINGS, rating)) return null;
    if (availability !== null && availability !== "available" && availability !== "unavailable") return null;
    if (reason !== null && !has(REASONS, reason)) return null;
    var topics = fields.topics == null || fields.topics === "" ? [] : fields.topics;
    if (typeof topics === "string") topics = topics.split(",");
    if (!Array.isArray(topics) || topics.length > Object.keys(TOPICS).length) return null;
    if (topics.some(function(topic) { return typeof topic !== "string" || !has(TOPICS, topic); })) return null;
    topics = Object.keys(TOPICS).filter(function(topic) { return topics.indexOf(topic) !== -1; });
    var note = fields.note == null ? "" : fields.note;
    if (typeof note !== "string" || note.length > 280) return null;
    return {rating: rating, availability: availability, topics: topics, reason: reason, note: note};
  }

  function normalizedRow(row, now) {
    var identity = identityOf(row);
    var address = normalizeAddress(row && row.address);
    var source = normalizeAddress(row && (row.source || row.site));
    if (!identity || !address || !source) return null;
    if (!Number.isSafeInteger(row.date_added) || row.date_added <= 0 || row.date_added > now + 120) return null;
    if (row.deleted != null && row.deleted !== false && row.deleted !== true && row.deleted !== 0 && row.deleted !== 1) return null;
    var deleted = row.deleted === true || row.deleted === 1;
    var fields = fieldsOf(deleted ? {} : row);
    if (!fields) return null;
    return Object.assign(fields, {address: address, identity: identity, source: source,
      date_added: row.date_added, deleted: deleted, signer: row.signer,
      signature_version: row.signature_version, signature: row.signature});
  }

  // A replica can have the same identity on several hubs. A newer review or
  // withdrawal replaces all older copies. Ties are stable across query order;
  // a tombstone wins its timestamp so a stale copy cannot revive it.
  function compareRows(left, right) {
    if (left.date_added !== right.date_added) return left.date_added - right.date_added;
    if (left.deleted !== right.deleted) return left.deleted ? 1 : -1;
    var a = JSON.stringify([left.rating, left.availability, left.topics, left.reason, left.note, left.source]);
    var b = JSON.stringify([right.rating, right.availability, right.topics, right.reason, right.note, right.source]);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function latestRows(rows, now) {
    var latest = Object.create(null);
    (Array.isArray(rows) ? rows : []).forEach(function(raw) {
      var row = normalizedRow(raw, now);
      if (!row) return;
      var key = row.identity + "/" + row.address;
      if (!latest[key] || compareRows(row, latest[key]) > 0) latest[key] = row;
    });
    return latest;
  }

  function emptySummary(address) {
    return {address: address, rating: null, rating_counts: {g: 0, m: 0, a: 0},
      availability: "unknown", availability_counts: {available: 0, unavailable: 0},
      stale_availability_count: 0, topics: [], topic_counts: {politics: 0, religion: 0, violence: 0},
      reason_counts: {spam: 0, scam: 0, malware: 0, abuse: 0}, review_count: 0, report_count: 0, evidence: []};
  }

  function summariesFrom(latest, now) {
    var summaries = Object.create(null);
    Object.keys(latest).sort().forEach(function(key) {
      var row = latest[key];
      if (row.deleted) return;
      var summary = summaries[row.address] || (summaries[row.address] = emptySummary(row.address));
      summary.review_count++;
      if (row.rating) summary.rating_counts[row.rating]++;
      row.topics.forEach(function(topic) { summary.topic_counts[topic]++; });
      if (row.reason) { summary.reason_counts[row.reason]++; summary.report_count++; }
      var stale = !!row.availability && row.date_added <= now - AVAILABILITY_DAYS * 86400;
      if (row.availability) {
        if (stale) summary.stale_availability_count++;
        else summary.availability_counts[row.availability]++;
      }
      summary.evidence.push(Object.assign({}, row, {topics: row.topics.slice(), availability_stale: stale}));
    });
    Object.keys(summaries).forEach(function(address) {
      var summary = summaries[address];
      // A reported classification is an opt-out signal, not a claim of
      // consensus. One reported Adult/Mature classification is enough to
      // respect the reader's content preference before any hub download.
      summary.rating = summary.rating_counts.a ? "a" : summary.rating_counts.m ? "m" : summary.rating_counts.g ? "g" : null;
      summary.topics = Object.keys(TOPICS).filter(function(topic) { return summary.topic_counts[topic] > 0; });
      var counts = summary.availability_counts;
      summary.availability = counts.available && counts.unavailable ? "mixed" : counts.unavailable ? "unavailable" : counts.available ? "available" : "unknown";
      summary.evidence.sort(function(a, b) { return b.date_added - a.date_added || a.identity.localeCompare(b.identity); });
    });
    return summaries;
  }

  function error(message) { return {error: message}; }
  function failure(result, fallback) { return error(result && typeof result.error === "string" ? result.error : fallback); }

  function trustedRules(rules, identity) {
    if (!rules || typeof rules !== "object" || rules.error || rules.user_address !== identity || rules.cert_signers_pattern) return false;
    var issuers = rules.cert_signers && rules.cert_signers["xid.epix"];
    if (!Array.isArray(issuers) || issuers.length !== 1 || issuers[0] !== "chain") return false;
    // These rules establish supported certificate metadata, not authorship:
    // the node also permits an implicit hub-owner signer. Each review needs
    // its own signature from a key verified for the forward xId name.
    return Array.isArray(rules.signers) && rules.signers.indexOf(identity) !== -1;
  }

  // A fixed positional format avoids object order and JSON canonicalization
  // differences. Identity, signer, all review fields and withdrawals are bound.
  function signedMessage(row) {
    return JSON.stringify(["EpixPost hub community review", SIGNATURE_VERSION,
      row.identity, row.signer, row.address, row.rating, row.availability,
      row.topics, row.reason, row.note, row.date_added, row.deleted]);
  }

  function validSigner(snapshot, identity, signer) {
    return !!snapshot && !snapshot.error && snapshot.name + "." + snapshot.tld === identity &&
      Array.isArray(snapshot.identities) && snapshot.identities.some(function(entry) {
        // Revoked keys are excluded even for old records. Their timestamps
        // are self-reported, so they cannot prove signing before revocation.
        return entry.address === signer && entry.active === true &&
          (entry.revoked_at == null || entry.revoked_at === 0) &&
          (entry.revoked_at_time == null || entry.revoked_at_time === 0);
      });
  }

  function eachLimited(items, limit, work, done) {
    if (!items.length) { done(); return; }
    var index = 0, remaining = items.length;
    var next = function() {
      if (index >= items.length) return;
      work(items[index++], function() {
        if (!--remaining) done();
        else next();
      });
    };
    for (var i = 0; i < Math.min(limit, items.length); i++) next();
  }

  class HubCommunity {
    constructor() {
      this.RATINGS = RATINGS;
      this.TOPICS = TOPICS;
      this.REASONS = REASONS;
      this.AVAILABILITY_DAYS = AVAILABILITY_DAYS;
      this.summaries = Object.create(null);
      this.latest = Object.create(null);
      this.queue = [];
      this.saving = false;
      this.load_generation = 0;
      this.warning = null;
      this.rejected_source_count = 0;
      this.summary_time = 0;
    }

    normalizeAddress(address) { return normalizeAddress(address); }
    getIdentity(row) { return identityOf(row); }

    summarize(rows, now) {
      // Pure aggregation only. Callers must first verify each record signature
      // and forward xId signer membership, as load() does for all DB results.
      if (now == null) now = nowSeconds();
      return summariesFrom(latestRows(rows, now), now);
    }

    currentIdentity() {
      var info = Page.site_info || {};
      return identityOf({cert_auth_type: "xid", cert_user_id: info.cert_user_id,
        directory: "data/users/" + info.xid_directory});
    }

    identityToken() {
      var info = Page.site_info || {};
      return JSON.stringify([info.auth_address, info.cert_user_id, info.xid_directory]);
    }

    getSummary(address) {
      address = normalizeAddress(address);
      var now = nowSeconds();
      if (this.summary_time !== now) {
        this.summaries = summariesFrom(this.latest, now);
        this.summary_time = now;
      }
      return this.summaries[address] || emptySummary(address);
    }

    getOwnReview(address) {
      var identity = this.currentIdentity();
      var row = this.latest[identity + "/" + normalizeAddress(address)];
      return row && !row.deleted ? Object.assign({}, row, {topics: row.topics.slice()}) : null;
    }

    request(command, params, cb) {
      var active = true;
      var timer = setTimeout(function() {
        if (!active) return;
        active = false;
        cb(error("The hub community request timed out. Reload the list before trying again."));
      }, 15000);
      Page.cmd(command, params, function(result) {
        if (!active) return;
        active = false;
        clearTimeout(timer);
        cb(result);
      });
    }

    load(cb) {
      var generation = ++this.load_generation;
      this.request("dbQuery", "SELECT hub_review.*, json.site AS source, json.directory, json.cert_auth_type, json.cert_user_id " +
        "FROM hub_review LEFT JOIN json USING (json_id)", (rows) => {
        if (!Array.isArray(rows)) {
          if (cb) cb(failure(rows, "Could not load hub community reviews."));
          return;
        }
        this.verifySources(rows, (trusted, rejected, verificationError) => {
          var now = nowSeconds();
          var latest = latestRows(trusted, now);
          if (generation !== this.load_generation) {
            if (cb) cb({error: "A newer community refresh superseded this request.", superseded: true});
            return;
          }
          if (verificationError) {
            if (cb) cb(verificationError);
            return;
          }
          this.latest = latest;
          this.summaries = summariesFrom(latest, now);
          this.summary_time = now;
          this.rejected_source_count = rejected;
          this.warning = rejected ? "Some hub reviews could not be verified and were excluded. Community information may be incomplete." : null;
          if (cb) cb("ok", latest);
        });
      });
    }

    verifySources(rows, cb) {
      var groups = Object.create(null);
      var rejected = Object.create(null);
      var now = nowSeconds();
      rows.forEach(function(raw, index) {
        var row = normalizedRow(raw, now);
        if (!row || row.signature_version !== SIGNATURE_VERSION ||
            !normalizeAddress(row.signer) || normalizeAddress(row.signer) !== row.signer || typeof row.signature !== "string" ||
            !/^[A-Za-z0-9+/]{87}=$/.test(row.signature)) {
          rejected["invalid-" + index] = true; return;
        }
        var key = row.source + "/" + row.identity;
        if (!Page.merged_sites || !Page.merged_sites[row.source]) { rejected[key] = true; return; }
        if (!groups[key]) groups[key] = {identity: row.identity, source: row.source, rows: []};
        if (groups[key].rows.length >= MAX_REVIEWS) { rejected[key] = true; return; }
        groups[key].rows.push({raw: raw, row: row});
      });
      var keys = Object.keys(groups);
      if (!keys.length) { cb([], Object.keys(rejected).length); return; }
      var trusted = [];
      var verificationError = null;
      var finished = false;
      var finishVerification = function() {
        if (finished) return;
        finished = true;
        cb(trusted, Object.keys(rejected).length, verificationError);
      };
      var checkFailure = function(result) {
        if (result && result.error) {
          verificationError = failure(result, "Could not verify hub community reviews.");
          // A failed proof cannot produce a usable refresh. Stop the queue
          // immediately and ignore replies from requests already in flight.
          finishVerification();
          return true;
        }
        return false;
      };
      var snapshots = Object.create(null);
      var resolve = (identity, next) => {
        if (snapshots[identity]) {
          if (snapshots[identity].waiting) snapshots[identity].waiting.push(next);
          else next(snapshots[identity].value);
          return;
        }
        snapshots[identity] = {waiting: [next]};
        this.request("xidResolveName", [identity], function(snapshot) {
          if (finished) return;
          var waiting = snapshots[identity].waiting;
          snapshots[identity] = {value: snapshot};
          waiting.forEach(function(callback) { callback(snapshot); });
        });
      };
      eachLimited(keys, 4, (key, finish) => {
        if (finished) return;
        var group = groups[key];
        // Only inspect the already joined source and resolve the reviewer's
        // name. Neither operation downloads the reviewed target hub.
        var path = "merged-EpixPost/" + group.source + "/data/users/" + group.identity + "/content.json";
        this.request("fileRules", [path], (rules) => {
          if (finished || checkFailure(rules)) return;
          if (!Page.merged_sites || !Page.merged_sites[group.source] || !trustedRules(rules, group.identity)) {
            rejected[key] = true; finish(); return;
          }
          resolve(group.identity, (snapshot) => {
            if (finished || checkFailure(snapshot)) return;
            eachLimited(group.rows, 1, (entry, next) => {
              if (finished) return;
              var complete = (valid) => {
                if (valid && Page.merged_sites && Page.merged_sites[group.source]) trusted.push(entry.raw);
                else rejected[key] = true;
                next();
              };
              if (!validSigner(snapshot, group.identity, entry.row.signer)) { complete(false); return; }
              this.request("ecdsaVerify", [signedMessage(entry.row), entry.row.signer, entry.row.signature], function(valid) {
                if (finished || checkFailure(valid)) return;
                complete(valid === true);
              });
            }, finish);
          });
        });
      }, finishVerification);
    }

    saveReview(address, fields, cb) {
      address = normalizeAddress(address);
      var normalized = fieldsOf(fields);
      if (!address || !normalized) {
        if (cb) cb(error("Invalid hub address or review fields."));
        return;
      }
      if (!normalized.rating && !normalized.availability && !normalized.topics.length && !normalized.reason && !normalized.note.trim()) {
        if (cb) cb(error("Choose a classification, availability, topic, or report before saving."));
        return;
      }
      this.enqueue(address, normalized, false, cb);
    }

    clearReview(address, cb) {
      address = normalizeAddress(address);
      if (!address) { if (cb) cb(error("Invalid hub address.")); return; }
      this.enqueue(address, fieldsOf({}), true, cb);
    }

    enqueue(address, fields, deleted, cb) {
      var identity = this.currentIdentity();
      var user = Page.user;
      var signer = normalizeAddress(Page.site_info && Page.site_info.auth_address);
      if (!identity || !signer || !user || typeof user.getPath !== "function") {
        if (cb) cb(error("Select an xId and join a hub before publishing a review."));
        return;
      }
      var defaults = Page.site_info && Page.site_info.content && Page.site_info.content.settings && Page.site_info.content.settings.default_hubs || {};
      var candidates = Object.keys(defaults).concat([user.hub]);
      var source = candidates.find(function(hub) {
        return normalizeAddress(hub) && Page.user_hubs && Page.user_hubs[hub] && Page.merged_sites && Page.merged_sites[hub];
      });
      if (!source) {
        if (cb) cb(error("Join a hub before publishing a review. No hubs will be downloaded automatically."));
        return;
      }
      var path = user.getPath(source);
      if (path !== "merged-EpixPost/" + source + "/data/users/" + identity) {
        if (cb) cb(error("The selected profile does not match your xId."));
        return;
      }
      this.queue.push({address: address, fields: fields, deleted: deleted, cb: cb,
        identity: identity, signer: signer, token: this.identityToken(), source: source, path: path});
      this.drain();
    }

    drain() {
      if (this.saving || !this.queue.length) return;
      this.saving = true;
      var job = this.queue.shift();
      var finished = false;
      var done = (result) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.saving = false;
        try { if (job.cb) job.cb(result); } finally { this.drain(); }
      };
      var timer = setTimeout(function() {
        done(error("Publishing the review timed out. It may have succeeded. Reload the list before trying again."));
      }, 45000);
      var current = () => this.identityToken() === job.token && this.currentIdentity() === job.identity &&
        Page.user_hubs && Page.user_hubs[job.source] && Page.merged_sites && Page.merged_sites[job.source];
      var guard = () => {
        if (finished) return false;
        if (current()) return true;
        done(error("Your identity or joined hubs changed. The review was not published."));
        return false;
      };
      if (!guard()) return;
      this.load((loaded, latest) => {
        if (!guard()) return;
        if (loaded !== "ok") return done(loaded);
        this.request("fileRules", [job.path + "/content.json"], (rules) => {
          if (!guard()) return;
          if (!trustedRules(rules, job.identity)) {
            return done(error("This hub does not use the supported xId certificate rules for your profile. Choose another joined hub to publish community reviews."));
          }
          this.request("fileGet", [job.path + "/hub_reviews.json", false], (raw) => {
            if (!guard()) return;
            if (raw && typeof raw === "object") return done(failure(raw, "Could not read your hub reviews."));
            var container;
            try { container = raw ? JSON.parse(raw) : {hub_review: []}; }
            catch (err) { return done(error("Your hub review file is invalid. It was not overwritten.")); }
            if (!container || typeof container !== "object" || Array.isArray(container) || !Array.isArray(container.hub_review)) {
              return done(error("Your hub review file is invalid. It was not overwritten."));
            }
            var previous = latest[job.identity + "/" + job.address];
            var clock = previous ? previous.date_added : 0;
            var kept = container.hub_review.filter(function(row) {
              if (!row || normalizeAddress(row.address) !== job.address) return true;
              if (Number.isSafeInteger(row.date_added) && row.date_added > 0 && row.date_added <= nowSeconds() + 120) clock = Math.max(clock, row.date_added);
              return false;
            });
            if (kept.length >= MAX_REVIEWS) return done(error("Your hub review file is full. Existing reviews were preserved."));
            var date = Math.max(nowSeconds(), clock + 1);
            if (date > nowSeconds() + 120) return done(error("Please wait before updating this review again."));
            var record = Object.assign({}, job.fields, {topics: job.fields.topics.join(","),
              address: job.address, date_added: date, deleted: job.deleted ? 1 : 0});
            record.signer = job.signer;
            record.signature_version = SIGNATURE_VERSION;
            var signed = normalizedRow(Object.assign({}, record, {source: job.source,
              directory: "data/users/" + job.identity, cert_auth_type: "xid",
              cert_user_id: Page.site_info.cert_user_id}), nowSeconds());
            this.request("xidResolveName", [job.identity], (snapshot) => {
              if (!guard()) return;
              if (!validSigner(snapshot, job.identity, job.signer)) {
                return done(error("Your xId signing key could not be verified. Reload and try again when chain verification is available."));
              }
              var message = signedMessage(signed);
              this.request("ecdsaSign", [message], (signature) => {
                if (!guard()) return;
                if (typeof signature !== "string" || !/^[A-Za-z0-9+/]{87}=$/.test(signature)) {
                  return done(failure(signature, "Could not sign your hub review."));
                }
                this.request("ecdsaVerify", [message, job.signer, signature], (valid) => {
                  if (!guard()) return;
                  if (valid !== true) return done(error("The review signature did not match your verified xId key. Nothing was written."));
                  record.signature = signature;
                  kept.push(record);
                  container.hub_review = kept;
                  if (JSON.stringify(container).length > 200000) return done(error("Your hub review file is too large. Existing reviews were preserved."));
                  if (!guard()) return;
                  // Ordinary signed files retain compatibility with existing hubs.
                  // This queue prevents same-page lost updates. Concurrent devices
                  // still use the node's whole-file last-writer-wins semantics.
                  this.request("fileWrite", [job.path + "/hub_reviews.json", Text.fileEncode(container)], (written) => {
                    if (!guard()) return;
                    if (written !== "ok") return done(failure(written, "Could not save your hub review."));
                    this.request("sitePublish", {inner_path: job.path + "/content.json"}, (published) => {
                      if (!guard()) return;
                      if (published !== "ok") {
                        var message = failure(published, "Your hub review was saved locally but could not be published.");
                        if (/timed out/.test(message.error)) message.error = "Publishing the review timed out. It may have succeeded. Reload the list before trying again.";
                        return done(message);
                      }
                      this.load((refreshed) => {
                        if (!guard()) return;
                        if (refreshed !== "ok") return done(error("Your review was published, but the community list could not be refreshed."));
                        done("ok");
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    }
  }

  window.HubCommunity = new HubCommunity();
})();
