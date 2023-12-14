import { vs, fs } from "../shaders/renderShader.js";
import {
  bufferMap,
  retrivePoints,
  toDeleteMap,
  wait,
  controls,
  global_max_intensity,
} from "../index.js";
import Stats from "three/examples/jsm/libs/stats.module";

let adapter = null;
let device = null;
let worldViewProj = mat4.create();
var projView = mat4.create();
let proj;
let camera;
let context = null;
let swapChainFormat = "bgra8unorm";
let renderPipeline;
let mvp_BG;
let positionBuffer;
let colorBuffer;
let MVP_Buffer;
var lasInfoBuffer;
let maxIntensityBuffer;
let commandEncoder;
let renderPassDescriptor;
let renderDepthTexture;
let canvas;
let numPoints;
let positions, colors;
let keyMap = {
  isDown: false,
  dragging: false,
};
let debounceTimeOutId = null;
let colorMapBuffer;
let paramsBuffer;
let currentAxis = 3;
let param;
let abortController = null;
let levelBuffer;

const stats = Stats();
document.body.appendChild(stats.dom);

function throttle(callback, interval) {
  let enableCall = true;
  return function (...args) {
    if (!enableCall) return;
    enableCall = false;
    callback.apply(this, args);
    setTimeout(() => (enableCall = true), interval);
  };
}

let throttleTreeTravel = throttle(retrivePoints, 2000);

// ------------------------------- camera itenary

const iternary = [
  { x: -100, y: 1000, z: 700 },
  { x: 0, y: 1000, z: 700 },
  { x: 0, y: 500, z: 300 },
  { x: 100, y: 200, z: 300 },
  { x: 0, y: 100, z: 100 },
];

function moveCamera() {
  return new Promise((resolve, reject) => {
    controls.object.position.set(
      iternary[count].x,
      iternary[count].y,
      iternary[count].z
    );
    render();
    throttleTreeTravel(projView);
    resolve("done");
  });
}

let count = 0;
function itenaryStart(fn) {
  fn().then((response) => {
    count++;
    if (count < 5) setTimeout(() => itenaryStart(fn), 10000);
  });
}

// -----------------------------------------------------------------

function configureSwapChain(device) {
  context.configure({
    device: device,
    format: swapChainFormat,
    usage: GPUTextureUsage.RenderAttachment,
    alphaMode: "premultiplied",
  });
}

function goToFallback() {
  console.error("unable to start webgpu");
  return;
}

function recoverFromDeviceLoss(data) {
  console.log("device is lost");
}

(() => {
  const selectColormap = document.getElementById("colormap-axis");
  selectColormap.addEventListener("change", (event) => {
    const axis = parseInt(event.target.value);
    if (axis != currentAxis) {
      currentAxis = axis;
      updateAxis();
    }
  });
})();

async function updateMaxIntensity() {
  param[param.length - 1] = global_max_intensity;
  const stagingBuffer = device.createBuffer({
    usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
    size: 32,
    mappedAtCreation: true,
  });

  const stagingData = new Float32Array(stagingBuffer.getMappedRange());
  stagingData.set(param);
  stagingBuffer.unmap();
  const copyEncoder = device.createCommandEncoder();
  copyEncoder.copyBufferToBuffer(stagingBuffer, 28, paramsBuffer, 28, 4);
  device.queue.submit([copyEncoder.finish()]);
}

async function updateAxis() {
  param[param.length - 2] = currentAxis;
  const stagingBuffer = device.createBuffer({
    usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
    size: 32,
    mappedAtCreation: true,
  });

  const stagingData = new Float32Array(stagingBuffer.getMappedRange());
  stagingData.set(param);
  stagingBuffer.unmap();
  const copyEncoder = device.createCommandEncoder();
  copyEncoder.copyBufferToBuffer(stagingBuffer, 24, paramsBuffer, 24, 8);
  device.queue.submit([copyEncoder.finish()]);
}

async function init() {
  adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return goToFallback();
  device = await adapter.requestDevice();
  if (!device) return goToFallback();
  // device.lost.then(recoverFromDeviceLoss);

  canvas = document.getElementById("screen-canvas");
  canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
  canvas.height = window.innerHeight * (window.devicePixelRatio || 1);

  context = canvas.getContext("webgpu");
  if (!context) {
    console.error("coould not get context from the canvas");
    return;
  }

  swapChainFormat = navigator.gpu.getPreferredCanvasFormat();
  configureSwapChain(device);
  canvas.addEventListener("mousedown", (e) => {
    if (e.buttons == 1 || e.buttons == 2) {
      keyMap["isDown"] = true;
    }
  });

  window.addEventListener("mouseup", (e) => {
    keyMap["isDown"] = false;
  });

  canvas.addEventListener("mousemove", () => {
    if (keyMap["isDown"] == true) {
      throttleTreeTravel(projView);
    }
  });

  window.addEventListener("wheel", (event) => {
    // console.log(camera.eyePos());
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();
    throttleTreeTravel(projView, abortController.signal);
  });
}

async function intRenderPipeline() {
  let Vertex_Buffer_Descriptor = [{}];
  let vs_module = device.createShaderModule({
    label: "vertex shader",
    code: vs,
  });

  let fs_module = device.createShaderModule({
    label: "fragment shader",
    code: fs,
  });

  let positionAttribute_Desc = {
    shaderLocation: 0,
    offset: 0,
    format: "float32x4",
  };

  let colorAttribute_Desc = {
    shaderLocation: 1,
    offset: 0,
    format: "float32x3",
  };

  let Vertex_Shader_Descriptor = {
    module: vs_module,
    entryPoint: "main",
    buffers: [
      {
        arrayStride: 16,
        stepMode: "instance",
        attributes: [positionAttribute_Desc],
      },
      {
        arrayStride: 12,
        stepMode: "instance",
        attributes: [colorAttribute_Desc],
      },
    ],
  };

  let Fragment_Shader_Descriptor = {
    module: fs_module,
    entryPoint: "main",
    targets: [{ format: swapChainFormat }],
  };

  let Depth_Stencil_Descriptor = {
    format: "depth24plus-stencil8",
    depthWriteEnabled: true,
    depthCompare: "less",
  };

  let Primitive_Descriptor = {
    topology: "triangle-strip",
    cullMode: "none",
  };

  renderPipeline = await device.createRenderPipeline({
    label: "render pipeline",
    layout: "auto",
    vertex: Vertex_Shader_Descriptor,
    fragment: Fragment_Shader_Descriptor,
    depthStencil: Depth_Stencil_Descriptor,
    primitive: Primitive_Descriptor,
  });
}

async function initVertexBuffer() {
  let totalNumberOfPoints = numPoints;
  positionBuffer = device.createBuffer({
    label: "vertex position buffer",
    size: totalNumberOfPoints * 16,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });

  let mapArrayPosition = new Float32Array(positionBuffer.getMappedRange());
  mapArrayPosition.set(positions);
  positionBuffer.unmap();

  colorBuffer = device.createBuffer({
    label: "vertex color buffer",
    size: totalNumberOfPoints * 12,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });

  let mapArrayColor = new Float32Array(colorBuffer.getMappedRange());
  mapArrayColor.set(colors);
  colorBuffer.unmap();
}

function initUniform(cam, projMatrix, params) {
  camera = cam;
  proj = projMatrix;
  param = params;
  params.push(currentAxis);
  params.push(global_max_intensity);
  // params
  paramsBuffer = device.createBuffer({
    size: 8 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  let mapArray_params = new Float32Array(paramsBuffer.getMappedRange());
  mapArray_params.set(params);
  paramsBuffer.unmap();

  levelBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  let mapArray_level = new Float32Array(levelBuffer.getMappedRange());
  mapArray_level.set([0]);
  levelBuffer.unmap();

  function get1DArray(arr) {
    return +arr.join().split(",");
  }
  // create colormap
  let hsv_colors = [
    [0.0, 0.0, 0.5],
    [0.0, 0.2, 0.7],
    [0.0, 0.4, 0.9],
    [0.0, 0.6, 1.0],
    [0.0, 0.8, 1.0],
    [0.2, 0.9, 0.8],
    [0.4, 1.0, 0.6],
    [0.6, 1.0, 0.4],
    [0.8, 1.0, 0.2],
    [1.0, 1.0, 0.0],
    [1.0, 0.9, 0.0],
    [1.0, 0.8, 0.0],
    [1.0, 0.6, 0.0],
    [1.0, 0.4, 0.0],
    [1.0, 0.2, 0.0],
    [0.9, 0.0, 0.0],
    [0.7, 0.0, 0.0],
    [0.5, 0.0, 0.0],
    [0.3, 0.0, 0.0],
    [0.1, 0.5, 0.0],
  ];

  hsv_colors = hsv_colors.flat();
  colorMapBuffer = device.createBuffer({
    size: hsv_colors.length * 3 * 4,
    usage: GPUBufferUsage.UNIFORM,
    mappedAtCreation: true,
  });

  let mapArray = new Float32Array(colorMapBuffer.getMappedRange());

  mapArray.set(hsv_colors);
  colorMapBuffer.unmap();

  MVP_Buffer = device.createBuffer({
    size: 16 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  let viewMatrix = camera.matrixWorldInverse.elements
  projView = mat4.mul(projView, viewMatrix, proj);
  return projView;
}

async function createBindGroups() {
  mvp_BG = device.createBindGroup({
    label: "uniform bindgroup - rendering",
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: MVP_Buffer,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: colorMapBuffer,
        },
      },
      {
        binding: 2,
        resource: {
          buffer: paramsBuffer,
        },
      },
    ],
  });
}

async function createDepthBuffer() {
  renderDepthTexture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: "depth24plus-stencil8",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

async function encodedCommand() {
  // create render pass descriptor
  // console.log(currentAxis);

  let colorAttachment = {
    view: context.getCurrentTexture().createView(),
    clearValue: { r: 1.0, g: 1.0, b: 1.0, a: 1.0 },
    loadOp: "clear",
    storeOp: "store",
  };

  let depthAttachment = {
    view: renderDepthTexture.createView(),
    depthLoadOp: "clear",
    depthClearValue: 1.0,
    depthStoreOp: "store",
    stencilLoadOp: "clear",
    stencilClearValue: 0,
    stencilStoreOp: "store",
  };

  renderPassDescriptor = {
    colorAttachments: [colorAttachment],
    depthStencilAttachment: depthAttachment,
  };
}

async function update(timestamp) {
  {
    // update worldViewProj
    let proj = mat4.create();
    let view = mat4.create();

    {
      // proj
      const aspect = Math.abs(canvas.width / canvas.height);
      mat4.perspective(proj, 90, aspect, 0.1, 1000.0);
    }

    {
      // view
      let target = vec3.fromValues(2, 5, 0);
      // let r = 50;
      // let x = r * Math.sin(timestamp / 10) + target[0];
      // let y = r * Math.cos(timestamp / 10) + target[1];
      // let z = 10;

      let position = vec3.fromValues(5, 100, 100);
      let up = vec3.fromValues(0, 0, 1);
      mat4.lookAt(view, position, target, up);
    }
    const view_matrix = camera.matrixWorldInverse;
    mat4.multiply(worldViewProj, view_matrix, proj);
  }
}

async function stages(camera, proj, params) {
  await init();
  await intRenderPipeline();
  let projectionViewMatrix = await initUniform(camera, proj, params);
  return projectionViewMatrix;
}

// ---------------------------------------------------------------------------
// i guess i am not using this

async function renderStages(position, color) {
  numPoints = position.length / 3;
  positions = position;
  colors = color;
  await initVertexBuffer();
  await createBindGroups();
  await createDepthBuffer();
  requestAnimationFrame(render2);
}
// -----------------------------------------------------------------------------
async function renderWrapper() {
  await createBindGroups();
  await createDepthBuffer();
  await updateMaxIntensity();
  render();
  // itenaryStart(moveCamera);
}

function render(timestamp) {
  stats.update();
  var startTime = performance.now();
  commandEncoder = device.createCommandEncoder();
  //  this is not helpful for tree traversal so model matrix rotation is removed for now
  let viewMatrix = camera.matrixWorldInverse.elements;
  // console.log(controls.object.position, controls.object.rotation, controls.target )
  projView = mat4.mul(projView, proj, viewMatrix);
  controls.update();
  // update(timestamp);
  encodedCommand();

  // device.queue.writeBuffer(MVP_Buffer, 0, worldViewProj, 16);

  let wvStagingBuffer = device.createBuffer({
    size: 4 * 16,
    usage: GPUBufferUsage.COPY_SRC,
    mappedAtCreation: true,
  });
  const stagingUniformData = new Float32Array(wvStagingBuffer.getMappedRange());
  stagingUniformData.set(projView);
  wvStagingBuffer.unmap();
  commandEncoder.copyBufferToBuffer(wvStagingBuffer, 0, MVP_Buffer, 0, 64);
  let renderPass = commandEncoder.beginRenderPass(renderPassDescriptor);
  renderPass.setPipeline(renderPipeline);
  renderPass.setViewport(0, 0, canvas.width, canvas.height, 0.0, 1.0);
  renderPass.setBindGroup(0, mvp_BG);
  for (let key in bufferMap) {
    // console.log(bufferMap[key].position);
    renderPass.setVertexBuffer(0, bufferMap[key].position);
    renderPass.setVertexBuffer(1, bufferMap[key].color);
    numPoints = +bufferMap[key].position.label / 4;
    renderPass.draw(4, numPoints, 0, 0);
  }
  renderPass.end();
  device.queue.submit([commandEncoder.finish()]);
  var endTime = performance.now();
  requestAnimationFrame(render);
}

export { renderStages, device, stages, renderWrapper, throttle };
