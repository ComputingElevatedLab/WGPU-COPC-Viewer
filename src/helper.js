import * as Octree from "./octree";

function fillArray(points, count, WIDTH, HEIGHT, DEPTH) {
  for (let i = 0; i < count; i++) {
    let point = new Octree.Point(
      i,
      Math.floor(Math.random() * WIDTH) - WIDTH / 2,
      Math.floor(Math.random() * HEIGHT) - HEIGHT / 2,
      Math.floor(Math.random() * DEPTH) - DEPTH / 2
    );
    points.push(point);
  }
}

function fillMidNodes(tree) {
  if (!tree.isDivided) {
    tree.points.splice(0, 1);
    return tree.points[0];
  }

  let children = [
    tree.minNE,
    tree.minNW,
    tree.minSW,
    tree.minSE,
    tree.maxNE,
    tree.maxNW,
    tree.maxSW,
    tree.maxSE,
  ];
  let result = [];
  for (let i = 0, _length = children.length; i < _length; i++) {
    let result1 = fillMidNodes(children[i]);
    if (result1 != null) {
      result.push(result1);
    }
  }
  let passIndex = Math.ceil(result.length / 2);
  let passingValue = result[passIndex];
  if (tree.level > 0) {
    result.splice(passIndex, 1);
  }
  tree.representativeNodes = [...result];
  return passingValue;
}

function updateHtmlUI(nodeNotFoundInBuffer, nodeFoundInBuffer, nodeFoundInLRU, nodeFoundInPersistent, nodeToFetch){
  let stats_text = `Among total nodes needed ${nodeFoundInBuffer + nodeNotFoundInBuffer}\b 
                    nodes found in GPU Buffer: ${nodeFoundInBuffer} \b
                    ---------------------------------------------------- 
                    nodes need to be loaded ${nodeNotFoundInBuffer}\b
                    \b
                    nodes found in LRU Cache: ${nodeFoundInLRU} \b
                    nodes found in Persistent memory: ${nodeFoundInPersistent} \b
                    nodes that were fetched from host: ${nodeToFetch}    `
  document.getElementById("stats-div").innerText = stats_text
}

export { fillArray, fillMidNodes, updateHtmlUI };
