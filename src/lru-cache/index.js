import LRUCache from "lru-cache";
const options = {
  max: 500,
  //   ttl: 100 * 60 * 10,   i dont think i need this as the node value wont be time dependent
  allowStale: false,
  updateAgeOnGet: true,
  updateAgeOnHas: true,
};

const cache = new LRUCache(options);
// -------------------------------------------------------
// since LRU Cache is not persistant on reload by default and is in-memory cache we dont need to be worried about clearing

export { cache };
