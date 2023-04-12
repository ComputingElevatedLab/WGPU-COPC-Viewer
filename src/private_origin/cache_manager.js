import { doesExist } from "./file_manager";

const source_file_name = process.env.filename.split("/").pop();

function sortObjectIntoMap(object1) {
  let resultMap = new Map();
  if (!object1) return resultMap;
  const sortedArray1 = Object.entries(object1).sort((a, b) => a.date - b.date);
  sortedArray1.forEach(([key, value]) => resultMap.set(key, value));
  return resultMap;
}

function mapIntoJSON(map) {
  // console.log("map to json is", Object.fromEntries(map));
  return JSON.stringify(Object.fromEntries(map));
}

const p_cache = async (capacity) => {
  let [permission, content] = await doesExist(process.env.p_cache);
  let cache = sortObjectIntoMap(content);
  return cache;
};

const get_inCache = async (cache, key) => {
  if (!cache.has(key)) return cache;
  let val = cache.get(key);
  cache.delete(key);
  cache.set(key, { date: Date.now(), count: val.count + 1 });
  return cache;
};

const put_inCache = async (cache, key, value) => {
  cache.delete(key);
  if (cache.size == process.env.p_cache_capacity) {
    let fileName = cache.keys().next().value;
    let fileName1 = `${source_file_name}-${fileName}`;
    let [Exist, data] = await doesExist(fileName1);
    if (Exist) {
      let fileToCheck = `${fileName1}.bin`;
      const root = await navigator.storage.getDirectory();
      const fileHandle2 = await root.getFileHandle(fileToCheck);
      await fileHandle2.remove();
      cache.delete(fileName);
    }
  }
  cache.set(key, value);
  return cache;
};

const getLRU_inCache = (cache) => {
  return Array.from(cache)[0];
};

const getMRU_inCache = (cache) => {
  return Array.from(cache)[cache.size - 1];
};

export {
  p_cache,
  get_inCache,
  getLRU_inCache,
  getMRU_inCache,
  sortObjectIntoMap,
  mapIntoJSON,
  put_inCache,
};
