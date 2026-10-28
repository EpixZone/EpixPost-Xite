// Layout/navigation fixtures adopt an explicit verified empty policy. Production
// loads RemovalRegistry and RemovalPolicy instead of this test-only adapter.
window.RemovalPolicy = {
  check: function() { return {status: 'allowed'}; },
  configure: function() { return Promise.resolve(); },
  refresh: function() { return Promise.resolve(); },
  message: function() { return 'Fixture removal policy'; }
};
