import * as THREE from "three";
import { Octree, Box, Node } from "./octree";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import "./styles/main.css";
import { fillArray } from "./helper";
let camera, scene, renderer;
let mesh, controls;

let scene_width = 1000;
let scene_height = 1000;
let scene_depth = 1000;
scene = new THREE.Scene();
let nodes = [];
init();

function init() {
  camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    1,
    100000
  );
  camera.position.z = 1200;

  const geometry = new THREE.BoxGeometry(200, 200, 200);
  const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });

  mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.listenToKeyEvents(window); // optional

  fillArray(nodes, 1000, scene_width, scene_height, scene_depth);
  nodes.forEach((element, index) => {
    scene.add(element.mesh);
  });
  window.addEventListener("resize", onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

let node = new Node(1, 3, 3, 3);
let node2 = new Node(1, 3, 3, 3);
let box = new Box(
  "main quad",
  0,
  0,
  0,
  Math.max(scene_width, scene_height, scene_depth)
);
let qt = new Octree(box);
let count = 0;
nodes.forEach((element, index) => {
  if (qt.insert(element)) {
    console.log("inserted point is", element);
    count++;
  }
});
console.log("total inserted elements are", count);

function animate() {
  requestAnimationFrame(animate);
  controls.autoRotate = true;
  controls.update();
  renderer.render(scene, camera);
}

animate();

export { scene, scene_width, scene_height, scene_depth };
