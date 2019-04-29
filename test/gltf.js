
// const {TextEncoder, TextDecoder} = require('util');
// global.TextEncoder = TextEncoder;
// global.TextDecoder = TextDecoder;

const {simplifyGLTF} = require('../simplify');
const fs = require('fs');

simplifyGLTF('./suzanne_high.gltf', 0.1, 'suzanne_low').then(res => {
    fs.writeFileSync('suzanne_low.gltf', JSON.stringify(res.gltf, null, 2), 'utf-8');
    fs.writeFileSync('suzanne_low.bin', new Buffer(res.buffer));
}).catch(e => {
    console.log(e);
});