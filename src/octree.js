import * as THREE from "three";
import { scene, scene_width, scene_height, scene_depth } from "./index";
let MAX_BOUNDARY_X = 8;
let MAX_BOUNDARY_Y = 8;
let MAX_BOUNDARY_Z = 8;
class Node {
  constructor(index, x, y, z) {
    this.index = index;
    this.x = x;
    this.y = y;
    this.z = z;
    console.log(x, y, z);
    let mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    mesh.position.set(x, y, z);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    this.mesh = mesh;
  }
}

class Box {
  constructor(x, y, z, width) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.width = width;
    let mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, width, width),
      new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true })
    );
    mesh.position.set(x, y, z);
    this.mesh = mesh;
    // scene.add(mesh);
  }

  bound(node) {
    // if (this.x + this.width * 0.5 == 0.5 * MAX_BOUNDARY_X) {
    //   console.log("this is a x boundry box");
    //   return (
    //     node.x >= this.x - this.width * 0.5 &&
    //     node.x <= this.x + this.width * 0.5 &&
    //     node.y < this.y + this.width * 0.5 &&
    //     node.y >= this.y - this.width * 0.5 &&
    //     node.z >= this.z - this.width * 0.5 &&
    //     node.z < this.z + this.width * 0.5
    //   );
    // }
    // if (this.y + this.width * 0.5 == 0.5 * MAX_BOUNDARY_Y) {
    //   console.log(" this is y boundary node");
    //   return (
    //     node.x >= this.x - this.width * 0.5 &&
    //     node.x < this.x + this.width * 0.5 &&
    //     node.y <= this.y + this.width * 0.5 &&
    //     node.y >= this.y - this.width * 0.5 &&
    //     node.z >= this.z - this.width * 0.5 &&
    //     node.z < this.z + this.width * 0.5
    //   );
    // }
    // if (this.z + this.width * 0.5 == 0.5 * MAX_BOUNDARY_Z) {
    //   console.log("this is z boundary");
    //   return (
    //     node.x >= this.x - this.width * 0.5 &&
    //     node.x < this.x + this.width * 0.5 &&
    //     node.y < this.y + this.width * 0.5 &&
    //     node.y >= this.y - this.width * 0.5 &&
    //     node.z >= this.z - this.width * 0.5 &&
    //     node.z <= this.z + this.width * 0.5
    //   );
    // }
    // else {
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

export { Node, Box };
