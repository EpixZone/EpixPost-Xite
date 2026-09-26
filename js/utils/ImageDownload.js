(function() {
  // One request per path, shared by feed rows that are rebuilt during sync.
  // fileNeed owns the network deadline. Only ask HTTP for a verified local file.
  const downloads = new Map();

  class ImageDownload {
    static forPath(path) {
      if (!downloads.has(path)) {
        if (downloads.size >= 256) {
          for (const [key, download] of downloads) {
            if (!download.loading && !download.retry_timer && !download.visible()) {
              downloads.delete(key);
            }
          }
        }
        downloads.set(path, new ImageDownload(path));
      }
      return downloads.get(path);
    }

    static fileDone(path) {
      const download = downloads.get(path);
      if (download && download.started && !download.loaded) download.load();
    }

    constructor(path) {
      this.path = path;
      this.tags = new Map();
      this.generation = 0;
      this.reset();
    }

    watch(tag, automatic) {
      this.tags.set(tag, automatic);
      this.visible();
    }

    visible() {
      let visible = false;
      for (const [tag, automatic] of this.tags) {
        if (!tag.isConnected) {
          this.tags.delete(tag);
          continue;
        }
        const rect = tag.getBoundingClientRect();
        if (automatic() && rect.bottom >= 0 && rect.top <= window.innerHeight) visible = true;
      }
      return visible;
    }

    reset() {
      this.generation += 1;
      clearTimeout(this.retry_timer);
      this.retry_timer = null;
      this.image = null;
      this.loading = false;
      this.loaded = false;
      this.failed = false;
      this.started = false;
      this.attempts = 0;
    }

    start(force) {
      if (this.loading || this.loaded || (this.retry_timer && !force)) return;
      clearTimeout(this.retry_timer);
      this.retry_timer = null;
      this.started = true;
      this.loading = true;
      this.failed = false;
      this.attempts += 1;
      const generation = ++this.generation;
      Page.cmd("fileNeed", [this.path], (result) => {
        if (generation !== this.generation || this.loaded) return;
        if (result === "ok") this.load();
        else this.fail();
      });
      Page.projector.scheduleRender();
    }

    load() {
      if (this.loaded || this.image) return;
      clearTimeout(this.retry_timer);
      this.retry_timer = null;
      this.started = true;
      this.loading = true;
      this.failed = false;
      // A file_done event can beat the fileNeed reply. Invalidate that reply
      // so a late error cannot undo a successful background download.
      const generation = ++this.generation;
      const image = this.image = new Image();
      image.onload = () => {
        if (generation !== this.generation) return;
        this.image = null;
        this.loading = false;
        this.loaded = true;
        this.failed = false;
        this.attempts = 0;
        Page.projector.scheduleRender();
      };
      image.onerror = () => {
        if (generation === this.generation) this.fail();
      };
      image.src = this.path;
      Page.projector.scheduleRender();
    }

    fail() {
      this.generation += 1;
      this.image = null;
      this.loading = false;
      this.failed = true;
      // The node caches failed dials for 45 seconds. Give a cold overlay time
      // to recover, and keep retries bounded to an image still on screen.
      const delay = this.attempts > 1 ? 60000 : 50000;
      this.retry_timer = setTimeout(() => {
        this.retry_timer = null;
        if (this.visible()) this.start();
      }, delay);
      Page.projector.scheduleRender();
    }
  }

  window.ImageDownload = ImageDownload;
})();
