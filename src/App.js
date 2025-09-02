import React, { useState, useRef, useEffect } from 'react';
import { Pen, Eraser, Download, Camera, FileText, Trash2, Loader } from 'lucide-react';

// Supabase REST API functions (no library needed)
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Google Vision API call
// Azure OCR API call
const processWithAzureOCR = async (imageBlob) => {
  const endpoint = process.env.REACT_APP_AZURE_ENDPOINT; 
  const apiKey = process.env.REACT_APP_AZURE_KEY;

  try {
    // Step 1: Send image for analysis
    const response = await fetch(`${endpoint}/vision/v3.2/read/analyze`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
        "Content-Type": "application/octet-stream",
      },
      body: imageBlob,
    });

    if (!response.ok) throw new Error("Azure OCR request failed");

    // Get operation-location to poll results
    const operationLocation = response.headers.get("operation-location");

    // Step 2: Poll until result is ready
    let result;
    while (true) {
      const poll = await fetch(operationLocation, {
        headers: { "Ocp-Apim-Subscription-Key": apiKey },
      });
      result = await poll.json();

      if (result.status === "succeeded" || result.status === "failed") break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (result.status === "succeeded") {
      return result.analyzeResult.readResults
        .flatMap((page) => page.lines.map((line) => line.text))
        .join(" ");
    } else {
      throw new Error("OCR failed");
    }
  } catch (error) {
    console.error("Azure OCR error:", error);
    throw new Error("OCR processing failed");
  }
};

console.log("Supabase URL:", process.env.REACT_APP_SUPABASE_URL);
console.log("Azure Endpoint:", process.env.REACT_APP_AZURE_ENDPOINT);

// Supabase Storage - Upload image
const uploadImageToSupabase = async (imageBlob) => {
  const fileName = `drawing_${Date.now()}.png`;
  const bucket = "drawings"; // make sure you created this bucket in Supabase

  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${fileName}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'image/png'
    },
    body: imageBlob
  });

  if (!response.ok) throw new Error('Image upload failed');

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
};


// Supabase Database - Save OCR result
const saveToSupabaseDB = async (text, imageUrl) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/ocr_results`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'apikey': supabaseAnonKey,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      text: text,
      image_url: imageUrl
    })
  });

  if (!response.ok) throw new Error('Database save failed');
  
  const data = await response.json();
  return data[0];
};

// Fetch saved entries from Supabase
const fetchSavedEntries = async () => {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/ocr_results?select=*&order=created_at.desc&limit=10`, {
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey
      }
    });

    if (!response.ok) throw new Error('Fetch failed');
    
    const data = await response.json();
    return data || [];
  } catch (error) {
    console.error('Fetch error:', error);
    return [];
  }
};

// // Debug Panel Component
// const DebugPanel = () => {
//   const [apiTestResult, setApiTestResult] = useState('');
//   const [testing, setTesting] = useState(false);

//   const testGoogleVisionAPI = async () => {
//     setTesting(true);
//     setApiTestResult('Testing...');
    
//     try {
//       // Simple test image (1x1 white pixel in base64)
//       const testImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
      
//       const apiKey = process.env.REACT_APP_GOOGLE_VISION_API_KEY;
      
//       const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({
//           requests: [{
//             image: {
//               content: testImageBase64
//             },
//             features: [{
//               type: 'TEXT_DETECTION',
//               maxResults: 1
//             }]
//           }]
//         })
//       });

//       const result = await response.json();
      
//       if (response.ok) {
//         setApiTestResult('✅ Google Vision API is working!');
//         console.log('API Test Success:', result);
//       } else {
//         setApiTestResult(`❌ API Error: ${result.error?.message || 'Unknown error'}`);
//         console.error('API Test Failed:', result);
//       }
//     } catch (error) {
//       setApiTestResult(`❌ Network Error: ${error.message}`);
//       console.error('API Test Network Error:', error);
//     }
    
//     setTesting(false);
//   };

//   return (
//     <div className="bg-yellow-100 p-4 rounded-lg mb-4 border border-yellow-300">
//       <h3 className="font-bold text-yellow-800 mb-2">🔍 Debug Info:</h3>
//       <div className="text-sm space-y-1 mb-3">
//         <p>Google API Key: {process.env.REACT_APP_GOOGLE_VISION_API_KEY ? '✅ Loaded' : '❌ Missing'}</p>
//         <p>Supabase URL: {process.env.REACT_APP_SUPABASE_URL ? '✅ Loaded' : '❌ Missing'}</p>
//         <p>Supabase Key: {process.env.REACT_APP_SUPABASE_ANON_KEY ? '✅ Loaded' : '❌ Missing'}</p>
//       </div>
      
//       <button
//         onClick={testGoogleVisionAPI}
//         disabled={testing}
//         className="bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700 disabled:opacity-50"
//       >
//         {testing ? 'Testing...' : 'Test Google Vision API'}
//       </button>
      
//       {apiTestResult && (
//         <p className="mt-2 text-sm font-medium">{apiTestResult}</p>
//       )}
//     </div>
//   );
// };

const DrawingOCRApp = () => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState([]);
  const [paths, setPaths] = useState([]);
  const [brushSize, setBrushSize] = useState(3);
  const [extractedText, setExtractedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [savedEntries, setSavedEntries] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load saved entries on component mount
  useEffect(() => {
    const loadEntries = async () => {
      setLoadingHistory(true);
      const entries = await fetchSavedEntries();
      setSavedEntries(entries);
      setLoadingHistory(false);
    };
    loadEntries();
  }, []);

  // Drawing functions
  const startDrawing = (e) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentPath([{ x, y }]);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setCurrentPath(prev => [...prev, { x, y }]);
  };

  const stopDrawing = () => {
    if (isDrawing && currentPath.length > 0) {
      setPaths(prev => [...prev, currentPath]);
      setCurrentPath([]);
    }
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    setPaths([]);
    setCurrentPath([]);
    setExtractedText('');
  };

  const undoLastStroke = () => {
    setPaths(prev => prev.slice(0, -1));
  };

  // Canvas drawing effect
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set drawing style
    ctx.strokeStyle = '#000';
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw all paths
    [...paths, currentPath].forEach(path => {
      if (path.length > 1) {
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        path.forEach(point => ctx.lineTo(point.x, point.y));
        ctx.stroke();
      }
    });
  }, [paths, currentPath, brushSize]);

  // OCR Processing
  // OCR Processing
const processOCR = async () => {
  if (paths.length === 0) {
    alert("Please draw something first!");
    return;
  }

  setIsProcessing(true);
  try {
    // Convert canvas to blob
    const canvas = canvasRef.current;
    canvas.toBlob(async (blob) => {
      try {
        // Call Azure OCR
        const extractedText = await processWithAzureOCR(blob);
        setExtractedText(extractedText);

        // Upload image and save to Supabase
        const imageUrl = await uploadImageToSupabase(blob);
        const savedEntry = await saveToSupabaseDB(extractedText, imageUrl);
        setSavedEntries((prev) => [savedEntry, ...prev]);

        setIsProcessing(false);
      } catch (error) {
        console.error("Processing error:", error);
        alert("Processing failed. Please check your Azure API key & endpoint.");
        setIsProcessing(false);
      }
    }, "image/png");
  } catch (error) {
    console.error("OCR processing failed:", error);
    setIsProcessing(false);
  }
};


  const downloadImage = () => {
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = `drawing_${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Debug Panel */}
        
        
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Drawing OCR App</h1>
          <p className="text-gray-600">Draw or write text, and we'll extract it using AI!</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Drawing Pad */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Drawing Pad</h2>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Brush Size:</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-20"
                />
                <span className="text-sm text-gray-600">{brushSize}px</span>
              </div>
            </div>

            {/* Canvas */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 mb-4">
              <canvas
                ref={canvasRef}
                width={600}
                height={400}
                className="border border-gray-200 rounded cursor-crosshair bg-white mx-auto block"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
              />
            </div>

            {/* Drawing Controls */}
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={undoLastStroke}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors"
                disabled={paths.length === 0}
              >
                <Eraser size={16} />
                Undo
              </button>
              
              <button
                onClick={clearCanvas}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                <Trash2 size={16} />
                Clear
              </button>
              
              <button
                onClick={downloadImage}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                disabled={paths.length === 0}
              >
                <Download size={16} />
                Download
              </button>
              
              <button
                onClick={processOCR}
                disabled={isProcessing || paths.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? <Loader className="animate-spin" size={16} /> : <Camera size={16} />}
                {isProcessing ? 'Processing...' : 'Extract Text'}
              </button>
            </div>
          </div>

          {/* Results Panel */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Results</h2>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
              >
                <FileText size={16} />
                History
              </button>
            </div>

            {/* Current Result */}
            {isProcessing && (
              <div className="flex items-center justify-center py-8">
                <Loader className="animate-spin mr-2" size={20} />
                <span className="text-gray-600">Processing with OCR...</span>
              </div>
            )}

            {extractedText && !isProcessing && (
              <div className="mb-6">
                <h3 className="font-medium text-gray-700 mb-2">Extracted Text:</h3>
                <div className="bg-gray-50 p-3 rounded-lg border">
                  <p className="text-gray-800">{extractedText}</p>
                </div>
                <p className="text-xs text-green-600 mt-2">✓ Saved to Firebase</p>
              </div>
            )}

            {/* History */}
            {showHistory && (
              <div>
                <h3 className="font-medium text-gray-700 mb-3">Previous Extractions:</h3>
                {loadingHistory ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader className="animate-spin mr-2" size={16} />
                    <span className="text-sm text-gray-600">Loading history...</span>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {savedEntries.length === 0 ? (
                      <p className="text-gray-500 text-sm">No saved entries yet</p>
                    ) : (
                      savedEntries.map((entry) => (
                        <div key={entry.id} className="bg-gray-50 p-3 rounded-lg border">
                          <p className="text-sm text-gray-800 mb-1">{entry.text}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(entry.created_at).toLocaleString()}
                          </p>
                          {entry.image_url && (
                            <img 
                              src={entry.image_url} 
                              alt="Drawing" 
                              className="mt-2 w-20 h-16 object-cover rounded border"
                            />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Instructions */}
            {!extractedText && !isProcessing && (
              <div className="text-center py-8">
                <Pen className="mx-auto mb-3 text-gray-400" size={32} />
                <p className="text-gray-500">Draw or write something on the canvas, then click "Extract Text" to see the magic!</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-500 text-sm">
          <p>Powered by Google Cloud Vision API & Firebase</p>
        </div>
      </div>
    </div>
  );
};

export default DrawingOCRApp;