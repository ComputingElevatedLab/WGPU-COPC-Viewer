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
const MAX_WORKERS = 1;
let promises = [];
let nodePagesString;
let pagesString;
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
  scaleFactor;

function createWorker(data1, data2) {
  return new Promise((resolve) => {
    let worker = new Worker();
    worker.onmessage = (event) => {
      postMessageRes = event.data;
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
let nodePages;

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

async function loadCOPC() {
  clock.getDelta();
  let filename = "https://s3.amazonaws.com/data.entwine.io/millsite.copc.laz";
  const copc = await Copc.create(filename);
  scaleFactor = copc.header.scale;
  copcString = JSON.stringify(copc);
  console.log("loading time is", clock.getDelta());
  scale = copc.header.scale[0];
  [x_min, y_min, z_min, x_max, y_max, z_max] = copc.info.cube;
  widthx = Math.abs(x_max - x_min);
  widthy = Math.abs(y_max - y_min);
  widthz = Math.abs(z_max - z_min);
  let center_x = (x_min + x_max) / 2;
  let center_y = (y_min + y_max) / 2;
  let center_z = (z_min + z_max) / 2;
  const { nodes: nodePages, pages: pages } = await Copc.loadHierarchyPage(
    filename,
    copc.info.rootHierarchyPage
  );
  nodePagesString = JSON.stringify(nodePages);
  pagesString = JSON.stringify(pages);

  let total = 0;
  for (let key in pages) {
    total += pages[key].pointCount;
  }
  console.log("toatl is", total);
  const root = nodePages["0-0-0-0"];
  keyCountMap = traverseTreeWrapper(
    nodePages,
    [0, 0, 0, 0],
    center_x,
    center_y,
    center_z,
    center_z,
    scale
  );
  console.log(keyCountMap);

  TotalCount = keyCountMap.length;
  let pointsArray = [];
  var geometry = new THREE.BufferGeometry();

  clock.getDelta();

  // while (postMessageRes == 100) {
  //   console.log("loading data");
  // }

  const syncThread = async () => {
    await Promise.all(promises).then(async (response) => {
      for (let i = 0, _length = response.length; i < _length; i++) {
        let data = response[i];
        let size = data[0].length * 4;
        let positionBuffer = await device.createBuffer({
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

        let colorBuffer = await device.createBuffer({
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

  let chunk = 1;
  let totalNodes = keyCountMap.length / 2;
  let doneCount = 0;
  console.log(clock.getDelta());
  stages();
  for (let m = 0; m < keyCountMap.length; ) {
    let remaining = totalNodes - doneCount;
    let numbWorker = Math.min(chunk, remaining);
    for (let i = 0; i < numbWorker; i++) {
      // console.log("i am entering first time");
      promises.push(createWorker(keyCountMap[m], keyCountMap[m + 1]));
      doneCount++;
      m += 2;
      if (doneCount % MAX_WORKERS == 0) {
        await syncThread();
        // console.log("i am done");
      }
    }
    // console.log(positions);
  }
  console.log(clock.getDelta());

  // render by WebGPU
  // console.log(colors);
  // renderStages(positions, colors);
  renderWrapper();
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
}

loadCOPC();

export { scene_width, scene_height, scene_depth, loadCOPC, bufferMap };
