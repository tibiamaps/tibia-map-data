#!/usr/bin/env bash

# Navigate to the root of the repository.
cd "$(dirname "${BASH_SOURCE}")/..";

# Ensure `tibia-maps` is in the PATH on CI.
PATH="${PATH}:$(pwd)/node_modules/.bin";

if [ -z "${1}" ]; then
	echo 'No argument supplied. Example usage:';
	echo '';
	echo 'scripts/enable-pack.sh orcsoberfest';
	echo 'scripts/enable-pack.sh percht';
	exit 0;
fi;

if [ 'orcsoberfest' != "${1}" ] && [ 'percht' != "${1}" ]; then
	echo "Invalid argument. Try 'orcsoberfest' or 'percht'.";
	exit 0;
fi;

echo 'Generating minimap files…';
tibia-maps --from-data=data --output-dir=minimap;
echo "Merging minimap files from the \`${1}-island\` pack…";
cp -f extra/"${1}"-island/*.png minimap;
echo 'Converting updated minimap back to `data/*`…';
tibia-maps --from-minimap=./minimap --output-dir=./data;
echo 'Updating markers…';
node scripts/enable-marker-pack.mjs "${1}";
