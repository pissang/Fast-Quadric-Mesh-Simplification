// Simple wrapper for Sven Forstmann's mesh simplification tool
//
// Loads a OBJ format mesh, decimates mesh, saves decimated mesh as OBJ format
// http://voxels.blogspot.com/2014/05/quadric-mesh-simplification-with-source.html
// https://github.com/sp4cerat/Fast-Quadric-Mesh-Simplification
//To compile for Linux/OSX (GCC/LLVM)
//  g++ Main.cpp -O3 -o simplify
//To compile for Windows (Visual Studio)
// vcvarsall amd64
// cl /EHsc Main.cpp /osimplify
//To execute
//  ./simplify wall.obj out.obj 0.04
//
// Pascal Version by Chris Roden:
// https://github.com/neurolabusc/Fast-Quadric-Mesh-Simplification-Pascal-
//

#include "Simplify.h"
#include <stdio.h>
#include <time.h>  // clock_t, clock, CLOCKS_PER_SEC
#include <emscripten.h>


int simplify(const float* vertices_arr, const int vertices_count, const int* triangles_arr, const int triangles_count, float reduceFraction, float agressiveness) {

    printf("Mesh Simplification (C)2014 by Sven Forstmann in 2014, MIT License (%zu-bit)\n", sizeof(size_t)*8);

    Simplify::triangles.clear();
    Simplify::vertices.clear();
    for (int i = 0; i < vertices_count; i++) {
        Simplify::Vertex vtx;
        vtx.p.x = vertices_arr[i * 3];
        vtx.p.y = vertices_arr[i * 3 + 1];
        vtx.p.z = vertices_arr[i * 3 + 2];
        Simplify::vertices.push_back(vtx);
    }
    int maxIdx = 0;
    for (int i = 0; i < triangles_count; i++) {
        Simplify::Triangle tri;
        tri.v[0] = triangles_arr[i * 3];
        tri.v[1] = triangles_arr[i * 3 + 1];
        tri.v[2] = triangles_arr[i * 3 + 2];

        maxIdx = tri.v[0] > maxIdx ? tri.v[0] : maxIdx;
        maxIdx = tri.v[1] > maxIdx ? tri.v[1] : maxIdx;
        maxIdx = tri.v[2] > maxIdx ? tri.v[2] : maxIdx;
        Simplify::triangles.push_back(tri);
    }

    printf("Max index %d, %d, %d\n", maxIdx, vertices_count, triangles_count);

    printf("First Vertex %f, %f, %f\n", Simplify::vertices[0].p.x, Simplify::vertices[0].p.y, Simplify::vertices[0].p.z);

    if ((Simplify::triangles.size() < 3) || (Simplify::vertices.size() < 3)) {
        printf("triangles size or vertices size less than 3\n");
        return EXIT_FAILURE;
    }

    int target_count =  Simplify::triangles.size() >> 1;

    if (reduceFraction > 1.0) reduceFraction = 1.0; //lossless only
    if (reduceFraction <= 0.0) {
        printf("Ratio must be BETWEEN zero and one.\n");
        return EXIT_FAILURE;
    }
    target_count = round((float)Simplify::triangles.size() * reduceFraction);

    if (target_count < 4) {
        printf("Object will not survive such extreme decimation\n");
        return EXIT_FAILURE;
    }
    clock_t start = clock();
    printf("Input: %zu vertices, %zu triangles (target %d)\n", Simplify::vertices.size(), Simplify::triangles.size(), target_count);
    int startSize = Simplify::triangles.size();
    Simplify::simplify_mesh(target_count, agressiveness, true);
    //Simplify::simplify_mesh_lossless( false);
    if ( Simplify::triangles.size() >= startSize) {
        printf("Unable to reduce mesh.\n");
        return EXIT_FAILURE;
    }

    printf("Output: %zu vertices, %zu triangles (%f reduction; %.4f sec)\n",Simplify::vertices.size(), Simplify::triangles.size()
        , (float)Simplify::triangles.size()/ (float) startSize  , ((float)(clock()-start))/CLOCKS_PER_SEC );
    return EXIT_SUCCESS;
}

extern "C" {
int EMSCRIPTEN_KEEPALIVE simplify(const float* vertices, const int vertices_count, const int* triangles, const int triangles_count, float reduceFraction) {
    return simplify(vertices, vertices_count, triangles, triangles_count, reduceFraction, 7.0);// aggressive
}

int EMSCRIPTEN_KEEPALIVE get_vertices_count() {
    return Simplify::vertices.size();
}

int EMSCRIPTEN_KEEPALIVE  get_triangles_count() {
    return Simplify::triangles.size();
}

void EMSCRIPTEN_KEEPALIVE get_vertices(float* vertices_arr) {
    for (int i = 0; i < Simplify::vertices.size(); i++) {
        Simplify::Vertex& vtx = Simplify::vertices[i];
        vertices_arr[i * 3] = vtx.p.x;
        vertices_arr[i * 3 + 1] = vtx.p.y;
        vertices_arr[i * 3 + 2] = vtx.p.z;
    }
}
void EMSCRIPTEN_KEEPALIVE get_triangles(int* triangles_arr) {
    for (int i = 0; i < Simplify::triangles.size(); i++) {
        Simplify::Triangle& tri = Simplify::triangles[i];
        triangles_arr[i * 3] = tri.v[0];
        triangles_arr[i * 3 + 1] = tri.v[1];
        triangles_arr[i * 3 + 2] = tri.v[2];
    }
}

}