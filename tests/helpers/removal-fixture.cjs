const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

// Existing feature tests run with an explicitly adopted, verified empty policy.
// Removal tests change decisions and exercise the real app presentation gates.
module.exports = function installRemovalFixture(context) {
  if (context.__installedRemovalFixture) return context.window.RemovalPolicy;
  context.__installedRemovalFixture = true;
  if (!vm.isContext(context)) vm.createContext(context);
  context.window ||= {};
  const decisions = new Map();
  const policy = context.window.RemovalPolicy = {
    decisions,
    key(address) { return crypto.createHash('sha256').update(String(address)).digest('hex'); },
    check(address) { return decisions.get(address) || {status: 'allowed'}; },
    message(result) {
      return result.status === 'removed' ? 'Hub removed. Reason: ' + result.reasonCode : 'Removal policy verification unavailable.';
    },
    configure() { return Promise.resolve(); },
    ready() { return Promise.resolve(); },
    refresh() { return Promise.resolve(); },
    records() { return Array.from(decisions.values()).filter(row => row.status === 'removed'); },
    guard(address, cb) { cb(this.check(address)); }
  };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../js/utils/PostRemoval.js'), 'utf8'), context);
  context.PostRemoval = context.window.PostRemoval;
  context.RemovalPolicy = policy;
  return policy;
};
