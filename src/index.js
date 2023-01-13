import * as THREE from "three";
import { Octree, Box, Point } from "./octree";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
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
scene = new THREE.Scene();
let points = [];
init();
function init() {
  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    1,
    100000
  );
  camera.position.z = 500;

  const geometry = new THREE.BoxGeometry(200, 200, 200);
  const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });

  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  scene.add(boxGroup);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.listenToKeyEvents(window); // optional

  fillArray(points, 10000, scene_width, scene_height, scene_depth);
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
controls.addEventListener("change", () => {
  findLevel(qt);
});

const stats_mb = Stats();
stats_mb.domElement.style.cssText = "position:absolute;top:50px;right:50px;";
stats_mb.showPanel(2);
document.body.appendChild(stats_mb.dom);
function animate() {
  requestAnimationFrame(animate);
  stats_mb.update();
  controls.autoRotate = true;
  controls.update();
  renderer.render(scene, camera);
}

animate();

export { scene, scene_width, scene_height, scene_depth };
