const _cache = new Map();
const TTL = 45_000;

module.exports = {
  get(sellerId) {
    const hit = _cache.get(String(sellerId));
    if (hit && hit.expireAt > Date.now()) return hit.data;
    return null;
  },
  set(sellerId, data) {
    _cache.set(String(sellerId), { data, expireAt: Date.now() + TTL });
  },
  invalidate(sellerId) {
    _cache.delete(String(sellerId));
  },
};
