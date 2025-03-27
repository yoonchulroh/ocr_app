// src/App.js
import React, { useState, useEffect, useRef } from 'react';
import Tesseract from 'tesseract.js';
import './App.css';

function App() {
  const [images, setImages] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [coordinates, setCoordinates] = useState({
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0
  });
  const [currentRegionIndex, setCurrentRegionIndex] = useState(0);
  // Shared regions across all images
  const [regions, setRegions] = useState([{
    name: 'Region 1',
    coordinates: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    text: '',
    croppedImageData: null
  }]);
  const [editingRegionName, setEditingRegionName] = useState(null);
  const [newRegionName, setNewRegionName] = useState('');
  const canvasRef = useRef(null);
  // Add new state variable to track click mode
  const [clickMode, setClickMode] = useState("none"); // "none", "ready", "first_click_done"

  // Draw rectangles on image
  const drawRectangles = (img) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set actual canvas dimensions to match image
    canvas.width = img.width;
    canvas.height = img.height;
    
    // Draw the image
    ctx.drawImage(img, 0, 0);
    
    // Draw all regions with different colors
    if (regions.length > 0) {
      regions.forEach((region, index) => {
        // Different color for current region
        ctx.strokeStyle = index === currentRegionIndex ? 'red' : 'blue';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          region.coordinates.minX,
          region.coordinates.minY,
          region.coordinates.maxX - region.coordinates.minX,
          region.coordinates.maxY - region.coordinates.minY
        );
        
        // Add region name label
        ctx.fillStyle = index === currentRegionIndex ? 'red' : 'blue';
        ctx.font = '14px Arial';
        ctx.fillText(region.name, region.coordinates.minX, region.coordinates.minY - 5);
      });
    }
  };

  // Update rectangles when coordinates or regions change
  useEffect(() => {
    if (images[currentImageIndex]) {
      const img = new Image();
      img.src = images[currentImageIndex].url;
      img.onload = () => {
        drawRectangles(img);
        setImageDimensions({ width: img.width, height: img.height });
      };
    }
  }, [coordinates, currentImageIndex, images, currentRegionIndex, regions]);

  // Handle image upload
  const handleImageChange = (e) => {
    if (e.target.files) {
      const newImages = Array.from(e.target.files).map(file => ({
        url: URL.createObjectURL(file),
        filename: file.name,
        results: Array(regions.length).fill(null).map(() => ({
          text: '',
          croppedImageData: null,
          error: false
        }))
      }));
      setImages(prev => [...prev, ...newImages]);
      setCurrentImageIndex(prev => prev + newImages.length - 1);
    }
  };

  // Handle image selection
  const handleImageSelect = (index) => {
    setCurrentImageIndex(index);
    setCurrentRegionIndex(0);
    
    // Update text if available for the current region
    if (images[index]?.results && images[index].results[0]) {
      setText(images[index].results[0].text || '');
    } else {
      setText('');
    }
  };

  // Add a new region
  const addRegion = () => {
    // Create new region object
    const newRegion = {
      name: `Region ${regions.length + 1}`,
      coordinates: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      text: '',
      croppedImageData: null
    };
    
    // Add the new region to shared regions
    setRegions(prev => [...prev, newRegion]);
    
    // Update the images to include results for the new region
    setImages(prev => {
      return prev.map(img => ({
        ...img,
        results: [...(img.results || []), { text: '', croppedImageData: null }]
      }));
    });
    
    // Set the current region to the new one
    setCurrentRegionIndex(regions.length);
    setCoordinates({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
    setText('');
  };

  // Delete current region
  const deleteRegion = () => {
    // Don't allow deleting if only one region
    if (regions.length <= 1) {
      alert("Can't delete the only region. At least one region is required.");
      return;
    }
    
    const regionIndexToDelete = currentRegionIndex;
    
    // Remove the region from shared regions
    setRegions(prev => {
      const updatedRegions = [...prev];
      updatedRegions.splice(regionIndexToDelete, 1);
      return updatedRegions;
    });
    
    // Update images to remove results for the deleted region
    setImages(prev => {
      return prev.map(img => {
        const updatedResults = [...(img.results || [])];
        updatedResults.splice(regionIndexToDelete, 1);
        return {
          ...img,
          results: updatedResults
        };
      });
    });
    
    // Set the current region index
    setCurrentRegionIndex(prev => 
      prev >= regions.length - 1 ? regions.length - 2 : prev
    );
    
    // Update coordinates to the new current region
    if (regions.length > 1) {
      const newIndex = currentRegionIndex >= regions.length - 1 ? 
        regions.length - 2 : currentRegionIndex;
      setCoordinates(regions[newIndex].coordinates);
    }
    
    // Update text
    const newIndex = currentRegionIndex >= regions.length - 1 ? 
      regions.length - 2 : currentRegionIndex;
    if (images[currentImageIndex]?.results?.[newIndex]) {
      setText(images[currentImageIndex].results[newIndex].text || '');
    } else {
      setText('');
    }
  };

  // Handle region selection
  const handleRegionSelect = (index) => {
    setCurrentRegionIndex(index);
    setCoordinates(regions[index].coordinates);
    
    // Update text based on the selected region for the current image
    if (images[currentImageIndex]?.results?.[index]) {
      setText(images[currentImageIndex].results[index].text || '');
    } else {
      setText('');
    }
  };

  // Crop image using coordinates
  const cropImage = (imageElement, coords) => {
    try {
      // Validate coordinates
      if (coords.minX >= coords.maxX || coords.minY >= coords.maxY) {
        console.warn("Invalid coordinates: min values must be less than max values");
        return null;
      }
      
      // Make sure coordinates are within image bounds
      const width = imageElement.width;
      const height = imageElement.height;
      
      if (coords.minX < 0 || coords.minY < 0 || coords.maxX > width || coords.maxY > height) {
        console.warn("Invalid coordinates: coordinates out of image bounds");
        return null;
      }
      
      // Calculate dimensions
      const cropWidth = coords.maxX - coords.minX;
      const cropHeight = coords.maxY - coords.minY;
      
      // Check that we have a valid area to crop
      if (cropWidth <= 0 || cropHeight <= 0) {
        console.warn("Invalid coordinates: resulting crop has no area");
        return null;
      }
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Set canvas size to the specified dimensions
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      
      // Draw the cropped region
      ctx.drawImage(
        imageElement,
        coords.minX, coords.minY,
        cropWidth, cropHeight,
        0, 0,
        cropWidth, cropHeight
      );
      
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error("Error cropping image:", error);
      return null;
    }
  };

  // Process single region with OCR
  const processRegionOCR = (imageUrl, regionCoords) => {
    return new Promise((resolve, reject) => {
      try {
        const img = new Image();
        
        img.onerror = () => {
          console.error("Failed to load image");
          resolve({ text: "Error: Failed to load image", croppedImageData: null, error: true });
        };
        
        img.onload = () => {
          const croppedImageData = cropImage(img, regionCoords);
          
          // Skip OCR if crop failed
          if (!croppedImageData) {
            console.warn("Skipping OCR due to invalid crop");
            resolve({ 
              text: "Error: Invalid coordinates for this region", 
              croppedImageData: null, 
              error: true 
            });
            return;
          }
          
          Tesseract.recognize(
            croppedImageData,
            'eng',
            {
              logger: (m) => console.log(m)
            }
          )
            .then(({ data: { text } }) => {
              resolve({ text, croppedImageData, error: false });
            })
            .catch(error => {
              console.error("Tesseract error:", error);
              resolve({ 
                text: "Error: OCR processing failed", 
                croppedImageData, 
                error: true 
              });
            });
        };
        
        img.src = imageUrl;
      } catch (error) {
        console.error("Unexpected error:", error);
        resolve({ 
          text: "Error: Unexpected error occurred", 
          croppedImageData: null, 
          error: true 
        });
      }
    });
  };

  // Process image and run OCR for current region
  const handleRunOCR = () => {
    if (!images[currentImageIndex]) {
      alert('Please upload an image first');
      return;
    }

    setIsLoading(true);
    processRegionOCR(images[currentImageIndex].url, regions[currentRegionIndex].coordinates)
      .then(({ text, croppedImageData, error }) => {
        setText(text);
        
        // Update regions with the coordinates
        setRegions(prev => {
          const newRegions = [...prev];
          newRegions[currentRegionIndex] = {
            ...newRegions[currentRegionIndex],
            coordinates: regions[currentRegionIndex].coordinates,
            hasError: error
          };
          return newRegions;
        });
        
        // Update the current image's results for the current region
        setImages(prev => {
          const newImages = [...prev];
          if (!newImages[currentImageIndex].results) {
            newImages[currentImageIndex].results = Array(regions.length).fill(null).map(() => ({
              text: '',
              croppedImageData: null,
              error: false
            }));
          }
          newImages[currentImageIndex].results[currentRegionIndex] = {
            text,
            croppedImageData,
            error
          };
          return newImages;
        });
        
        setIsLoading(false);
      })
      .catch(error => {
        console.error(error);
        setIsLoading(false);
        alert("An unexpected error occurred. Please try again.");
      });
  };

  // Process all regions in current image
  const handleRunOCRAllRegions = async () => {
    if (!images[currentImageIndex]) {
      alert('Please upload an image first');
      return;
    }

    if (regions.length === 0) {
      alert('No regions defined');
      return;
    }

    setIsLoading(true);
    setBatchProgress({ current: 0, total: regions.length });

    try {
      const results = await Promise.all(
        regions.map(async (region, idx) => {
          try {
            const result = await processRegionOCR(
              images[currentImageIndex].url, 
              region.coordinates
            );
            setBatchProgress(prev => ({ ...prev, current: idx + 1 }));
            return result;
          } catch (error) {
            console.error(`Error processing region ${idx + 1}:`, error);
            setBatchProgress(prev => ({ ...prev, current: idx + 1 }));
            return { 
              text: `Error processing region ${idx + 1}`, 
              croppedImageData: null,
              error: true
            };
          }
        })
      );

      // Update the current image's results
      setImages(prev => {
        const newImages = [...prev];
        newImages[currentImageIndex].results = results;
        return newImages;
      });
      
      // Update text for current region
      setText(results[currentRegionIndex].text);
      setIsLoading(false);
      setBatchProgress({ current: 0, total: 0 });
    } catch (error) {
      console.error("Failed to process regions:", error);
      setIsLoading(false);
      setBatchProgress({ current: 0, total: 0 });
      alert("An error occurred while processing regions. Some regions may not have been processed correctly.");
    }
  };

  // Process all images with OCR (all regions)
  const handleRunOCRAll = async () => {
    if (images.length === 0) {
      alert('Please upload images first');
      return;
    }

    setIsLoading(true);
    const totalOperations = images.length * regions.length;
    setBatchProgress({ current: 0, total: totalOperations });
    
    let processedCount = 0;

    try {
      const updatedImages = await Promise.all(
        images.map(async (img) => {
          try {
            const results = await Promise.all(
              regions.map(async (region) => {
                try {
                  const result = await processRegionOCR(
                    img.url, 
                    region.coordinates
                  );
                  processedCount++;
                  setBatchProgress({ current: processedCount, total: totalOperations });
                  return result;
                } catch (error) {
                  console.error("Error processing region:", error);
                  processedCount++;
                  setBatchProgress({ current: processedCount, total: totalOperations });
                  return { 
                    text: "Error processing this region", 
                    croppedImageData: null,
                    error: true
                  };
                }
              })
            );
            return { ...img, results };
          } catch (error) {
            console.error("Error processing image:", error);
            return {
              ...img,
              results: Array(regions.length).fill(null).map(() => ({
                text: "Error processing this image",
                croppedImageData: null,
                error: true
              }))
            };
          }
        })
      );

      setImages(updatedImages);
      
      // Update text for current image and region
      if (updatedImages[currentImageIndex]?.results?.[currentRegionIndex]) {
        setText(updatedImages[currentImageIndex].results[currentRegionIndex].text || '');
      }
      
      setIsLoading(false);
      setBatchProgress({ current: 0, total: 0 });
    } catch (error) {
      console.error("Failed to process all images:", error);
      setIsLoading(false);
      setBatchProgress({ current: 0, total: 0 });
      alert("An error occurred while processing images. Some images may not have been processed correctly.");
    }
  };

  // Handle coordinate changes for current region
  const handleCurrentRegionCoordinatesChange = (e) => {
    const { name, value } = e.target;
    const newCoordinates = {
      ...coordinates,
      [name]: parseInt(value) || 0
    };
    setCoordinates(newCoordinates);
    
    // Update coordinates in the regions array
    setRegions(prev => {
      const newRegions = [...prev];
      newRegions[currentRegionIndex].coordinates = newCoordinates;
      return newRegions;
    });
  };

  // Handle region name edit
  const startEditingRegionName = (index) => {
    setEditingRegionName(index);
    setNewRegionName(regions[index].name);
  };

  // Save edited region name
  const saveRegionName = () => {
    if (editingRegionName !== null && newRegionName.trim() !== '') {
      setRegions(prev => {
        const newRegions = [...prev];
        newRegions[editingRegionName].name = newRegionName.trim();
        return newRegions;
      });
      setEditingRegionName(null);
    }
  };

  // Cancel region name editing
  const cancelRegionNameEdit = () => {
    setEditingRegionName(null);
  };

  // Handle region name input change
  const handleRegionNameChange = (e) => {
    setNewRegionName(e.target.value);
  };

  // Export results as CSV
  const exportToCSV = () => {
    // Create CSV header with a column for each region
    let header = "Image Name";
    for (let i = 0; i < regions.length; i++) {
      header += `,${regions[i].name}`;
    }
    let csvContent = header + "\n";
    
    // Add each image as a row with region texts as columns
    images.forEach((img, imgIndex) => {
      // Start with the image name
      const imageName = img.filename || `Image ${imgIndex + 1}`;
      let row = `"${imageName}"`;
      
      // Add each region's text as a column
      if (img.results) {
        for (let i = 0; i < regions.length; i++) {
          // Get text for this region if available, otherwise use empty string
          const regionText = img.results[i]?.text || '';
          // Clean text data by escaping quotes and removing line breaks
          const cleanedText = regionText.replace(/"/g, '""').replace(/\n/g, ' ');
          // Add to row
          row += `,"${cleanedText}"`;
        }
      } else {
        // If no results, fill with empty columns
        for (let i = 0; i < regions.length; i++) {
          row += `,""`;
        }
      }
      
      // Add row to CSV
      csvContent += row + "\n";
    });
    
    // Create a blob with the CSV content
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Create a link element to trigger download
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'ocr_results.csv');
    link.style.visibility = 'hidden';
    
    // Add to document, click to download, then remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Update the canvas click handler to account for scaling
  const handleCanvasClick = (e) => {
    if (clickMode === "none" || !images[currentImageIndex]?.url || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Calculate the scaling factor between displayed size and actual size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Calculate the click position relative to the image, accounting for scaling
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    
    if (clickMode === "ready") {
      // First click - set min coordinates
      const newCoords = { minX: x, minY: y, maxX: x, maxY: y };
      
      // Update the coordinates state
      setCoordinates(newCoords);
      
      // Update the regions array with new coordinates
      const updatedRegions = [...regions];
      updatedRegions[currentRegionIndex] = {
        ...updatedRegions[currentRegionIndex],
        coordinates: newCoords
      };
      setRegions(updatedRegions);
      
      setClickMode("first_click_done");
    } else if (clickMode === "first_click_done") {
      // Second click - set max coordinates
      // Get current coordinates
      const currentCoords = regions[currentRegionIndex].coordinates;
      
      // Ensure max values are greater than min values
      const minX = Math.min(currentCoords.minX, x);
      const minY = Math.min(currentCoords.minY, y);
      const maxX = Math.max(currentCoords.minX, x);
      const maxY = Math.max(currentCoords.minY, y);
      
      const newCoords = { minX, minY, maxX, maxY };
      
      // Update the coordinates state
      setCoordinates(newCoords);
      
      // Update the regions array with new coordinates
      const updatedRegions = [...regions];
      updatedRegions[currentRegionIndex] = {
        ...updatedRegions[currentRegionIndex],
        coordinates: newCoords
      };
      setRegions(updatedRegions);
      
      setClickMode("ready"); // Reset to ready for next region
    }
  };

  // Update the drawRectangle function
  const drawRectangle = () => {
    if (images[currentImageIndex]) {
      const img = new Image();
      img.onload = () => {
        drawRectangles(img);
        
        // Set cursor style based on click mode
        if (canvasRef.current) {
          if (clickMode === "ready" || clickMode === "first_click_done") {
            canvasRef.current.style.cursor = "crosshair";
          } else {
            canvasRef.current.style.cursor = "default";
          }
        }
      };
      img.src = images[currentImageIndex].url;
    }
  };

  // Update useEffect for imageUrl to include clickMode dependency
  useEffect(() => {
    if (images[currentImageIndex]?.url) {
      drawRectangle();
    }
  }, [images[currentImageIndex]?.url, regions, currentRegionIndex, clickMode]);

  return (
    <div className="App">
      <h1>OCR Image to Text</h1>
      
      {/* Image Selection */}
      {images.length > 0 && (
        <div className="image-selection">
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            multiple
            style={{ display: 'none' }}
            id="fileInput"
          />
          <label htmlFor="fileInput" className="file-upload-button">
            Choose Files
          </label>
          
          <div className="image-thumbnails">
            {images.map((image, index) => (
              <div
                key={index}
                className={`image-thumbnail ${index === currentImageIndex ? 'selected' : ''}`}
                onClick={() => handleImageSelect(index)}
              >
                <img src={image.url} alt={`Thumbnail ${index + 1}`} />
                <span>Image {index + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Region and Coordinate Controls Container */}
      {images.length > 0 && (
        <div className="region-coordinate-container">
          {/* Region Selection - now shared across all images */}
          {regions.length > 0 && (
            <div className="region-selection">
              <h3>Regions (Shared Across All Images):</h3>
              <div className="region-controls">
                <button onClick={addRegion} className="control-button">Add Region</button>
                <button onClick={deleteRegion} className="control-button">Delete Region</button>
              </div>
              <div className="region-tabs">
                {regions.map((region, index) => (
                  <div 
                    key={index}
                    className={`region-tab ${index === currentRegionIndex ? 'selected' : ''}`}
                  >
                    {editingRegionName === index ? (
                      <div className="region-name-edit">
                        <input
                          type="text"
                          value={newRegionName}
                          onChange={handleRegionNameChange}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                        <div className="edit-buttons">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              saveRegionName();
                            }}
                            className="save-button"
                          >
                            ✓
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelRegionNameEdit();
                            }}
                            className="cancel-button"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div 
                        className="region-name-display"
                        onClick={() => handleRegionSelect(index)}
                      >
                        <span>{region.name}</span>
                        <button 
                          className="edit-name-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditingRegionName(index);
                          }}
                        >
                          ✎
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Coordinate Inputs */}
          <div className="coordinates-input">
            <h3>Enter Coordinates for {regions[currentRegionIndex].name}</h3>
            
            {/* Add click mode toggle button */}
            <div className="click-mode-toggle">
              <button 
                onClick={() => setClickMode(clickMode === "none" ? "ready" : "none")}
                className={clickMode !== "none" ? "active" : ""}
              >
                {clickMode !== "none" ? "Disable Click Selection" : "Enable Click Selection"}
              </button>
              {clickMode === "ready" && 
                <p className="click-instruction">Click on image to set top-left corner</p>
              }
              {clickMode === "first_click_done" && 
                <p className="click-instruction">Click on image to set bottom-right corner</p>
              }
            </div>
            
            <div className="coordinate-group">
              <div>
                <label>Min X:</label>
                <input
                  type="number"
                  name="minX"
                  value={coordinates.minX}
                  onChange={handleCurrentRegionCoordinatesChange}
                  placeholder="Min X"
                />
              </div>
              <div>
                <label>Max X:</label>
                <input
                  type="number"
                  name="maxX"
                  value={coordinates.maxX}
                  onChange={handleCurrentRegionCoordinatesChange}
                  placeholder="Max X"
                />
              </div>
              <div>
                <label>Min Y:</label>
                <input
                  type="number"
                  name="minY"
                  value={coordinates.minY}
                  onChange={handleCurrentRegionCoordinatesChange}
                  placeholder="Min Y"
                />
              </div>
              <div>
                <label>Max Y:</label>
                <input
                  type="number"
                  name="maxY"
                  value={coordinates.maxY}
                  onChange={handleCurrentRegionCoordinatesChange}
                  placeholder="Max Y"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OCR Buttons */}
      {images.length > 0 && (
        <div className="run-ocr">
          <button 
            onClick={handleRunOCR} 
            disabled={isLoading || !images[currentImageIndex]?.url}
          >
            {isLoading ? 'Processing...' : 'Run OCR on Current Region'}
          </button>
          <button 
            className="run-all-button"
            onClick={handleRunOCRAllRegions}
            disabled={isLoading || !images[currentImageIndex]?.url}
          >
            {isLoading ? 'Processing...' : 'Run OCR on All Regions'}
          </button>
          <button 
            className="export-button"
            onClick={exportToCSV}
            disabled={!images[currentImageIndex]?.results?.[currentRegionIndex] || !images[currentImageIndex]?.url}
          >
            Export to CSV
          </button>
        </div>
      )}

      {/* Image Previews Container */}
      {images.length > 0 && (
        <div className="image-preview-container">
          {/* Original Image with Rectangle */}
          <div className="original-image-container">
            <h2>Original Image:</h2>
            <canvas 
              ref={canvasRef} 
              onClick={handleCanvasClick}
            ></canvas>
            <div className="image-dimensions">
              Size: {imageDimensions.width} x {imageDimensions.height} pixels
            </div>
          </div>

          {/* Cropped Image Preview */}
          {images[currentImageIndex]?.results?.[currentRegionIndex] && (
        <div className="image-preview">
              <h2>Cropped {regions[currentRegionIndex].name}:</h2>
              {images[currentImageIndex].results[currentRegionIndex].error ? (
                <div className="error-message">
                  <p>Error: Unable to crop region due to invalid coordinates</p>
                  <p>Please check that:</p>
                  <ul>
                    <li>Min values are less than Max values</li>
                    <li>Coordinates are within image boundaries</li>
                    <li>The region has a valid area (width and height &gt; 0)</li>
                  </ul>
                </div>
              ) : (
                <img 
                  src={images[currentImageIndex].results[currentRegionIndex].croppedImageData} 
                  alt="Cropped" 
                  style={{ maxWidth: '400px' }} 
                />
              )}
            </div>
          )}

          {/* Extracted Text */}
          {images[currentImageIndex]?.results?.[currentRegionIndex] && (
            <div className="result">
              <h2>Extracted Text from {regions[currentRegionIndex].name}:</h2>
              {images[currentImageIndex].results[currentRegionIndex].error ? (
                <div className="error-message">
                  {images[currentImageIndex].results[currentRegionIndex].text}
                </div>
              ) : (
                <pre>{images[currentImageIndex].results[currentRegionIndex].text}</pre>
              )}
            </div>
          )}
        </div>
      )}

      {/* Loading Indicator */}
      {isLoading && <p>Processing image...</p>}
    </div>
  );
}

export default App;