import { controls } from "./index";
import * as THREE from "three";

let direction = [
  [0, 0, 0],
  [0, 0, 1],
  [0, 1, 0],
  [0, 1, 1],
  [1, 0, 0],
  [1, 0, 1],
  [1, 1, 0],
  [1, 1, 1],
];

async function* lazyLoad(offsetMap, url) {
  while (offsetMap.length > 0) {
    let fetchStart = offsetMap.pop();
    let bytesofPointData = offsetMap.pop();
    let fetchEnd = fetchStart + bytesofPointData;
    let response = await fetch(url, {
      headers: {
        "content-type": "multipart/byteranges",
        Range: `bytes=${fetchStart}-${fetchEnd}`,
      },
    });
    let buffer = await response.arrayBuffer();
    let view = new DataView(buffer);
  }
}

function isLeadfNode(root, nodePages) {
  let [level, x, y, z] = root;
  for (let i = 0; i < direction.length; i++) {
    let [dx, dy, dz] = direction[i];
    let newLevel = level + 1;
    let key = `${newLevel}-${2 * x + dx}-${2 * y + dy}-${2 * z + dz}`;
    if (key in nodePages) {
      return false;
    }
  }
  return true;
}

function traverseTreeWrapper(
  nodePages,
  root,
  center_x,
  center_y,
  center_z,
  width,
  scale
) {
  function traverseTree(root, center_x, center_y, center_z, width) {
    let [level, x, y, z] = root;
    let newLevel = level + 1;
    let key = level + "-" + x + "-" + y + "-" + z;
    if (level > 3) {
      return [];
    }
    if (isLeadfNode(root, nodePages)) {
      return [key, nodePages[key].pointCount];
    }
    let cameraPosition = controls.object.position;
    let myDistanceFromCamera = cameraPosition.distanceTo(
      new THREE.Vector3(center_x, center_y, center_z)
    );

    let x_left = center_x - width / 2;
    let x_right = center_x + width / 2;
    let y_top = center_y + width / 2;
    let y_bottom = center_y - width / 2;
    let z_near = center_z - width / 2;
    let z_far = center_z + width / 2;

    let result = [key, nodePages[key].pointCount];
    direction.forEach((element, index) => {
      let [dx, dy, dz] = element;
      let key = `${newLevel}-${2 * x + dx}-${2 * y + dy}-${2 * z + dz}`;
      if (!(key in nodePages && nodePages[key].pointCount > 0)) {
        return;
      }
      center_x = x_left;
      center_y = y_bottom;
      center_z = z_near;
      if (dx == 1) {
        center_x = x_right;
      }
      if (dy == 1) {
        center_y = y_top;
      }
      if (dz == 1) {
        center_z = z_far;
      }
      let result1 = traverseTree(
        [newLevel, 2 * x + dx, 2 * y + dy, 2 * z + dz],
        center_x,
        center_y,
        center_z,
        width / 2
      );
      result.push(...result1);
    });
    return result;
  }
  return traverseTree(
    root,
    center_x / scale,
    center_y / scale,
    center_z / scale,
    width / scale
  );
}

export { traverseTreeWrapper };
