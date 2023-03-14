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
import "./styles/main.css";
import { fillArray, fillMidNodes } from "./helper";
let bufferMap = {};
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
  scaleFactor;
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

const syncThread = async () => {
  await Promise.all(promises).then(async (response) => {
    for (let i = 0, _length = response.length; i < _length; i++) {
      let data = response[i];
      let size = data[0].length * 4;
      let positionBuffer = device.createBuffer({
        label: `${data[0].length}`,
        size: size,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
      });

      let positionMappedArray = new Float32Array(
        positionBuffer.getMappedRange()
      );
      positionMappedArray.set(data[0]);
      positionBuffer.unmap();

      let colorBuffer = device.createBuffer({
        label: `color buffer of ${data[2]}`,
        size: size,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
      });

      let colorMappedArray = new Float32Array(colorBuffer.getMappedRange());
      colorMappedArray.set(data[1]);
      colorBuffer.unmap();

      bufferMap[data[2]] = {
        position: positionBuffer,
        color: colorBuffer,
      };
    }
    // console.log(bufferMap);
    // console.log("one chunk finish");
  });
};

function filterkeyCountMap(keyMap, bufferMap) {
  let newKeyMap = [];
  let newBufferMap = {};
  // return keymap that need to be added
  // let existingBuffers = Object.keys(bufferMap);
  // console.log(existingBuffers);
  // let existingBuffer = existingBuffers.reduce((acc, val) => {
  //   acc[val] = true;
  //   return acc;
  // }, {});
  // console.log(existingBuffer);

  for (let i = 0; i < keyMap.length; i += 2) {
    if (!(keyMap[i] in bufferMap)) {
      newKeyMap.push(keyMap[i], keyMap[i + 1]);
    } else {
      newBufferMap[keyMap[i]] = {
        position: bufferMap[keyMap[i]].position,
        color: bufferMap[keyMap[i]].color,
      };
      // delete existingBuffer[keyMap[i]];
    }
  }

  bufferMap = newBufferMap;
  return newKeyMap;
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

  keyCountMap = filterkeyCountMap(keyCountMap, bufferMap);
  console.log(keyCountMap);
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
  camera = new ArcballCamera([0, 0, 2000], [0, 0, 0], [0, 1, 0], 500, [
    window.innerWidth,
    window.innerHeight,
  ]);

  proj = mat4.perspective(
    mat4.create(),
    (90 * Math.PI) / 180.0,
    canvas.width / canvas.height,
    0.1,
    80000
  );
}

async function loadCOPC(camera, projViewMatrix) {
  clock.getDelta();
  // https://viewer.copc.io/?copc=https://s3.amazonaws.com/data.entwine.io/millsite.copc.laz
  // https://github.com/PDAL/data/blob/master/autzen/autzen-classified.copc.laz
  let filename = "https://s3.amazonaws.com/data.entwine.io/millsite.copc.laz";
  const copc = await Copc.create(filename);
  scaleFactor = copc.header.scale;
  copcString = JSON.stringify(copc);
  // scale = copc.header.scale[0];
  [x_min, y_min, z_min, x_max, y_max, z_max] = copc.info.cube;
  scaleFactor = [1, 1, 1];
  widthx = Math.abs(x_max - x_min);
  widthy = Math.abs(y_max - y_min);
  widthz = Math.abs(z_max - z_min);
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
  await retrivePoints(projViewMatrix);
}

(async () => {
  await createCameraProj();
  let projViewMatrix = await stages(camera, proj);
  console.log("data loading start");
  await loadCOPC(camera, projViewMatrix);
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
};
