const simplifyMod = require('./dist/simplify_wasm');


function simplify(vertices, triangles, reduceFraction) {
    if (!(vertices instanceof Float32Array)) {
        vertices = new Float32Array(vertices);
    }
    if (!(triangles instanceof Uint32Array)) {
        triangles = new Uint32Array(triangles);
    }
    const vtxPtr = simplifyMod._malloc(vertices.length * 4);
    const triPtr = simplifyMod._malloc(triangles.length * 4);
    simplifyMod.HEAPF32.set(vertices, vtxPtr >> 2); // https://github.com/emscripten-core/emscripten/issues/4003#issuecomment-168669612
    simplifyMod.HEAPU32.set(triangles, triPtr >> 2);

    simplifyMod._simplify(
        vtxPtr, vertices.length / 3,
        triPtr, triangles.length / 3,
        reduceFraction
    );

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

    simplifyMod._free(vtxPtr);
    simplifyMod._free(triPtr);

    return {
        vertices: simpVertices,
        triangles: simpTriangles
    };
}

module.exports.simplify = simplify;