#!/usr/bin/env bash

id="$(date +%Y-%m-%d)";

if [ "${1}" != '--with-markers-only' ]; then
	file="Automap-${id}-without-markers.zip";
	echo "Generating maps without markers…";
	tibia-maps --from-data=./data --output-dir=./Automap --no-markers;
	echo "Saving maps without markers as \`${file}\`…";
	zip -q -FS -r "${file}" Automap --exclude */.git* */.DS_Store;
fi;

file="Automap-${id}-with-markers.zip";
echo "Generating maps with markers…";
tibia-maps --from-data=./data --output-dir=./Automap;
echo "Saving maps without markers as \`${file}\`…";
zip -q -FS -r "${file}" Automap --exclude */.git* */.DS_Store;

echo "All done.";
