"""Export runtime texture derivatives without changing the editable campus.

blender --background assets/team-world/campus/models/team-campus.blend \
  --python tools/team-world/campus_export.py
"""
from pathlib import Path
import bpy


def export_campus(path):
    originals = []
    derivatives = {}
    approved = {"sandstone-basecolor.png", "timber-basecolor.png", "turf-basecolor.png"}
    try:
        for material in bpy.data.materials:
            if not material.use_nodes:
                continue
            for node in material.node_tree.nodes:
                if node.type != "TEX_IMAGE" or not node.image:
                    continue
                image = node.image
                links = list(node.outputs["Color"].links)
                if (image.name not in approved or node.outputs["Alpha"].is_linked or
                    not links or any(link.to_node.type != "BSDF_PRINCIPLED" or
                                     link.to_socket.name != "Base Color" for link in links)):
                    raise ValueError("Review texture use before JPEG export: " + image.name)
                if any(link.to_node.inputs["Alpha"].is_linked or
                       link.to_node.inputs["Alpha"].default_value != 1 for link in links):
                    raise ValueError("Campus runtime textures must remain opaque")
                if image not in derivatives:
                    runtime = image.copy()
                    runtime.name = image.name + " / runtime 512"
                    ratio = min(1, 512 / max(image.size))
                    runtime.scale(max(1, round(image.size[0] * ratio)),
                                  max(1, round(image.size[1] * ratio)))
                    derivatives[image] = runtime
                originals.append((node, image))
                node.image = derivatives[image]
        if {image.name for image in derivatives} != approved:
            raise ValueError("Campus runtime texture set changed")
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB",
            use_selection=True, export_animations=False,
            export_cameras=False, export_lights=False,
            export_image_format="JPEG", export_jpeg_quality=85)
    finally:
        for node, image in originals:
            node.image = image
        for image in derivatives.values():
            bpy.data.images.remove(image)


if __name__ == "__main__":
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        obj.select_set(obj.type == "MESH")
    export_campus(Path(__file__).resolve().parents[2] /
                  "assets/team-world/campus/models/team-campus.glb")
