# DEM2STL-To3DPrinter
Web application to create 3D topography/bathymetry models of regions selected by drawing bounding boxes on top of a world map.

Hope you can find it interesting.

Carmelo

## Setup

1. Clone the repository
2. Install dependencies with `npm install`
3. Create a configuration file for API keys:
   - Copy `src/config.example.js` to `src/config.js`
   - Replace the placeholder API key with your actual OpenTopography API key
4. Start the development server with `npm run dev`

## API Keys

This application uses the OpenTopography API to fetch elevation data. You'll need to:

1. Register for an API key at [OpenTopography](https://portal.opentopography.org/developer)
2. Add your API key to the `src/config.js` file

Note: The `config.js` file is excluded from version control to keep your API key private.
