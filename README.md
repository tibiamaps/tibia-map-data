# Tibia map data [![Build status](https://travis-ci.org/tibiamaps/tibia-map-data.svg)](https://travis-ci.org/tibiamaps/tibia-map-data)

This repository hosts (almost) fully explored [Tibia](https://secure.tibia.com/) maps in a custom format that is more suitable for version control systems than [the original, binary format](https://tibiamaps.io/guides/map-file-format).

[The `tibia-maps` script](https://github.com/tibiamaps/tibia-maps-script) can be used to convert from either format to the other.

The custom format consists of three files for each floor:

1. a PNG image containing the entire map;
2. a PNG image visualizing the pathfinding data;
3. a JSON file containing the marker info, if any.

## Using the PNGs

Feel free to use the generated data in your own projects. For example, if you need Tibia maps in PNG format, you could hotlink the following URLs:

* [`https://tibiamaps.github.io/tibia-map-data/floor-00-map.png`](https://tibiamaps.github.io/tibia-map-data/floor-00-map.png)
* [`https://tibiamaps.github.io/tibia-map-data/floor-01-map.png`](https://tibiamaps.github.io/tibia-map-data/floor-01-map.png)
* [`https://tibiamaps.github.io/tibia-map-data/floor-02-map.png`](https://tibiamaps.github.io/tibia-map-data/floor-02-map.png)
* [`https://tibiamaps.github.io/tibia-map-data/floor-03-map.png`](https://tibiamaps.github.io/tibia-map-data/floor-03-map.png)
* [`https://tibiamaps.github.io/tibia-map-data/floor-04-map.png`](https://tibiamaps.github.io/tibia-map-data/floor-04-map.png)
* [`https://tibiamaps.github.io/tibia-map-data/floor-05-map.png`](https://tibiamaps.github.io/tibia-map-data/floor-05-map.png)
* [`https://tibiamaps.github.io/tibia-map-data/floor-06-map.png`](https://tibiamaps.github.io/tibia-map-data/floor-06-map.png)
* [`https://tibiamaps.github.io/tibia-map-data/floor-07-map.png`](https://tibiamaps.github.io/tibia-map-data/floor-07-map.png) (i.e. ground floor)
* [`https://tibiamaps.github.io/tibia-map-data/floor-08-map.png`](https://tibiamaps.github.io/tibia-map-data/floor-08-map.png)
* [`https://tibiamaps.github.io/tibia-map-data/floor-09-map.png`](https://tibiamaps.github.io/tibia-map-data/floor-09-map.png)
* [`https://tibiamaps.github.io/tibia-map-data/floor-10-map.png`](https://tibiamaps.github.io/tibia-map-data/floor-10-map.png)
* [`https://tibiamaps.github.io/tibia-map-data/floor-11-map.png`](https://tibiamaps.github.io/tibia-map-data/floor-11-map.png)
* [`https://tibiamaps.github.io/tibia-map-data/floor-12-map.png`](https://tibiamaps.github.io/tibia-map-data/floor-12-map.png)
* [`https://tibiamaps.github.io/tibia-map-data/floor-13-map.png`](https://tibiamaps.github.io/tibia-map-data/floor-13-map.png)
* [`https://tibiamaps.github.io/tibia-map-data/floor-14-map.png`](https://tibiamaps.github.io/tibia-map-data/floor-14-map.png)
* [`https://tibiamaps.github.io/tibia-map-data/floor-15-map.png`](https://tibiamaps.github.io/tibia-map-data/floor-15-map.png)

That way, as soon as the maps are updated here, your project gets the same updates automatically.

## Contributing

Did you discover an area that’s missing from our maps? [Let us know!](https://github.com/tibiamaps/tibia-map-data/issues/new)

Not sure where to explore? [View the open issues.](https://github.com/tibiamaps/tibia-map-data/issues?q=is%3Aissue+is%3Aopen)

Alternatively, if you’re comfortable using command-line tools and Git, you could follow the instructions below to work with the map files directly. Use the official Tibia client to update your maps, [convert the maps to PNGs and JSON](#map--png--json), and submit a pull request containing your changes.

These maps are being used by [TibiaMaps.io](https://tibiamaps.io/) and [TibiaWiki](http://tibia.wikia.com/wiki/Mapper), so your contributions will be reflected there!

## Set up

1. Install [Node.js v8+](https://nodejs.org/en/).

2. Install [the `tibia-maps` command-line utility](https://github.com/tibiamaps/tibia-maps-script):

    ```sh
    npm install -g tibia-maps
    ```

3. Clone this repository and `cd` to it in your favorite terminal.

## `minimap/*` → `data/*`

_If you’ve added new markers or explored new areas in-game, and you want to contribute them to our map data, then this is what you’re looking for. Copy the new map files to the `minimap` directory before continuing._

To generate PNGs for the maps + pathfinding visualization and JSON for the marker data based on the map files in the `minimap` directory, run:

```sh
tibia-maps --from-minimap=./minimap --output-dir=./data
```

The output is saved in the `data` directory.

## `data/*` → `minimap/*`

_If you’ve modified marker data by editing the JSON files, and you’re looking to contribute those changes back to our map data, then this is what you’re looking for._

To generate Tibia-compatible `minimap/*` files based on the PNGs and JSON files in the `data` directory, run:

```sh
tibia-maps --from-data=./data --output-dir=./minimap
```

The output is saved in the `minimap` directory.

## Maintainer

| [![twitter/mathias](https://gravatar.com/avatar/24e08a9ea84deb17ae121074d0f17125?s=70)](https://twitter.com/mathias "Follow @mathias on Twitter") |
|---|
| [Mathias Bynens](https://mathiasbynens.be/) |
