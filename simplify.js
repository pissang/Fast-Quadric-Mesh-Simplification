const simplifyWasmMod = require('./dist/simplify_wasm');
const GLTF = require('./gltf');

/**
 * @param {Float32Array} vertices
 * @param {Uint32Array} triangles
 * @param {Number} reduceFraction
 */
function simplify(vertices, triangles, reduceFraction) {
    if (!(vertices instanceof Float32Array)) {
        vertices = new Float32Array(vertices);
    }
    if (!(triangles instanceof Uint32Array)) {
        triangles = new Uint32Array(triangles);
    }
    const vtxPtr = simplifyWasmMod._malloc(vertices.length * 4);
    const triPtr = simplifyWasmMod._malloc(triangles.length * 4);
    simplifyWasmMod.HEAPF32.set(vertices, vtxPtr >> 2); // https://github.com/emscripten-core/emscripten/issues/4003#issuecomment-168669612
    simplifyWasmMod.HEAPU32.set(triangles, triPtr >> 2);

    simplifyWasmMod._set_vertices(vtxPtr, vertices.length / 3);
    simplifyWasmMod._set_triangles(triPtr, triangles.length / 3);

    simplifyWasmMod._simplify(reduceFraction);

    const simpVtxCount = simplifyWasmMod._get_vertices_count();
    const simpTriCount = simplifyWasmMod._get_triangles_count();
    const oldTriPtr = simplifyWasmMod._malloc(triangles.length * 4);
    simplifyWasmMod._get_vertices(vtxPtr);
    simplifyWasmMod._get_triangles(triPtr, oldTriPtr);

    const simpVertices = simplifyWasmMod.HEAPF32.slice(
        vtxPtr >> 2, (vtxPtr >> 2) + simpVtxCount * 3
    );
    const simpTriangles = simplifyWasmMod.HEAPU32.slice(
        triPtr >> 2, (triPtr >> 2) + simpTriCount * 3
    );
    const simpTrianglesMap = simplifyWasmMod.HEAPU32.slice(
        oldTriPtr >> 2, (oldTriPtr >> 2) + simpTriCount * 3
    );
    simplifyWasmMod._free(vtxPtr);
    simplifyWasmMod._free(triPtr);
    simplifyWasmMod._free(oldTriPtr);

    return {
        vertices: simpVertices,
        triangles: simpTriangles,
        trianglesMap: simpTrianglesMap
    };
}

function simplifiedAttributesData(attributesArr, vertexCount, size, triangles, trianglesMap) {
    const simplifiedArr = new (attributesArr.constructor)(vertexCount * size);
    for (let i = 0; i < triangles.length; i++) {
        let newIdx = triangles[i];
        let oldIdx = trianglesMap[i];
        simplifiedArr[newIdx] = attributesArr[oldIdx];
    }
    return simplifiedArr;
}

function simplifyGLTF(filePath, reduceFraction, outputName) {
    const gltfHelper = new GLTF();
    return gltfHelper.load(filePath).then(data => {
        const newMeshes = data.meshes.map(mesh => {
            return {
                name: mesh.name,
                primitives: mesh.primitives.map(primitive => {
                    let vertices = primitive.attributes.POSITION.value;
                    let indices = primitive.indices;
                    const simpRes = simplify(vertices, indices, reduceFraction);
                    const attributes = {};
                    for (let key in primitive.attributes) {
                        if (key === 'POSITION') {
                            attributes['POSITION'] = {
                                value: simpRes.vertices,
                                size: 3
                            };
                        }
                        else {
                            let vertexCount =  simpRes.vertices.length / 3;
                            attributes[key] = {
                                value: simplifiedAttributesData(
                                    primitive.attributes[key].value,
                                    vertexCount,
                                    primitive.attributes[key].size,
                                    simpRes.triangles,
                                    simpRes.trianglesMap
                                ),
                                size: primitive.attributes[key].size
                            };
                        }
                    }
                    return {
                        material: primitive.material,
                        indices: simpRes.triangles,
                        attributes: attributes
                    };
                })
            };
        });

        return gltfHelper.build(data.json, newMeshes, outputName);
    });
}

module.exports.simplify = simplify;

module.exports.simplifiedAttributesData = simplifiedAttributesData;

module.exports.simplifyGLTF = simplifyGLTF;