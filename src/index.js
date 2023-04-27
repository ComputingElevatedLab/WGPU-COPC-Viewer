import * as THREE from "three";
import { Octree, Box, Point } from "./octree";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import { CopyShader } from "three/examples/jsm/shaders/CopyShader";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader";
import Stats from "three/examples/jsm/libs/stats.module";
import { Copc, Key } from "copc";
import Worker from "./worker/fetcher.worker.js";
import { renderStages, device, stages, renderWrapper } from "./webgpu/renderer";
import { traverseTreeWrapper } from "./passiveloader";
import {
  write,
  read,
  doesExist,
  clear,
  create_P_Meta_Cache,
  throttled_Update_Pers_Cache,
} from "./private_origin/file_manager";
import {
  p_cache,
  get_inCache,
  getLRU_inCache,
  getMRU_inCache,
  sortObjectIntoMap,
  mapIntoJSON,
  put_inCache,
} from "./private_origin/cache_manager";

import "./styles/main.css";
import { fillArray, fillMidNodes } from "./helper";
import { cache } from "./lru-cache/index";

const bytes = new Float32Array(59);

const source_file_name = process.env.filename.split("/").pop();
let state_meta = {};

// ------------------- used to clear intital POFS that got created while writing code ---------------
// (async () => {
//   const root = await navigator.storage.getDirectory();
//   const fileHandle2 = await root.getFileHandle("1-1-0-0.txt");
//   await fileHandle2.remove();
//   const fileHandle = await root.getFileHandle("0-0-0-0.txt");
//   await fileHandle.remove();
//   const fileHandle1 = await root.getFileHandle("1-0-0-0.txt");
//   await fileHandle1.remove();

//   // console.log(await doesExist("0-1-0-0"));
// })();
// ---------------------------------------------------------------------------------------------------

let bufferMap = {};
let wait = false;
let toDeleteMap = {};
let toDelete = false;
let postMessageRes = 100;
let positions = [];
let colors = [];
let workerCount = 0;
const clock = new THREE.Clock();
const workers = new Array(1).fill(null);
let TotalCount = 0;
const MAX_WORKERS = navigator.hardwareConcurrency - 1;
let promises = [];
let nodePages, nodePagesString;
let pagesString;
let camera, proj;
let copcString;
let x_min,
  y_min,
  z_min,
  x_max,
  y_max,
  z_max,
  widthx,
  widthy,
  widthz,
  center_x,
  center_y,
  center_z,
  scaleFactor,
  params,
  controls;
let pers_cache;
let global_max_intensity = 0.5;

const canvas = document.getElementById("screen-canvas");

canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
canvas.height = window.innerHeight * (window.devicePixelRatio || 1);

function isTerminated(worker) {
  try {
    worker.postMessage(() => {});
    return true;
  } catch (e) {
    return false;
  }
}

function createWorker(data1, data2) {
  return new Promise((resolve) => {
    let worker = new Worker();
    worker.onmessage = (event) => {
      let postMessageRes = event.data;
      if (postMessageRes == 200) {
        worker.postMessage([
          nodePagesString,
          pagesString,
          copcString,
          data1,
          data2,
          [
            x_min,
            y_min,
            z_min,
            widthx,
            widthy,
            widthz,
            scaleFactor[0],
            scaleFactor[1],
            scaleFactor[2],
          ],
        ]);
      } else {
        workerCount += 1;
        let position = postMessageRes[0];
        let color = postMessageRes[1];
        let [minZ, maxZ, maxIntensity] = postMessageRes[2];
        if (maxIntensity > global_max_intensity) {
          global_max_intensity = maxIntensity;
        }
        let localPosition = [];
        let localColor = [];
        for (let i = 0; i < position.length; i++) {
          positions.push(position[i]);
          localPosition.push(position[i]);
          colors.push(color[i]);
          localColor.push(color[i]);
        }
        if (workerCount == MAX_WORKERS) {
          workerCount = 0;
          promises = [];
        }
        worker.terminate();
        resolve([localPosition, localColor, data1]);
      }
    };
  });
}

let boxGroup = new THREE.Group();
let scene_width = 1000;
let scene_height = 1000;
let scene_depth = 1000;
let scale = 1;
let qt;
let mapCamera,
  mapSizeX = 128,
  mapSizeY = 64;
let _width = window.innerWidth;
let _height = window.innerHeight;
let right = 1024,
  left = -1024,
  top = 1024,
  bottom = -1024;

let isIntensityPresent;

function findLevel(qt) {
  // traverse octre
  let threshold = 100;
  let cameraPosition = controls.object.position;
  // remove all bounding box 3d object after disposing before every check
  for (let i = 0, _length = boxGroup.children.length; i < _length; i++) {
    boxGroup.children[i].material.dispose();
    boxGroup.children[i].geometry.dispose();
  }

  boxGroup.remove(...boxGroup.children);

  function traverseTree(node = qt) {
    if (node == null) {
      return null;
    }
    boxGroup.add(node.box.mesh);
    if (!node.isDivided) {
      return [...node.points, ...node.buffer];
    }
    let myDistanceFromCamera = cameraPosition.distanceTo(
      new THREE.Vector3(node.box.x, node.box.y, node.box.z)
    );
    if (myDistanceFromCamera > threshold) {
      return [...node.points, ...node.buffer];
    }
    let children = [
      node.minNE,
      node.minNW,
      node.minSW,
      node.minSE,
      node.maxNE,
      node.maxNW,
      node.maxSW,
      node.maxSE,
    ];
    let results = [...node.points, ...node.buffer];
    for (let i = 0, _length = children.length; i < _length; i++) {
      let points = traverseTree(children[i]);
      results.push(...points);
    }
    return results;
  }
  return traverseTree();
}
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let keyCountMap;

const createBuffer = (positions, colors) => {
  let size = positions.length;
  let positionBuffer = device.createBuffer({
    label: `${size}`,
    size: size * 4,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });

  let positionMappedArray = new Float32Array(positionBuffer.getMappedRange());
  positionMappedArray.set(positions);
  positionBuffer.unmap();

  let colorBuffer = device.createBuffer({
    label: `${size}`,
    size: size * 4,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });

  let colorMappedArray = new Float32Array(colorBuffer.getMappedRange());
  colorMappedArray.set(colors);
  colorBuffer.unmap();
  return [positionBuffer, colorBuffer];
};

let total = 0;
let total2 = 0;

const syncThread = async () => {
  await Promise.all(promises).then(async (response) => {
    for (let i = 0, _length = response.length; i < _length; i++) {
      let data = response[i];
      let fileName = data[2];
      let data_json = {
        position: data[0],
        color: data[1],
      };
      const start = performance.now();
      let data_json_stringify = JSON.stringify(data_json);
      cache.set(fileName, data_json_stringify);
      const end = performance.now();
      total += end - start;
      await write(`${source_file_name}-${fileName}`, data_json_stringify);

      state_meta[fileName] = {
        count: 1,
        date: new Date(),
      };

      let [positionBuffer, colorBuffer] = createBuffer(data[0], data[1]);
      bufferMap[data[2]] = {
        position: positionBuffer,
        color: colorBuffer,
      };
    }
    // console.log(bufferMap);
    // console.log("one chunk finish");
  });
  const start = performance.now();
  await throttled_Update_Pers_Cache(mapIntoJSON(pers_cache));
  const end = performance.now();
  console.log(`Total Time to write into meta cache: ${end - start}ms`);
};

async function filterkeyCountMap_NOthing(keyMap) {
  let newKeyMap = [];
  let newBufferMap = {};
  let total = 0;
  for (let i = 1; i < keyMap.length; i += 2) {
    total += keyMap[i];
  }

  console.log("total point to be loaded is", total);

  for (const key in toDeleteMap) {
    toDeleteMap[key].position.destroy();
    toDeleteMap[key].color.destroy();
    delete toDeleteMap[key];
  }

  let existingBuffers = Object.keys(bufferMap);
  // console.log("at the start of filtering", existingBuffers.length);

  let toDeleteArray = existingBuffers.reduce((acc, val) => {
    acc[val] = true;
    return acc;
  }, {});

  const startTime1 = performance.now();
  for (let i = 0; i < keyMap.length; i += 2) {
    if (!(keyMap[i] in bufferMap)) {
      newKeyMap.push(keyMap[i], keyMap[i + 1]);
    } else {
      // console.log(`found ${keyMap[i]} in existing buffer`);
      newBufferMap[keyMap[i]] = {
        position: bufferMap[keyMap[i]].position,
        color: bufferMap[keyMap[i]].color,
      };
      pers_cache = await get_inCache(pers_cache, keyMap[i]);
      delete toDeleteArray[keyMap[i]];
    }
  }
  //-------------------------------------------------------------------------
  existingBuffers = Object.keys(newBufferMap);
  for (let key in toDeleteArray) {
    toDeleteMap[key] = {
      position: bufferMap[key].position,
      color: bufferMap[key].position,
    };
  }
  bufferMap = newBufferMap;
  return newKeyMap;
}

async function filterkeyCountMap_LRU(keyMap) {
  let newKeyMap = [];
  let newBufferMap = {};
  let total = 0;
  for (let i = 1; i < keyMap.length; i += 2) {
    total += keyMap[i];
  }

  console.log("total point to be loaded is", total);

  // console.log("asked for", keyMap);
  for (const key in toDeleteMap) {
    toDeleteMap[key].position.destroy();
    toDeleteMap[key].color.destroy();
    delete toDeleteMap[key];
  }

  let existingBuffers = Object.keys(bufferMap);
  // console.log("at the start of filtering", existingBuffers.length);

  let toDeleteArray = existingBuffers.reduce((acc, val) => {
    acc[val] = true;
    return acc;
  }, {});

  const startTime1 = performance.now();
  for (let i = 0; i < keyMap.length; i += 2) {
    if (!(keyMap[i] in bufferMap)) {
      newKeyMap.push(keyMap[i], keyMap[i + 1]);
    } else {
      // console.log(`found ${keyMap[i]} in existing buffer`);
      newBufferMap[keyMap[i]] = {
        position: bufferMap[keyMap[i]].position,
        color: bufferMap[keyMap[i]].color,
      };
      pers_cache = await get_inCache(pers_cache, keyMap[i]);
      delete toDeleteArray[keyMap[i]];
    }
  }
  const endTime1 = performance.now();
  // console.log(`Time taken to find new one needed: ${endTime1 - startTime1}ms`);

  // --------------------- these are new ones
  // are they in cache?
  const startTime2 = performance.now();

  let afterCheckingCache = [];
  for (let i = 0; i < newKeyMap.length; i += 2) {
    let cachedResult = cache.get(newKeyMap[i]);

    if (cachedResult) {
      // console.log(`found ${newKeyMap[i]} in cache`);
      cachedResult = JSON.parse(cachedResult);
      // pers_cache = await get_inCache(pers_cache, newKeyMap[i]);
      let [positionBuffer, colorBuffer] = createBuffer(
        cachedResult.position,
        cachedResult.color
      );
      newBufferMap[newKeyMap[i]] = {
        position: positionBuffer,
        color: colorBuffer,
      };
    } else {
      afterCheckingCache.push(newKeyMap[i], newKeyMap[i + 1]);
    }
  }
  // console.log(
  //   `Time taken for retival from persistance cache: ${endTime3 - startTime3}ms`
  // );
  //-------------------------------------------------------------------------
  existingBuffers = Object.keys(newBufferMap);
  // console.log("after filtering", existingBuffers.length);

  // console.log("to delete array", toDeleteArray);
  for (let key in toDeleteArray) {
    toDeleteMap[key] = {
      position: bufferMap[key].position,
      color: bufferMap[key].position,
    };
  }
  bufferMap = newBufferMap;
  return afterCheckingCache;
  //filter and delete unwanted bufferMap
}

async function filterkeyCountMap(keyMap) {
  let newKeyMap = [];
  let newBufferMap = {};
  let total = 0;
  for (let i = 1; i < keyMap.length; i += 2) {
    total += keyMap[i];
  }

  console.log("total point to be loaded is", total);

  // console.log("asked for", keyMap);
  for (const key in toDeleteMap) {
    toDeleteMap[key].position.destroy();
    toDeleteMap[key].color.destroy();
    delete toDeleteMap[key];
  }

  let existingBuffers = Object.keys(bufferMap);
  // console.log("at the start of filtering", existingBuffers.length);

  let toDeleteArray = existingBuffers.reduce((acc, val) => {
    acc[val] = true;
    return acc;
  }, {});

  const startTime1 = performance.now();
  for (let i = 0; i < keyMap.length; i += 2) {
    if (!(keyMap[i] in bufferMap)) {
      newKeyMap.push(keyMap[i], keyMap[i + 1]);
    } else {
      // console.log(`found ${keyMap[i]} in existing buffer`);
      newBufferMap[keyMap[i]] = {
        position: bufferMap[keyMap[i]].position,
        color: bufferMap[keyMap[i]].color,
      };
      pers_cache = await get_inCache(pers_cache, keyMap[i]);
      delete toDeleteArray[keyMap[i]];
    }
  }
  const endTime1 = performance.now();
  // console.log(`Time taken to find new one needed: ${endTime1 - startTime1}ms`);

  // --------------------- these are new ones
  // are they in cache?
  const startTime2 = performance.now();

  let afterCheckingCache = [];
  for (let i = 0; i < newKeyMap.length; i += 2) {
    let cachedResult = cache.get(newKeyMap[i]);

    if (cachedResult) {
      // console.log(`found ${newKeyMap[i]} in cache`);
      cachedResult = JSON.parse(cachedResult);
      // pers_cache = await get_inCache(pers_cache, newKeyMap[i]);
      let [positionBuffer, colorBuffer] = createBuffer(
        cachedResult.position,
        cachedResult.color
      );
      newBufferMap[newKeyMap[i]] = {
        position: positionBuffer,
        color: colorBuffer,
      };
    } else {
      afterCheckingCache.push(newKeyMap[i], newKeyMap[i + 1]);
    }
  }
  const endTime2 = performance.now();

  const startTime3 = performance.now();
  let filteredElements = [];
  for (let i = 0; i < afterCheckingCache.length; i += 2) {
    let [Exist, data] = await doesExist(
      `${source_file_name}-${afterCheckingCache[i]}`
    );

    if (Exist) {
      // console.log(`found ${afterCheckingCache[i]} in POFS`);
      // let data = await read(afterCheckingCache[i]);
      let [positionBuffer, colorBuffer] = createBuffer(
        data.position,
        data.color
      );

      newBufferMap[afterCheckingCache[i]] = {
        position: positionBuffer,
        color: colorBuffer,
      };
      cache.set(afterCheckingCache[i], JSON.stringify(data));
      pers_cache = await get_inCache(pers_cache, afterCheckingCache[i]);
    } else {
      filteredElements.push(afterCheckingCache[i], afterCheckingCache[i + 1]);
      pers_cache = await put_inCache(pers_cache, afterCheckingCache[i], {
        count: 1,
        date: Date.now(),
      });
    }
  }
  const endTime3 = performance.now();
  // console.log(
  //   `Time taken for retival from persistance cache: ${endTime3 - startTime3}ms`
  // );
  //-------------------------------------------------------------------------
  existingBuffers = Object.keys(newBufferMap);
  // console.log("after filtering", existingBuffers.length);

  // console.log("to delete array", toDeleteArray);
  for (let key in toDeleteArray) {
    toDeleteMap[key] = {
      position: bufferMap[key].position,
      color: bufferMap[key].position,
    };
  }
  bufferMap = newBufferMap;
  return filteredElements;
  //filter and delete unwanted bufferMap
}

const syncThread_Prefetch = async () => {
  await Promise.all(promises).then(async (response) => {
    for (let i = 0, _length = response.length; i < _length; i++) {
      let data = response[i];
      let fileName = data[2];
      let data_json = {
        position: data[0],
        color: data[1],
      };
      let data_json_stringify = JSON.stringify(data_json);
      await write(`${source_file_name}-${fileName}`, data_json_stringify);
      state_meta[fileName] = {
        count: 1,
        date: new Date(),
      };
      cache.set(fileName, data_json_stringify);
    }
  });
};

async function filterkeyCountMap_Prefetch(keyMap) {
  let afterCheckingCache = [];

  for (let i = 0; i < keyMap.length; i += 2) {
    let cachedResult = cache.get(keyMap[i]);
    if (!cachedResult) {
      afterCheckingCache.push(keyMap[i], keyMap[i + 1]);
    }
  }

  let filteredElements = [];
  for (let i = 0; i < afterCheckingCache.length; i += 2) {
    let [Exist, data] = await doesExist(
      `${source_file_name}-${afterCheckingCache[i]}`
    );
    if (Exist) {
      cache.set(afterCheckingCache[i], JSON.stringify(data));
      pers_cache = await get_inCache(pers_cache, afterCheckingCache[i]);
    } else {
      filteredElements.push(afterCheckingCache[i], afterCheckingCache[i + 1]);
      pers_cache = await put_inCache(pers_cache, afterCheckingCache[i], {
        count: 1,
        date: Date.now(),
      });
    }
  }
  await throttled_Update_Pers_Cache(mapIntoJSON(cache));
  return filteredElements;
}

async function retrivePoints(projectionViewMatrix, newCamera) {
  const start = performance.now();
  total = 0;
  if (newCamera != undefined) camera = newCamera;
  const startTime4 = performance.now();
  let [keyCountMap, nodeToPrefetch] = traverseTreeWrapper(
    nodePages,
    [0, 0, 0, 0],
    center_x,
    center_y,
    center_z,
    [0.5 * widthx, 0.5 * widthy, 0.5 * widthz],
    scaleFactor,
    controls,
    projectionViewMatrix
  );
  const endTime4 = performance.now();
  // console.log(`Time taken to traverse tree: ${endTime4 - startTime4}ms`);
  // keyCountMap = await filterkeyCountMap_LRU(keyCountMap);
  // keyCountMap = await filterkeyCountMap_NOthing(keyCountMap);
  keyCountMap = await filterkeyCountMap(keyCountMap);
  clock.getDelta();
  const start_retrival = performance.now();
  let totalNodes = keyCountMap.length / 2;
  let doneCount = 0;

  let existingBuffers = Object.keys(bufferMap);
  let prefetch_keyCountMap = [];
  // let prefetch_keyCountMap = await filterkeyCountMap_Prefetch(nodeToPrefetch);
  // console.log("before fetching", existingBuffers.length);

  for (let m = 0; m < keyCountMap.length; ) {
    let remaining = totalNodes - doneCount;
    let numbWorker = Math.min(MAX_WORKERS, remaining);
    for (let i = 0; i < numbWorker; i++) {
      // console.log("i am entering first time");
      promises.push(createWorker(keyCountMap[m], keyCountMap[m + 1]));
      doneCount++;
      m += 2;
      if (doneCount % MAX_WORKERS == 0 || doneCount == totalNodes) {
        await syncThread();
        // if (controllerSignal && controllerSignal.aborted) {
        //   console.log("i am aborted now from fetching thread");
        //   return;
        // }
        // console.log(doneCount, "i am done");
      }
    }
  }

  const end = performance.now();
  console.log(`Total retrive Time: ${end - start}ms`);

  totalNodes = prefetch_keyCountMap.length / 2;
  doneCount = 0;
  promises = [];

  for (let m = 0; m < prefetch_keyCountMap.length; ) {
    let remaining = totalNodes - doneCount;
    let numbWorker = Math.min(MAX_WORKERS, remaining);
    for (let i = 0; i < numbWorker; i++) {
      // console.log("i am entering first time");
      promises.push(
        createWorker(prefetch_keyCountMap[m], prefetch_keyCountMap[m + 1])
      );
      doneCount++;
      m += 2;
      if (doneCount % MAX_WORKERS == 0 || doneCount == totalNodes) {
        await syncThread_Prefetch();
        // if (controllerSignal && controllerSignal.aborted) {
        //   console.log("i am aborted now from prefetcher");
        //   return;
        // }
      }
    }
  }

  existingBuffers = Object.keys(bufferMap);
  // console.log("after fetching", existingBuffers.length);

  const end_retival = performance.now();
  // console.log(
  //   `Time to retrive/fetch needed is : ${
  //     end_retival - start_retrival
  //   }ms, and ${total} is consumed in cache in between`
  // );
  // console.log("it finished at", clock.getDelta());
}

async function createCameraProj() {
  camera = new THREE.PerspectiveCamera(
    90,
    canvas.width / canvas.height,
    0.1,
    20000
  );
  camera.position.set(0, 0, 1500);
  camera.up.set(0, 0, 1);
  camera.updateProjectionMatrix();
  camera.lookAt(new THREE.Vector3(0, 0, 0));

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.5;
  // controls.minAzimuthAngle = 0;
  // controls.maxAzimuthAngle = 0.25 * Math.PI;
  // controls.minPolarAngle = 0;
  // controls.maxPolarAngle = Math.PI;
  controls.rotateSpeed = 2;
  controls.zoomSpeed = 2;
  controls.panSpeed = 5;
  // controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;
  controls.update();

  // camera = new ArcballCamera([100, -100, 100], [0, 0, 0], [0, 1, 0], 300, [
  //   window.innerWidth,
  //   window.innerHeight,
  // ]);

  proj = mat4.perspective(
    mat4.create(),
    (90 * Math.PI) / 180.0,
    canvas.width / canvas.height,
    0.1,
    8000
  );
}

async function loadCOPC() {
  clock.getDelta();
  // https://viewer.copc.io/?copc=https://s3.amazonaws.com/data.entwine.io/millsite.copc.laz
  // https://github.com/PDAL/data/blob/master/autzen/autzen-classified.copc.laz
  // let filename = "https://s3.amazonaws.com/data.entwine.io/millsite.copc.laz";
  const filename = process.env.filename;
  const copc = await Copc.create(filename);
  console.log(copc.header);
  scaleFactor = copc.header.scale;
  copcString = JSON.stringify(copc);
  // scale = copc.header.scale[0];
  [x_min, y_min, z_min, x_max, y_max, z_max] = copc.info.cube;
  scaleFactor = [1, 1, 1];
  widthx = Math.abs(x_max - x_min);
  widthy = Math.abs(y_max - y_min);
  widthz = Math.abs(z_max - z_min);
  // console.log(z_max, z_min, widthz);
  // for new COPC file widthz is 50, z_min is fine but width is wrong
  // widthz = 150;
  console.log("minimum z is", z_min, "z-width is", widthz, copc.info.cube);

  params = [widthx, widthy, widthz, x_min, y_min, z_min];
  center_x = ((x_min + x_max) / 2 - x_min - 0.5 * widthx) * scaleFactor[0];
  center_y = ((y_min + y_max) / 2 - y_min - 0.5 * widthy) * scaleFactor[1];
  center_z = ((z_min + z_max) / 2 - z_min - 0.5 * widthz) * scaleFactor[2];
  // center is moved to origin and we dont need to do this but for sake for checking the cordinate system, i am doing this
  const { nodes: nodePages1, pages: pages } = await Copc.loadHierarchyPage(
    filename,
    copc.info.rootHierarchyPage
  );
  nodePages = nodePages1;
  nodePagesString = JSON.stringify(nodePages);
  pagesString = JSON.stringify(pages);
}

(async () => {
  // await clear();
  const start6 = performance.now();
  await create_P_Meta_Cache();
  const end6 = performance.now();
  console.log(`Time taken to create meta cache: ${end6 - start6}ms`);

  const start7 = performance.now();
  pers_cache = await p_cache();
  const end7 = performance.now();
  console.log(`Time taken to make LRU meta cache: ${end7 - start7}ms`);
  // console.log("cache created successfully");

  const start8 = performance.now();
  await createCameraProj();
  const end8 = performance.now();
  console.log(`Time taken to create camera: ${end8 - start8}ms`);
  // console.log("file reading start");

  const start9 = performance.now();
  await loadCOPC();
  const end9 = performance.now();
  console.log(`Time taken to load COPC file: ${end9 - start9}ms`);
  // console.log("initialize the uniform buffers");

  const start10 = performance.now();
  let projViewMatrix = await stages(camera, proj, params);
  const end10 = performance.now();
  console.log(`Time taken to do initial rendering setup: ${end10 - start10}ms`);
  // console.log("data loading start");

  // const start11 = performance.now();
  // await retrivePoints(projViewMatrix);
  // const end11 = performance.now();
  // console.log(
  //   `Time taken to retrive needed nodes from tree: ${end11 - start11}ms`
  // );
  // console.log("data loaded");

  const start12 = performance.now();
  await renderWrapper();
  const end12 = performance.now();
  console.log(`Time taken to render: ${end12 - start12}ms`);
  // console.log("render done");
})();

// ------------------------------------------------------------------------------------
// -------------make iternary of camera ----------------------------------------------

// render by WebGPU
// console.log(colors);
// renderStages(positions, colors);
// ----------------------------------------------------------------------------
// geometry.setAttribute(
//   "position",
//   new THREE.Float32BufferAttribute(positions, 3)
// );
// geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
// var material = new THREE.PointsMaterial({ size: 2, vertexColors: true });
// let p = new THREE.Points(geometry, material);
// scene.add(p);
// -----------------------------------------------------------------------------

export {
  scene_width,
  scene_height,
  scene_depth,
  loadCOPC,
  bufferMap,
  retrivePoints,
  toDeleteMap,
  wait,
  controls,
  global_max_intensity,
};
