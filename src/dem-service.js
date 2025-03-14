/**
 * DEM Service - Handles fetching and processing Digital Elevation Model data
 */

import * as geotiff from 'geotiff';
import { API_KEYS } from './config.js';

// Default DEM type
let selectedDemType = 'SRTMGL1';

// Function to set the selected DEM type
export function setSelectedDemType(demType) {
  selectedDemType = demType;
}

// Function to fetch DEM data from open source providers
export async function fetchDEMData(bbox) {
  try {
    // Use the Open Topography API to fetch DEM data
    const apiUrl = generateOpenTopographyUrl(bbox, selectedDemType);
    console.log(`Fetching DEM data from: ${apiUrl}`);

    // Fetch the GeoTIFF file
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();

    // Parse the GeoTIFF data
    const tiff = await geotiff.fromArrayBuffer(arrayBuffer);
    const image = await tiff.getImage();
    const width = image.getWidth();
    const height = image.getHeight();
    const data = await image.readRasters();

    // Extract the elevation data from the raster
    const elevationData = data[0];

    // Fill any gaps or NaN values to ensure a solid model
    const filledData = fillGapsInElevationData(elevationData, width, height);

    return {
      width,
      height,
      data: filledData,
      bbox
    };
  } catch (error) {
    console.error('Error fetching DEM data:', error);
    throw new Error('Failed to fetch elevation data');
  }
}

// Function to generate the Open Topography API URL
function generateOpenTopographyUrl(bbox, demType) {
  const { southwestLat, southwestLng, northeastLat, northeastLng } = bbox;

  // Open Topography API endpoint
  const baseUrl = 'https://portal.opentopography.org/API/globaldem?demtype=' + demType;

  // Get API key from config
  const apiKey = API_KEYS.openTopography;

  // Construct the URL with the bounding box and output format
  const url = `${baseUrl}&south=${southwestLat}&north=${northeastLat}&west=${southwestLng}&east=${northeastLng}&outputFormat=GTiff&API_Key=${apiKey}`;

  return url;
}

// Function to fill gaps in elevation data to ensure a solid model
function fillGapsInElevationData(elevationData, width, height) {
  // Create a copy of the data
  const filledData = new Float32Array(elevationData.length);

  // First pass: copy all valid data
  for (let i = 0; i < elevationData.length; i++) {
    filledData[i] = isNaN(elevationData[i]) ? -Infinity : elevationData[i];
  }

  // Second pass: fill any NaN or invalid values with interpolated values
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;

      if (filledData[index] === -Infinity) {
        // This is a gap, fill it with interpolated value
        filledData[index] = interpolateElevation(filledData, x, y, width, height);
      }
    }
  }

  // Third pass: ensure no remaining gaps
  for (let i = 0; i < filledData.length; i++) {
    if (filledData[i] === -Infinity || isNaN(filledData[i])) {
      // If still invalid, use the average elevation
      let sum = 0;
      let count = 0;

      for (let j = 0; j < filledData.length; j++) {
        if (filledData[j] !== -Infinity && !isNaN(filledData[j])) {
          sum += filledData[j];
          count++;
        }
      }

      filledData[i] = count > 0 ? sum / count : 500; // Default to 500 if all values are invalid
    }
  }

  return filledData;
}

// Helper function to interpolate elevation at a gap
function interpolateElevation(data, x, y, width, height) {
  // Find valid neighbors
  const neighbors = [];

  // Check 8 surrounding cells
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue; // Skip the center

      const nx = x + dx;
      const ny = y + dy;

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const value = data[ny * width + nx];
        if (value !== -Infinity && !isNaN(value)) {
          neighbors.push(value);
        }
      }
    }
  }

  // If we have neighbors, return their average
  if (neighbors.length > 0) {
    return neighbors.reduce((sum, val) => sum + val, 0) / neighbors.length;
  }

  // If no valid neighbors, expand the search radius
  for (let radius = 2; radius <= 5; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) < radius && Math.abs(dy) < radius) continue; // Skip inner cells

        const nx = x + dx;
        const ny = y + dy;

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const value = data[ny * width + nx];
          if (value !== -Infinity && !isNaN(value)) {
            neighbors.push(value);
          }
        }
      }
    }

    if (neighbors.length > 0) {
      return neighbors.reduce((sum, val) => sum + val, 0) / neighbors.length;
    }
  }

  // If still no valid neighbors, return a default value
  return 500; // Default elevation
}
