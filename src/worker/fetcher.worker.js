import { Copc, Key } from "copc";
import * as THREE from "three";
const color = new THREE.Color();
const colors = [];
let maxZ = -999;
let minZ = 1000;
let maxIntensity = -100;
let firstTime = true;
var nodePages, pages, receivedData, copc;
let x_min,
  y_min,
  z_min,
  x_max,
  y_max,
  z_max,
  widthx,
  widthy,
  widthz,
  scaleX,
  scaleY,
  scaleZ,
  level;
let positions = [];
// const filename = process.env.filename;
const filename = process.env.filename;

const readPoints = (id, getters) => {
  let returnPoint = getXyzi(id, getters);
  // console.log(returnPoint)
  if (returnPoint[2] > maxZ) {
    maxZ = returnPoint[2];
  }
  if (returnPoint[2] < minZ) {
    minZ = returnPoint[2];
  }

  positions.push(returnPoint[0], returnPoint[1], returnPoint[2]);
  // console.log("intensity is", returnPoint[3]);
  const vx = returnPoint[3];
  if (vx > maxIntensity) {
    maxIntensity = vx;
  }
  color.setRGB(returnPoint[3], returnPoint[4], returnPoint[5]);
  colors.push(color.r, color.g, color.b);
  firstTime = false;
};

function getXyzi(index, getters) {
  return getters.map((get) => get(index));
}

async function load() {
  // copc = await Copc.create(filename);
  // let scale = copc.header.scale[0];
  // [x_min, y_min, z_min, x_max, y_max, z_max] = copc.info.cube;
  // width = Math.abs(x_max - x_min);
  // // let center_x = (x_min + x_max) / 2;
  // // let center_y = (y_min + y_max) / 2;
  // // let center_z = (z_min + z_max) / 2;
  // receivedData = await Copc.loadHierarchyPage(
  //   filename,
  //   copc.info.rootHierarchyPage
  // );
  // nodePages = receivedData.nodes;
  // pages = receivedData.pages;
  postMessage(200);
}

async function loadData(nodes, pages, copc, myRoot, pointCount) {
  // console.log(copc, myRoot);
  const view = await Copc.loadPointDataView(filename, copc, myRoot);
  // let getters = ["X", "Y", "Z", "Intensity"].map(view.getter);
  let getters = ["X", "Y", "Z", "Red", "Green", "Blue"].map(view.getter);
  for (let j = 0; j < pointCount; j += 1) {
    readPoints(j, getters);
  }
  postMessage([positions, colors, [minZ, maxZ, maxIntensity, level]]);
}

load();

onmessage = function (message) {
  let nodePages = message.data[0];
  let nodes = JSON.parse(nodePages);
  let pagesStr = message.data[1];
  let pages = JSON.parse(pagesStr);
  let copcStr = message.data[2];
  let copc = JSON.parse(copcStr);

  let mapIndex = message.data[3];
  let pointCount = message.data[4];
  let myRoot = nodes[mapIndex];
  x_min = message.data[5][0];
  y_min = message.data[5][1];
  z_min = message.data[5][2];
  widthx = message.data[5][3];
  widthy = message.data[5][4];
  widthz = message.data[5][5];
  scaleX = message.data[5][6];
  scaleY = message.data[5][7];
  scaleZ = message.data[5][8];
  level = message.data[5][9];
  loadData(nodes, pages, copc, myRoot, pointCount);
};
