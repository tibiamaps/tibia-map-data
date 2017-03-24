#!/usr/bin/env bash

# Navigate to the root of the repository.
cd "$(dirname "${BASH_SOURCE}")/..";

# Create the output directory, and make sure it’s empty.
DIST_DIR='dist';
if [ -d "${DIST_DIR}" ]; then
	rm -rf -- "${DIST_DIR}";
fi;
mkdir -p "${DIST_DIR}";

# Copy `data/*` into `dist/*`, while compressing JSON and images.
echo 'Compressing JSON-formatted data…';
for file in data/*.json; do
	jsesc --object --json < "${file}" > "${DIST_DIR}/$(basename ${file})";
done;
echo 'Compressing PNG images…';
imagemin data/*.png "${DIST_DIR}/";

cd "${DIST_DIR}";

# Generate `dist/Automap-without-markers.zip`.
suffix='without-markers.zip';
echo 'Generating maps without markers…';
tibia-maps --from-data=../data --output-dir=Automap --no-markers;
echo "Saving maps without markers as \`${DIST_DIR}/Automap-${suffix}\`…";
zip -q -FS -r "Automap-${suffix}" Automap --exclude */.git* */.DS_Store;
echo "Saving minimap maps without markers as \`${DIST_DIR}/minimap-${suffix}\`…";
#imagemin minimap/*.png --out-dir=minimap;
zip -q -FS -r "minimap-${suffix}" minimap --exclude */.git* */.DS_Store;
tibia-maps --from-data=../data --flash-export-file=./maps-without-markers.exp --no-markers;
file='export-without-markers.zip';
echo "Saving maps export file without markers as \`${DIST_DIR}/${file}\`…";
zip -q "${file}" maps-without-markers.exp;
rm maps-without-markers.exp;
# Preserve `dist/{Automap,minimap}-without-markers`.
mv Automap Automap-without-markers;
mv minimap minimap-without-markers;

# Generate `dist/Automap-with-markers.zip`.
suffix='with-markers.zip';
echo 'Generating maps with markers…';
tibia-maps --from-data=../data --output-dir=Automap;
echo "Saving maps without markers as \`${DIST_DIR}/Automap-${suffix}\`…";
zip -q -FS -r "Automap-${suffix}" Automap --exclude */.git* */.DS_Store;
echo "Saving minimap maps without markers as \`${DIST_DIR}/minimap-${suffix}\`…";
#imagemin minimap/*.png --out-dir=minimap;
zip -q -FS -r "minimap-${suffix}" minimap --exclude */.git* */.DS_Store;
tibia-maps --from-data=../data --flash-export-file=./maps-with-markers.exp;
file='export-with-markers.zip';
echo "Saving maps export file with markers as \`${DIST_DIR}/${file}\`…";
zip -q -FS "${file}" maps-with-markers.exp;
rm maps-with-markers.exp;
# Preserve `dist/{Automap,minimap}-with-markers`.
mv Automap Automap-with-markers;
mv minimap minimap-with-markers;

# Generate `walkable-tiles.json`.
# https://tibiamaps.io/blog/walkable-tile-count
echo 'Saving the total number of walkable tiles as `walkable-tiles.json`…';
for file in Automap-without-markers/*.map; do
	# Get just the pathfinding data, and count only walkable tiles.
	# In other words, discard 0xFA (unexplored) and 0xFF (non-walkable) bytes.
	# https://tibiamaps.io/guides/map-file-format#pathfinding-data
	dd if="${file}" skip=65536 count=65536 \
		iflag=skip_bytes,count_bytes status=none | \
		tr -d $'\xFA\xFF' | \
		wc -c;
done | awk '{s+=$1} END {print s}' | tee walkable-tiles.json;

# Create optimized versions of each `*.map` file, intended for online map
# viewer usage. Only the map data is needed; the pathfinding data and marker
# data can be removed.
echo 'Generating truncated & compressed map files for online mapper…';
mkdir -p mapper;
for map in Automap-without-markers/*.map; do
	file="$(basename ${map})";
	head -c 65536 "${map}" > "mapper/${file}";
done;
# Generate a list of known tile IDs, for online map viewers to use as a
# whitelist.
# Note: in Bash, file redirection occurs *before* the command is executed.
# Because `tiles.json` shouldn’t get an entry in, well, `tiles.json`, we create
# it outside of the `mapper` folder first, and move it afterwards.
python -c 'import os, json; print json.dumps([name[0:8] for name in os.listdir("mapper")], separators=(",", ":"))' > tiles.json;
mv tiles.json mapper/tiles.json;

echo "All done.";
