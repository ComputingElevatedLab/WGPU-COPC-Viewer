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
    const fileHandle = await root.getFileHandle("0-0-0-0");
    await fileHandle.remove();
  }
};

let write = async (fileName, textToWrite) => {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await root.getFileHandle(`${fileName}.txt`, {
    create: true,
  });
  const writableStream = await fileHandle.createWritable();
  await writableStream.write(textToWrite);
  await writableStream.close();
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
    return true;
  } catch (error) {
    if (error.name === "NotFoundError") {
      console.log("file not found");
      return false;
    } else {
      console.error("Error checking if file exists:", error);
      return false;
    }
  }
};

export { write, read, doesExist, clear };
