import { smoothTerrain, calculateTerrainStats, createHeightmapVisualization } from './terrain-utils.js';

// Function to generate an STL file from elevation data
export function generateSTL(demData, settings) {
  console.log('Generating STL with settings:', settings);

  const { width, height, data, bbox } = demData;
  const {
    width: modelWidth,
    length: modelLength,
    verticalExaggeration,
    layerThickness,
    smoothness
  } = settings;

  // Apply smoothing if requested
  const smoothedData = smoothTerrain(data, width, height, parseFloat(smoothness));

  // Calculate model dimensions
  const physicalWidth = parseFloat(modelWidth);
  const physicalLength = parseFloat(modelLength);

  // Parse vertical exaggeration - ensure it's at least 1
  const verticalScale = Math.max(1, parseFloat(verticalExaggeration));

  // Find min and max elevation for scaling
  const stats = calculateTerrainStats(smoothedData);
  const minElevation = stats.min;
  const maxElevation = stats.max;
  const elevationRange = stats.range;

  // Calculate base thickness (minimum 2mm)
  const baseThickness = 2;

  // Calculate model height based on elevation range and vertical exaggeration
  // Scale the height so that the model has a reasonable aspect ratio
  const aspectRatio = Math.max(physicalWidth, physicalLength) / Math.min(physicalWidth, physicalLength);
  const targetHeightRatio = 0.3; // Target height is 30% of the largest dimension
  const maxDimension = Math.max(physicalWidth, physicalLength);
  const scaledModelHeight = maxDimension * targetHeightRatio;

  // Calculate scaling factor to achieve the target height
  // When verticalScale is 1, we use the base scaling factor
  // When verticalScale > 1, we multiply by that factor
  const baseScalingFactor = scaledModelHeight / elevationRange;
  const finalVerticalScale = baseScalingFactor * verticalScale;

  // Calculate cell dimensions
  const cellWidth = physicalWidth / (width - 1);
  const cellLength = physicalLength / (height - 1);

  // Calculate maximum height of the model
  const maxModelHeight = elevationRange * finalVerticalScale;

  // Generate binary STL file
  // Binary STL format:
  // - 80-byte header (usually ignored)
  // - 4-byte unsigned integer (number of triangles)
  // - For each triangle:
  //   - 3 floats for normal vector (12 bytes)
  //   - 3 floats for vertex 1 (12 bytes)
  //   - 3 floats for vertex 2 (12 bytes)
  //   - 3 floats for vertex 3 (12 bytes)
  //   - 2-byte attribute byte count (usually 0)

  // Calculate number of triangles
  // For a completely solid model:
  // - 2 triangles per grid cell for the terrain surface
  // - 2 triangles for the bottom face
  // - 4 triangles per edge cell for the side walls
  const numCells = (width - 1) * (height - 1);
  const numTerrainTriangles = numCells * 2;
  const numBaseTriangles = 2; // Bottom face

  // Calculate wall triangles - only for the perimeter cells
  const numPerimeterCells = 2 * (width - 1) + 2 * (height - 3);
  const numWallTriangles = numPerimeterCells * 2;

  // Calculate total triangles - use a more conservative approach
  const numTriangles = numTerrainTriangles + numBaseTriangles + numWallTriangles;

  console.log(`Generating STL with ${numTriangles} triangles`);
  console.log(`- Terrain surface: ${numTerrainTriangles}`);
  console.log(`- Base: ${numBaseTriangles}`);
  console.log(`- Walls: ${numWallTriangles}`);

  // Create buffer for binary STL with extra padding to avoid buffer overflows
  const triangleSize = 50; // bytes per triangle (12 for normal, 36 for vertices, 2 for attribute)
  const bufferSize = 84 + (triangleSize * numTriangles) + 1024; // Header + triangles + safety padding
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // Write header (80 bytes, usually ignored)
  const header = "Terrain model generated by Interactive World Map";
  for (let i = 0; i < 80; i++) {
    if (i < header.length) {
      view.setUint8(i, header.charCodeAt(i));
    } else {
      view.setUint8(i, 0);
    }
  }

  // Write number of triangles (4-byte unsigned integer)
  view.setUint32(80, numTriangles, true);

  let offset = 84; // Start after header and triangle count
  let triangleCount = 0; // Keep track of actual triangles written

  // Helper function to add a triangle to the binary STL
  function addTriangleToBinary(v1, v2, v3) {
    // Safety check to prevent buffer overflow
    if (offset + triangleSize > bufferSize) {
      console.error("Buffer overflow prevented. Skipping triangle.");
      return;
    }

    // Calculate normal vector
    const normal = calculateNormal(v1, v2, v3);

    // Write normal vector (3 floats)
    view.setFloat32(offset, normal[0], true); offset += 4;
    view.setFloat32(offset, normal[1], true); offset += 4;
    view.setFloat32(offset, normal[2], true); offset += 4;

    // Write vertex 1 (3 floats)
    view.setFloat32(offset, v1[0], true); offset += 4;
    view.setFloat32(offset, v1[1], true); offset += 4;
    view.setFloat32(offset, v1[2], true); offset += 4;

    // Write vertex 2 (3 floats)
    view.setFloat32(offset, v2[0], true); offset += 4;
    view.setFloat32(offset, v2[1], true); offset += 4;
    view.setFloat32(offset, v2[2], true); offset += 4;

    // Write vertex 3 (3 floats)
    view.setFloat32(offset, v3[0], true); offset += 4;
    view.setFloat32(offset, v3[1], true); offset += 4;
    view.setFloat32(offset, v3[2], true); offset += 4;

    // Write attribute byte count (2 bytes, usually 0)
    view.setUint16(offset, 0, true); offset += 2;

    triangleCount++;
  }

  // Add base (bottom plate)
  addTriangleToBinary([0, 0, 0], [physicalWidth, 0, 0], [0, physicalLength, 0]);
  addTriangleToBinary([physicalWidth, 0, 0], [physicalWidth, physicalLength, 0], [0, physicalLength, 0]);

  // Generate terrain surface and walls
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      // Get elevations for the four corners of this cell
      const z1 = getScaledElevation(smoothedData[y * width + x], minElevation, finalVerticalScale, baseThickness);
      const z2 = getScaledElevation(smoothedData[y * width + (x + 1)], minElevation, finalVerticalScale, baseThickness);
      const z3 = getScaledElevation(smoothedData[(y + 1) * width + x], minElevation, finalVerticalScale, baseThickness);
      const z4 = getScaledElevation(smoothedData[(y + 1) * width + (x + 1)], minElevation, finalVerticalScale, baseThickness);

      // Calculate coordinates
      const x1 = x * cellWidth;
      const x2 = (x + 1) * cellWidth;
      const y1 = y * cellLength;
      const y2 = (y + 1) * cellLength;

      // Add two triangles to form a quad for the terrain surface
      addTriangleToBinary([x1, y1, z1], [x2, y1, z2], [x1, y2, z3]);
      addTriangleToBinary([x2, y1, z2], [x2, y2, z4], [x1, y2, z3]);

      // Add side walls if this cell is at the edge
      if (x === 0) {
        // Left wall
        addTriangleToBinary([x1, y1, 0], [x1, y2, 0], [x1, y1, z1]);
        addTriangleToBinary([x1, y2, 0], [x1, y2, z3], [x1, y1, z1]);
      }

      if (x === width - 2) {
        // Right wall
        addTriangleToBinary([x2, y1, 0], [x2, y1, z2], [x2, y2, 0]);
        addTriangleToBinary([x2, y1, z2], [x2, y2, z4], [x2, y2, 0]);
      }

      if (y === 0) {
        // Front wall
        addTriangleToBinary([x1, y1, 0], [x1, y1, z1], [x2, y1, 0]);
        addTriangleToBinary([x1, y1, z1], [x2, y1, z2], [x2, y1, 0]);
      }

      if (y === height - 2) {
        // Back wall
        addTriangleToBinary([x1, y2, 0], [x2, y2, 0], [x1, y2, z3]);
        addTriangleToBinary([x2, y2, 0], [x2, y2, z4], [x1, y2, z3]);
      }
    }
  }

  console.log(`Actually wrote ${triangleCount} triangles`);

  // Update the triangle count in the header to match what we actually wrote
  view.setUint32(80, triangleCount, true);

  // Create a preview image
  const previewImage = createHeightmapVisualization(smoothedData, width, height);

  // Store model dimensions for the 3D preview
  const modelDimensions = {
    width: physicalWidth,
    length: physicalLength,
    height: baseThickness + maxModelHeight
  };

  // Create a new buffer with the exact size needed
  const finalBuffer = new ArrayBuffer(84 + (triangleSize * triangleCount));
  const finalView = new DataView(finalBuffer);

  // Copy the data from the original buffer to the final buffer
  const originalArray = new Uint8Array(buffer, 0, 84 + (triangleSize * triangleCount));
  const finalArray = new Uint8Array(finalBuffer);
  finalArray.set(originalArray);

  return {
    stlBuffer: finalBuffer,
    previewImage: previewImage,
    modelDimensions: modelDimensions,
    stats: {
      minElevation,
      maxElevation,
      elevationRange,
      maxModelHeight: baseThickness + maxModelHeight,
      triangleCount: triangleCount,
      verticalScaleFactor: verticalScale,
      baseScalingFactor: baseScalingFactor
    }
  };
}

// Helper function to calculate normal vector for a triangle
function calculateNormal(v1, v2, v3) {
  // Calculate vectors from v1 to v2 and v1 to v3
  const a = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
  const b = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];

  // Calculate cross product
  const normal = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];

  // Normalize
  const length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
  if (length > 0) {
    normal[0] /= length;
    normal[1] /= length;
    normal[2] /= length;
  }

  return normal;
}

// Helper function to scale elevation values to model dimensions
function getScaledElevation(elevation, minElevation, verticalScale, baseThickness) {
  // Scale elevation directly using the vertical scale factor
  return baseThickness + (elevation - minElevation) * verticalScale;
}

// Function to download STL file
export function downloadSTL(stlResult, filename) {
  const { stlBuffer, previewImage, stats, modelDimensions } = stlResult;

  // Create STL blob from binary buffer
  const blob = new Blob([stlBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  // Show preview and stats with download link
  showModelPreview(previewImage, stats, filename, url, stlBuffer, modelDimensions);
}

// Function to show model preview and statistics
function showModelPreview(previewImage, stats, filename, downloadUrl, stlBuffer, modelDimensions) {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  document.body.appendChild(overlay);

  // Create preview container
  const previewContainer = document.createElement('div');
  previewContainer.className = 'model-preview';
  document.body.appendChild(previewContainer);

  // Add title
  const title = document.createElement('h3');
  title.textContent = `3D Model Preview: ${filename}`;
  previewContainer.appendChild(title);

  // Create a container for the 3D preview
  const preview3DContainer = document.createElement('div');
  preview3DContainer.id = 'preview-3d';
  preview3DContainer.className = 'preview-3d';
  previewContainer.appendChild(preview3DContainer);

  // Add model information
  const infoDiv = document.createElement('div');
  infoDiv.className = 'model-info';
  infoDiv.innerHTML = `
    <p><strong>Model Type:</strong> Fully Solid Terrain Model (Ready for 3D Printing)</p>
  `;
  previewContainer.appendChild(infoDiv);

  // Add statistics
  const statsDiv = document.createElement('div');
  statsDiv.className = 'model-stats';
  statsDiv.innerHTML = `
    <p><strong>Elevation Range:</strong> ${stats.minElevation.toFixed(1)}m to ${stats.maxElevation.toFixed(1)}m</p>
    <p><strong>Elevation Difference:</strong> ${stats.elevationRange.toFixed(1)}m</p>
    <p><strong>Width:</strong> ${modelDimensions.width.toFixed(1)}mm</p>
    <p><strong>Length:</strong> ${modelDimensions.length.toFixed(1)}mm</p>
    <p><strong>Height:</strong> ${stats.maxModelHeight.toFixed(1)}mm</p>
    <p><strong>Triangle Count:</strong> ${stats.triangleCount.toLocaleString()}</p>
    <p><strong>Vertical Exaggeration:</strong> ${stats.verticalScaleFactor.toFixed(1)}x</p>
  `;
  previewContainer.appendChild(statsDiv);

  // Create action buttons container
  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'model-actions';
  previewContainer.appendChild(actionsContainer);

  // Add direct download link
  const downloadLink = document.createElement('a');
  downloadLink.href = downloadUrl;
  downloadLink.download = filename;
  downloadLink.className = 'download-button';
  downloadLink.innerHTML = `
    <svg xmlns="http://www.2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
    Download STL File
  `;
  actionsContainer.appendChild(downloadLink);

  // Add close button
  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close Preview';
  closeButton.className = 'close-button';
  closeButton.onclick = () => {
    document.body.removeChild(previewContainer);
    document.body.removeChild(overlay);
    URL.revokeObjectURL(downloadUrl);
  };
  actionsContainer.appendChild(closeButton);

  // Initialize 3D preview
  initializeSTLPreview(preview3DContainer, stlBuffer, modelDimensions);

  // Close on overlay click
  overlay.addEventListener('click', () => {
    document.body.removeChild(previewContainer);
    document.body.removeChild(overlay);
    URL.revokeObjectURL(downloadUrl);
  });

  // Prevent closing when clicking on the preview itself
  previewContainer.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

// Function to initialize 3D preview of STL model
function initializeSTLPreview(container, stlBuffer, modelDimensions) {
  // Load Three.js dynamically
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.min.js';
  script.onload = () => {
    // Load STL loader after Three.js is loaded
    const stlLoaderScript = document.createElement('script');
    stlLoaderScript.src = 'https://cdn.jsdelivr.net/npm/three@0.132.2/examples/js/loaders/STLLoader.js';
    stlLoaderScript.onload = () => {
      // Load OrbitControls after STL loader is loaded
      const orbitControlsScript = document.createElement('script');
      orbitControlsScript.src = 'https://cdn.jsdelivr.net/npm/three@0.132.2/examples/js/controls/OrbitControls.js';
      orbitControlsScript.onload = () => {
        // Now that all dependencies are loaded, initialize the 3D preview
        setupSTLPreview(container, stlBuffer, modelDimensions);
      };
      document.head.appendChild(orbitControlsScript);
    };
    document.head.appendChild(stlLoaderScript);
  };
  document.head.appendChild(script);
}

// Function to set up the 3D preview
function setupSTLPreview(container, stlBuffer, modelDimensions) {
  const THREE = window.THREE;

  // Create scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

  // Create camera
  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.set(0, -modelDimensions.length * 1.5, modelDimensions.height * 2);

  // Create renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  // Add lights
  const ambientLight = new THREE.AmbientLight(0x888888);
  scene.add(ambientLight);

  const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight1.position.set(1, 1, 1);
  scene.add(directionalLight1);

  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight2.position.set(-1, -1, 1);
  scene.add(directionalLight2);

  // Add controls with enhanced options for full movement
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.25;
  controls.screenSpacePanning = true; // Enable panning in screen space
  controls.enablePan = true; // Enable panning
  controls.panSpeed = 0.8; // Adjust pan speed
  controls.enableRotate = true; // Enable rotation
  controls.rotateSpeed = 0.8; // Adjust rotation speed
  controls.enableZoom = true; // Enable zooming
  controls.zoomSpeed = 1.2; // Adjust zoom speed
  controls.maxPolarAngle = Math.PI; // Allow full rotation (no restriction)

  // Load STL from buffer
  const loader = new THREE.STLLoader();
  const geometry = loader.parse(stlBuffer);

  // Center the geometry
  geometry.computeBoundingBox();
  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z / 2); // Only center XY, keep Z at bottom

  // Create material with cross-section capability
  const material = new THREE.MeshPhongMaterial({
    color: 0x1976d2,
    specular: 0x111111,
    shininess: 30,
    flatShading: true,
    side: THREE.DoubleSide, // Render both sides of faces
    transparent: false,
    opacity: 1.0
  });

  // Create mesh
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // Add grid helper
  const gridHelper = new THREE.GridHelper(Math.max(modelDimensions.width, modelDimensions.length) * 1.5, 10);
  gridHelper.rotation.x = Math.PI / 2;
  gridHelper.position.z = -0.001; // Slightly below the model -0.01
  scene.add(gridHelper);

  // Add axes helper
  const axesHelper = new THREE.AxesHelper(Math.max(modelDimensions.width, modelDimensions.length) * 0.5);
  scene.add(axesHelper);

  // Add instructions
  const instructions = document.createElement('div');
  instructions.style.position = 'absolute';
  instructions.style.bottom = '10px';
  instructions.style.left = '10px';
  instructions.style.color = '#555';
  instructions.style.fontSize = '12px';
  instructions.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
  instructions.style.padding = '5px';
  instructions.style.borderRadius = '3px';
  instructions.innerHTML = 'Left-click: Rotate | Right-click: Pan | Scroll: Zoom';
  container.appendChild(instructions);

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  // Handle window resize
  window.addEventListener('resize', () => {
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    }
  });
}
