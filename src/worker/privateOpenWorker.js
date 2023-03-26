let write = async () => {
  const root = await navigator.storage.getDirectory();
  console.log(root);
  const draftHandle = await root.getFileHandle("draft.txt", { create: true });
  console.log(draftHandle);
  const accessHandle = await draftHandle.createSyncAccessHandle();
  const encoder = new TextEncoder();
  const encodedMessage = encoder.encode("hi there");
  const writeBuffer = accessHandle.write(encodedMessage, { at: 0 });
  const writeSize = accessHandle.write(writeBuffer, { "at" : 0 });
  accessHandle.flush();
  accessHandle.close();
  console.log("done");
};
let read = async()=>{

}

write();

onmessage = function (message) {
  console.log("hello");
};
