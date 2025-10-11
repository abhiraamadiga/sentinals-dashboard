import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MilitaryDashboard.css';

// Fix for default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom threat level icons
const getCustomIcon = (threatLevel) => {
  const colors = {
    'high': '#ff4444',
    'medium': '#ffaa00',
    'low': '#00ff88',
    'unknown': '#00bfff'
  };

  const color = colors[threatLevel] || colors.unknown;

  return L.divIcon({
    html: `<div style="
      background-color: ${color};
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 0 10px rgba(0,0,0,0.5);
    "></div>`,
    className: 'custom-threat-marker',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
};

function App() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [intelligenceData, setIntelligenceData] = useState([]);

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Extract threat level from analysis text
  const extractThreatLevel = (analysisText) => {
    const threatMatch = analysisText.match(/threat.{0,20}(high|medium|low)/i);
    return threatMatch ? threatMatch[1].toLowerCase() : 'unknown';
  };

  // Generate random coordinates if no GPS
  const generateRandomCoordinates = () => {
    const baseLat = 20.5937;
    const baseLon = 78.9629;
    return {
      lat: baseLat + (Math.random() - 0.5) * 0.5,
      lon: baseLon + (Math.random() - 0.5) * 0.5
    };
  };

  // Handle text input submission
  const handleTextSubmit = async () => {
    if (!textInput.trim()) {
      alert('Please enter some text to analyze');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('report', textInput);

    try {
      const response = await fetch('http://localhost:8000/upload-text', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.ai_analysis) {
        const coordinates = result.coordinates || generateRandomCoordinates();
        const threatLevel = extractThreatLevel(result.ai_analysis);

        const newIntelligence = {
          id: Date.now(),
          type: 'text',
          analysis: result.ai_analysis,
          coordinates: coordinates,
          threatLevel: threatLevel,
          timestamp: new Date().toLocaleString(),
          source: 'Field Report',
          originalData: result.original_report
        };

        setIntelligenceData(prev => [...prev, newIntelligence]);
        setAiAnalysis({
          type: 'text',
          analysis: result.ai_analysis,
          message: result.message,
          original: result.original_report,
          coordinates: coordinates,
          timestamp: new Date().toLocaleString()
        });
      }
    } catch (error) {
      console.error('🚨 Text analysis error:', error);
      alert('Backend connection failed!');
    }

    setLoading(false);
    setTextInput('');
  };

  // Handle image upload submission
  const handleImageSubmit = async () => {
    if (!selectedImage) {
      alert('Please select an image first');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('image', selectedImage);

    try {
      const response = await fetch('http://localhost:8000/upload-image', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.ai_analysis) {
        const coordinates = result.coordinates || generateRandomCoordinates();
        const threatLevel = extractThreatLevel(result.ai_analysis);

        const newIntelligence = {
          id: Date.now(),
          type: 'image',
          analysis: result.ai_analysis,
          coordinates: coordinates,
          threatLevel: threatLevel,
          timestamp: new Date().toLocaleString(),
          source: result.original_image,
          originalData: result.original_image
        };

        setIntelligenceData(prev => [...prev, newIntelligence]);
        setAiAnalysis({
          type: 'image',
          analysis: result.ai_analysis,
          message: result.message,
          original: result.original_image,
          coordinates: coordinates,
          timestamp: new Date().toLocaleString()
        });
      }
    } catch (error) {
      console.error('🚨 IMAGE UPLOAD ERROR:', error);
      alert('Backend connection failed!');
    }

    setLoading(false);
    setSelectedImage(null);
  };

  // Handle file selection
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file);
      setSelectedFile(null);
    } else if (file) {
      setSelectedFile(file);
      setSelectedImage(null);
      alert('Please select an image file for image analysis');
    }
  };

  return (
    <div className="military-dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1>🛡️ SENTINALS GEOSPATIAL INTELLIGENCE DASHBOARD</h1>
          <div className="status-indicators">
            <span className="status-indicator active">🟢 OPERATIONAL</span>
            <span className="status-indicator">📡 SECURE LINK</span>
            <span className="status-indicator">🗺️ GEOSPATIAL ACTIVE</span>
          </div>
        </div>
        <div className="header-right">
          <div className="time-display">
            <div className="current-time">{currentTime.toLocaleTimeString()}</div>
            <div className="current-date">{currentTime.toLocaleDateString()}</div>
          </div>
        </div>
      </header>

      {/* Main Dashboard Grid */}
      <main className="dashboard-grid">
        {/* Left Column */}
        <div className="left-column">
          {/* Intelligence Upload Section */}
          <section className="glass-panel upload-section">
            <div className="panel-header">
              <h2>📤 UPLOAD INTELLIGENCE DATA</h2>
              <div className="upload-status">
                {loading ? <span className="status processing">⚡ PROCESSING...</span>
                  : <span className="status ready">✅ READY</span>}
              </div>
            </div>

            <div className="panel-content">
              {/* Text Input */}
              <div className="input-group">
                <label>📝 FIELD REPORT TEXT:</label>
                <textarea
                  className="text-input"
                  placeholder="Enter field report, intelligence briefing, or tactical data for AI analysis..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  rows="4"
                  disabled={loading}
                />
                <button
                  className="submit-btn text-btn"
                  onClick={handleTextSubmit}
                  disabled={!textInput.trim() || loading}
                >
                  {loading ? '⏳ PROCESSING...' : '🧠 ANALYZE TEXT'}
                </button>
              </div>

              {/* File Upload */}
              <div className="input-group">
                <label>📁 SURVEILLANCE IMAGE:</label>
                <div className="file-upload-area">
                  <input
                    type="file"
                    id="file-upload"
                    className="file-input"
                    onChange={handleFileChange}
                    accept="image/*"
                    disabled={loading}
                  />
                  <label htmlFor="file-upload" className="file-upload-label">
                    {selectedImage ? `📸 ${selectedImage.name}` :
                      selectedFile ? `📄 ${selectedFile.name}` :
                        '🎯 SELECT DRONE IMAGE'}
                  </label>
                </div>
                <button
                  className="submit-btn image-btn"
                  onClick={handleImageSubmit}
                  disabled={!selectedImage || loading}
                >
                  {loading ? '⏳ PROCESSING...' : '🔍 ANALYZE IMAGE'}
                </button>
              </div>
            </div>
          </section>

          {/* AI Analysis Output */}
          <section className="glass-panel analysis-section">
            <div className="panel-header">
              <h2>🧠 AI ANALYSIS OUTPUT</h2>
              <div className="analysis-status">
                {aiAnalysis ?
                  <span className="status complete">✅ ANALYSIS COMPLETE</span> :
                  <span className="status waiting">⏳ AWAITING INPUT</span>
                }
              </div>
            </div>

            <div className="panel-content analysis-content">
              {aiAnalysis ? (
                <div className="analysis-result">
                  <div className="analysis-header">
                    <strong>{aiAnalysis.message}</strong>
                    <span className="timestamp">{aiAnalysis.timestamp}</span>
                  </div>
                  {aiAnalysis.original && (
                    <div className="original-data">
                      <strong>Source:</strong> {aiAnalysis.original}
                    </div>
                  )}
                  {aiAnalysis.coordinates && (
                    <div className="gps-data">
                      <strong>📍 Coordinates:</strong> {aiAnalysis.coordinates.lat.toFixed(6)}, {aiAnalysis.coordinates.lon.toFixed(6)}
                    </div>
                  )}
                  <div className="analysis-text">
                    <pre>{aiAnalysis.analysis}</pre>
                  </div>
                </div>
              ) : (
                <div className="analysis-placeholder">
                  <div className="placeholder-icon">🤖</div>
                  <p>AI ANALYSIS AWAITING INPUT</p>
                  <div className="loading-dots">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Column */}
        <div className="right-column">
          {/* Enhanced FREE Leaflet Map */}
          <section className="glass-panel map-section">
            <div className="panel-header">
              <h2>🗺️ GEOSPATIAL INTELLIGENCE MAP</h2>
              <div className="map-controls">
                <span className="intel-count">📍 {intelligenceData.length} INTEL POINTS</span>
              </div>
            </div>

            <div className="panel-content map-container">
              <MapContainer
                center={[20.5937, 78.9629]}
                zoom={5}
                style={{ height: '100%', width: '100%' }}
                className="natural-map"
              >
                {/* Natural Terrain Map with Realistic Colors */}
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                  attribution='&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics'
                />

                {/* Optional: Add labels/roads overlay */}
                <TileLayer
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                  attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                />

                {/* Your existing markers */}
                {intelligenceData.map((intel) => (
                  <Marker
                    key={intel.id}
                    position={[intel.coordinates.lat, intel.coordinates.lon]}
                    icon={getCustomIcon(intel.threatLevel)}
                  >
                    <Popup>
                      <div className="intel-popup">
                        <h4>🛡️ Intelligence Report</h4>
                        <div className="intel-details">
                          <p><strong>📊 Type:</strong> {intel.type.toUpperCase()}</p>
                          <p><strong>📍 Source:</strong> {intel.source}</p>
                          <p><strong>⚠️ Threat Level:</strong>
                            <span className={`threat-${intel.threatLevel}`}>
                              {intel.threatLevel.toUpperCase()}
                            </span>
                          </p>
                          <p><strong>🕐 Time:</strong> {intel.timestamp}</p>
                        </div>
                        <div className="intel-analysis">
                          <strong>📋 Analysis:</strong>
                          <div className="analysis-preview">
                            {intel.analysis.substring(0, 300)}...
                          </div>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {/* Keep your tactical overlay */}
                <div className="map-overlay">
                  <div className="crosshair"></div>
                  <div className="range-finder">
                    <div className="range-circle"></div>
                    <div className="range-circle"></div>
                  </div>
                </div>
              </MapContainer>

            </div>
          </section>

          {/* Mission Status - Updated */}
          <section className="glass-panel mission-status">
            <div className="panel-header">
              <h2>⚡ OPERATIONAL STATUS</h2>
            </div>
            <div className="panel-content">
              <div className="status-grid">
                <div className="status-item">
                  <span className="status-label">AI SYSTEMS:</span>
                  <span className="status-value online">ONLINE</span>
                </div>
                <div className="status-item">
                  <span className="status-label">INTEL POINTS:</span>
                  <span className="status-value">{intelligenceData.length}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">HIGH THREATS:</span>
                  <span className="status-value threat-high">
                    {intelligenceData.filter(i => i.threatLevel === 'high').length}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">GEOSPATIAL:</span>
                  <span className="status-value active">ACTIVE</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;
