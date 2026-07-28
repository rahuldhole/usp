/**
 * Hybrid Logical Clock (HLC)
 * Provides causal ordering for events across distributed nodes.
 * Format: `<timestamp>-<counter>-<nodeId>`
 */
export class HLC {
  constructor(nodeId) {
    this.nodeId = nodeId;
    this.ts = Date.now();
    this.count = 0;
  }

  /**
   * Generates a new local timestamp for an event.
   */
  inc() {
    const now = Date.now();
    if (now > this.ts) {
      this.ts = now;
      this.count = 0;
    } else {
      this.count++;
    }
    return this.pack();
  }

  /**
   * Updates the clock upon receiving a remote timestamp.
   * @param {string} remoteHlc 
   */
  receive(remoteHlc) {
    const now = Date.now();
    const [remoteTsStr, remoteCountStr] = remoteHlc.split('-');
    const remoteTs = parseInt(remoteTsStr, 10);
    const remoteCount = parseInt(remoteCountStr, 36);

    if (now > this.ts && now > remoteTs) {
      this.ts = now;
      this.count = 0;
      return;
    }

    if (this.ts === remoteTs) {
      this.count = Math.max(this.count, remoteCount) + 1;
    } else if (this.ts > remoteTs) {
      this.count++;
    } else {
      this.ts = remoteTs;
      this.count = remoteCount + 1;
    }
  }

  pack() {
    // Pad counter to ensure string sortability
    const countStr = this.count.toString(36).padStart(4, '0');
    return `${this.ts}-${countStr}-${this.nodeId}`;
  }

  /**
   * Compares two HLC strings.
   * Returns >0 if a > b, <0 if a < b, 0 if equal.
   */
  static compare(a, b) {
    if (a === b) return 0;
    return a > b ? 1 : -1;
  }
}
