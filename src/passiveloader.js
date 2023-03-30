import * as THREE from "three";
import { computeFocalLength, computeSSE } from "./utils/loader";

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

let cameraFocalLength = computeFocalLength(90);

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

// function calculateSSE(
//   distance,
//   center_x,
//   center_y,
//   center_z,
//   [width_x, width_y, width_z],
//   camera,
//   proj
// ) {
//   const box = new THREE.Box3(
//     new THREE.Vector3(
//       center_x - width_x / 2,
//       center_y - width_y / 2,
//       center_z - width_z / 2
//     ),
//     new THREE.Vector3(
//       center_x + width_x / 2,
//       center_y + width_y / 2,
//       center_z + width_z / 2
//     )
//   );
//   console.log(proj);
//   const boxScreen = box
//     .clone()
//     .applyMatrix4(new THREE.Matrix4().fromArray(camera.invCamera))
//     .applyMatrix4(new THREE.Matrix4().fromArray(proj));
//   const boxSize = boxScreen.getSize(new THREE.Vector3()).length();
//   console.log(boxScreen);
//   const error = boxSize / distance;
//   return error;
// }
let canvas = document.getElementById("screen-canvas");
let screenWidth = window.innerWidth;
let screenHeight = window.innerHeight;
let fovRADIAN = Math.PI / 2;

//create a view frustum based on viewProjectionMatrix
//check containsBox

// transforming center of bounding sphere from world space to screen space
function isRendered(center, radius, distance, projViewMatrix) {
  let minPoint = [center[0] - radius, center[1] - radius, center[2] - radius];
  let maxPoint = [center[0] + radius, center[1] + radius, center[2] + radius];
  let frustum = new Frustum(projViewMatrix);
  if (!frustum.containsBox([...minPoint, ...maxPoint])) {
    console.log("out of frustum");
    return false;
  }
  let projectedRadius =
    (radius * screenHeight) / (distance * (2 * Math.tan(fovRADIAN / 2.0)));
  // console.log(screenHeight, projectedRadius, Math.abs(projectedRadius) > 150);
  return Math.abs(projectedRadius) > 100;
}

function traverseTreeWrapper(
  nodePages,
  root,
  center_x,
  center_y,
  center_z,
  width,
  scale,
  camera,
  projViewMatrix
) {
  let cameraPosition = camera.position.toArray();
  function traverseTree(root, center_x, center_y, center_z, width) {
    // console.log(center_x, center_y, center_z, width);
    let [level, x, y, z] = root;
    let newLevel = level + 1;
    let key = level + "-" + x + "-" + y + "-" + z;
    let distance = Math.sqrt(
      Math.pow(Math.abs(cameraPosition[0] - center_x), 2) +
        Math.pow(Math.abs(cameraPosition[1] - center_y), 2) +
        Math.pow(Math.abs(cameraPosition[2] - center_z), 2)
    );
    if (
      !isRendered(
        [center_x, center_y, center_z],
        Math.max(...width),
        distance,
        projViewMatrix
      )
    ) {
      return [];
    }
    let x_left = center_x - width[0] / 2;
    let x_right = center_x + width[0] / 2;
    let y_top = center_y + width[1] / 2;
    let y_bottom = center_y - width[1] / 2;
    let z_near = center_z - width[2] / 2;
    let z_far = center_z + width[2] / 2;

    let result = [key, nodePages[key].pointCount];
    direction.forEach((element, index) => {
      let [dx, dy, dz] = element;
      let key = `${newLevel}-${2 * x + dx}-${2 * y + dy}-${2 * z + dz}`;
      if (!(key in nodePages && nodePages[key].pointCount > 0)) {
        return [];
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
      // console.log([width[0] / 2, width[1] / 2, width[2] / 2]);
      let result1 = traverseTree(
        [newLevel, 2 * x + dx, 2 * y + dy, 2 * z + dz],
        center_x,
        center_y,
        center_z,
        [width[0] / 2, width[1] / 2, width[2] / 2]
      );
      result.push(...result1);
    });
    return result;
  }
  let finalPoints = traverseTree(root, center_x, center_y, center_z, [
    width[0] * scale[0],
    width[1] * scale[1],
    width[2] * scale[2],
  ]);
  return finalPoints;
}

export { traverseTreeWrapper };
