let vs = `
    struct VertexInput {
        @location(0) position: vec4<f32>,
        @location(1) color: vec3<f32>
    };

    struct VertexOut {
        @builtin(position) position: vec4<f32>,
        @location(0) color: vec4<f32>,
    };

    struct paramsUniform {
        width_x:f32,
        width_y:f32,
        width_z:f32,
        x_min: f32,
        y_min: f32,
        z_min: f32,
        current_Axis: f32,
        max_Intensity: f32
    };

    struct cmapUniform {
        colors: array<vec4<f32>, 20>
    };

    @group(0) @binding(0) var<uniform> MVP_Matrix: mat4x4<f32>;
    @group(0) @binding(1) var<uniform> cMap: cmapUniform;
    @group(0) @binding(2) var<uniform> params: paramsUniform;

    const direction = array<vec2<f32>, 4>(
        vec2<f32>(-1, -1),
        vec2<f32>(1, -1),
        vec2<f32>(-1, 1),
        vec2<f32>(1, 1)
    );
    
    const PI: f32 = 3.1415926535897932384626433832795;

    fn getCmapped(cMapIndex: i32)->vec4<f32>{
        var cmapped = cMap.colors[cMapIndex];
        if(cMapIndex>19){
            cmapped = cMap.colors[19];
        }
        return cmapped;
    }

    @vertex
    fn main(in: VertexInput, @builtin(instance_index) inst_index:u32, @builtin(vertex_index) vertexIndex : u32)->VertexOut{
        var out:VertexOut;
        var cMapIndex:i32; 
        var level:f32 = in.position.w;
        var radius:f32 = 3.0* pow(0.5, level);
        radius = max(radius, 1.0);
        var position:vec3<f32> = in.position.xyz - vec3(params.x_min, params.y_min, params.z_min) - 0.5*vec3(params.width_x, params.width_y, params.width_z);
        var factor = in.color.x/65536.0;
        if(params.current_Axis == 2.0){
            cMapIndex = i32((abs(in.position.z - params.z_min)/params.width_z) *19);
            let mappedColor = getCmapped(cMapIndex);
            out.color = vec4(mappedColor.xyz, 1.0);
            if(cMapIndex < 0){
                out.color = vec4(0.5, 0.5, 0.0, 1.0);
            }
            factor = in.color.x/params.max_Intensity;
        }
        else if(params.current_Axis == 1.0){
            cMapIndex = i32(1.25*(abs(in.position.y - params.y_min)/params.width_y) *19);
            out.color = getCmapped(cMapIndex);
        }
        else if(params.current_Axis == 0.0){
            cMapIndex = i32(1.25*(abs(in.position.x - params.x_min)/params.width_x) *19);
            out.color = getCmapped(cMapIndex);
        }
        else{
            out.color = vec4(in.color.x/65536.0, in.color.y/65536.0, in.color.z/65536.0, 1.0);
            factor = 1.0;
        }

        if(factor < 0.1){
            factor = 0.35;
        }
        out.color = vec4(out.color.x, out.color.y, out.color.z, 1.0)*factor;
        // if(level <= 1.0){
        //     out.color = vec4(0.0, 1.0, 0.0, 1.0);
        // }
        position = position + vec3<f32>(radius*direction[vertexIndex], 0.0);
        position.z = position.z;
        out.position = MVP_Matrix* vec4<f32>(position, 1.0);
        return out;
    }
`;

let fs = `
struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>
};

@fragment
fn main(in:VertexOut)->@location(0) vec4<f32>{
    return in.color;
}
`;

export { fs, vs };
