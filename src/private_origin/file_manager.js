import { throttle } from "../webgpu/renderer";

let total_ops = 0;
let used_ops = 0;
navigator.webkitPersistentStorage.queryUsageAndQuota(
  function (used, total) {
    total_ops = total;
    used_ops = used;
  },
  function (error) {
    console.error("Error getting origin-private file system size:", error);
  }
);

let available_ops = total_ops - used_ops;
//------------------------------------------------ for persistent cache capacity is number of files for now --------------------------------------------
let create_P_Meta_Cache = async () => {
  const root = await navigator.storage.getDirectory();
  let fileToCheck = `${process.env.p_cache}.json`;
  let [already_exist, content] = await doesExist(fileToCheck);
  if (!already_exist) {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(fileToCheck, {
      create: true,
    });
  } else {
    console.log("meta cache file already exist");
  }
};

let updatePersCache = async (updatD_data) => {
  let fileToCheck = `${process.env.p_cache}.json`;
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(fileToCheck, {
    create: true,
  });
  const writableStream = await fileHandle.createWritable();
  await writableStream.write(updatD_data);
  await writableStream.close();
  console.log("cache updating is done");
};

let throttled_Update_Pers_Cache = throttle(updatePersCache, 30000);

// let update_cache = async (method, data) => {
//   const cache_name = "cache-holder";
//   let [isAvailable, content] = doesExist(cache_name);
//   // if (!isAvailable) {
//   //   console.error("cache meta ile does not exist");
//   //   return;
//   // }
//   // content = JSON.parse(content);
//   // switch (method) {
//   //   case "life_update":
//   //     content[data.fileName].useCounter = content[data.fileName].useCounter + 1;

//   //     break;
//   //   case "put":
//   // }
// };

let clear = async () => {
  const root = await navigator.storage.getDirectory();
  const fileNames = await root.keys();
  let x = await fileNames.next();
  while (!x.done) {
    let fileName = x.value;
    const fileHandle = await root.getFileHandle(fileName);
    await fileHandle.remove();
    x = await fileNames.next();
  }
};

// clear()
// --------------------------- indepedent readBinary file code wrote to test before putting this part inside doesExist --------------------------
let readBin = async (fileName) => {
  let fileToCheck = `${fileName}.bin`;
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(fileToCheck);
  let retrived_blob = await fileHandle.getFile();
  var reader = new FileReader();
  return await new Promise((resolve, reject) => {
    reader.onload = function () {
      resolve(JSON.parse(reader.result));
    };
    reader.readAsText(retrived_blob);
  });
};

//--------------------------------------------------------------------------------
let write = async (fileName, positions, colors, maxIntensity) => {
  // positions and colors are Float32Array or arrays, maxIntensity is a number
  const pos = new Float32Array(positions);
  const col = new Float32Array(colors);
  const meta = new Float32Array([maxIntensity]);
  const totalLength = pos.length + col.length + meta.length;
  const combined = new Float32Array(totalLength);
  combined.set(pos, 0);
  combined.set(col, pos.length);
  combined.set(meta, pos.length + col.length);

  let fileToCheck = `${fileName}.bin`;
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(fileToCheck, { create: true });
  const writableStream = await fileHandle.createWritable();
  await writableStream.write(combined.buffer);
  await writableStream.close();
};

let read = async (fileName, posLen, colLen) => {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(`${fileName}.bin`, {
    create: false,
  });
  let file = await fileHandle.getFile();
  let buffer = await file.arrayBuffer();
  const floatArray = new Float32Array(buffer);
  const positions = floatArray.slice(0, posLen);
  const colors = floatArray.slice(posLen, posLen + colLen);
  const maxIntensity = floatArray[posLen + colLen];
  return {
    position: Array.from(positions),
    color: Array.from(colors),
    maxIntensity,
  };
};

let doesExist = async (fileName, posLen, colLen) => {
  try {
    let fileToCheck = `${fileName}.bin`;
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(fileToCheck);
    const permissionStatus = await fileHandle.queryPermission();
    let found = permissionStatus == "granted" ? true : false;
    let retrived_blob = await fileHandle.getFile();
    if (retrived_blob.size > 0) {
      let buffer = await retrived_blob.arrayBuffer();
      const floatArray = new Float32Array(buffer);
      const positions = floatArray.slice(0, posLen);
      const colors = floatArray.slice(posLen, posLen + colLen);
      const maxIntensity = floatArray[posLen + colLen];
      return [
        true,
        {
          position: Array.from(positions),
          color: Array.from(colors),
          maxIntensity,
        },
      ];
    } else {
      return [true, { position: [], color: [] }];
    }
  } catch (error) {
    if (error.name === "NotFoundError") {
      return [false, null];
    } else {
      console.error("Error checking if file exists:", error);
      return [false, null];
    }
  }
};

export {
  write,
  read,
  doesExist,
  clear,
  create_P_Meta_Cache,
  throttled_Update_Pers_Cache,
};
