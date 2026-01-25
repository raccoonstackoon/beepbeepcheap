import { useState, useRef, useEffect, useCallback } from 'react';
import { Check, RotateCcw, Eraser, Highlighter } from 'lucide-react';
import './ImageAnnotator.css';

/**
 * ImageAnnotator - A freehand highlighting/scrubbing tool
 * 
 * Users can "rub" their finger or mouse over areas of the image to highlight
 * what they want the AI to focus on - like using a highlighter pen.
 * 
 * Props:
 * - imageUrl: The image to annotate (required)
 * - onConfirm: Callback with the highlight mask data (required)
 * - onCancel: Callback when user wants to go back (required)
 * - mode: 'pricetag' or 'product' - affects the instruction text (optional)
 */
export default function ImageAnnotator({ imageUrl, onConfirm, onCancel, mode = 'pricetag' }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  
  // Canvas dimensions
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  
  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState('highlight'); // 'highlight' or 'eraser'
  const [hasDrawn, setHasDrawn] = useState(false);
  
  // Brush settings
  const brushSize = 40; // Finger-friendly size
  const highlightColor = 'rgba(255, 200, 87, 0.5)'; // Gold highlight
  const eraserSize = 50;

  // Initialize canvas when image loads
  const handleImageLoad = useCallback(() => {
    if (!imageRef.current || !canvasRef.current) return;
    
    const img = imageRef.current;
    const canvas = canvasRef.current;
    
    // Match canvas to image size
    canvas.width = img.offsetWidth;
    canvas.height = img.offsetHeight;
    
    setDimensions({
      width: img.offsetWidth,
      height: img.offsetHeight
    });
    
    // Set up canvas context
    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (imageRef.current && canvasRef.current) {
        // Save current drawing
        const canvas = canvasRef.current;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        tempCanvas.getContext('2d').drawImage(canvas, 0, 0);
        
        // Resize
        canvas.width = imageRef.current.offsetWidth;
        canvas.height = imageRef.current.offsetHeight;
        
        // Restore drawing (scaled)
        const ctx = canvas.getContext('2d');
        ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        setDimensions({
          width: imageRef.current.offsetWidth,
          height: imageRef.current.offsetHeight
        });
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Get position from mouse or touch event
  const getPosition = useCallback((e) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }, []);

  // Start drawing
  const handleStart = useCallback((e) => {
    e.preventDefault();
    setIsDrawing(true);
    
    const pos = getPosition(e);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    
    // Draw a dot at start position
    if (tool === 'highlight') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = highlightColor;
      ctx.lineWidth = brushSize;
    } else {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = eraserSize;
    }
    
    ctx.lineTo(pos.x + 0.1, pos.y + 0.1);
    ctx.stroke();
    
    if (tool === 'highlight') {
      setHasDrawn(true);
    }
  }, [getPosition, tool, brushSize, eraserSize, highlightColor]);

  // Continue drawing
  const handleMove = useCallback((e) => {
    if (!isDrawing) return;
    e.preventDefault();
    
    const pos = getPosition(e);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (tool === 'highlight') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = highlightColor;
      ctx.lineWidth = brushSize;
    } else {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = eraserSize;
    }
    
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    
    if (tool === 'highlight') {
      setHasDrawn(true);
    }
  }, [isDrawing, getPosition, tool, brushSize, eraserSize, highlightColor]);

  // Stop drawing
  const handleEnd = useCallback(() => {
    setIsDrawing(false);
    
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.beginPath();
    }
  }, []);

  // Clear canvas
  const handleClear = useCallback(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }, []);

  // Confirm and extract highlight region
  const handleConfirm = useCallback(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Find bounding box of highlighted area
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = 0;
    let maxY = 0;
    let hasHighlight = false;
    
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        // Check if pixel has any opacity (is highlighted)
        if (data[i + 3] > 10) {
          hasHighlight = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    
    // If nothing highlighted, use full image
    if (!hasHighlight) {
      onConfirm({
        x: 0,
        y: 0,
        width: 100,
        height: 100
      });
      return;
    }
    
    // Add some padding
    const padding = 10;
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(canvas.width, maxX + padding);
    maxY = Math.min(canvas.height, maxY + padding);
    
    // Convert to percentages
    const focusArea = {
      x: (minX / canvas.width) * 100,
      y: (minY / canvas.height) * 100,
      width: ((maxX - minX) / canvas.width) * 100,
      height: ((maxY - minY) / canvas.height) * 100
    };
    
    onConfirm(focusArea);
  }, [onConfirm]);

  // Get instruction text based on mode
  const getInstructions = () => {
    if (mode === 'pricetag') {
      return {
        title: 'Highlight the Price Area',
        description: 'Rub your finger over the price and product name'
      };
    }
    return {
      title: 'Highlight the Product',
      description: 'Rub your finger over the product you want to track'
    };
  };

  const instructions = getInstructions();

  return (
    <div className="image-annotator">
      {/* Instructions */}
      <div className="annotator-instructions">
        <div className="instruction-icon">
          <Highlighter size={20} />
        </div>
        <div className="instruction-text">
          <h4>{instructions.title}</h4>
          <p>{instructions.description}</p>
        </div>
      </div>

      {/* Tool selector */}
      <div className="tool-selector">
        <button 
          className={`tool-btn ${tool === 'highlight' ? 'active' : ''}`}
          onClick={() => setTool('highlight')}
        >
          <Highlighter size={18} />
          <span>Highlight</span>
        </button>
        <button 
          className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`}
          onClick={() => setTool('eraser')}
        >
          <Eraser size={18} />
          <span>Eraser</span>
        </button>
      </div>

      {/* Canvas container */}
      <div 
        className="annotator-container"
        ref={containerRef}
      >
        {/* The image */}
        <img 
          ref={imageRef}
          src={imageUrl} 
          alt="Image to annotate"
          className="annotator-image"
          onLoad={handleImageLoad}
          draggable={false}
        />
        
        {/* Drawing canvas overlay */}
        <canvas
          ref={canvasRef}
          className="annotator-canvas"
          onMouseDown={handleStart}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
          onTouchCancel={handleEnd}
        />
        
        {/* Visual hint when no drawing yet */}
        {!hasDrawn && dimensions.width > 0 && (
          <div className="draw-hint">
            <Highlighter size={32} />
            <span>Draw here</span>
          </div>
        )}
      </div>

      {/* Helper text */}
      <p className="annotator-help">
        {tool === 'highlight' 
          ? '👆 Drag your finger to highlight the important area'
          : '🧽 Drag to erase parts of your highlight'
        }
      </p>

      {/* Actions */}
      <div className="annotator-actions">
        <button className="btn btn-ghost" onClick={handleClear} disabled={!hasDrawn}>
          <RotateCcw size={16} />
          Clear
        </button>
        <div className="action-group">
          <button className="btn btn-secondary" onClick={onCancel}>
            Back
          </button>
          <button className="btn btn-primary" onClick={handleConfirm}>
            <Check size={18} />
            {hasDrawn ? 'Continue' : 'Skip'}
          </button>
        </div>
      </div>
    </div>
  );
}
