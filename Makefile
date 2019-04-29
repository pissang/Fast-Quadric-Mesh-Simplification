CXX := cpp/Main.cpp
O3 := -O3
WASM := -o dist/simplify_wasm.js -s DEMANGLE_SUPPORT=1 -s EXTRA_EXPORTED_RUNTIME_METHODS='["ccall", "cwrap", "FS_createDataFile", "FS_readFile", "FS_unlink"]' -s ALLOW_MEMORY_GROWTH=1 -s WASM=1  -s TOTAL_MEMORY=128MB


all: release

# release: CXX98 += ${O3}
release: wasm_debug

debug:
	g++ ${CXX}

wasm:
	em++ ${CXX} ${WASM} ${O3}
wasm_debug:
	em++ ${CXX} ${WASM}
