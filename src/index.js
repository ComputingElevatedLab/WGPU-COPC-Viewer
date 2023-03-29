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
import { write, read, doesExist, clear } from "./private_origin/file_manager";
import "./styles/main.css";
import { fillArray, fillMidNodes } from "./helper";

clear();

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

const canvas = document.getElementById("screen-canvas");
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

const syncThread = async () => {
  await Promise.all(promises).then(async (response) => {
    for (let i = 0, _length = response.length; i < _length; i++) {
      let data = response[i];
      let fileName = data[2];
      let data_json = {
        position: data[0],
        color: data[1],
      };
      let data_json_stringify = JSON.stringify(data_json);
      write(fileName, data_json_stringify);
      let [positionBuffer, colorBuffer] = createBuffer(data[0], data[1]);
      bufferMap[data[2]] = {
        position: positionBuffer,
        color: colorBuffer,
      };
    }
    // console.log(bufferMap);
    // console.log("one chunk finish");
  });
};

async function filterkeyCountMap(keyMap) {
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

  for (let i = 0; i < keyMap.length; i += 2) {
    if (!(keyMap[i] in bufferMap)) {
      newKeyMap.push(keyMap[i], keyMap[i + 1]);
    } else {
      newBufferMap[keyMap[i]] = {
        position: bufferMap[keyMap[i]].position,
        color: bufferMap[keyMap[i]].color,
      };
      delete toDeleteArray[keyMap[i]];
    }
  }

  let filteredElements = [];
  for (let i = 0; i < newKeyMap.length; i += 2) {
    let Exist = await doesExist(newKeyMap[i]);
    console.log(Exist, newKeyMap[i]);
    if (Exist) {
      let data = await read(newKeyMap[i]);
      let [positionBuffer, colorBuffer] = createBuffer(
        data.position,
        data.color
      );
      newBufferMap[newKeyMap[i]] = {
        position: positionBuffer,
        color: colorBuffer,
      };
    } else {
      filteredElements.push(newKeyMap[i], newKeyMap[i + 1]);
    }
  }

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

async function retrivePoints(projectionViewMatrix) {
  let keyCountMap = traverseTreeWrapper(
    nodePages,
    [0, 0, 0, 0],
    center_x,
    center_y,
    center_z,
    [0.5 * widthx, 0.5 * widthy, 0.5 * widthz],
    scaleFactor,
    camera,
    projectionViewMatrix
  );

  keyCountMap = await filterkeyCountMap(keyCountMap);
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
        // console.log(doneCount, "i am done");
      }
    }
  }
  console.log("it finished at", clock.getDelta());
}

async function createCameraProj() {
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    20000
  );
  camera.position.z = 20;
  // camera.lookAt(new THREE.Vector3(0, 0, 0));

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  // controls.minAzimuthAngle = 0;
  // controls.maxAzimuthAngle = 0.25 * Math.PI;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.rotateSpeed = 2;
  controls.zoomSpeed = 2;
  controls.panSpeed = 5;
  // controls.autoRotate = true;
  // controls.autoRotateSpeed = 1;
  controls.update();
  proj = mat4.perspective(
    mat4.create(),
    (90 * Math.PI) / 180.0,
    canvas.width / canvas.height,
    0.1,
    20000
  );
}

async function loadCOPC() {
  clock.getDelta();
  // https://viewer.copc.io/?copc=https://s3.amazonaws.com/data.entwine.io/millsite.copc.laz
  // https://github.com/PDAL/data/blob/master/autzen/autzen-classified.copc.laz
  // let filename = "https://s3.amazonaws.com/data.entwine.io/millsite.copc.laz";
  const filename = process.env.filename;
  const copc = await Copc.create(filename);
  scaleFactor = copc.header.scale;
  copcString = JSON.stringify(copc);
  // scale = copc.header.scale[0];
  [x_min, y_min, z_min, x_max, y_max, z_max] = copc.info.cube;
  scaleFactor = [1, 1, 1];
  widthx = Math.abs(x_max - x_min);
  widthy = Math.abs(y_max - y_min);
  widthz = Math.abs(z_max - z_min);
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
  await createCameraProj();
  console.log("file reading start");
  await loadCOPC();
  console.log("initialize the uniform buffers");
  let projViewMatrix = await stages(camera, proj, params);
  console.log("data loading start");
  await retrivePoints(projViewMatrix);
  console.log("data loaded");
  await renderWrapper();
  console.log("render done");
})();
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
};
