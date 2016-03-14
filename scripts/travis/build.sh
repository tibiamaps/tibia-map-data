#!/usr/bin/env bash

# Navigate to the root of the repository.
cd "$(dirname "${BASH_SOURCE}")/../..";

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

# Generate `dist/Automap-without-markers.zip`.
file="Automap-without-markers.zip";
echo "Generating maps without markers…";
tibia-maps --from-data=./data --output-dir="${DIST_DIR}/Automap" --no-markers;
echo "Saving maps without markers as \`${DIST_DIR}/${file}\`…";
zip -q -FS -r "${DIST_DIR}/${file}" "${DIST_DIR}/Automap" --exclude */.git* */.DS_Store;
# Preserve `dist/Automap-without-markers/*.map`.
mv "${DIST_DIR}/Automap" "${DIST_DIR}/Automap-without-markers";

# Generate `dist/Automap-with-markers.zip`.
file="Automap-with-markers.zip";
echo "Generating maps with markers…";
tibia-maps --from-data=./data --output-dir="${DIST_DIR}/Automap";
echo "Saving maps without markers as \`${DIST_DIR}/${file}\`…";
zip -q -FS -r "${DIST_DIR}/${file}" "${DIST_DIR}/Automap" --exclude */.git* */.DS_Store;
# Preserve `dist/Automap-with-markers/*.map`.
mv "${DIST_DIR}/Automap" "${DIST_DIR}/Automap-with-markers";

# Create truncated & compressed (`*.map.gz`) versions of each `*.map` file.
# Since these are only useful for online map viewers, only the map data is
# needed; the pathfinding data and marker data can be removed.
echo "Generating truncated & compressed map files for online mapper…";
mkdir -p "${DIST_DIR}/mapper";
for map in "${DIST_DIR}"/Automap-without-markers/*.map; do
	head -c 65536 "${map}" | gzip -c > "${DIST_DIR}/mapper/$(basename ${map}).gz";
done;

echo "All done.";
