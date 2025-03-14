import 'leaflet-defaulticon-compatibility';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import L from 'leaflet';
import { fetchDEMData, setSelectedDemType } from './dem-service.js';
import { generateSTL, downloadSTL } from './stl-generator.js';

document.addEventListener('DOMContentLoaded', () => {
  const map = L.map('map').setView([0, 0], 2);

  // OpenStreetMap layer
  const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });

  // Digital Terrain Model (DEM) layer - Open Topo Map
  const openTopoMapLayer = L.tileLayer('https://tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
  }).addTo(map); // Set Open Topo Map as default

  // Add a scale control
  L.control.scale().addTo(map);

  // Layer control
  const baseMaps = {
    "OpenStreetMap": osmLayer,
    "Open Topo Map": openTopoMapLayer,
  };

  L.control.layers(baseMaps).addTo(map);

  // Set max bounds to prevent map from repeating
  const southWest = L.latLng(-90, -180);
  const northEast = L.latLng(90, 180);
  const bounds = L.latLngBounds(southWest, northEast);

  map.setMaxBounds(bounds);
  map.on('drag', function() {
    map.panInsideBounds(bounds, { animate: false });
  });

  map.setMinZoom(2);

  // Bounding Box Drawing Functionality
  let drawingMode = false;
  let startPoint = null;
  let rectangle = null;
  let boundingBoxes = JSON.parse(localStorage.getItem('boundingBoxes')) || [];
  let bboxLayers = [];

  const drawBboxButton = document.getElementById('draw-bbox-button');
  const bboxList = document.getElementById('bbox-list');
  const bboxPanel = document.getElementById('bbox-panel');

  // Function to update the bounding box list in the panel
  function updateBboxList() {
    bboxList.innerHTML = '';
    boundingBoxes.forEach((bbox, index) => {
      const listItem = document.createElement('li');

      // Calculate default width and length if not already defined
      if (bbox.width === undefined || bbox.length === undefined) {
        bbox.length = 100;
        bbox.width = calculateDefaultWidth(bbox);
      }

      listItem.innerHTML = `
        <div class="bbox-title-container">
          <span style="font-weight: bold; color: red;">${bbox.name || `Box ${index + 1}`}</span>
          <button class="rename-button" data-index="${index}">Rename</button>
        </div>
        <div class="coordinates">
          <span style="color: blue;">North: ${bbox.northeastLat.toFixed(4)}</span>
          <span style="color: blue;">South: ${bbox.southwestLat.toFixed(4)}</span>
          <span style="color: blue;">West: ${bbox.southwestLng.toFixed(4)}</span>
          <span style="color: blue;">East: ${bbox.northeastLng.toFixed(4)}</span>
        </div>
        <div class="action-buttons">
          <button class="toggle-button" data-index="${index}">${bbox.visible ? 'Hide' : 'Show'}</button>
          <button class="delete-button" data-index="${index}">Delete</button>
        </div>
        <div class="generation-settings">
          <h4>3D Model Settings</h4>
          <label for="width-${index}">Width (mm):</label>
          <input type="number" id="width-${index}" data-index="${index}" value="${bbox.width.toFixed(2)}">

          <label for="length-${index}">Length (mm):</label>
          <input type="number" id="length-${index}" data-index="${index}" value="${bbox.length.toFixed(2)}">

          <label for="vertical-exaggeration-${index}">Vertical Exaggeration:</label>
          <input type="number" id="vertical-exaggeration-${index}" data-index="${index}" value="${bbox.verticalExaggeration || 1}">

          <label for="layer-thickness-${index}">Layer Thickness (mm):</label>
          <input type="number" id="layer-thickness-${index}" data-index="${index}" value="${bbox.layerThickness || 0.2}">

          <label for="smoothness-${index}">Smoothness:</label>
          <input type="number" id="smoothness-${index}" data-index="${index}" value="${bbox.smoothness || 0}">

          <button class="generate-button" data-index="${index}">Generate 3D Model</button>

          <label for="dem-type-${index}">DEM Source:</label>
          <select id="dem-type-${index}" data-index="${index}">
            <option value="SRTMGL3" ${bbox.demType === 'SRTMGL3' ? 'selected' : ''}>SRTMGL3 (SRTM GL3 90m)</option>
            <option value="SRTMGL1" ${bbox.demType === 'SRTMGL1' ? 'selected' : ''}>SRTMGL1 (SRTM GL1 30m)</option>
            <option value="SRTMGL1_E" ${bbox.demType === 'SRTMGL1_E' ? 'selected' : ''}>SRTMGL1_E (SRTM GL1 Ellipsoidal 30m)</option>
            <option value="AW3D30" ${bbox.demType === 'AW3D30' ? 'selected' : ''}>AW3D30 (ALOS World 3D 30m)</option>
            <option value="AW3D30_E" ${bbox.demType === 'AW3D30_E' ? 'selected' : ''}>AW3D30_E (ALOS World 3D Ellipsoidal, 30m)</option>
            <option value="SRTM15Plus" ${bbox.demType === 'SRTM15Plus' ? 'selected' : ''}>SRTM15Plus (Global Bathymetry SRTM15+ V2.1 500m)</option>
            <option value="NASADEM" ${bbox.demType === 'NASADEM' ? 'selected' : ''}>NASADEM (NASADEM Global DEM)</option>
            <option value="COP30" ${bbox.demType === 'COP30' ? 'selected' : ''}>COP30 (Copernicus Global DSM 30m)</option>
            <option value="COP90" ${bbox.demType === 'COP90' ? 'selected' : ''}>COP90 (Copernicus Global DSM 90m)</option>
            <option value="EU_DTM" ${bbox.demType === 'EU_DTM' ? 'selected' : ''}>EU_DTM (DTM 30m)</option>
            <option value="GEDI_L3" ${bbox.demType === 'GEDI_L3' ? 'selected' : ''}>GEDI_L3 (DTM 1000m)</option>
            <option value="GEBCOIceTopo" ${bbox.demType === 'GEBCOIceTopo' ? 'selected' : ''}>GEBCOIceTopo (Global Bathymetry 500m)</option>
            <option value="GEBCOSubIceTopo" ${bbox.demType === 'GEBCOSubIceTopo' ? 'selected' : ''}>GEBCOSubIceTopo (Global Bathymetry 500m)</option>
          </select>
        </div>
      `;
      listItem.dataset.index = index; // Store the index in the list item
      bboxList.appendChild(listItem);

      // Rename button functionality
      listItem.querySelector('.rename-button').addEventListener('click', () => {
        const newName = prompt('Enter new name for the bounding box:', bbox.name || `Box ${index + 1}`);
        if (newName) {
          bbox.name = newName;
          updateBboxList();
          localStorage.setItem('boundingBoxes', JSON.stringify(boundingBoxes));
        }
      });

      // Delete button functionality
      listItem.querySelector('.delete-button').addEventListener('click', () => {
        if (bboxLayers[index]) {
          map.removeLayer(bboxLayers[index]);
        }
        bboxLayers.splice(index, 1); // Remove the layer from the array
        boundingBoxes.splice(index, 1); // Remove the bounding box from the array
        updateBboxList();
        localStorage.setItem('boundingBoxes', JSON.stringify(boundingBoxes));
      });

      // Toggle visibility button functionality
      listItem.querySelector('.toggle-button').addEventListener('click', () => {
        bbox.visible = !bbox.visible;
        localStorage.setItem('boundingBoxes', JSON.stringify(boundingBoxes));

        if (bboxLayers[index]) {
          bboxLayers[index].setStyle({ opacity: bbox.visible ? 1 : 0, fillOpacity: bbox.visible ? 0.2 : 0 });
        }
        updateBboxList();
      });

      // DEM type select functionality
      listItem.querySelector(`#dem-type-${index}`).addEventListener('change', (event) => {
        const demType = event.target.value;
        bbox.demType = demType;
        localStorage.setItem('boundingBoxes', JSON.stringify(boundingBoxes));
      });

      // Generate button functionality
      listItem.querySelector('.generate-button').addEventListener('click', () => {
        const index = parseInt(listItem.dataset.index, 10);
        // Retrieve the settings
        const width = document.getElementById(`width-${index}`).value;
        const length = document.getElementById(`length-${index}`).value;
        const verticalExaggeration = document.getElementById(`vertical-exaggeration-${index}`).value;
        const layerThickness = document.getElementById(`layer-thickness-${index}`).value;
        const smoothness = document.getElementById(`smoothness-${index}`).value;
        const demType = document.getElementById(`dem-type-${index}`).value;

        // Store the settings in the boundingBoxes array
        bbox.width = parseFloat(width);
        bbox.length = parseFloat(length);
        bbox.verticalExaggeration = parseFloat(verticalExaggeration);
        bbox.layerThickness = parseFloat(layerThickness);
        bbox.smoothness = parseFloat(smoothness);
        bbox.demType = demType;

        localStorage.setItem('boundingBoxes', JSON.stringify(boundingBoxes));
        setSelectedDemType(demType);

        // Generate 3D model
        generate3DModel(bbox);
      });

      // Event listeners for input changes with real-time updates
      const widthInput = listItem.querySelector(`#width-${index}`);
      const lengthInput = listItem.querySelector(`#length-${index}`);

      widthInput.addEventListener('input', (event) => {
        const index = parseInt(event.target.dataset.index, 10);
        const value = parseFloat(event.target.value);
        
        if (!isNaN(value) && value > 0) {
          boundingBoxes[index].width = value;
          boundingBoxes[index].length = calculateLinkedLength(boundingBoxes[index]);
          lengthInput.value = boundingBoxes[index].length.toFixed(2);
          localStorage.setItem('boundingBoxes', JSON.stringify(boundingBoxes));
        }
      });

      lengthInput.addEventListener('input', (event) => {
        const index = parseInt(event.target.dataset.index, 10);
        const value = parseFloat(event.target.value);
        
        if (!isNaN(value) && value > 0) {
          boundingBoxes[index].length = value;
          boundingBoxes[index].width = calculateLinkedWidth(boundingBoxes[index]);
          widthInput.value = boundingBoxes[index].width.toFixed(2);
          localStorage.setItem('boundingBoxes', JSON.stringify(boundingBoxes));
        }
      });

      // Event listeners for other inputs
      listItem.querySelectorAll('input[type="number"]').forEach(input => {
        if (input.id.includes('width') || input.id.includes('length')) {
          return; // Skip width and length inputs as they're handled above
        }
        
        input.addEventListener('change', (event) => {
          const index = parseInt(event.target.dataset.index, 10);
          const setting = event.target.id.replace(`-${index}`, '');
          const value = parseFloat(event.target.value);
          
          boundingBoxes[index][setting] = value;
          localStorage.setItem('boundingBoxes', JSON.stringify(boundingBoxes));
        });
      });
    });
  }

  // Function to calculate the default width based on the aspect ratio and a fixed length
  function calculateDefaultWidth(bbox) {
    const defaultLength = 100; // mm
    const aspectRatio = calculateAspectRatio(bbox);
    return defaultLength * aspectRatio;
  }

  // Function to calculate the aspect ratio of a bounding box
  function calculateAspectRatio(bbox) {
    // Calculate the width/length ratio based on the geographic coordinates
    const latDiff = bbox.northeastLat - bbox.southwestLat;
    const lngDiff = bbox.northeastLng - bbox.southwestLng;
    
    // Convert to approximate distances
    const latDistanceKm = latDiff * 111.32; // 1 degree of latitude is approximately 111.32 km
    const lngDistanceKm = lngDiff * 111.32 * Math.cos(((bbox.northeastLat + bbox.southwestLat) / 2) * Math.PI / 180);
    
    return lngDistanceKm / latDistanceKm;
  }

  // Function to calculate linked length based on width and aspect ratio
  function calculateLinkedLength(bbox) {
    const aspectRatio = calculateAspectRatio(bbox);
    return bbox.width / aspectRatio;
  }

  // Function to calculate linked width based on length and aspect ratio
  function calculateLinkedWidth(bbox) {
    const aspectRatio = calculateAspectRatio(bbox);
    return bbox.length * aspectRatio;
  }

  // Function to initialize bounding boxes from local storage on page load
  function initializeBBoxes() {
    boundingBoxes.forEach((bbox, index) => {
      // Ensure width and length are defined, calculate if not
      if (bbox.width === undefined || bbox.length === undefined) {
        bbox.length = 100;
        bbox.width = calculateDefaultWidth(bbox);
      }

      const bounds = [[bbox.southwestLat, bbox.southwestLng], [bbox.northeastLat, bbox.northeastLng]];
      const rect = L.rectangle(bounds, { color: 'blue', weight: 1, opacity: bbox.visible ? 1 : 0, fillOpacity: bbox.visible ? 0.2 : 0 });
      bboxLayers.push(rect);
      rect.addTo(map);
    });
  }

  initializeBBoxes();
  updateBboxList();

  drawBboxButton.addEventListener('click', () => {
    drawingMode = !drawingMode;
    if (drawingMode) {
      drawBboxButton.textContent = 'Cancel Drawing';
      map.getContainer().style.cursor = 'crosshair';
      map.dragging.disable(); // Disable map dragging
    } else {
      drawBboxButton.textContent = 'Draw Bounding Box';
      map.getContainer().style.cursor = '';
      map.dragging.enable(); // Enable map dragging
      if (rectangle) {
        map.removeLayer(rectangle);
        rectangle = null;
      }
      startPoint = null;
    }
  });

  map.on('mousedown', (e) => {
    if (!drawingMode) return;

    startPoint = e.latlng;
  });

  map.on('mousemove', (e) => {
    if (!drawingMode || !startPoint) return;

    let endPoint = e.latlng;
    let bounds = [startPoint, endPoint];

    if (rectangle) {
      map.removeLayer(rectangle);
    }

    rectangle = L.rectangle(bounds, { color: 'red', weight: 1 }).addTo(map);
  });

  map.on('mouseup', (e) => {
    if (!drawingMode || !startPoint) return;

    drawingMode = false;
    drawBboxButton.textContent = 'Draw Bounding Box';
    map.getContainer().style.cursor = '';
    map.dragging.enable(); // Enable map dragging

    if (rectangle) {
      map.removeLayer(rectangle);
      rectangle = null;
    }

    let endPoint = e.latlng;

    const southwestLat = Math.min(startPoint.lat, endPoint.lat);
    const southwestLng = Math.min(startPoint.lng, endPoint.lng);
    const northeastLat = Math.max(startPoint.lat, endPoint.lat);
    const northeastLng = Math.max(startPoint.lng, endPoint.lng);

    const newBbox = {
      southwestLat: southwestLat,
      southwestLng: southwestLng,
      northeastLat: northeastLat,
      northeastLng: northeastLng,
      visible: true, // Initially visible
      name: `Box ${boundingBoxes.length + 1}`, // Set default name
      demType: 'SRTMGL1' // Default DEM type
    };

    // Calculate initial width and length
    newBbox.length = 100;
    newBbox.width = calculateDefaultWidth(newBbox);

    boundingBoxes.push(newBbox);
    const rect = L.rectangle([[southwestLat, southwestLng], [northeastLat, northeastLng]], { color: 'blue', weight: 1, opacity: 1, fillOpacity: 0.2 });
    bboxLayers.push(rect);
    rect.addTo(map);

    localStorage.setItem('boundingBoxes', JSON.stringify(boundingBoxes));
    updateBboxList();

    startPoint = null;
  });

  map.on('mouseout', () => {
    if (drawingMode && startPoint && rectangle) {
      drawingMode = false;
      drawBboxButton.textContent = 'Draw Bounding Box';
      map.getContainer().style.cursor = '';
      map.dragging.enable(); // Enable map dragging
      if (rectangle) {
        map.removeLayer(rectangle);
        rectangle = null;
      }
      startPoint = null;
    }
  });

  // Function to generate 3D model from DEM data
  async function generate3DModel(bbox) {
    try {
      // Create loading indicator
      const loadingIndicator = document.createElement('div');
      loadingIndicator.className = 'loading-indicator';
      loadingIndicator.innerHTML = `
        <div class="loading-spinner"></div>
        <p>Generating 3D model for ${bbox.name || 'Selected Area'}...</p>
        <div class="progress-container">
          <div class="progress-bar" id="progress-bar"></div>
        </div>
      `;
      document.body.appendChild(loadingIndicator);
      
      // Update progress bar
      const progressBar = loadingIndicator.querySelector('#progress-bar');
      progressBar.style.width = '10%';
      
      // Step 1: Fetch DEM data for the bounding box
      updateLoadingText(loadingIndicator, 'Fetching elevation data...');
      const demData = await fetchDEMData(bbox);
      progressBar.style.width = '50%';
      
      // Step 2: Generate STL from DEM data
      updateLoadingText(loadingIndicator, 'Generating 3D model...');
      const settings = {
        width: bbox.width,
        length: bbox.length,
        verticalExaggeration: bbox.verticalExaggeration,
        layerThickness: bbox.layerThickness,
        smoothness: bbox.smoothness
      };
      
      const stlResult = generateSTL(demData, settings);
      progressBar.style.width = '90%';
      
      // Step 3: Download the STL file
      updateLoadingText(loadingIndicator, 'Preparing download...');
      const filename = `${bbox.name || 'terrain'}.stl`;
      
      // Short delay to show 100% progress
      setTimeout(() => {
        progressBar.style.width = '100%';
        
        // Remove loading indicator
        setTimeout(() => {
          document.body.removeChild(loadingIndicator);
          
          // Download the STL file
          downloadSTL(stlResult, filename);
          
          // Show success message
          showSuccessMessage(`3D model for ${bbox.name || 'Selected Area'} has been generated successfully!`);
        }, 500);
      }, 500);
      
    } catch (error) {
      console.error('Error generating 3D model:', error);
      
      // Remove loading indicator if it exists
      const loadingIndicator = document.querySelector('.loading-indicator');
      if (loadingIndicator) {
        document.body.removeChild(loadingIndicator);
      }
      
      // Show error message
      alert(`Error generating 3D model: ${error.message}`);
    }
  }
  
  // Helper function to update loading text
  function updateLoadingText(loadingIndicator, text) {
    const textElement = loadingIndicator.querySelector('p');
    textElement.textContent = text;
  }
  
  // Helper function to show success message
  function showSuccessMessage(message) {
    const successMessage = document.createElement('div');
    successMessage.className = 'success-message';
    successMessage.textContent = message;
    document.body.appendChild(successMessage);
    
    // Remove after 4 seconds
    setTimeout(() => {
      if (document.body.contains(successMessage)) {
        document.body.removeChild(successMessage);
      }
    }, 4000);
  }
});
