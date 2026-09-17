"""Rebuild the app-owned campus: Blender 5.2+, no add-ons or network needed.

blender --background --factory-startup --python tools/team-world/build-campus.py
The generated world.json is the client AND relay collision contract. Keep the
existing approved object/action definitions; only campus terrain is authored here.
"""
import bpy
import json
import math
import random
import sys
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/team-world/campus"
OUT = ASSETS / "models"
OUT.mkdir(parents=True, exist_ok=True)
random.seed(716)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
world_path = ROOT / "app/team-world/world.json"
world = json.loads(world_path.read_text())
world.update(id="team-world-campus-v2", bounds=dict(x=-71, z=-71, width=142, depth=142), blockers=[])
centers = [-44, -22, 0, 22, 44]
world["surfaces"] = [dict(id=f"district-ground-{i}", x=c-27, z=-c-27,
    width=54, depth=54, y=0, thickness=1.2, color="#c7bda4", rollingResistance=.4)
    for i, c in enumerate(centers)]
for name, x, z, w, d, y, slope in [
    ("social-perch", -24, -24, 20, 14, 2.4, 0),
    ("social-ramp", -8, -10, 4, 12, 2.4, -.2),
    ("west-terrace", -54, 16, 20, 14, 2.4, 0),
    ("west-ramp", -38, 30, 4, 12, 2.4, -.2),
    ("bridge", -4, -19, 16, 4, 2.4, 0),
    ("garden-terrace", 12, -26, 14, 14, 2.4, 0),
    ("garden-ramp", 22, -12, 4, 12, 2.4, -.2),
]:
    world["surfaces"].append(dict(id=name, x=x, z=z, width=w, depth=d, y=y,
        slope=slope, thickness=.32, color="#d5c6a7"))

def material(name, color, texture=None):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = .88
    if texture:
        t = m.node_tree.nodes.new("ShaderNodeTexImage")
        t.image = bpy.data.images.load(str(ASSETS / "textures" / texture))
        t.image.pack()
        m.node_tree.links.new(t.outputs["Color"], shader.inputs["Base Color"])
    return m

stone = material("campus / sandstone", (.72, .65, .51), "sandstone-basecolor.png")
turf = material("campus / turf", (.33, .43, .18), "turf-basecolor.png")
wood = material("campus / timber", (.46, .28, .12), "timber-basecolor.png")
cream = material("campus / warm limestone", (.76, .69, .56))
rock = material("campus / cliff", (.37, .39, .33))
metal = material("campus / charcoal steel", (.055, .075, .072))
cloth = material("campus / wine canopy", (.28, .025, .065))
white = material("campus / chalk", (.94, .91, .79))
leaf = material("campus / sage", (.23, .34, .105))
gold = material("campus / lantern glass", (.94, .58, .15))
gold.node_tree.nodes.get("Principled BSDF").inputs["Emission Color"].default_value = (1, .52, .12, 1)
gold.node_tree.nodes.get("Principled BSDF").inputs["Emission Strength"].default_value = .5

def finish(o, name, mat, block=False):
    o.name = name
    o.data.materials.clear()
    o.data.materials.append(mat)
    if block:
        bpy.context.view_layer.update()
        corners = [o.matrix_world @ Vector(c) for c in o.bound_box]
        lo = [min(c[i] for c in corners) for i in range(3)]
        hi = [max(c[i] for c in corners) for i in range(3)]
        world["blockers"].append(dict(x=round(lo[0], 4), z=round(-hi[1], 4),
            width=round(hi[0]-lo[0], 4), depth=round(hi[1]-lo[1], 4),
            y=round(lo[2], 4), height=round(hi[2]-lo[2], 4)))
    return o

def box(name, x, z, y, w, d, h, mat, block=False):
    # Blender Z-up -> glTF Y-up: (x, -world.z, world.y).
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -z, y+h/2))
    o = bpy.context.object
    o.scale = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # World-scale UVs keep generated stone/wood at human scale on long beams.
    uv = o.data.uv_layers.active.data
    for poly in o.data.polygons:
        axis = max(range(3), key=lambda i: abs(poly.normal[i]))
        a, b = [i for i in range(3) if i != axis]
        for idx in poly.loop_indices:
            v = o.data.vertices[o.data.loops[idx].vertex_index].co
            uv[idx].uv = (v[a]/3, v[b]/3)
    return finish(o, name, mat, block)

def mesh(name, vertices, faces, mat, uvscale=4):
    data = bpy.data.meshes.new(name)
    data.from_pydata([(x, -z, y) for x, y, z in vertices], [], faces)
    data.update()
    o = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(o)
    uv = data.uv_layers.new()
    for poly in data.polygons:
        for idx in poly.loop_indices:
            v = data.vertices[data.loops[idx].vertex_index].co
            uv.data[idx].uv = (v.x/uvscale, -v.y/uvscale)
    return finish(o, name, mat)

def rail(name, x, z, y, length, along="x"):
    w, d = (length, .12) if along == "x" else (.12, length)
    # A single collider for the entire rail avoids hundreds of tiny obstacles.
    box(name, x, z, y, w, d, 1, metal, True)
    # Recessed slats keep a visually light silhouette without transparency cost.
    o = bpy.context.object
    o.scale.z = .07
    o.location.z = y+.97
    for v in [-length/2+.1, length/2-.1]:
        box(name+" post", x+(v if along=="x" else 0), z+(v if along=="z" else 0), y, .12, .12, 1, metal)
    box(name+" lower", x, z, y+.4, w, d, .055, metal)

def supported(x, z):
    return any(abs(x-c) <= 27 and abs(z+c) <= 27 for c in centers)

# One non-overlapping ground mesh, split by district for render culling.
lawns = [(-24, 2, 32, 22), (18, -42, 22, 20), (-61, 39, 24, 18), (39, -62, 21, 16)]
def lawn(x, z):
    return any(a < x < a+w and b < z < b+d for a,b,w,d in lawns)
for i, c in enumerate(centers):
    for grassy, mat in [(False, stone), (True, turf)]:
        verts, faces = [], []
        for x in range(-71, 71, 2):
            for z in range(-71, 71, 2):
                if not supported(x+1, z+1) or lawn(x+1, z+1) != grassy:
                    continue
                owner = min(range(5), key=lambda j: (x+1-centers[j])**2+(z+1+centers[j])**2)
                if owner != i:
                    continue
                n = len(verts)
                verts += [(x, .016, z), (x, .016, z+2), (x+2, .016, z+2), (x+2, .016, z)]
                faces.append((n, n+1, n+2, n+3))
        if verts:
            mesh(f"district {i} / {'lawn' if grassy else 'paving'}", verts, faces, mat)

# Raised slabs and slope caps follow the exact authoritative terrain equation.
for s in world["surfaces"][5:]:
    x,z,w,d,y = [s[k] for k in ["x","z","width","depth","y"]]
    end = y+s["slope"]*d
    o = mesh(s["id"]+" textured cap", [(x,y+.016,z),(x,y+.016,z+d),(x+w,y+.016,z+d),(x+w,y+.016,z)], [(0,1,2,3)], stone)
    # Change far-end vertices to the slope's height.
    for v in o.data.vertices:
        if abs(-v.co.y-(z+d)) < .001:
            v.co.z = end+.016
    if not s["slope"]:
        # Exposed slab fascia and sparse supports allow an actual underpass.
        box(s["id"]+" fascia", x+w/2,z+d/2,y-.34,w,d,.32,cream)
        if s["id"] != "bridge":
            for px in [x+.35,x+w-.35]:
                for pz in [z+.35,z+d-.35]:
                    box("terrace pier",px,pz,0,.6,.6,y-.32,cream,True)

templates = {}
def asset(kind, name, x, z, y=0, size=1, angle=0, block=False):
    if name == "bench":
        # The source pack's bench reads as a tall single chair at avatar scale.
        # Build a low three-seat timber bench with a single solid envelope.
        along = abs(angle) == 90
        def plank(label, dx, dz, dy, w, d, h, mat):
            return box(label, x+(dz if along else dx), z+(dx if along else dz), y+dy,
                d if along else w, w if along else d, h, mat)
        for dx in [-size*.38, size*.38]:
            plank("bench leg",dx,0,0,.12,.64,.48,metal)
            plank("bench back support",dx,-.28,.45,.09,.09,.7,metal)
        for dz in [-.22,0,.22]: plank("bench seat",0,dz,.46,size,.19,.09,wood)
        for dy in [.79,1.05]: plank("bench back",0,-.3,dy,size,.09,.16,wood)
        world["blockers"].append(dict(x=x-(.36 if along else size/2),z=z-(size/2 if along else .36),
            width=.72 if along else size,depth=size if along else .72,y=y,height=1.2))
        return None
    key = kind+"/"+name
    if key not in templates:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(ASSETS / "source" / kind / (name+".glb")))
        imported = [o for o in set(bpy.data.objects)-before if o.type == "MESH"]
        bpy.ops.object.select_all(action="DESELECT")
        for o in imported: o.select_set(True)
        bpy.context.view_layer.objects.active = imported[0]
        bpy.ops.object.join()
        t = bpy.context.object
        # Kenney's glTF root carries the Y-up conversion. Bake the FULL world
        # matrix before dropping the import hierarchy, not only the local pose.
        t.data.transform(t.matrix_world)
        t.parent = None
        t.matrix_world = Matrix.Identity(4)
        lo = Vector([min(v.co[i] for v in t.data.vertices) for i in range(3)])
        hi = Vector([max(v.co[i] for v in t.data.vertices) for i in range(3)])
        center = (lo+hi)/2
        scale = 1/max(hi.x-lo.x, hi.y-lo.y) if kind == "furniture" else 1/(hi.z-lo.z)
        for v in t.data.vertices:
            v.co = (v.co-Vector((center.x,center.y,lo.z)))*scale
        # Palette unifies CC0 meshes with existing angular Avatar Studio kits.
        for slot in t.material_slots:
            n = slot.material.name.lower()
            slot.material = (wood if "wood" in n else cloth if "carpet" in n or "fabric" in n
                else leaf if any(v in n for v in ["leaf", "green", "grass", "plant"]) else rock if "dirt" in n else metal if "metal" in n
                else cream if "pot" in n else slot.material)
        templates[key] = t.data
        bpy.data.objects.remove(t, do_unlink=True)
    o = bpy.data.objects.new(name, templates[key])
    bpy.context.collection.objects.link(o)
    o.location=(x,-z,y)
    o.scale=(size,size,size)
    o.rotation_euler.z=math.radians(angle)
    if block:
        # Keep original mesh materials; calculate transformed physical envelope.
        bpy.context.view_layer.update()
        p=[o.matrix_world@Vector(c) for c in o.bound_box]
        lo=[min(c[i] for c in p) for i in range(3)]
        hi=[max(c[i] for c in p) for i in range(3)]
        world["blockers"].append(dict(x=round(lo[0],4),z=round(-hi[1],4),width=round(hi[0]-lo[0],4),depth=round(hi[1]-lo[1],4),y=round(lo[2],4),height=round(hi[2]-lo[2],4)))
    return o

def planter(x,z,y=0,length=3):
    box("sandstone planter",x,z,y,length,1.5,.75,stone,True)
    box("planter soil",x,z,y+.75,length-.2,1.25,.05,rock)
    for dx in [-length*.3,0,length*.3]:
        asset("nature","grass_leafsLarge",x+dx,z,y+.76,1.3,random.randrange(360))

def lantern(x,z,y=0):
    box("lantern foot",x,z,y,.38,.38,.12,metal)
    box("lantern glass",x,z,y+.12,.26,.26,.42,gold)
    box("lantern cap",x,z,y+.54,.4,.4,.08,metal)
    for dx in [-.15,.15]:
        for dz in [-.15,.15]: box("lantern frame",x+dx,z+dz,y+.12,.035,.035,.43,metal)

def lounge(x,z,y=2.4):
    for dx in [-5,5]:
        for dz in [-3.5,3.5]:
            box("pergola column",x+dx,z+dz,y,.18,.18,3.4,metal,True)
    for dz in [-3.5,3.5]: box("pergola lintel",x,z+dz,y+3.35,10.4,.2,.22,metal)
    for dx in [-5,0,5]: box("pergola crossbeam",x+dx,z,y+3.36,.16,7.4,.2,metal)
    # Narrow open strips admit light and leave the avatars visible from above.
    for dx in [-2.5,2.5]:
        mesh("wine sail", [(x+dx-2.25,y+3.42,z-3.4),(x+dx-2.25,y+3.42,z+1),
             (x+dx+2.25,y+3.42,z+1),(x+dx+2.25,y+3.42,z-3.4)],[(0,1,2,3)],cloth)
    asset("furniture","loungeSofa",x,z-2.2,y,2.6,0,True)
    asset("furniture","loungeChair",x-2.4,z+.4,y,1.2,-90,True)
    asset("furniture","loungeChair",x+2.4,z+.4,y,1.2,90,True)
    asset("furniture","tableCoffee",x,z+.1,y,1.6,0,True)
    asset("furniture","pottedPlant",x+4,z-2.3,y,1.1)
    lantern(x-.4,z+.1,y+.5)

lounge(-15,-19)
lounge(-45,21)
lounge(19,-21)
for x,z,y in [(-22,-11,2.4),(-13,-11,2.4),(-52,29,2.4),(-43,29,2.4),(14,-13,2.4),
               (-29,5,0),(-29,20,0),(12,7,0),(12,21,0),(-33,40,0),(40,-27,0),(46,-43,0)]:
    planter(x,z,y)
    lantern(x+1,z,y+.78)
for x,z,y,angle in [(-18,27,0,0),(-8,27,0,0),(2,27,0,0),(-29,12,0,90),
                    (12,14,0,90),(-57,34,0,0),(-47,34,0,0),(-31,47,0,90),
                    (16,-34,0,90),(44,-34,0,90),(51,-46,0,0),(-16,-11,2.4,0)]:
    asset("furniture","bench",x,z,y,3,angle,True)

# Edges protect terrace drops; ramp entries and both bridge ends remain open.
rail("perch front",-16,-10,2.4,15)
rail("perch left",-24,-17,2.4,14,"z")
rail("west front",-47,30,2.4,13)
rail("west left",-54,23,2.4,14,"z")
rail("garden front",16.5,-12,2.4,9)
rail("garden right",26,-19,2.4,14,"z")
for z in [-19,-15]: rail("bridge rail",4,z,2.4,15.8)

def marking(x,z,w,d): box("pitch chalk",x,z,.026,w,d,.008,white)
def pitch(x,z,w,d):
    for dz in [-d/2,d/2]: marking(x,z+dz,w,.1)
    for dx in [-w/2,w/2,0]: marking(x+dx,z,.1,d)
    for dx in [-w/2,w/2]:
        direction = 1 if dx<0 else -1
        marking(x+dx+direction*3,z,.1,d*.48)
        for dz in [-d*.24,d*.24]: marking(x+dx+direction*1.5,z+dz,3,.1)
    vertices=[]
    for i in range(97):
        a=i*math.tau/96
        for r in [d*.17,d*.17+.1]: vertices.append((x+math.cos(a)*r,.036,z+math.sin(a)*r))
    mesh("center circle",vertices,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(96)],white)
pitch(-8,13,30,20)
pitch(29,-32,18,16)

# Arrival court, banners, picnic tables and informal warm-up lawn.
for x,z in [(-52,50),(-42,50),(47,-55),(56,-55)]:
    asset("furniture","table",x,z,0,1.5,0,True)
    for dz in [-1.5,1.5]: asset("furniture","bench",x,z+dz,0,2.5,0,True)
for x,z in [(-60,56),(-36,37),(9,-8),(43,-46)]:
    box("banner mast",x,z,0,.15,.15,4.4,metal,True)
    box("wine banner",x+.8,z,2.1,1.5,.07,2.2,cloth)
    box("banner stripe",x+.8,z-.045,2.3,1.3,.015,.055,cream)
    lantern(x,z,4.4)

# Planting and faceted rock margins use deterministic CC0 originals. Leave
# ground-level routes wide; large trees live at the outer rim, never on pitches.
edge_sites=[]
for x in range(-69,70,6):
    for z in range(-69,70,6):
        if supported(x,z) and any(not supported(x+dx,z+dz) for dx,dz in [(4,0),(-4,0),(0,4),(0,-4)]):
            edge_sites.append((x,z))
for i,(x,z) in enumerate(edge_sites):
    asset("nature","rock_largeA",x,z,-1.3,random.uniform(2,3.1),random.randrange(360))
    if i%2==0:
        asset("nature","tree_oak" if i%4==0 else "tree_small",x,z,0,random.uniform(3.6,5.2),random.randrange(360))
        # Only the trunk is solid; canopy must not create invisible walls.
        world["blockers"].append(dict(x=x-.28,z=z-.28,width=.56,depth=.56,y=0,height=2))
    else:
        asset("nature","plant_bush",x,z,0,1.5,random.randrange(360))

# Each pitch's separate models share these authored physical boundaries.
for pitch_object in world["objects"]:
    if pitch_object["behavior"] != "soccer": continue
    cfg=pitch_object["config"]; origin=pitch_object["position"]
    def boundary(x,y,z,w,h,d):
        world["blockers"].append(dict(x=origin["x"]+x-w/2,z=origin["z"]+z-d/2,y=y-h/2,width=w,height=h,depth=d))
    for sign in [-1,1]:
        gx=sign*(cfg["halfLength"]+.45)
        for z in [-2.4,2.4]: boundary(gx,1.225,z,.15,2.45,.15)
        boundary(gx,2.375,0,.15,.15,4.95)
        boundary(gx+sign*1.3,.98,0,.035,1.96,4.8)
        for z in [-2.36,2.36]: boundary(gx+sign*.65,1.05,z,1.3,2.1,.025)
    for x in [-2.4,2.4]: boundary(x-5,1.5,-cfg["halfWidth"]-3,.9,3,.9)
    boundary(-5,3.15,-cfg["halfWidth"]-3,6.5,2.4,.48)
assert len(world["blockers"]) <= 200, len(world["blockers"])
world_path.write_text(json.dumps(world, indent=2)+"\n")

# Split shared meshes by material, then merge within each district. This retains
# useful frustum culling while reducing repeated furniture to a bounded draw set.
bpy.ops.object.select_all(action="DESELECT")
for o in list(bpy.context.scene.objects):
    if o.type != "MESH": continue
    # Material separation/join mutate meshes. Detach each reused instance first
    # so an earlier join cannot expand the geometry of later instances.
    o.data = o.data.copy()
    o.select_set(True)
    bpy.context.view_layer.objects.active=o
    if len(o.data.materials)>1:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.separate(type="MATERIAL")
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
groups={}
for o in bpy.context.scene.objects:
    if o.type != "MESH": continue
    center=o.matrix_world @ (sum((Vector(c) for c in o.bound_box),Vector())/8)
    district=min(range(5), key=lambda i:(center.x-centers[i])**2+(center.y-centers[i])**2)
    key=(district,o.data.materials[0].name if o.data.materials else "none")
    groups.setdefault(key,[]).append(o)
for (district,name), objects in groups.items():
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    bpy.context.object.name=f"district {district} / {name}"
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=str(OUT/"team-campus.glb"),export_format="GLB",
    use_selection=True,export_animations=False,export_cameras=False,export_lights=False)

# Reproducible overview for art review (not a substitute for runtime screenshots).
scene=bpy.context.scene
scene.world.color=(.65,.69,.62)
scene.world.use_nodes = True
scene.world.node_tree.nodes.get("Background").inputs["Color"].default_value = (.72,.75,.67,1)
scene.world.node_tree.nodes.get("Background").inputs["Strength"].default_value = .7
bpy.ops.object.light_add(type="AREA",location=(-20,-35,70))
bpy.context.object.data.energy=55000
bpy.context.object.data.shape="DISK"
bpy.context.object.data.size=70
bpy.ops.object.camera_add(location=(105,-105,124))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat("-Z","Y").to_euler()
camera.data.type="ORTHO"
camera.data.ortho_scale=218
camera.data.clip_end=500
scene.camera=camera
scene.render.engine="CYCLES"
scene.cycles.samples=24
scene.render.resolution_x=2400
scene.render.resolution_y=900
scene.render.resolution_percentage=100
scene.view_settings.view_transform="AgX"
scene.render.image_settings.file_format="PNG"
scene.render.filepath=str(ROOT/"outputs/campus/blender-overview.png")
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/"team-campus.blend"))
if "--skip-render" not in sys.argv: bpy.ops.render.render(write_still=True)
print(json.dumps(dict(meshes=len(groups),blockers=len(world["blockers"]),glb_bytes=(OUT/"team-campus.glb").stat().st_size)))
