const simplifyMod = require('./dist/simplify_wasm');


function simplify(vertices, uvs, triangles, reduceFraction) {
    if (!(vertices instanceof Float32Array)) {
        vertices = new Float32Array(vertices);
    }
    if (!(triangles instanceof Uint32Array)) {
        triangles = new Uint32Array(triangles);
    }
    if (uvs && !(uvs instanceof Float32Array)) {
        uvs = new Float32Array(uvs);
    }
    const vtxPtr = simplifyMod._malloc(vertices.length * 4);
    const triPtr = simplifyMod._malloc(triangles.length * 4);
    simplifyMod.HEAPF32.set(vertices, vtxPtr >> 2); // https://github.com/emscripten-core/emscripten/issues/4003#issuecomment-168669612
    simplifyMod.HEAPU32.set(triangles, triPtr >> 2);

    simplifyMod._set_vertices(vtxPtr, vertices.length / 3);
    simplifyMod._set_triangles(triPtr, triangles.length / 3);

    const uvPtr = uvs && simplifyMod._malloc(uvs.length * 4);
    if (uvs) {
        simplifyMod.HEAPF32.set(uvs, uvPtr >> 2);
        // set uvs after triangles.
        simplifyMod._set_uvs(uvs, uvs.length / 2);
    }

    simplifyMod._simplify(reduceFraction);

    const simpVtxCount = simplifyMod._get_vertices_count();
    const simpTriCount = simplifyMod._get_triangles_count();
    simplifyMod._get_vertices(vtxPtr);
    simplifyMod._get_triangles(triPtr);

    const simpVertices = simplifyMod.HEAPF32.slice(
        vtxPtr >> 2, (vtxPtr >> 2) + simpVtxCount * 3
    );
    const simpTriangles = simplifyMod.HEAPU32.slice(
        triPtr >> 2, (triPtr >> 2) + simpTriCount * 3
    );
    const simpUvs = uvs && simplifyMod.HEAPF32.slice(
        uvPtr >> 2, (uvPtr >> 2) + simpVtxCount * 2
    );

    simplifyMod._free(vtxPtr);
    simplifyMod._free(triPtr);
    simplifyMod._free(uvPtr);

    return {
        vertices: simpVertices,
        triangles: simpTriangles,
        uvs: simpUvs || null
    };
}

module.exports.simplify = simplify;