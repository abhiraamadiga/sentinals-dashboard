import React, { useEffect, useMemo, useState } from 'react';
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
  const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [textInput, setTextInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [intelligenceData, setIntelligenceData] = useState([]);
  const [backendHealth, setBackendHealth] = useState({ state: 'checking', service: 'Sentinals Backend' });
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch(`${API_BASE}/health`);
        if (!response.ok) {
          throw new Error('Health endpoint failed');
        }
        const health = await response.json();
        setBackendHealth({
          state: health.status === 'healthy' ? 'online' : 'degraded',
          service: health.service || 'Sentinals Backend',
          aiEnabled: Boolean(health.ai_enabled),
        });
      } catch (error) {
        setBackendHealth({ state: 'offline', service: 'Sentinals Backend', aiEnabled: false });
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 25000);

    return () => clearInterval(interval);
  }, [API_BASE]);

  const extractThreatLevel = (analysisText) => {
    const threatMatch = analysisText.match(/threat.{0,20}(high|medium|low)/i);
    return threatMatch ? threatMatch[1].toLowerCase() : 'unknown';
  };

  const generateRandomCoordinates = () => {
    const baseLat = 20.5937;
    const baseLon = 78.9629;
    return {
      lat: baseLat + (Math.random() - 0.5) * 0.5,
      lon: baseLon + (Math.random() - 0.5) * 0.5
    };
  };

  const stats = useMemo(() => {
    const threatCounts = intelligenceData.reduce(
      (acc, item) => {
        acc[item.threatLevel] = (acc[item.threatLevel] || 0) + 1;
        return acc;
      },
      { high: 0, medium: 0, low: 0, unknown: 0 }
    );

    return {
      total: intelligenceData.length,
      text: intelligenceData.filter((item) => item.type === 'text').length,
      image: intelligenceData.filter((item) => item.type === 'image').length,
      high: threatCounts.high,
      medium: threatCounts.medium,
      low: threatCounts.low,
      unknown: threatCounts.unknown,
    };
  }, [intelligenceData]);

  const latestIntel = useMemo(() => {
    return [...intelligenceData].sort((a, b) => b.id - a.id).slice(0, 4);
  }, [intelligenceData]);

  const clearErrorSoon = () => {
    setTimeout(() => setErrorMessage(''), 3500);
  };

  const handleTextSubmit = async () => {
    if (!textInput.trim()) {
      alert('Please enter some text to analyze');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('report', textInput);

    try {
      const response = await fetch(`${API_BASE}/upload-text`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

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
      console.error('Text analysis error:', error);
      setErrorMessage('Text analysis failed. Check backend health and try again.');
      clearErrorSoon();
    }

    setLoading(false);
    setTextInput('');
  };

  const handleImageSubmit = async () => {
    if (!selectedImage) {
      alert('Please select an image first');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('image', selectedImage);

    try {
      const response = await fetch(`${API_BASE}/upload-image`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

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
      console.error('Image upload error:', error);
      setErrorMessage('Image analysis failed. Verify backend and API key configuration.');
      clearErrorSoon();
    }

    setLoading(false);
    setSelectedImage(null);
  };

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
      <header className="dashboard-header">
        <div className="header-left">
          <p className="eyebrow">Operational Intelligence Platform</p>
          <h1>Sentinals Geospatial Command Center</h1>
          <p className="header-subtitle">AI-driven field analysis with live threat mapping and mission-grade situational awareness.</p>
          <div className="status-indicators">
            <span className={`status-indicator ${backendHealth.state === 'online' ? 'active' : ''}`}>
              {backendHealth.state === 'online' ? 'ONLINE' : backendHealth.state === 'checking' ? 'CHECKING' : 'OFFLINE'}
            </span>
            <span className="status-indicator">AI {backendHealth.aiEnabled ? 'READY' : 'LIMITED'}</span>
            <span className="status-indicator">MAP ACTIVE</span>
          </div>
        </div>
        <div className="header-right">
          <div className="time-display">
            <div className="current-time">{currentTime.toLocaleTimeString()}</div>
            <div className="current-date">{currentTime.toLocaleDateString()}</div>
          </div>
        </div>
      </header>

      <section className="quick-metrics">
        <article className="metric-card">
          <span>Total Intel</span>
          <strong>{stats.total}</strong>
        </article>
        <article className="metric-card">
          <span>Text Reports</span>
          <strong>{stats.text}</strong>
        </article>
        <article className="metric-card">
          <span>Image Reports</span>
          <strong>{stats.image}</strong>
        </article>
        <article className="metric-card alert">
          <span>High Threats</span>
          <strong>{stats.high}</strong>
        </article>
      </section>

      {errorMessage && <div className="error-banner">{errorMessage}</div>}

      <main className="dashboard-grid">
        <div className="left-column">
          <section className="glass-panel upload-section">
            <div className="panel-header">
              <h2>Ingest Intelligence</h2>
              <div className="upload-status">
                {loading ? <span className="status processing">Processing</span>
                  : <span className="status ready">Ready</span>}
              </div>
            </div>

            <div className="panel-content">
              <div className="input-group">
                <label>Field Report Input</label>
                <textarea
                  className="text-input"
                  placeholder="Paste field notes, tactical brief, or raw situation update for intelligence parsing..."
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
                  {loading ? 'Processing...' : 'Analyze Text'}
                </button>
              </div>

              <div className="input-group">
                <label>Surveillance Image</label>
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
                    {selectedImage ? `Selected: ${selectedImage.name}` :
                      selectedFile ? `Unsupported file: ${selectedFile.name}` :
                        'Drop or Select Recon Image'}
                  </label>
                </div>
                <button
                  className="submit-btn image-btn"
                  onClick={handleImageSubmit}
                  disabled={!selectedImage || loading}
                >
                  {loading ? 'Processing...' : 'Analyze Image'}
                </button>
              </div>
            </div>
          </section>

          <section className="glass-panel analysis-section">
            <div className="panel-header">
              <h2>AI Analysis Output</h2>
              <div className="analysis-status">
                {aiAnalysis ?
                  <span className="status complete">Completed</span> :
                  <span className="status waiting">Awaiting Input</span>
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
                      <strong>Coordinates:</strong> {aiAnalysis.coordinates.lat.toFixed(6)}, {aiAnalysis.coordinates.lon.toFixed(6)}
                    </div>
                  )}
                  <div className="analysis-text">
                    <pre>{aiAnalysis.analysis}</pre>
                  </div>
                </div>
              ) : (
                <div className="analysis-placeholder">
                  <div className="placeholder-icon">AI</div>
                  <p>No analysis yet. Submit a report to start intelligence extraction.</p>
                  <div className="loading-dots">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="glass-panel feed-section">
            <div className="panel-header">
              <h2>Recent Intelligence Feed</h2>
            </div>
            <div className="panel-content">
              {latestIntel.length === 0 ? (
                <p className="feed-empty">Incoming analyzed records will appear here.</p>
              ) : (
                <ul className="feed-list">
                  {latestIntel.map((intel) => (
                    <li key={intel.id} className="feed-item">
                      <div>
                        <span className="feed-type">{intel.type.toUpperCase()}</span>
                        <p className="feed-source">{intel.source}</p>
                      </div>
                      <div>
                        <span className={`feed-threat threat-${intel.threatLevel}`}>{intel.threatLevel.toUpperCase()}</span>
                        <p className="feed-time">{intel.timestamp}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <div className="right-column">
          <section className="glass-panel map-section">
            <div className="panel-header">
              <h2>Geospatial Intelligence Map</h2>
              <div className="map-controls">
                <span className="intel-count">{intelligenceData.length} points</span>
              </div>
            </div>

            <div className="panel-content map-container">
              <div className="map-shell">
                <MapContainer
                  center={[20.5937, 78.9629]}
                  zoom={5}
                  style={{ height: '100%', width: '100%' }}
                  className="natural-map"
                >
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution='&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics'
                  />

                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                    attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                  />

                  {intelligenceData.map((intel) => (
                    <Marker
                      key={intel.id}
                      position={[intel.coordinates.lat, intel.coordinates.lon]}
                      icon={getCustomIcon(intel.threatLevel)}
                    >
                      <Popup>
                        <div className="intel-popup">
                          <h4>Intelligence Report</h4>
                          <div className="intel-details">
                            <p><strong>Type:</strong> {intel.type.toUpperCase()}</p>
                            <p><strong>Source:</strong> {intel.source}</p>
                            <p><strong>Threat:</strong>
                              <span className={`threat-${intel.threatLevel}`}>
                                {intel.threatLevel.toUpperCase()}
                              </span>
                            </p>
                            <p><strong>Time:</strong> {intel.timestamp}</p>
                          </div>
                          <div className="intel-analysis">
                            <strong>Analysis</strong>
                            <div className="analysis-preview">
                              {intel.analysis.substring(0, 300)}...
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>

                <div className="map-overlay">
                  <div className="crosshair"></div>
                  <div className="range-finder">
                    <div className="range-circle"></div>
                    <div className="range-circle"></div>
                  </div>
                </div>
              </div>

            </div>
          </section>

          <section className="glass-panel mission-status">
            <div className="panel-header">
              <h2>Operational Status</h2>
            </div>
            <div className="panel-content">
              <div className="status-grid">
                <div className="status-item">
                  <span className="status-label">backend</span>
                  <span className={`status-value ${backendHealth.state === 'online' ? 'online' : 'threat-high'}`}>
                    {backendHealth.state}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">intel points</span>
                  <span className="status-value">{intelligenceData.length}</span>
                </div>
                <div className="status-item">
                  <span className="status-label">high threats</span>
                  <span className="status-value threat-high">
                    {stats.high}
                  </span>
                </div>
                <div className="status-item">
                  <span className="status-label">service</span>
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
