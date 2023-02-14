import * as THREE from "three";
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

const colors = [yellow, red, illusion, blue, green, grey, illusion];
// -------------------------------------

class Point {
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
    // scene.add(mesh);
  }

  bound(point) {
    if (this.x + this.width * 0.5 == 0.5 * MAX_BOUNDARY_X) {
      return (
        point.x >= this.x - this.width * 0.5 &&
        point.x <= this.x + this.width * 0.5 &&
        point.y < this.y + this.width * 0.5 &&
        point.y >= this.y - this.width * 0.5 &&
        point.z >= this.z - this.width * 0.5 &&
        point.z < this.z + this.width * 0.5
      );
    }
    if (this.y + this.width * 0.5 == 0.5 * MAX_BOUNDARY_Y) {
      return (
        point.x >= this.x - this.width * 0.5 &&
        point.x < this.x + this.width * 0.5 &&
        point.y <= this.y + this.width * 0.5 &&
        point.y >= this.y - this.width * 0.5 &&
        point.z >= this.z - this.width * 0.5 &&
        point.z < this.z + this.width * 0.5
      );
    }
    if (this.z + this.width * 0.5 == 0.5 * MAX_BOUNDARY_Z) {
      return (
        point.x >= this.x - this.width * 0.5 &&
        point.x < this.x + this.width * 0.5 &&
        point.y < this.y + this.width * 0.5 &&
        point.y >= this.y - this.width * 0.5 &&
        point.z >= this.z - this.width * 0.5 &&
        point.z <= this.z + this.width * 0.5
      );
    } else {
      return (
        point.x >= this.x - this.width * 0.5 &&
        point.x < this.x + this.width * 0.5 &&
        point.y < this.y + this.width * 0.5 &&
        point.y >= this.y - this.width * 0.5 &&
        point.z >= this.z - this.width * 0.5 &&
        point.z < this.z + this.width * 0.5
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
    // this.representativeNodes = [];
    this.points = [];
    this.buffer = [];
    this.level = level;
    this.parent = null;
  }

  // function findRepresentiveNode(){
  //   let children = [this.minNE, this.minNW, this.minSW, this.minSE, this.maxNE, this.maxNW, this.maxSW, this.maxSE]
  //   children.forEach((element, index)=>{
  //     if(element != null && element.length>0){
  //       this.representativeNodes.push(element.nodes[0])
  //     }
  //   })
  // }

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

  insert(point) {
    if (!this.box.bound(point)) {
      // console.log(
      //   "out of boundary",
      //   "for node",
      //   point.x,
      //   point.y,
      //   point.z,
      //   "for box",
      //   this.box.x,
      //   this.box.y,
      //   this.box.z,
      //   this.box.width * 0.5,
      //   this.box.label
      // );
      return false;
    }
    if (this.points.length < tree.leafCapacity && !this.isDivided) {
      // this.updateRepresentativeNode();
      this.points.push(point.index);
      // this.sortNode();
      return true;
    } else if (this.buffer.length < tree.bufferCapacity && !this.isDivided) {
      this.buffer.push(point.index);
      return true;
    } else {
      if (!this.isDivided) {
        this.partition();
        this.buffer.forEach((existingPoint, index) => {
          if (
            existingPoint.x == point.x &&
            existingPoint.y == point.y &&
            existingPoint.z == point.z
          ) {
            console.log("repetitive node not allowed");
            return false;
          }
          this.minNE.insert(existingPoint) ||
            this.minNW.insert(existingPoint) ||
            this.minSE.insert(existingPoint) ||
            this.minSW.insert(existingPoint) ||
            this.maxNE.insert(existingPoint) ||
            this.maxNW.insert(existingPoint) ||
            this.maxSW.insert(existingPoint) ||
            this.maxSE.insert(existingPoint);
        });
        this.buffer = [];
      }
      return (
        this.minNE.insert(point) ||
        this.minNW.insert(point) ||
        this.minSE.insert(point) ||
        this.minSW.insert(point) ||
        this.maxNE.insert(point) ||
        this.maxNW.insert(point) ||
        this.maxSW.insert(point) ||
        this.maxSE.insert(point)
      );
    }
  }
}

export { Point, Box, Octree };
