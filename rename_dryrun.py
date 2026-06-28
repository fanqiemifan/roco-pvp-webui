#!/usr/bin/env python3
import os
import re
from collections import defaultdict

img_dir = "/Users/john/Documents/GitHub/pvp-webUI-for-roco/img"
os.chdir(img_dir)

files = [f for f in os.listdir('.') if f.endswith('.png')]

groups = defaultdict(list)

for f in files:
    m = re.match(r'^(NO\.\d+)_(.+)\.png$', f)
    if m:
        num = m.group(1)
        name = m.group(2)
        
        m2 = re.match(r'^(.+)-(\d+)$', name)
        if m2:
            base_name = m2.group(1)
            suffix = int(m2.group(2))
        else:
            base_name = name
            suffix = 0
        
        key = f"{num}_{base_name}"
        groups[key].append((suffix, f))

print("=== Dry run - showing what would happen ===\n")

for key in sorted(groups.keys()):
    items = groups[key]
    if len(items) == 1:
        continue
    
    print(f"=== {key} ({len(items)} files) ===")
    
    no_suffix = [(s, f) for s, f in items if s == 0]
    with_suffix = [(s, f) for s, f in items if s > 0]
    
    with_suffix.sort(key=lambda x: x[0], reverse=True)
    for s, f in with_suffix:
        new_suffix = s + 1
        new_name = f"{key}-{new_suffix}.png"
        print(f"  Would rename: {f} -> {new_name}")
    
    no_suffix.sort(key=lambda x: x[1])
    for i, (s, f) in enumerate(no_suffix):
        new_name = f"{key}-{i+1}.png"
        print(f"  Would rename: {f} -> {new_name}")
    
    print()