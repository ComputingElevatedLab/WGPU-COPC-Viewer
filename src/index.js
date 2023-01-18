import * as THREE from "three";
import { Octree, Box, Point } from "./octree";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import { CopyShader } from "three/examples/jsm/shaders/CopyShader";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader";
import Stats from "three/examples/jsm/libs/stats.module";

import "./styles/main.css";
import { fillArray, fillMidNodes } from "./helper";
let camera, scene, renderer;
let mesh, controls;
let boxGroup = new THREE.Group();
let scene_width = 1000;
let scene_height = 1000;
let scene_depth = 1000;
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

let composerScreen;
let composerMap;

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
function init() {
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
}

function findLevel(qt) {
  // traverse octre
  let threshold = 1500;

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
      return node.points;
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
    let results = [];
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
controls.addEventListener("change", () => {
  visiblePoints = findLevel(qt);
  visiblePoints.forEach((element, index) => {
    // console.log("aded");
    boxGroup.add(points[element].mesh);
  });
});

const stats_mb = Stats();
stats_mb.domElement.style.cssText = "position:absolute;top:50px;right:50px;";
stats_mb.showPanel(2);
document.body.appendChild(stats_mb.dom);
initMapCamera();
postProcessing();
function animate(delta) {
  delta = Math.max(delta, 0.1);
  requestAnimationFrame(animate);
  console.log(controls.object.position);
  stats_mb.update();
  controls.autoRotate = true;
  controls.update();
  renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
  composerScreen.render(delta);
  renderer.clear(false, true, false);
  renderer.setClearColor(0x006432); // set the color you want
  renderer.setViewport(20, 50, 256, 256);
  composerMap.render(delta);
  // renderer.render(scene, camera);
}

window.requestAnimationFrame(animate);

export { scene, scene_width, scene_height, scene_depth };
