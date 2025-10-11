from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
import exifread, base64, io
import re

app = FastAPI()

# Configure Gemini API - REPLACE WITH YOUR ACTUAL KEY
genai.configure(api_key='AIzaSyAex1X_HSPRbStjRFfFurmiK1hFJNy8-dM')

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "🛡️ Sentinals Geospatial Intelligence Backend is running!"}

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "Sentinals Geospatial Intelligence Backend",
        "version": "4.0.0",
        "ai_enabled": True,
        "geospatial_enabled": True
    }

@app.get("/test-gemini")
def test_gemini():
    try:
        model_g = genai.GenerativeModel('gemini-2.5-flash')
        response = model_g.generate_content("Say hello world")
        return {"status": "✅ SUCCESS!", "response": response.text}
    except Exception as e:
        return {"status": "❌ FAILED", "error": str(e)}

def extract_gps(image_bytes):
    """Extract GPS coordinates from image EXIF data"""
    try:
        tags = exifread.process_file(io.BytesIO(image_bytes))
        if 'GPS GPSLatitude' in tags and 'GPS GPSLongitude' in tags:
            lat_ref = tags['GPS GPSLatitudeRef'].printable
            lon_ref = tags['GPS GPSLongitudeRef'].printable
            lat = tags['GPS GPSLatitude'].values
            lon = tags['GPS GPSLongitude'].values
            d2d = lambda d: float(d.num) / float(d.den)
            lat_value = d2d(lat[0]) + d2d(lat[1])/60 + d2d(lat[2])/3600
            lon_value = d2d(lon[0]) + d2d(lon[1])/60 + d2d(lon[2])/3600
            if lat_ref != 'N': lat_value = -lat_value
            if lon_ref != 'E': lon_value = -lon_value
            return lat_value, lon_value
    except Exception:
        pass
    return None, None

def extract_coordinates_from_text(text):
    """Extract coordinates from AI-generated text response"""
    # Pattern for LAT: XX.XXXXX, LON: XX.XXXXX
    coord_pattern = r'LAT:\s*(-?\d+\.?\d*),?\s*LON:\s*(-?\d+\.?\d*)'
    match = re.search(coord_pattern, text, re.IGNORECASE)
    
    if match:
        return float(match.group(1)), float(match.group(2))
    
    # Alternative patterns for coordinates
    patterns = [
        r'(\d+\.?\d*)\s*[°]?\s*N,?\s*(\d+\.?\d*)\s*[°]?\s*E',
        r'(-?\d+\.?\d+),\s*(-?\d+\.?\d+)',
        r'coordinates?:?\s*(-?\d+\.?\d+),?\s*(-?\d+\.?\d+)',
        r'location:?\s*(-?\d+\.?\d+),?\s*(-?\d+\.?\d+)'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            lat, lon = float(match.group(1)), float(match.group(2))
            # Basic validation for reasonable coordinates
            if -90 <= lat <= 90 and -180 <= lon <= 180:
                return lat, lon
    
    return None, None

@app.post("/upload-text")
async def upload_text(report: str = Form(...)):
    try:
        print(f"📝 Processing text report: {report[:50]}...")
        
        model_g = genai.GenerativeModel('gemini-2.5-flash')
        prompt = f"""
        You are a military intelligence analyst. Analyze this field report and extract:
        
        1. ENTITIES: People, vehicles, equipment, weapons mentioned
        2. ACTIVITIES: What actions/movements/operations are happening  
        3. LOCATIONS: Extract ANY coordinates, place names, or geographical references
        4. COORDINATES: If you find or can estimate coordinates, format EXACTLY as: LAT: XX.XXXXX, LON: XX.XXXXX
        5. THREAT LEVEL: Assess as High/Medium/Low based on tactical significance
        6. TACTICAL SUMMARY: One sentence operational takeaway
        
        Field Report: {report}
        
        Format your response clearly with numbered headers for each section.
        If you identify specific locations or can estimate coordinates, include them in the COORDINATES section.
        For threat assessment, consider: weapons presence, hostile activities, strategic locations, force size.
        """
        
        response = model_g.generate_content(prompt)
        
        # Try to extract coordinates from the AI response
        extracted_coords = extract_coordinates_from_text(response.text)
        
        return {
            "message": "✅ Field report analyzed by AI!",
            "original_report": report,
            "ai_analysis": response.text,
            "coordinates": {"lat": extracted_coords[0], "lon": extracted_coords[1]} if extracted_coords else None,
            "data_type": "text_analysis"
        }
        
    except Exception as e:
        print(f"❌ Error in text processing: {str(e)}")
        return {
            "message": f"❌ AI Analysis Failed: {str(e)}",
            "original_report": report,
            "error": str(e)
        }

@app.post("/upload-image")
async def upload_image(image: UploadFile = File(...)):
    try:
        print(f"📸 Processing image: {image.filename}")
        image_bytes = await image.read()
        
        # Extract GPS from EXIF
        lat, lon = extract_gps(image_bytes)
        print(f"📍 GPS from EXIF: {lat}, {lon}" if lat and lon else "📍 No GPS in EXIF")
        
        # Use Gemini Vision to analyze image
        model_g = genai.GenerativeModel('gemini-2.5-flash')
        
        # Convert image for Gemini
        image_data = {
            "mime_type": image.content_type,
            "data": base64.b64encode(image_bytes).decode('utf-8')
        }
        
        prompt = f"""
        You are a military intelligence analyst reviewing surveillance imagery.
        
        GPS Location from EXIF: {f"{lat}, {lon}" if lat and lon else "No GPS data available"}
        
        Provide detailed tactical analysis in this format:
        
        1. DETECTED OBJECTS: List each visible object (vehicles, personnel, structures, weapons)
        2. ACTIVITIES: Describe movements, behaviors, tactical formations visible
        3. TERRAIN ANALYSIS: Describe geographical features, strategic value, cover/concealment
        4. COORDINATES: Use GPS if available, otherwise estimate location as: LAT: XX.XXXXX, LON: XX.XXXXX  
        5. THREAT ASSESSMENT: Evaluate threat level (High/Medium/Low) and tactical significance
        6. OPERATIONAL INTELLIGENCE: Key findings for command decisions
        
        Focus on military-relevant details: force composition, defensive positions, equipment types,
        movement patterns, terrain advantages, and any indicators of hostile intent.
        Be specific about object counts, positions, and tactical implications.
        """
        
        response = model_g.generate_content([prompt, image_data])
        
        # Use EXIF GPS if available, otherwise try to extract from AI response
        coordinates = None
        if lat and lon:
            coordinates = {"lat": lat, "lon": lon}
        else:
            extracted_coords = extract_coordinates_from_text(response.text)
            if extracted_coords:
                coordinates = {"lat": extracted_coords[0], "lon": extracted_coords[1]}
        
        return {
            "message": "✅ Surveillance image analyzed by AI!",
            "original_image": image.filename,
            "ai_analysis": response.text,
            "coordinates": coordinates,
            "data_type": "image_analysis"
        }
        
    except Exception as e:
        print(f"❌ Error in image processing: {str(e)}")
        return {
            "message": f"❌ Image analysis failed: {str(e)}",
            "original_image": image.filename if image else "unknown",
            "error": str(e)
        }

# Additional endpoint for batch processing
@app.post("/batch-analysis")
async def batch_analysis(reports: list = Form(...)):
    """Process multiple intelligence reports at once"""
    results = []
    
    for i, report in enumerate(reports):
        try:
            # Process each report
            result = await upload_text(report)
            results.append({
                "index": i,
                "status": "success",
                "data": result
            })
        except Exception as e:
            results.append({
                "index": i, 
                "status": "failed",
                "error": str(e)
            })
    
    return {
        "message": f"✅ Batch analysis completed: {len(results)} reports processed",
        "results": results,
        "data_type": "batch_analysis"
    }

@app.get("/intelligence-summary")
async def intelligence_summary():
    """Endpoint to get operational summary statistics"""
    return {
        "status": "operational",
        "systems": {
            "ai_analysis": "online",
            "image_processing": "online", 
            "geospatial": "active",
            "threat_assessment": "active"
        },
        "capabilities": [
            "Text Intelligence Analysis",
            "Image/Surveillance Analysis", 
            "GPS Extraction",
            "Threat Level Assessment",
            "Geospatial Mapping",
            "Operational Intelligence"
        ]
    }
