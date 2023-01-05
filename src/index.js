import * as THREE from "three";
import { Box, Node } from "./octree";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import "./styles/main.css";
import { fillArray } from "./helper";
let camera, scene, renderer;
let mesh, controls;

let scene_width = window.innerWidth;
let scene_height = window.innerHeight;
let scene_depth = 1000;
scene = new THREE.Scene();
console.log(scene);
init();
animate();

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

  let nodes = [];
  fillArray(
    nodes,
    1000,
    1.5 * window.innerWidth,
    window.innerHeight,
    scene_depth
  );
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

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  mesh.rotation.x += 0.005;
  mesh.rotation.y += 0.01;
  renderer.render(scene, camera);
}

let node = new Node(1, 3, 4, 3);
let box = new Box(0, 0, 0, 8);
console.log("the result of node is inside the box is", box.bound(node));

export { scene, scene_width, scene_height, scene_depth };
