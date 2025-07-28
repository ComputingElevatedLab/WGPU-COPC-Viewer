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
import { fillArray, fillMidNodes, updateHtmlUI } from "./helper";
import { cache } from "./lru-cache/index";

let loadedFromCache = 0; 
let fetchedFromsource = 0;
const bytes = new Float32Array(59);
const source_file_name = process.env.filename.split("/").pop();
let state_meta = {};
let currentJobToken = 0;

function startNewCOPCJob() {
  currentJobToken++;
  return currentJobToken;
}

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
let pages;
let copc;
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
let global_max_intensity = 0;
let prefetch_keyCountMap;

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
  let myNode = data1.split("-").map(Number);
  let myLevel = myNode[0];
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
            myLevel,
          ],
        ]);
      } else {
        workerCount += 1;
        let position = postMessageRes[0];
        let color = postMessageRes[1];
        let [minZ, maxZ, maxIntensity, dataLevel] = postMessageRes[2];
        if (maxIntensity > global_max_intensity) {
          global_max_intensity = maxIntensity;
        }
        let localPosition = [];
        let localColor = [];
        for (let i = 0; i < position.length; i++) {
          positions.push(position[i]);
          if (i > 0 && i % 3 == 0) {
            localPosition.push(dataLevel);
          }
          localPosition.push(position[i]);
          colors.push(color[i]);
          localColor.push(color[i]);
        }
        localPosition.push(dataLevel);

        if (workerCount == MAX_WORKERS) {
          workerCount = 0;
          promises = [];
        }
        worker.terminate();
        resolve([localPosition, localColor, data1, maxIntensity]);
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
  // console.log("size is ", size);
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

const syncThread = async () => {
  await Promise.all(promises).then(async (response) => {
    for (let i = 0, _length = response.length; i < _length; i++) {
      let data = response[i];
      let fileName = data[2];

      let data_json = {
        position: data[0],
        color: data[1],
        maxIntensity: data[3],
      };

      await write(`${source_file_name}-${fileName}`, data[0], data[1], data[3]);

      state_meta[fileName] = {
        count: 1,
        date: new Date(),
      };
      // console.log("data sent from worker is", data[0].length);
      let [positionBuffer, colorBuffer] = createBuffer(data[0], data[1]);

      bufferMap[data[2]] = {
        position: positionBuffer,
        color: colorBuffer,
        maxIntensity: data[3],
      };
    }
    // console.log(bufferMap);
    // console.log("one chunk finish");
  });
};

const syncThread_Prefetch = async () => {
  await Promise.all(promises).then(async (response) => {
    for (let i = 0, _length = response.length; i < _length; i++) {
      let data = response[i];
      let fileName = data[2];

      await write(`${source_file_name}-${fileName}`, data[0], data[1], data[3]);
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
    let pointCount = afterCheckingCache[i + 1];
    let posLen = pointCount * 3;
    let colLen = pointCount * 3;
    let [Exist, data] = await doesExist(
      `${source_file_name}-${afterCheckingCache[i]}`,
      posLen,
      colLen
    );
    if (Exist) {
      cache.set(afterCheckingCache[i], JSON.stringify(data));
      pers_cache = get_inCache(pers_cache, afterCheckingCache[i]);
    } else {
      filteredElements.push(afterCheckingCache[i], afterCheckingCache[i + 1]);
      pers_cache = put_inCache(pers_cache, afterCheckingCache[i], {
        count: 1,
        date: Date.now(),
      });
    }
  }
  await throttled_Update_Pers_Cache(mapIntoJSON(cache));
  return filteredElements;
}

async function filterkeyCountMap(keyMap) {
  // computing node fetch counts
  let nodeNotFoundInBuffer = 0;
  let nodeFoundInBuffer = 0;
  let nodeFoundInLRU = 0;
  let nodeFoundInPersistent = 0;
  let nodeToFetch = 0;

  let newKeyMap = [];
  let newBufferMap = {};
  for (const key in toDeleteMap) {
    toDeleteMap[key].position.destroy();
    toDeleteMap[key].color.destroy();
    delete toDeleteMap[key];
  }

  let existingBuffers = Object.keys(bufferMap);
  let toDeleteArray = existingBuffers.reduce((acc, val) => {
    acc[val] = true;
    return acc;
  }, {});

  const startTime1 = performance.now();
  for (let i = 0; i < keyMap.length; i += 2) {
    if (!(keyMap[i] in bufferMap)) {
      newKeyMap.push(keyMap[i], keyMap[i + 1]);
      nodeNotFoundInBuffer++;
    } else {
      // console.log(`found ${keyMap[i]} in existing buffer`);
      nodeFoundInBuffer++;
      let maxIntensity = bufferMap[keyMap[i]].maxIntensity;
      newBufferMap[keyMap[i]] = {
        position: bufferMap[keyMap[i]].position,
        color: bufferMap[keyMap[i]].color,
        maxIntensity: maxIntensity,
      };
      if (maxIntensity > global_max_intensity) {
        global_max_intensity = maxIntensity;
      }
      pers_cache = get_inCache(pers_cache, keyMap[i]);
      delete toDeleteArray[keyMap[i]];
    }
  }
  const endTime1 = performance.now();
  // console.log(`Time taken: ${endTime1 - startTime1}ms`);

  // --------------------- these are new ones
  // are they in non-persistence cache?
  const startTime2 = performance.now();

  let afterCheckingCache = [];
  for (let i = 0; i < newKeyMap.length; i += 2) {
    let cachedResult = cache.get(newKeyMap[i]);
    if (cachedResult) {
      nodeFoundInLRU++;
      // console.log(`found ${newKeyMap[i]} in cache`);
      cachedResult = JSON.parse(cachedResult);
      pers_cache = get_inCache(pers_cache, newKeyMap[i]);
      let [positionBuffer, colorBuffer] = createBuffer(
        cachedResult.position,
        cachedResult.color
      );
      const maxIntensity = cachedResult.maxIntensity;
      newBufferMap[newKeyMap[i]] = {
        position: positionBuffer,
        color: colorBuffer,
        maxIntensity: maxIntensity,
      };
      if (maxIntensity > global_max_intensity) {
        global_max_intensity = maxIntensity;
      }
    } else {
      afterCheckingCache.push(newKeyMap[i], newKeyMap[i + 1]);
    }
  }
  const endTime2 = performance.now();
  // console.log(`Time taken: ${endTime2 - startTime2}ms`);

  const startTime3 = performance.now();
  let filteredElements = [];
  for (let i = 0; i < afterCheckingCache.length; i += 2) {
    let pointCount = afterCheckingCache[i + 1];
    let posLen = pointCount * 3;
    let colLen = pointCount * 3;
    let [Exist, data] = await doesExist(
      `${source_file_name}-${afterCheckingCache[i]}`,
      posLen,
      colLen
    );
    if (Exist) {
      console.log("found in POFS");
      // console.log(`found ${afterCheckingCache[i]} in POFS`);
      // let data = await read(afterCheckingCache[i]);
      nodeFoundInPersistent++;
      let [positionBuffer, colorBuffer] = createBuffer(
        data.position,
        data.color
      );
      newBufferMap[afterCheckingCache[i]] = {
        position: positionBuffer,
        color: colorBuffer,
        maxIntensity: data.maxIntensity,
      };
      if (data.maxIntensity > global_max_intensity) {
        global_max_intensity = data.maxIntensity;
      }
      cache.set(afterCheckingCache[i], JSON.stringify(data));
      pers_cache = get_inCache(pers_cache, afterCheckingCache[i]);
    } else {
      filteredElements.push(afterCheckingCache[i], afterCheckingCache[i + 1]);
      pers_cache = put_inCache(pers_cache, afterCheckingCache[i], {
        count: 1,
        date: Date.now(),
      });
      nodeToFetch++;
    }
  }
  const endTime3 = performance.now();
  // console.log(`Time taken: ${endTime3 - startTime3}ms`);

  await throttled_Update_Pers_Cache(mapIntoJSON(cache));
  //-------------------------------------------------------------------------

  for (let key in toDeleteArray) {
    toDeleteMap[key] = {
      position: bufferMap[key].position,
      color: bufferMap[key].position,
    };
  }
  bufferMap = newBufferMap;
  // console.log(`to fetch this ${filteredElements}`);

  updateHtmlUI(
    nodeNotFoundInBuffer,
    nodeFoundInBuffer,
    nodeFoundInLRU,
    nodeFoundInPersistent,
    nodeToFetch
  );
  return filteredElements;
  //filter and delete unwanted bufferMap
}

let direction = [
  [0, 0, 0],
  [0, 0, 1],
  [0, 1, 0],
  [0, 1, 1],
  [1, 0, 0],
  [1, 0, 1],
  [1, 1, 0],
  [1, 1, 1],
];

function findSiblings(keyCountMap) {
  let siblings = {};
  let nodeKeyCount = [];
  for (let i = 0; i < keyCountMap.length; i += 2) {
    let myNode = keyCountMap[i];
    myNode = myNode.split("-").map(Number);
    if (myNode.every((c) => c == 0)) {
      continue;
    }
    let myParent = [];
    myParent[0] = myNode[0] - 1;
    for (let i = 1; i <= 3; i++) {
      myParent[i] = Math.floor(myNode[i] / 2);
    }

    // for (let k = 0; k < 8; k++) {
    //   let sibling = [
    //     myNode[0],
    //     2 * myParent[1] + direction[k][0],
    //     2 * myParent[2] + direction[k][1],
    //     2 * myParent[3] + direction[k][2],
    //   ];
    //   sibling = sibling.join("-");
    //   if (sibling in siblings || sibling in bufferMap) {
    //     continue;
    //   } else if (sibling in nodePages && nodePages[sibling].pointCount > 0) {
    //     nodeKeyCount.push(sibling, nodePages[sibling].pointCount);
    //     siblings[sibling] = true;
    //   }
    // }
  }
  return nodeKeyCount;
}

async function retrivePoints(
  projectionViewMatrix,
  controllerSignal = null,
  jobToken = null
) {
  const startTime4 = performance.now();
  // if (jobToken !== currentJobToken) return;
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

  keyCountMap = await filterkeyCountMap(keyCountMap);
  prefetch_keyCountMap = await filterkeyCountMap_Prefetch(nodeToPrefetch);

  clock.getDelta();
  let totalNodes = keyCountMap.length / 2;
  let doneCount = 0;

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
        // console.log(controllerSignal)
        if (controllerSignal && controllerSignal.aborted) {
          // console.log("i am aborted now from fetching thread");
          return;
        }
      }
    }
  }

  // ------------------------------------------------------------------
  totalNodes = prefetch_keyCountMap.length / 2;
  doneCount = 0;
  promises = [];

  // for (let m = 0; m < prefetch_keyCountMap.length; ) {
  //   let remaining = totalNodes - doneCount;
  //   let numbWorker = Math.min(MAX_WORKERS, remaining);
  //   for (let i = 0; i < numbWorker; i++) {
  //     // console.log("i am entering first time");
  //     promises.push(
  //       createWorker(prefetch_keyCountMap[m], prefetch_keyCountMap[m + 1])
  //     );
  //     doneCount++;
  //     m += 2;
  //     if (doneCount % MAX_WORKERS == 0 || doneCount == totalNodes) {
  //       await syncThread_Prefetch();
  //       if (controllerSignal && controllerSignal.aborted) {
  //         console.log("i am aborted now from prefetcher");
  //         return;
  //       }
  //     }
  //   }
  // }

  // console.log("it finished at", clock.getDelta());

  // find sibling
  // let siblings = findSiblings(keyCountMap);
  // console.log(siblings);
}

async function createCameraProj() {
  camera = new THREE.PerspectiveCamera(
    50,
    canvas.width / canvas.height,
    0.1,
    4000
  );
  camera.up.set(0, 0, 1);
  camera.position.set(0, 1000, 1000);
  // camera.position.set( 1446.6944661802368, -1721.55051389683 , 444.2788);
  // camera.rotation.set(0.6403667747403355, 0.34, 0.42);
  camera.updateProjectionMatrix();

  controls = new OrbitControls(camera, canvas);
  // controls.target.set(900, -665, -710);

  controls.enableDamping = true;
  controls.dampingFactor = 0.5;
  // controls.minAzimuthAngle = 0;
  // controls.maxAzimuthAngle = 0.25 * Math.PI;
  // controls.minPolarAngle = 0;
  // controls.maxPolarAngle = Math.PI;
  // controls.rotateSpeed = 2;
  controls.zoomSpeed = 1;
  controls.panSpeed = 2;
  // controls.autoRotate = true;
  // controls.autoRotateSpeed = 0.5;
  controls.update();

  // camera = new ArcballCamera([100, -100, 100], [0, 0, 0], [0, 1, 0], 300, [
  //   window.innerWidth,
  //   window.innerHeight,
  // ]);

  proj = mat4.perspective(
    mat4.create(),
    (50 * Math.PI) / 180.0,
    canvas.width / canvas.height,
    0.1,
    8000
  );
}

async function loadCOPC() {
  clock.getDelta();
  const filename = process.env.filename;
  copc = await Copc.create(filename);
  console.log("file is", copc);
  scaleFactor = copc.header.scale;
  scaleFactor = [1.0, 1.0, 1.0];
  copcString = JSON.stringify(copc);
  [x_min, y_min, z_min, x_max, y_max, z_max] = [
    ...copc.header.min,
    ...copc.header.max,
  ];
  x_min *= scaleFactor[0];
  x_max *= scaleFactor[0];
  y_min *= scaleFactor[1];
  y_max *= scaleFactor[1];
  z_min *= scaleFactor[2];
  z_max *= scaleFactor[2];
  widthx = Math.abs(x_max - x_min);
  widthy = Math.abs(y_max - y_min);
  widthz = Math.abs(z_max - z_min);
  params = [widthx, widthy, widthz, x_min, y_min, z_min];
  center_x = (x_min + x_max) / 2 - x_min - 0.5 * widthx;
  center_y = (y_min + y_max) / 2 - y_min - 0.5 * widthy;
  center_z = (z_min + z_max) / 2 - z_min - 0.5 * widthz;
  const { nodes: nodePages1, pages: pages1 } = await Copc.loadHierarchyPage(
    filename,
    copc.info.rootHierarchyPage
  );
  nodePages = nodePages1;
  nodePagesString = JSON.stringify(nodePages);
  pages = pages1;
  pagesString = JSON.stringify(pages);

  // --- Performance test for one node ---
  let testKey = Object.keys(nodePages).filter(
    (k) =>
      nodePages[k].pointCount > 0 && nodePages[k].pointDataOffset !== undefined
  );
  if (!testKey) {
    console.error("No suitable node found for timing test.");
    return;
  }
  console.log(`Testing node: ${testKey}`);
  // get testKey with highest number of points
  const highestPointKey = testKey.reduce((maxKey, k) =>
    nodePages[k].pointCount > nodePages[maxKey].pointCount ? k : maxKey
  );
  console.log(`Highest point node: ${highestPointKey}`);

  testKey = highestPointKey;
  const pointCount = nodePages[testKey].pointCount;
  const posLen = pointCount * 3;
  const colLen = pointCount * 3;
  const pofsFilename = `${source_file_name}-${testKey}`;

  // 1. Worker timing
  const extraParams = [
    x_min,
    y_min,
    z_min,
    widthx,
    widthy,
    widthz,
    scaleFactor[0],
    scaleFactor[1],
    scaleFactor[2],
    nodePages[testKey].level,
  ];
  const tWorkerStart = performance.now();
  const workerResult = await new Promise((resolve) => {
    const worker = new Worker("./worker/fetcher.worker.js", { type: "module" });
    worker.onmessage = (event) => {
      if (Array.isArray(event.data) && event.data.length === 3) {
        resolve(event.data);
        worker.terminate();
      }
    };
    worker.postMessage([
      JSON.stringify(nodePages),
      JSON.stringify(pages),
      JSON.stringify(copc),
      testKey,
      pointCount,
      extraParams,
    ]);
  });
  const tWorkerEnd = performance.now();
  console.log(
    `Worker: ${pointCount} points fetched in ${(
      tWorkerEnd - tWorkerStart
    ).toFixed(2)} ms`
  );

  const tWriteStart = performance.now();
  await write(
    pofsFilename,
    workerResult[0],
    workerResult[1],
    workerResult[2][2]
  );
  const tWriteEnd = performance.now();
  console.log(
    `POFS: Wrote ${pointCount} points in ${(tWriteEnd - tWriteStart).toFixed(
      2
    )} ms`
  );

  const tPOFSStart = performance.now();
  let [Exist2, data2] = await doesExist(pofsFilename, posLen, colLen);
  const tPOFSEnd = performance.now();
  if (Exist2) {
    console.log(
      `POFS: ${pointCount} points read in ${(tPOFSEnd - tPOFSStart).toFixed(
        2
      )} ms`
    );
    // Compare positions, colors, and maxIntensity
    const workerPositions = workerResult[0].slice(0, 10);
    const pofsPositions = data2.position.slice(0, 10);
    const workerColors = workerResult[1].slice(0, 10);
    const pofsColors = data2.color.slice(0, 10);
    const workerMaxIntensity = workerResult[2][2];
    const pofsMaxIntensity = data2.maxIntensity;

    const positionsMatch =
      JSON.stringify(workerResult[0].map(v => v.toFixed(0))) === JSON.stringify(data2.position.map(v => v.toFixed(0)));
    const colorsMatch =
      JSON.stringify(workerResult[1].map(v => v.toFixed(0))) === JSON.stringify(data2.color.map(v => v.toFixed(0)));
    const intensityMatch = workerMaxIntensity === pofsMaxIntensity;

    console.log("First 10 positions from worker:", workerPositions);
    console.log("First 10 positions from POFS:", pofsPositions);
    console.log("First 10 colors from worker:", workerColors);
    console.log("First 10 colors from POFS:", pofsColors);
    console.log("Worker maxIntensity:", workerMaxIntensity);
    console.log("POFS maxIntensity:", pofsMaxIntensity);

    console.log("Positions match:", positionsMatch);
    console.log("Colors match:", colorsMatch);
    console.log("Max intensity match:", intensityMatch);

    if (!positionsMatch || !colorsMatch || !intensityMatch) {
      console.warn("Worker and POFS data do NOT match!");
    } else {
      console.log("Worker and POFS data are identical.");
    }
  } else {
    console.error("POFS read failed.");
  }
}

(async () => {
  // await clear();
  // const start6 = performance.now();
  await create_P_Meta_Cache();
  // const end6 = performance.now();
  // console.log(`Time taken to create meta cache: ${end6 - start6}ms`);

  // const start7 = performance.now();
  pers_cache = await p_cache();
  // const end7 = performance.now();
  // console.log(`Time taken to make LRU meta cache: ${end7 - start7}ms`);
  // console.log("cache created successfully");

  // const start8 = performance.now();
  await createCameraProj();
  // const end8 = performance.now();
  // console.log(`Time taken to create camera: ${end8 - start8}ms`);
  // console.log("file reading start");

  // const start9 = performance.now();
  await loadCOPC();
  // const end9 = performance.now();
  // console.log(`Time taken to load COPC file: ${end9 - start9}ms`);
  // console.log("initialize the uniform buffers");

  // Pick a node key and pointCount to test
  // const testKey = Object.keys(nodePages)[1]; // or any valid key
  // const pointCount = nodePages[testKey].pointCount;
  // const posLen = pointCount * 3;
  // const colLen = pointCount * 3;

  // // For POFS
  // const pofsFilename = `${source_file_name}-${testKey}`;

  // // For fetch: get the byte range for this node (you may need to adjust this)
  // // If you have offsetMap or similar, use it. Otherwise, hardcode for test.
  // const fetchUrl = process.env.filename.replace(/"/g, "");
  // const fetchStart = nodePages[testKey].pointDataOffset; // adjust if needed
  // const fetchEnd = fetchStart + nodePages[testKey].pointDataLength - 1; // adjust if needed

  // const start10 = performance.now();
  let projViewMatrix = await stages(camera, proj, params);
  // const end10 = performance.now();
  // console.log(`Time taken to do initial rendering setup: ${end10 - start10}ms`);
  // console.log("data loading start");

  // const start11 = performance.now();
  await retrivePoints(projViewMatrix);
  // const end11 = performance.now();
  // console.log(
  //   `Time taken to retrive needed nodes from tree: ${end11 - start11}ms`
  // );
  // console.log("data loaded");

  // const start12 = performance.now();
  await renderWrapper();
  // const end12 = performance.now();
  // console.log(`Time taken to render: ${end12 - start12}ms`);
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
