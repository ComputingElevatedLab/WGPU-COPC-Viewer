async function loadImageBitMap(device, url) {
  const response = await fetch(url);
  const image = response.blob();
  //   const imageData = await
  const textureDescriptor = {
    size: {
      width: image.width,
      height: image.height,
    },
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  };

  let texture = device.createTexture(textureDescriptor);

  device.queue.copyExternalImageToTexture(
    image,
    texture,
    textureDescriptor.size
  );

  let viewDescriptor = {
    label: "heatmap texture view",
    format: "rgba8unorm",
    dimension: textureDescriptor.size,
  };

  let view = texture.createView(viewDescriptor);

  let sampler = device.createSampler({
    label: "heatmap texture sampler",
    addressModeU: "repeat",
    addressModeV: "repeat",
  });

  return [view, sampler];
}

export { loadImageBitMap };
