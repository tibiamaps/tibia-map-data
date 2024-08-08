#!/usr/bin/env bash

# Navigate to the root of the repository.
cd "$(dirname "${BASH_SOURCE}")/..";

# Ensure `tibia-maps` is in the PATH on CI.
PATH="${PATH}:$(pwd)/node_modules/.bin";

if [ -z "${1}" ]; then
	echo 'No argument supplied. Example usage:';
	echo '';
	echo 'scripts/apply-overlay.sh challenging';
	exit 0;
fi;

if [ 'challenging' != "${1}" ]; then
	echo "Invalid argument. Try 'challenging'.";
	exit 0;
fi;

overlayID="${1}";
for floorID in 00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15; do
	echo "Processing ${floorID}...";
	input_path="./data/floor-${floorID}-map.png";
	overlay_path="./overlays/${overlayID}/floor-${floorID}.png";
	mkdir -p "./data-with-overlays/${overlayID}";
	output_path="./data-with-overlays/${overlayID}/floor-${floorID}-map.png";
	if [ -f "${overlay_path}" ]; then
		magick "${input_path}" \
			\( -clone 0 -fill black -colorize 60% \) \
			-compose over -gravity center -composite \
			"${overlay_path}" -gravity center -compose over -composite \
			"${output_path}";
	else
		# No overlay image; only apply the darkening.
		magick "${input_path}" \
			\( -clone 0 -fill black -colorize 60% \) \
			-compose over -gravity center -composite \
			"${output_path}";
	fi;
done;
cp ./data/bounds.json "./data-with-overlays/${overlayID}/bounds.json";
