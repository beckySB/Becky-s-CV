'use strict';
/* One error shape for every platform, so the queue can say what went wrong in plain words
   and whether the fix is to reconnect the account. */
class SocialError extends Error {
  constructor(platform, message, opts) {
    super(message);
    this.platform = platform;
    this.status = (opts && opts.status) || 0;
    this.reconnect = !!(opts && opts.reconnect);
    this.detail = (opts && opts.detail) || '';
  }
}
module.exports = { SocialError };
