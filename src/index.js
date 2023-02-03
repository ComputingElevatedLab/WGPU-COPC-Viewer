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

import { traverseTreeWrapper } from "./passiveloader";
import "./styles/main.css";
import { fillArray, fillMidNodes } from "./helper";
let postMessageRes = 100;
let positions = [];
let colors = [];
let workerCount = 0;
const clock = new THREE.Clock();
const workers = new Array(1).fill(null);
let TotalCount = 0;
const MAX_WORKERS = 3;
let promises = [];
let nodePagesString;
let pagesString;
let copcString;

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
        ]);
      } else {
        workerCount += 1;
        let position = postMessageRes[0];
        let color = postMessageRes[1];
        for (let i = 0; i < position.length; i++) {
          positions.push(position[i]);
          colors.push(colors[i]);
        }
        if (workerCount == MAX_WORKERS) {
          worker.terminate();
          workerCount = 0;
          promises = [];
        }
        resolve(true);
      }
    };
  });
}

let camera, scene, renderer;
let mesh, controls;
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

let composerScreen;
let composerMap;
let isIntensityPresent;

scene = new THREE.Scene();
scene.background = new THREE.Color(0xcccccc);
let parameters = {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  stencilBuffer: false,
  type: THREE.FloatType,
};

let renderTarget = new THREE.WebGLRenderTarget(256, 256, parameters);

let points = [];

init();
async function init() {
  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    1,
    100000
  );
  camera.position.set(800, -200, -1200);

  const geometry = new THREE.BoxGeometry(200, 200, 200);
  const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });

  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  scene.add(boxGroup);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  renderer.autoClear = false;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.listenToKeyEvents(window); // optional
  controls.zoom = 3;

  fillArray(points, 3000, scene_width, scene_height, scene_depth);
  // points.forEach((element, index) => {
  //   // scene.add(element.mesh);
  // });
  window.addEventListener("resize", onWindowResize);
  // await loadCOPC();
}

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

function initMapCamera() {
  mapCamera = new THREE.OrthographicCamera(left, right, top, bottom, 0.1, 1000);
  // for camera to see down up should be on z axis
  mapCamera.up = new THREE.Vector3(0, 0, 1);
  mapCamera.lookAt(0, -1, 0);
  mapCamera.position.set(0, 0, 0);
  mapCamera.position.y = 1200;
  scene.add(mapCamera);
  // const helper = new THREE.CameraHelper(mapCamera)
  // scene.add(helper)
}

function postProcessing() {
  let pixelRatio = 1;
  composerScreen = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  let fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.material.uniforms["resolution"].value.x =
    1 / (window.innerWidth * pixelRatio);
  fxaaPass.material.uniforms["resolution"].value.y =
    1 / (window.innerHeight * pixelRatio);
  const copyPass1 = new ShaderPass(CopyShader);
  copyPass1.renderToScreen = true;
  composerScreen.addPass(renderPass);
  composerScreen.addPass(fxaaPass);
  composerScreen.addPass(copyPass1);

  composerMap = new EffectComposer(renderer, renderTarget);
  composerMap.setSize(256, 256);
  let renderPassMap = new RenderPass(scene, mapCamera);
  composerMap.addPass(renderPassMap);
  var effectFXAA_Map = new ShaderPass(FXAAShader);
  effectFXAA_Map.uniforms["resolution"].value.set(1 / 256, 1 / 256);
  composerMap.addPass(effectFXAA_Map);
  // composerMap.addPass(gammaCorrectionPass);
  const copyPass = new ShaderPass(CopyShader);
  copyPass.renderToScreen = true;
  composerMap.addPass(copyPass);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

let box = new Box(
  "main quad",
  0,
  0,
  0,
  Math.max(scene_width, scene_height, scene_depth)
);
qt = new Octree(box);
let count = 0;
points.forEach((element, index) => {
  if (qt.insert(element)) {
    count++;
  }
});
let visiblePoints = [];
// controls.addEventListener("change", () => {
//   visiblePoints = findLevel(qt);
//   visiblePoints.forEach((element, index) => {
//     boxGroup.add(points[element].mesh);
//   });
// });

const stats_mb = Stats();
stats_mb.domElement.style.cssText = "position:absolute;top:50px;right:50px;";
stats_mb.showPanel(2);
document.body.appendChild(stats_mb.dom);
initMapCamera();
postProcessing();
function animate(delta) {
  delta = Math.max(delta, 0.1);
  requestAnimationFrame(animate);
  // console.log(controls.object.position);
  stats_mb.update();
  controls.autoRotate = false;
  controls.update();
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  composerScreen.render(delta);
  renderer.clear(false, true, false);
  renderer.setClearColor(0xffffff); // set the color you want
  renderer.setViewport(20, 50, 256, 256);
  composerMap.render(delta);
  // renderer.render(scene, camera);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let keyCountMap;
async function loadCOPC() {
  clock.getDelta();
  let filename = "https://s3.amazonaws.com/data.entwine.io/millsite.copc.laz";
  const copc = await Copc.create(filename);
  copcString = JSON.stringify(copc);
  console.log("loading time is", clock.getDelta());
  scale = copc.header.scale[0];
  let [x_min, y_min, z_min, x_max, y_max, z_max] = copc.info.cube;
  let width = Math.abs(x_max - x_min);
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

  TotalCount = keyCountMap.length;
  let pointsArray = [];
  var geometry = new THREE.BufferGeometry();
  let colors = [];
  const color = new THREE.Color();

  clock.getDelta();

  // while (postMessageRes == 100) {
  //   console.log("loading data");
  // }

  const syncThread = async () => {
    await Promise.all(promises).then((response) => {
      console.log("one chunk finish");
    });
  };

  let chunk = 3;
  let totalNodes = keyCountMap.length / 2;
  let doneCount = 0;

  for (let m = 0; m < keyCountMap.length; ) {
    let remaining = totalNodes - doneCount;
    let numbWorker = Math.min(chunk, remaining);
    for (let i = 0; i < numbWorker; i++) {
      promises.push(createWorker(keyCountMap[m], keyCountMap[m + 1]));
      doneCount++;
      m += 2;
      console.log(doneCount);
      if (doneCount % MAX_WORKERS == 0) {
        await syncThread();
        console.log("i am done");
      }
    }
  }

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  var material = new THREE.PointsMaterial({ size: 2, vertexColors: true });
  let p = new THREE.Points(geometry, material);

  scene.add(p);
  // const view = await Copc.loadPointDataView(filename, copc, root);
  console.log(scene.children);
}

loadCOPC();
window.requestAnimationFrame(animate);

export { scene, scene_width, scene_height, scene_depth, controls, loadCOPC };
