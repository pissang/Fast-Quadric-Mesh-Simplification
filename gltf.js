const fs = require('fs');

function relative2absolute(path, basePath) {
    if (!basePath || path.match(/^\//)) {
        return path;
    }
    var pathParts = path.split('/');
    var basePathParts = basePath.split('/');

    var item = pathParts[0];
    while(item === '.' || item === '..') {
        if (item === '..') {
            basePathParts.pop();
        }
        pathParts.shift();
        item = pathParts[0];
    }
    return basePathParts.join('/') + '/' + pathParts.join('/');
};

var semanticAttributeMap = {
    'NORMAL': 'normal',
    'POSITION': 'position',
    'TEXCOORD_0': 'texcoord0',
    'TEXCOORD_1': 'texcoord1',
    'WEIGHTS_0': 'weight',
    'JOINTS_0': 'joint',
    'COLOR_0': 'color'
};

var ARRAY_CTOR_MAP = {
    5120: Int8Array,
    5121: Uint8Array,
    5122: Int16Array,
    5123: Uint16Array,
    5125: Uint32Array,
    5126: Float32Array
};
var ARRAY_CTOR_MAP_INVERSE = new Map();
for (let enm in ARRAY_CTOR_MAP) {
    ARRAY_CTOR_MAP_INVERSE.set(ARRAY_CTOR_MAP[enm], enm);
}

var SIZE_MAP = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
    MAT2: 4,
    MAT3: 9,
    MAT4: 16
};
var SIZE_MAP_INVERSE = {};
for (let key in SIZE_MAP) {
    SIZE_MAP_INVERSE[SIZE_MAP[key]] = key;
}

function getAccessorData(json, lib, accessorIdx, isIndices) {
    var accessorInfo = json.accessors[accessorIdx];

    var buffer = lib.bufferViews[accessorInfo.bufferView];
    var byteOffset = accessorInfo.byteOffset || 0;
    var ArrayCtor = ARRAY_CTOR_MAP[accessorInfo.componentType] || Float32Array;

    var size = SIZE_MAP[accessorInfo.type];
    if (size == null && isIndices) {
        size = 1;
    }
    var arr = new ArrayCtor(buffer, byteOffset, size * accessorInfo.count);

    var quantizeExtension = accessorInfo.extensions && accessorInfo.extensions['WEB3D_quantized_attributes'];
    if (quantizeExtension) {
        var decodedArr = new Float32Array(size * accessorInfo.count);
        var decodeMatrix = quantizeExtension.decodeMatrix;
        var decodeOffset;
        var decodeScale;
        var decodeOffset = new Array(size);
        var decodeScale = new Array(size);
        for (var k = 0; k < size; k++) {
            decodeOffset[k] = decodeMatrix[size * (size + 1) + k];
            decodeScale[k] = decodeMatrix[k * (size + 1) + k];
        }
        for (var i = 0; i < accessorInfo.count; i++) {
            for (var k = 0; k < size; k++) {
                decodedArr[i * size + k] = arr[i * size + k] * decodeScale[k] + decodeOffset[k];
            }
        }

        arr = decodedArr;
    }
    return {
        value: arr,
        size
    }
}

function base64ToBinary(input, charStart) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var lookup = new Uint8Array(130);
    for (var i = 0; i < chars.length; i++) {
        lookup[chars.charCodeAt(i)] = i;
    }
    // Ignore
    var len = input.length - charStart;
    if (input.charAt(len - 1) === '=') { len--; }
    if (input.charAt(len - 1) === '=') { len--; }

    var uarray = new Uint8Array((len / 4) * 3);

    for (var i = 0, j = charStart; i < uarray.length;) {
        var c1 = lookup[input.charCodeAt(j++)];
        var c2 = lookup[input.charCodeAt(j++)];
        var c3 = lookup[input.charCodeAt(j++)];
        var c4 = lookup[input.charCodeAt(j++)];

        uarray[i++] = (c1 << 2) | (c2 >> 4);
        uarray[i++] = ((c2 & 15) << 4) | (c3 >> 2);
        uarray[i++] = ((c3 & 3) << 6) | c4;
    }

    return uarray.buffer;
}
module.exports = class GLTF {

    load(filePath) {
        return new Promise(resolve => {
            if (this.rootPath == null) {
                this.rootPath = filePath.slice(0, filePath.lastIndexOf('/'));
            }
            var isBinary = filePath.endsWith('.glb');
            // TODO glb
            fs.readFile(filePath, isBinary ? 'buffer' : 'utf-8', (err, data) => {
                !isBinary ? this.parse(JSON.parse(data), null, resolve)
                    : this.parseBinary(new Uint8Array(data).buffer, resolve);
            });
        });
    }

    parseBinary(buffer, cb) {
        var header = new Uint32Array(buffer, 0, 4);
        if (header[0] !== 0x46546C67) {
            this.trigger('error', 'Invalid glTF binary format: Invalid header');
            return;
        }
        if (header[0] < 2) {
            this.trigger('error', 'Only glTF2.0 is supported.');
            return;
        }

        var dataView = new DataView(buffer, 12);

        var json;
        var buffers = [];
        // Read chunks
        for (var i = 0; i < dataView.byteLength;) {
            var chunkLength = dataView.getUint32(i, true);
            i += 4;
            var chunkType = dataView.getUint32(i, true);
            i += 4;

            // json
            if (chunkType === 0x4E4F534A) {
                var arr = new Uint8Array(buffer, i + 12, chunkLength);
                // TODO, for the browser not support TextDecoder.
                var decoder = new TextDecoder();
                var str = decoder.decode(arr);
                try {
                    json = JSON.parse(str);
                }
                catch (e) {
                    this.trigger('error', 'JSON Parse error:' + e.toString());
                    return;
                }
            }
            else if (chunkType === 0x004E4942) {
                buffers.push(buffer.slice(i + 12, i + 12 + chunkLength));
            }

            i += chunkLength;
        }
        if (!json) {
            this.trigger('error', 'Invalid glTF binary format: Can\'t find JSON.');
            return;
        }

        return this.parse(json, buffers, cb);
    }

    parse(json, buffers, cb) {
        var self = this;

        var lib = {
            json: json,
            meshes: [],
            buffers: [],
            bufferViews: []
        };

        var loading = 0;
        function checkLoad() {
            loading--;
            if (loading === 0) {
                afterLoadBuffer();
            }
        }
        // If already load buffers
        if (buffers) {
            lib.buffers = buffers.slice();
            afterLoadBuffer(true);
        }
        else {
            // Load buffers
            json.buffers.forEach(function (bufferInfo, idx) {
                loading++;
                var path = bufferInfo.uri;

                self._loadBuffers(path, function (buffer) {
                    lib.buffers[idx] = buffer;
                    checkLoad();
                }, checkLoad);
            });
        }

        function getResult() {
            return {
                json: json,
                meshes: lib.meshes
            };
        }

        function afterLoadBuffer(immediately) {
            // Buffer not load complete.
            if (lib.buffers.length !== json.buffers.length) {
                setTimeout(function () {
                    self.trigger('error', 'Buffer not load complete.');
                });
                return;
            }

            json.bufferViews.forEach(function (bufferViewInfo, idx) {
                // PENDING Performance
                lib.bufferViews[idx] = lib.buffers[bufferViewInfo.buffer]
                    .slice(bufferViewInfo.byteOffset || 0, (bufferViewInfo.byteOffset || 0) + (bufferViewInfo.byteLength || 0));
            });
            lib.buffers = null;
            self._parseMeshes(json, lib);
            if (immediately) {
                setTimeout(function () {
                    cb(getResult());
                });
            }
            else {
                cb(getResult());
            }
        }

        return getResult();
    }

    build(json, meshes, basePath) {
        var bufferViewIdxMap = {};
        var bufferViews = [];
        var accessors = [];

        var bufferTotalSize = 0;
        // TODO Animation and pose matrix accessors.
        function addAccessor(data, size, target) {
            var accessorIdx = accessors.length;
            var componentType = ARRAY_CTOR_MAP_INVERSE.get(data.constructor);
            var bufferViewKey = componentType + '-' + target;
            var bufferViewIdx = bufferViewIdxMap[bufferViewKey];
            var bufferView = bufferViews[bufferViewIdx];
            if (!bufferView) {
                var bufferView = {
                    buffers: [],
                    byteOffset: 0,
                    target
                };
                bufferViewIdx = bufferViews.length;
                bufferViews.push(bufferView);
                bufferViewIdxMap[bufferViewKey] = bufferViewIdx;
            }
            bufferView.buffers.push(data.buffer);

            var min = [];
            var max = [];
            for (var i = 0; i < size; i++) {
                min[i] = Infinity;
                max[i] = -Infinity;
            }
            for (var i = 0; i < data.length; i += size) {
                var off = i * size;
                for (var k = 0; k < size; k++) {
                    min[k] = Math.min(min[k], data[off + k]);
                    max[k] = Math.max(max[k], data[off + k]);
                }
            }

            accessors.push({
                bufferView: bufferViewIdx,
                byteOffset: bufferView.byteOffset,
                count: data.length / size,
                componentType,
                type: SIZE_MAP_INVERSE[size],
                min,
                max
            });

            bufferView.byteOffset += data.buffer.byteLength;
            bufferTotalSize += data.buffer.byteLength;
            return accessorIdx;
        }

        var meshesInfos = meshes.map(mesh => {
            return {
                name: mesh.name,
                primitives: mesh.primitives.map(primitive => {
                    var primitiveInfo = {
                        attributes: {},
                        material: primitive.material,
                        indices: addAccessor(primitive.indices, 1, 34963)
                    };
                    for (var key in primitive.attributes) {
                        primitiveInfo.attributes[key] = addAccessor(
                            primitive.attributes[key].value,
                            primitive.attributes[key].size,
                            34962
                        );
                    }
                    return primitiveInfo;
                })
            };
        });
        var totalBuffer = new Uint8Array(bufferTotalSize);
        var offset = 0;
        var bufferViewOffset = 0;
        var bufferViewsInfos = bufferViews.map(bufferView => {
            var bufferViewByteLength = 0;
            bufferView.buffers.forEach(buffer => {
                totalBuffer.set(new Uint8Array(buffer), offset);
                bufferViewByteLength += buffer.byteLength;
                offset += buffer.byteLength;
            });
            var bufferViewInfo = {
                buffer: 0,
                byteOffset: bufferViewOffset,
                target: bufferView.target,
                byteLength: bufferViewByteLength
            };
            bufferViewOffset += bufferViewByteLength;
            return bufferViewInfo;
        });

        return {
            gltf: Object.assign({}, json, {
                accessors,
                buffers: [{
                    byteLength: totalBuffer.length,
                    uri: basePath + '.bin'
                }],
                bufferViews: bufferViewsInfos,
                meshes: meshesInfos
            }),
            buffer: totalBuffer.buffer
        };
    }

    resolveBufferPath(path) {
        if (path && path.match(/^data:(.*?)base64,/)) {
            return path;
        }

        var rootPath = this.rootPath;
        return relative2absolute(path, rootPath);
    }

    loadBuffer(path, onsuccess, onerror) {
        fs.readFile(path, (err, buffer) => {
            if (err) {
                onerror(err);
            }
            else {
                onsuccess(new Uint8Array(buffer).buffer);
            }
        });
    }

    _loadBuffers(path, onsuccess, onerror) {
        var base64Prefix = 'data:application/octet-stream;base64,';
        var strStart = path.substr(0, base64Prefix.length);
        if (strStart === base64Prefix) {
            onsuccess(
                base64ToBinary(path, base64Prefix.length)
            );
        }
        else {
            this.loadBuffer(
                this.resolveBufferPath(path),
                onsuccess,
                onerror
            );
        }
    }

    _parseMeshes(json, lib) {
        json.meshes.forEach(function (meshInfo, idx) {
            lib.meshes[idx] = {
                name: meshInfo.name,
                primitives: []
            };
            for (var pp = 0; pp < meshInfo.primitives.length; pp++) {
                var primitiveInfo = meshInfo.primitives[pp];
                var mesh = {
                    material: primitiveInfo.material,
                    attributes: {}
                };
                // Parse attributes
                var semantics = Object.keys(primitiveInfo.attributes);
                for (var ss = 0; ss < semantics.length; ss++) {
                    var semantic = semantics[ss];
                    var accessorIdx = primitiveInfo.attributes[semantic];
                    mesh.attributes[semantic] = getAccessorData(json, lib, accessorIdx);
                }

                // Parse indices
                if (primitiveInfo.indices != null) {
                    mesh.indices = getAccessorData(json, lib, primitiveInfo.indices, true).value;
                    if (!(mesh.indices instanceof Uint32Array)) {
                        mesh.indices = new Uint32Array(mesh.indices);
                    }
                }

                lib.meshes[idx].primitives.push(mesh);
            }
        }, this);
    }
}