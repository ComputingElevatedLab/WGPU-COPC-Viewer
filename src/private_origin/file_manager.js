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

let clear = async () => {
  const root = await navigator.storage.getDirectory();
  const fileNames = await root.keys();
  const files = Array.from(fileNames);
  for (const fileName of files) {
    const fileHandle = await root.getFile(fileName);
    await fileHandle.remove();
  }
};
// clear();

let write = async (fileName, textToWrite) => {
  console.log(fileName, "writing is started");
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(`${fileName}.txt`, {
    create: true,
  });
  const writableStream = await fileHandle.createWritable();
  await writableStream.write(textToWrite);
  await writableStream.close();
  console.log(fileName, "writing is done");
};

let read = async (fileName) => {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(`${fileName}.txt`, {
    create: false,
  });
  let file = await fileHandle.getFile();
  let content = await file.text();
  if (content) {
    return JSON.parse(content);
  }
  return null;
};

let doesExist = async (fileName) => {
  try {
    let fileToCheck = `${fileName}.txt`;
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(fileToCheck);
    const permissionStatus = await fileHandle.queryPermission();
    let found = permissionStatus == "granted" ? true : false;
    let file = await fileHandle.getFile();
    let content = await file.text();
    if (content) {
      content = JSON.parse(content);
    } else {
      content = null;
    }
    return [found, content];
  } catch (error) {
    if (error.name === "NotFoundError") {
      console.log("file not found");
      return [false, null];
    } else {
      console.error("Error checking if file exists:", error);
      return [false, null];
    }
  }
};

export { write, read, doesExist, clear };
