(function() {
  // One group of related queries. Replacing a feed load cancels its retries
  // and ignores late responses, including responses from dependent queries.
  class QueryRows {
    constructor(onError) {
      this.onError = onError;
      this.cancelled = false;
      this.timers = new Set();
    }

    cancel() {
      this.cancelled = true;
      for (const timer of this.timers) clearTimeout(timer);
      this.timers.clear();
    }

    run(params, cb, optionalTable, attempt) {
      if (this.cancelled) return;
      if (attempt == null) attempt = 0;
      Page.cmd("dbQuery", params, (rows) => {
        if (this.cancelled) return;
        if (Array.isArray(rows)) {
          cb(rows);
          return;
        }
        // Older schemas may lack comment likes. Other database errors must
        // keep the previous feed intact and retry instead of becoming []
        const missingTable = rows && typeof rows.error === "string"
          ? rows.error.match(/\bno such table: (\w+)(?:\s|$)/) : null;
        if (optionalTable && missingTable && missingTable[1] === optionalTable) {
          cb([]);
          return;
        }
        if (attempt < 5) {
          const timer = setTimeout(() => {
            this.timers.delete(timer);
            this.run(params, cb, optionalTable, attempt + 1);
          }, Math.min(2000 * Math.pow(2, attempt), 15000));
          this.timers.add(timer);
        } else {
          this.cancel();
          this.onError();
        }
      });
    }
  }

  window.QueryRows = QueryRows;
})();
