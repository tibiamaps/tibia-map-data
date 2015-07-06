# Tibia map data

This repository hosts (almost) fully explored [Tibia](https://secure.tibia.com/) maps in a custom format that is more suitable for version control systems than [the original, binary format](http://www.tibiamaps.org/into-the-automap-format-c-client/).

[The `tibia-maps` script](https://github.com/tibiamaps/tibia-maps-script) can be used to convert from either format to the other.

## Set up

1. Install [io.js](https://iojs.org/en/).

2. Install the `tibia-maps` command-line utility:

    ```sh
    npm install -g tibia-maps
    ```

3. Clone this repository and `cd` to it in your favorite terminal.

## `*.map` → `*.png` + `*.json`

_If you’ve added new markers or explored new areas in-game, and you want to contribute them to our map data, then this is what you’re looking for. Copy the new map files to the `Automap` directory before continuing._

To generate PNGs for the maps + pathfinding visualization and JSON for the marker data based on the map files in the `Automap` directory, run:

    ```bash
    tibia-maps --from-maps=./Automap --output-dir=./data
    ```

The output is saved in the `data` directory.

## `*.png` + `*.json` → `*.map`

_If you’ve modified marker data by editing the JSON files, and you’re looking to contribute those changes back to our map data, then this is what you’re looking for._

To generate Tibia-compatible map files based on the PNGs and JSON files in the `data` directory, run:

    ```bash
    tibia-maps --from-maps=./Automap-new --output-dir=./data
    ```

The output is saved in the `Automap-new` directory.

## Maintainer

| [![twitter/mathias](https://gravatar.com/avatar/24e08a9ea84deb17ae121074d0f17125?s=70)](https://twitter.com/mathias "Follow @mathias on Twitter") |
|---|
| [Mathias Bynens](https://mathiasbynens.be/) |
