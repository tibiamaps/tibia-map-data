#!/usr/bin/env bash

id="$(date +%Y-%m-%d)";

tibia-maps --from-data=./data --output-dir=./Automap --no-markers;
zip -q -r "Automap-${id}-without-markers.zip" Automap --exclude *.git* .DS_Store;

tibia-maps --from-data=./data --output-dir=./Automap;
zip -q -r "Automap-${id}-with-markers.zip" Automap --exclude *.git* .DS_Store;
