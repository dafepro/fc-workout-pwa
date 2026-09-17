"""Author reusable pitch items in an isolated Blender background scene (meters).
blender --background --factory-startup --python tools/team-world/build-pitch-items.py
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/team-world/campus/models'
OUT.mkdir(parents=True,exist_ok=True)
def clear():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0,rough=.65):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    s=m.node_tree.nodes.get('Principled BSDF'); s.inputs['Base Color'].default_value=(*color,1)
    s.inputs['Metallic'].default_value=metal; s.inputs['Roughness'].default_value=rough
    return m
def coord(p): return Vector((p[0],-p[2],p[1]))
def box(name,p,size,material,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=coord(p)); o=bpy.context.object; o.name=name
    o.scale=(size[0],size[2],size[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(material)
    if bevel:
        m=o.modifiers.new('Soft manufactured edges','BEVEL');m.width=bevel;m.segments=2
        bpy.ops.object.modifier_apply(modifier=m.name)
    return o
verts=[];faces=[]
def rope(a,b,r=.011,sides=4):
    a,b=coord(a),coord(b); axis=(b-a).normalized(); ref=Vector((0,0,1))
    if abs(axis.dot(ref))>.9: ref=Vector((1,0,0))
    u=axis.cross(ref).normalized()*r;v=axis.cross(u).normalized()*r;n=len(verts)
    for p in [a,b]:
        for i in range(sides): verts.append(p+u*math.cos(i*math.tau/sides)+v*math.sin(i*math.tau/sides))
    for i in range(sides): faces.append((n+i,n+(i+1)%sides,n+sides+(i+1)%sides,n+sides+i))
    if r>.02: faces.extend([tuple(n+i for i in reversed(range(sides))),tuple(n+sides+i for i in range(sides))])
def ropes_object(name,material):
    global verts,faces
    data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.update()
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);data.materials.append(material)
    verts=[];faces=[];return o
def export(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(name+'.blend')))
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_extras=True,export_animations=False,export_cameras=False,export_lights=False)
clear()
white=mat('Powder-coated ivory alloy',(.81,.83,.77),.25,.38)
net=mat('Woven warm-white rope',(.67,.70,.59),0,.96)
steel=mat('Graphite support steel',(.035,.055,.055),.55,.48)
rubber=mat('Ground feet',(.035,.042,.037),0,.95)
# Mouth x=0, width 4.8, clear height 2.3; back x=1.3.
for z in [-2.4,2.4]:
    rope((0,.075,z),(0,2.375,z),.075,12)
rope((0,2.375,-2.4),(0,2.375,2.4),.075,12)
ropes_object('goal-frame',white)
for z in [-2.4,2.4]:
    rope((0,.06,z),(1.3,.06,z),.045,10)
    rope((1.3,.06,z),(1.3,2.0,z),.04,10)
    rope((0,2.32,z),(1.3,2.0,z),.035,10)
    box('goal-foot',(.02,.055,z),(.3,.11,.28),rubber)
rope((1.3,.06,-2.4),(1.3,.06,2.4),.045,10)
rope((1.3,2.0,-2.4),(1.3,2.0,2.4),.04,10)
ropes_object('goal-rear-supports',steel)
def grid(fn,nu,nv):
    for i in range(nu+1):
        for j in range(nv): rope(fn(i/nu,j/nv),fn(i/nu,(j+1)/nv))
    for j in range(nv+1):
        for i in range(nu): rope(fn(i/nu,j/nv),fn((i+1)/nu,j/nv))
grid(lambda u,v:(1.3+.09*math.sin(u*math.pi)*math.sin(v*math.pi),.09+1.87*v,-2.36+4.72*u),20,9)
grid(lambda u,v:(1.3*v,2.32-.32*v-.10*math.sin(v*math.pi)*math.sin(u*math.pi),-2.36+4.72*u),20,6)
for sign in [-1,1]:
    grid(lambda u,v:(1.3*u,.09+(2.23-.32*u)*v,sign*(2.36-.045*math.sin(u*math.pi)*math.sin(v*math.pi))),6,10)
ropes_object('goal-net',net)
export('pitch-goal-v2')
clear()
burgundy=mat('Burgundy enamel',(.28,.025,.06),.25,.4)
gold=mat('Ochre enamel',(.52,.30,.065),.25,.4)
face=mat('Recessed display face',(.012,.028,.025),.1,.75)
letters=mat('Raised ivory lettering',(.85,.84,.71),.1,.5)
for x in [-2.4,2.4]:
    box('scoreboard-foundation',(x,.12,0),(.9,.24,.9),steel,.08)
    box('scoreboard-leg',(x,1.5,0),(.22,2.8,.22),steel)
    for dz in [-.3,.3]:
        rope((x,.2,dz),(x,1.1,0),.035,8)
ropes_object('scoreboard-braces',steel)
box('scoreboard-housing',(0,3.15,0),(6.5,2.4,.48),steel,.10)
box('scoreboard-burgundy-panel',(-1.58,3.15,.254),(3.04,2.17,.06),burgundy,.04)
box('scoreboard-gold-panel',(1.58,3.15,.254),(3.04,2.17,.06),gold,.04)
for x in [-1.58,1.58]: box('scoreboard-digit-recess',(x,2.99,.3),(2.7,1.45,.07),face,.035)
box('scoreboard-visor',(0,4.36,.14),(6.68,.12,.88),steel,.035)
for x,word in [(-1.58,'BURGUNDY'),(1.58,'GOLD')]:
    curve=bpy.data.curves.new(word,'FONT');curve.body=word;curve.align_x='CENTER';curve.size=.26
    curve.extrude=.009;curve.bevel_depth=.002;curve.bevel_resolution=1;curve.resolution_u=3
    o=bpy.data.objects.new('scoreboard-label-'+word,curve);bpy.context.collection.objects.link(o)
    o.location=coord((x,3.85,.304));o.rotation_euler=(math.pi/2,0,0);curve.materials.append(letters)
    bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o.select_set(False)
export('pitch-scoreboard-v2')
print(json.dumps({'goalBytes':(OUT/'pitch-goal-v2.glb').stat().st_size,'scoreboardBytes':(OUT/'pitch-scoreboard-v2.glb').stat().st_size}))
