export function checkMaxSize(val: any, options: any = {}) {
  const max = options.maxSize !== undefined ? options.maxSize : options.max_size;
  if (max !== undefined && max !== null) {
    let size = 0;
    if (typeof val === 'string') {
      size = new TextEncoder().encode(val).length;
    } else {
      size = new TextEncoder().encode(JSON.stringify(val)).length;
    }
    if (size > max) {
      throw new Error(`ERR_PAYLOAD_TOO_LARGE: Value size (${size} bytes) exceeds maximum allowed size (${max} bytes)`);
    }
  }
}
