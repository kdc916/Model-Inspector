"""Batch Blender (.blend/.fbx/.obj) -> binary glTF.
Run with: blender -b example.blend --python tools/blender_to_glb.py -- --output example.glb
For importing FBX/OBJ into an empty scene:
 blender -b --python tools/blender_to_glb.py -- --input example.fbx --output example.glb
Requires Blender 4.3+; Blender's format import operator availability varies by version.
This script cannot open native Autodesk 3ds Max .max files.
"""
import argparse
import sys
from pathlib import Path
import bpy


def run():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', help='FBX/OBJ/GLB source to import. Omit if .blend is already open.')
    parser.add_argument('--output', required=True, help='Destination .glb')
    args = parser.parse_args(argv)
    if args.input:
        path = Path(args.input).resolve()
        if not path.is_file():
            raise FileNotFoundError(path)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        suffix = path.suffix.lower()
        if suffix == '.blend':
            bpy.ops.wm.open_mainfile(filepath=str(path))
        elif suffix == '.fbx':
            bpy.ops.import_scene.fbx(filepath=str(path))
        elif suffix == '.obj':
            bpy.ops.wm.obj_import(filepath=str(path))
        elif suffix in ('.gltf', '.glb'):
            bpy.ops.import_scene.gltf(filepath=str(path))
        else:
            raise ValueError(f'Unsupported conversion input: {suffix}')
    target = Path(args.output).resolve()
    if target.suffix.lower() != '.glb':
        raise ValueError('Output must end in .glb')
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', export_apply=False)
    print(f'Exported: {target}')


if __name__ == '__main__':
    run()
