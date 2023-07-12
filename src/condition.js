class Condition {
  constructor() {
    this.pending = [];
    this.closed = false;
    this.inErrorState = false;
    this.error = null;
  }

  wait() {
    if (this.inErrorState) return Promise.reject(this.error);
    if (this.closed) return Promise.resolve(undefined);
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
    });
  }
  notifyOne() {
    if (this.pending.length > 0) this.pending.shift()?.resolve();
  }
  notifyAll() {
    this.pending.forEach((p) => p.resolve());
    this.pending = [];
  }
  rejectAll(error) {
    this.inErrorState = true;
    this.error = error;
    this.pending.forEach((p) => p.reject(error));
    this.pending = [];
  }
  close() {
    this.notifyAll();
    this.closed = true;
  }
}

module.exports = Condition