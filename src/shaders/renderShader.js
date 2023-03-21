let vs = `
    struct VertexInput {
        @location(0) position: vec3<f32>,
        @location(1) color: vec3<f32>
    };

    struct VertexOut {
        @builtin(position) position: vec4<f32>,
        @location(0) color: vec3<f32>
    };


    struct paramsUniform {
        width_x:f32,
        width_y:f32,
        width_z:f32,
        x_min: f32,
        y_min: f32,
        z_min: f32
    };

    struct cmapUniform {
        colors: array<vec4<f32>, 10>
    };

    @group(0) @binding(0) var<uniform> MVP_Matrix: mat4x4<f32>;
    @group(0) @binding(1) var<uniform> cMap: cmapUniform;
    @group(0) @binding(2) var<uniform> params: paramsUniform;
    

    @vertex
    fn main(in: VertexInput)->VertexOut{
        var out:VertexOut;
        let position = in.position - vec3(params.x_min, params.y_min, params.z_min) - 0.5*vec3(params.width_x, params.width_y, params.width_z);
        let y_position_shifted = abs(in.position.z - params.z_min)/params.width_z;
        let cmapIndex = i32(y_position_shifted*9);
        let cmapped = cMap.colors[cmapIndex];
        out.color = vec3(cmapped.x, cmapped.y, cmapped.z);
        out.position = MVP_Matrix* vec4<f32>(position, 1.0);
        return out;
    }
`;

let fs = `
struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec3<f32>
};

@fragment
fn main(in:VertexOut)->@location(0) vec4<f32>{
    return vec4<f32>(in.color.x, in.color.y, in.color.z, 1.0);
}
`;

export { fs, vs };
