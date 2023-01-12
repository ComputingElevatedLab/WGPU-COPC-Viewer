import * as THREE from "three";
import { scene, scene_width, scene_height, scene_depth } from "./index";
let MAX_BOUNDARY_X = 8;
let MAX_BOUNDARY_Y = 8;
let MAX_BOUNDARY_Z = 8;
// color
const white = new THREE.Color(0xffffff);
const red = new THREE.Color(0xff0000);
const green = new THREE.Color(0xc5e908);
const blue = new THREE.Color(0x0000ff);
const yellow = new THREE.Color(0xe69b00);
const grey = new THREE.Color(0xe0a387);
const illusion = new THREE.Color(0xf1a784);

const colors = [yellow, red, green, blue, green, grey, illusion];
// -------------------------------------

class Node {
  constructor(index, x, y, z) {
    this.index = index;
    this.x = x;
    this.y = y;
    this.z = z;
    let mesh = new THREE.Mesh(
      new THREE.BoxGeometry(5, 5, 5),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    mesh.position.set(x, y, z);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    this.mesh = mesh;
  }
}

class Box {
  constructor(label, x, y, z, width, level) {
    this.label = label;
    this.x = x;
    this.y = y;
    this.z = z;
    this.width = width;
    let mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, width, width),
      new THREE.MeshBasicMaterial({ color: colors[level % 7], wireframe: true })
    );
    mesh.position.set(x, y, z);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    this.mesh = mesh;
    scene.add(mesh);
  }

  bound(node) {
    if (this.x + this.width * 0.5 == 0.5 * MAX_BOUNDARY_X) {
      return (
        node.x >= this.x - this.width * 0.5 &&
        node.x <= this.x + this.width * 0.5 &&
        node.y < this.y + this.width * 0.5 &&
        node.y >= this.y - this.width * 0.5 &&
        node.z >= this.z - this.width * 0.5 &&
        node.z < this.z + this.width * 0.5
      );
    }
    if (this.y + this.width * 0.5 == 0.5 * MAX_BOUNDARY_Y) {
      return (
        node.x >= this.x - this.width * 0.5 &&
        node.x < this.x + this.width * 0.5 &&
        node.y <= this.y + this.width * 0.5 &&
        node.y >= this.y - this.width * 0.5 &&
        node.z >= this.z - this.width * 0.5 &&
        node.z < this.z + this.width * 0.5
      );
    }
    if (this.z + this.width * 0.5 == 0.5 * MAX_BOUNDARY_Z) {
      return (
        node.x >= this.x - this.width * 0.5 &&
        node.x < this.x + this.width * 0.5 &&
        node.y < this.y + this.width * 0.5 &&
        node.y >= this.y - this.width * 0.5 &&
        node.z >= this.z - this.width * 0.5 &&
        node.z <= this.z + this.width * 0.5
      );
    } else {
      return (
        node.x >= this.x - this.width * 0.5 &&
        node.x < this.x + this.width * 0.5 &&
        node.y < this.y + this.width * 0.5 &&
        node.y >= this.y - this.width * 0.5 &&
        node.z >= this.z - this.width * 0.5 &&
        node.z < this.z + this.width * 0.5
      );
    }
  }
}

class Octree {
  constructor(box, level = 0) {
    this.box = box;
    this.minNE = null;
    this.minNW = null;
    this.minSW = null;
    this.minSE = null;
    this.maxNE = null;
    this.maxNW = null;
    this.maxSW = null;
    this.maxSE = null;
    this.isDivided = false;
    this.nodes = [];
    this.level = level;
  }

  partition() {
    let x = this.box.x;
    let y = this.box.y;
    let z = this.box.z;
    let newWidth = this.box.width * 0.5;
    let level = this.level + 1;
    let maxNE_Box = new Box(
      "maxNE",
      x + newWidth * 0.5,
      y + 0.5 * newWidth,
      z - 0.5 * newWidth,
      newWidth,
      level
    );
    let maxNW_Box = new Box(
      "maxNW",
      x - newWidth * 0.5,
      y + 0.5 * newWidth,
      z - 0.5 * newWidth,
      newWidth,
      level
    );
    let maxSW_Box = new Box(
      "maxSW",
      x - newWidth * 0.5,
      y - 0.5 * newWidth,
      z - 0.5 * newWidth,
      newWidth,
      level
    );
    let maxSE_Box = new Box(
      "maxSE",
      x + newWidth * 0.5,
      y - 0.5 * newWidth,
      z - 0.5 * newWidth,
      newWidth,
      level
    );

    let minNE_Box = new Box(
      "minNE",
      x + newWidth * 0.5,
      y + 0.5 * newWidth,
      z + 0.5 * newWidth,
      newWidth,
      level
    );
    let minNW_Box = new Box(
      "minNW",
      x - newWidth * 0.5,
      y + 0.5 * newWidth,
      z + 0.5 * newWidth,
      newWidth,
      level
    );
    let minSW_Box = new Box(
      "minSW",
      x - newWidth * 0.5,
      y - 0.5 * newWidth,
      z + 0.5 * newWidth,
      newWidth,
      level
    );
    let minSE_Box = new Box(
      "minSE",
      x + newWidth * 0.5,
      y - 0.5 * newWidth,
      z + 0.5 * newWidth,
      newWidth,
      level
    );

    this.minNE = new Octree(minNE_Box, level);
    this.minNW = new Octree(minNW_Box, level);
    this.minSW = new Octree(minSW_Box, level);
    this.minSE = new Octree(minSE_Box, level);
    this.maxNE = new Octree(maxNE_Box, level);
    this.maxNW = new Octree(maxNW_Box, level);
    this.maxSW = new Octree(maxSW_Box, level);
    this.maxSE = new Octree(maxSE_Box, level);
    this.isDivided = true;
  }

  insert(node) {
    if (!this.box.bound(node)) {
      // console.log(
      //   "out of boundary",
      //   "for node",
      //   node.x,
      //   node.y,
      //   node.z,
      //   "for box",
      //   this.box.x,
      //   this.box.y,
      //   this.box.z,
      //   this.box.width * 0.5,
      //   this.box.label
      // );
      return false;
    }
    if (this.nodes.length < 32 && !this.isDivided) {
      this.nodes.push(node);
      return true;
    } else {
      if (!this.isDivided) {
        this.partition();
        this.nodes.forEach((element, index) => {
          let existingNode = element;
          if (
            existingNode.x == node.x &&
            existingNode.y == node.y &&
            existingNode.z == node.z
          ) {
            console.log("repetitive node not allowed");
            return false;
          }
          this.minNE.insert(existingNode) ||
            this.minNW.insert(existingNode) ||
            this.minSE.insert(existingNode) ||
            this.minSW.insert(existingNode) ||
            this.maxNE.insert(existingNode) ||
            this.maxNW.insert(existingNode) ||
            this.maxSW.insert(existingNode) ||
            this.maxSE.insert(existingNode);
        });
      }
      return (
        this.minNE.insert(node) ||
        this.minNW.insert(node) ||
        this.minSE.insert(node) ||
        this.minSW.insert(node) ||
        this.maxNE.insert(node) ||
        this.maxNW.insert(node) ||
        this.maxSW.insert(node) ||
        this.maxSE.insert(node)
      );
    }
  }
}

export { Node, Box, Octree };
