"""Additional authored landscape models for the BE6 edition.

Execute this file in build_kit.py's namespace, then call
build_environment_assets() after clear_scene() and before exporting the kit.
The kit's existing geometry/material helpers are deliberately reused.
"""
import math
import random
from mathutils import Vector


def _env_branch(name, start, end, radius, material):
    direction = Vector(end) - Vector(start)
    branch = cylinder(name, radius, direction.length,
                      tuple((Vector(start) + Vector(end)) * 0.5), material, verts=9)
    branch.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
    return branch


def _env_tree(name, seed, tall=False):
    """A branching, layered crown with an intentionally open lower canopy."""
    rng = random.Random(seed)
    bark = mat('landscape_bark', srgb(0x725442), roughness=0.96)
    greens = [mat('landscape_leaf_' + str(i), srgb(colour), roughness=0.91)
              for i, colour in enumerate((0x315D3E, 0x477B48, 0x62934D))]
    h = 6.8 if tall else 5.2
    parts = [_env_branch(name + '_trunk', (0, 0, 0), (0.09, 0, h * 0.73), 0.18, bark)]
    # Root flares ground the tree; visible branching gives it a real silhouette.
    for i in range(5):
        a = i * math.tau / 5
        parts.append(_env_branch(name + '_root_' + str(i),
                     (math.cos(a) * 0.42, math.sin(a) * 0.42, 0.035),
                     (0, 0, 0.5), 0.075, bark))
    for i in range(9):
        a = i * 2.39996 + rng.uniform(-0.15, 0.15)
        level = i / 8
        reach = (1.0 - level * 0.57) * (1.15 if tall else 1.4)
        z = h * (0.48 + level * 0.35)
        end = (math.cos(a) * reach, math.sin(a) * reach, z + 0.43)
        parts.append(_env_branch(name + '_branch_' + str(i),
                     (0.03, 0, z - 0.8), end, 0.055 - level * 0.02, bark))
        # Small overlapping leaf masses, not one smooth sphere: three tones
        # and an irregular silhouette still read clearly from a driving camera.
        for j in range(3):
            centre = (end[0] + rng.uniform(-0.44, 0.44),
                      end[1] + rng.uniform(-0.44, 0.44), end[2] + rng.uniform(-0.1, 0.5))
            crown = ico(name + '_leaves_' + str(i) + '_' + str(j),
                        0.67 + rng.random() * 0.27, centre,
                        greens[(i + j) % len(greens)], subdiv=2)
            crown.scale = (1.0, 0.85 + rng.random() * 0.3, 0.82)
            # Perturb each lobe slightly so the outer contour avoids a repeated
            # geometric shape while keeping a small, reusable mesh.
            for vert in crown.data.vertices:
                vert.co *= 0.93 + rng.random() * 0.14
            parts.append(crown)
    top = ico(name + '_top', 0.85, (0.05, 0, h - 0.32), greens[2], subdiv=2)
    top.scale = (0.85, 0.9, 1.1)
    parts.append(top)
    tree = join(name, parts, origin=(0, 0, 0))
    smooth(tree, angle=75)
    return tree


def build_environment_assets():
    _env_tree('tree', 206, False)
    _env_tree('tree_tall', 608, True)
    earth = mat('landscape_mulch', srgb(0x685443), roughness=1.0)
    leaf = mat('landscape_shrub', srgb(0x547C40), roughness=0.92)
    flower = mat('landscape_flower', srgb(0xE9BF64), roughness=0.85)
    parts = [cylinder('planting_soil', 1.05, 0.06, (0, 0, 0.03), earth, verts=16)]
    for i in range(7):
        angle = i * 2.4
        reach = 0.32 + (i % 3) * 0.18
        x, y = math.cos(angle) * reach, math.sin(angle) * reach
        bush = ico('planting_shrub_' + str(i), 0.38, (x, y, 0.28), leaf, subdiv=2)
        bush.scale.z = 0.62
        parts.append(bush)
        if i % 2 == 0:
            blossom = ico('planting_flower_' + str(i), 0.065, (x, y, 0.51), flower, subdiv=1)
            parts.append(blossom)
    bed = join('planting_bed', parts, origin=(0, 0, 0))
    smooth(bed, angle=65)
    make_bench()
    make_bin()
