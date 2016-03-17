#!/usr/bin/env bash

# Navigate to the root of the repository.
cd "$(dirname "${BASH_SOURCE}")/..";

# Create the output directory, and make sure it’s empty.
DIST_DIR='dist';
if [ -d "${DIST_DIR}" ]; then
	rm -rf -- "${DIST_DIR}";
fi;
mkdir -p "${DIST_DIR}";

# Copy `data/*` into `dist/*`, while compressing images.
echo "Copying JSON-formatted data…";
cp -R data/*.json "${DIST_DIR}/";
echo "Compressing PNG images…";
imagemin data/*.png "${DIST_DIR}/";

cd "${DIST_DIR}";

# Generate `dist/Automap-without-markers.zip`.
file="Automap-without-markers.zip";
echo "Generating maps without markers…";
tibia-maps --from-data=../data --output-dir=Automap --no-markers;
echo "Saving maps without markers as \`${DIST_DIR}/${file}\`…";
zip -q -FS -r "${file}" Automap --exclude */.git* */.DS_Store;
# Preserve `dist/Automap-without-markers/*.map`.
mv Automap Automap-without-markers;

# Generate `dist/Automap-with-markers.zip`.
file="Automap-with-markers.zip";
echo "Generating maps with markers…";
tibia-maps --from-data=../data --output-dir=Automap;
echo "Saving maps without markers as \`${DIST_DIR}/${file}\`…";
zip -q -FS -r "${file}" Automap --exclude */.git* */.DS_Store;
# Preserve `dist/Automap-with-markers/*.map`.
mv Automap Automap-with-markers;

# Create optimized versions of each `*.map` file, intended for online map
# viewer usage. Only the map data is needed; the pathfinding data and marker
# data can be removed.
echo "Generating truncated & compressed map files for online mapper…";
mkdir -p mapper;
for map in Automap-without-markers/*.map; do
	file="$(basename ${map})";
	head -c 65536 "${map}" > "mapper/${file}";
done;

echo "All done.";
