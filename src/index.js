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
import { traverseTreeWrapper } from "./passiveloader";
import "./styles/main.css";
import { fillArray, fillMidNodes } from "./helper";
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
scene.background = new THREE.Color(0x000000);
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
  await loadCOPC();
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
  renderer.setClearColor(0x006432); // set the color you want
  renderer.setViewport(20, 50, 256, 256);
  composerMap.render(delta);
  // renderer.render(scene, camera);
}
async function loadCOPC() {
  console.log("waiting");
  let filename = "https://hobu-lidar.s3.amazonaws.com/sofi.copc.laz";
  const copc = await Copc.create(filename);
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

  console.log(copc);
  let total = 0;
  for (let key in pages) {
    total += pages[key].pointCount;
  }
  console.log("toatl is", total);
  const root = nodePages["0-0-0-0"];
  let keyCountMap = traverseTreeWrapper(
    nodePages,
    [0, 0, 0, 0],
    center_x,
    center_y,
    center_z,
    center_z,
    scale
  );

  let getters;
  function getXyzi(index) {
    return getters.map((get) => get(index));
  }
  let pointsArray = [];
  var geometry = new THREE.BufferGeometry();
  let positions = [];

  for (let m = 0; m < keyCountMap.length; m = m + 20) {
    console.log(m, keyCountMap[m], keyCountMap.length);
    let myRoot = nodePages[keyCountMap[m]];
    const view = await Copc.loadPointDataView(filename, copc, myRoot);
    getters = ["X", "Y", "Z", "Intensity"].map(view.getter);
    for (let j = 0; j < keyCountMap[m + 1]; j++) {
      let returnPoint = getXyzi(j);
      // pointsArray.push(...getXyzi(j));
      positions.push(
        returnPoint[0] - x_min - 0.5 * width,
        returnPoint[1] - y_min - 0.5 * width,
        returnPoint[2] - z_min - 0.5 * width
      );
    }
  }
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  var material = new THREE.PointsMaterial({ size: 2, color: 0xffffff });
  console.log(positions);
  let p = new THREE.Points(geometry, material);

  scene.add(p);
  const view = await Copc.loadPointDataView(filename, copc, root);
  console.log(scene.children);
}

window.requestAnimationFrame(animate);

export { scene, scene_width, scene_height, scene_depth, controls };
