const fs = require('fs');
const parseOBJ = require('parse-obj');
const {simplify} = require('../simplify');

parseOBJ(fs.createReadStream('./bunny.obj'), function (err, result) {
    const vertices = new Float32Array(result.vertexPositions.length * 3);
    const triangles = new Uint32Array(result.facePositions.length * 3);

    let cursor = 0;
    for (let i = 0; i < result.vertexPositions.length; i++) {
        vertices[cursor++] = result.vertexPositions[i][0];
        vertices[cursor++] = result.vertexPositions[i][1];
        vertices[cursor++] = result.vertexPositions[i][2];
    }
    cursor = 0;
    for (let i = 0; i < result.facePositions.length; i++) {
        triangles[cursor++] = result.facePositions[i][0] - 1;
        triangles[cursor++] = result.facePositions[i][1] - 1;
        triangles[cursor++] = result.facePositions[i][2] - 1;
    }
    console.log(simplify(vertices, null, triangles, 0.1));
});