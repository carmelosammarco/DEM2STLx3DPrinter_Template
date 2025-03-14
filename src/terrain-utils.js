/**
 * Terrain Utilities - Helper functions for terrain processing
 */

// Apply smoothing to elevation data
export function smoothTerrain(elevationData, width, height, smoothness) {
  if (smoothness <= 0) {
    return elevationData; // No smoothing needed
  }
  
  // Create a copy of the elevation data
  const smoothedData = new Float32Array(elevationData.length);
  
  // Apply Gaussian blur for smoothing
  const iterations = Math.min(5, Math.ceil(smoothness));
  let currentData = elevationData;
  
  for (let i = 0; i < iterations; i++) {
    // Apply a simple box blur
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        
        // Sample neighboring cells (3x3 kernel)
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              sum += currentData[ny * width + nx];
              count++;
            }
          }
        }
        
        smoothedData[y * width + x] = sum / count;
      }
    }
    
    // Use the smoothed data for the next iteration
    currentData = smoothedData.slice();
  }
  
  return smoothedData;
}

// Calculate terrain statistics
export function calculateTerrainStats(elevationData) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  
  for (let i = 0; i < elevationData.length; i++) {
    const value = elevationData[i];
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
  }
  
  const mean = sum / elevationData.length;
  
  // Calculate standard deviation
  let sumSquaredDiff = 0;
  for (let i = 0; i < elevationData.length; i++) {
    const diff = elevationData[i] - mean;
    sumSquaredDiff += diff * diff;
  }
  
  const stdDev = Math.sqrt(sumSquaredDiff / elevationData.length);
  
  return {
    min,
    max,
    mean,
    range: max - min,
    stdDev
  };
}

// Create a heightmap visualization of the terrain
export function createHeightmapVisualization(elevationData, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  // Find min and max elevation for normalization
  const stats = calculateTerrainStats(elevationData);
  
  // Create an ImageData object
  const imageData = ctx.createImageData(width, height);
  
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}
