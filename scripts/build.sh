#!/usr/bin/env bash

# Navigate to the root of the repository.
cd "$(dirname "${BASH_SOURCE}")/..";

# Create the output directory, and make sure it’s empty.
DIST_DIR='dist';
if [ -d "${DIST_DIR}" ]; then
	rm -rf -- "${DIST_DIR}";
fi;
mkdir -p "${DIST_DIR}";
# Speed up GitHub Pages build + deploy times.
touch "${DIST_DIR}/.nojekyll";

# Copy `data/*` into `dist/*`, while compressing JSON and images.
echo 'Compressing JSON-formatted data…';
for file in data/*.json; do
	jsesc --object --json < "${file}" > "${DIST_DIR}/$(basename ${file})";
done;
jsesc --object --json < extra/points-of-interest/markers.json > "${DIST_DIR}/poi-markers.json";
echo 'Compressing PNG images…';
imagemin data/*.png --out-dir="${DIST_DIR}";

cd "${DIST_DIR}";

echo 'Generating minimap folders…';
tibia-maps --from-data=../data --output-dir=./minimap;
# Note: minimap images cannot be optimized — their color palette must be
# preserved.
echo "Saving minimap maps with markers as \`${DIST_DIR}/minimap-with-markers.zip\`…";
zip -q -FS -r "minimap-with-markers.zip" minimap --exclude */.git* */.DS_Store;
echo "Saving minimap maps without markers as \`${DIST_DIR}/minimap-without-markers.zip\`…";
zip -q -FS -r "minimap-without-markers.zip" minimap --exclude */minimapmarkers.bin */.git* */.DS_Store;

# Preserve `dist/minimap-{with,without}-markers`.
mv minimap minimap-with-markers;
cp -r minimap-with-markers minimap-without-markers;
rm minimap-without-markers/minimapmarkers.bin;

echo 'Generating minimap folders with grid overlay…';
tibia-maps --from-data=../data --output-dir=./minimap --overlay-grid;
echo "Saving minimap maps with grid overlay and markers as \`${DIST_DIR}/minimap-with-grid-overlay-and-markers.zip\`…";
zip -q -FS -r "minimap-with-grid-overlay-and-markers.zip" minimap --exclude */.git* */.DS_Store;

echo "Saving minimap maps with grid overlay without markers as \`${DIST_DIR}/minimap-with-grid-overlay-without-markers.zip\`…";
zip -q -FS -r "minimap-with-grid-overlay-without-markers.zip" minimap --exclude */minimapmarkers.bin */.git* */.DS_Store;

# Preserve `dist/minimap-with-grid-overlay-{and,without}-markers`.
mv minimap minimap-with-grid-overlay-and-markers;
cp -r minimap-with-grid-overlay-and-markers minimap-with-grid-overlay-without-markers;
rm minimap-with-grid-overlay-without-markers/minimapmarkers.bin;

# Create specialized version with only the Points of Interest markers.
mv ../data/markers.json ../data/markers.json.bak;
cp ../extra/points-of-interest/markers.json ../data/markers.json;
tibia-maps --from-data=../data --output-dir=./minimap --overlay-grid;
mv ../data/markers.json.bak ../data/markers.json;
echo "Saving minimap maps with grid overlay and PoI markers as \`${DIST_DIR}/minimap-with-grid-overlay-and-poi-markers.zip\`…";
zip -q -FS -r "minimap-with-grid-overlay-and-poi-markers.zip" minimap --exclude */.git* */.DS_Store;

# Preserve `dist/minimap-with-grid-overlay-and-poi-markers`.
cp -r minimap minimap-with-grid-overlay-and-poi-markers;

# Generate `walkable-tiles.json`.
# https://tibiamaps.io/blog/walkable-tile-count
echo 'Saving the total number of walkable tiles as `walkable-tiles.json`…';
tibia-count-walkable-tiles ../data/floor-*-path.png > walkable-tiles.json;

# Create optimized versions of each map tile, intended for online map viewer
# usage. Only the map data is needed; the pathfinding data and marker data can
# be removed.
echo 'Generating optimized images for the online mapper…';
mkdir -p mapper;
imagemin minimap-without-markers/Minimap_Color_*.png --out-dir=mapper;

# Generate a list of known tile IDs, for online map viewers to use as a
# whitelist.
# Note: in Bash, file redirection occurs *before* the command is executed.
# Because `tiles.json` shouldn’t get an entry in, well, `tiles.json`, we create
# it outside of the `mapper` folder first, and move it afterwards.
python -c 'import os, json; print(json.dumps([name.split(".")[0][14:] for name in os.listdir("mapper") if "_Color_" in name], separators=(",", ":")))' > tiles.json;
mv tiles.json mapper/tiles.json;

echo 'All done.';
