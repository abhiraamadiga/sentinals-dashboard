import base64
import io
import logging
import os
import re
from typing import Any

import exifread
import google.generativeai as genai
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sentinals.backend")

app = FastAPI(
    title="Sentinals Geospatial Intelligence Backend",
    version="5.0.0",
    description="AI-assisted intelligence extraction for text and surveillance images.",
)


def _load_allowed_origins() -> list[str]:
    origins_raw = os.getenv("CORS_ORIGINS", "http://localhost:3000")
    return [origin.strip() for origin in origins_raw.split(",") if origin.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_load_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _configure_gemini() -> bool:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return False
    genai.configure(api_key=api_key)
    return True


AI_ENABLED = _configure_gemini()


def _get_model() -> Any:
    if not AI_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini API is not configured. Set GEMINI_API_KEY.",
        )
    return genai.GenerativeModel("gemini-2.5-flash")


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "Sentinals Geospatial Intelligence Backend is running."}


@app.get("/health")
def health_check() -> dict[str, Any]:
    return {
        "status": "healthy",
        "service": "Sentinals Geospatial Intelligence Backend",
        "version": app.version,
        "ai_enabled": AI_ENABLED,
        "geospatial_enabled": True,
    }


@app.get("/test-gemini")
def test_gemini() -> dict[str, Any]:
    model = _get_model()
    try:
        response = model.generate_content("Say hello world")
        return {"status": "success", "response": response.text}
    except Exception as exc:
        logger.exception("Gemini test failed")
        raise HTTPException(status_code=502, detail=str(exc)) from exc


def extract_gps(image_bytes: bytes) -> tuple[float | None, float | None]:
    """Extract GPS coordinates from image EXIF data."""
    try:
        tags = exifread.process_file(io.BytesIO(image_bytes))
        if "GPS GPSLatitude" in tags and "GPS GPSLongitude" in tags:
            lat_ref = tags["GPS GPSLatitudeRef"].printable
            lon_ref = tags["GPS GPSLongitudeRef"].printable
            lat = tags["GPS GPSLatitude"].values
            lon = tags["GPS GPSLongitude"].values

            def decimal(degree: Any) -> float:
                return float(degree.num) / float(degree.den)

            lat_value = decimal(lat[0]) + decimal(lat[1]) / 60 + decimal(lat[2]) / 3600
            lon_value = decimal(lon[0]) + decimal(lon[1]) / 60 + decimal(lon[2]) / 3600

            if lat_ref != "N":
                lat_value = -lat_value
            if lon_ref != "E":
                lon_value = -lon_value
            return lat_value, lon_value
    except Exception:
        logger.exception("Failed to parse EXIF GPS")

    return None, None


def extract_coordinates_from_text(text: str) -> tuple[float | None, float | None]:
    """Extract coordinates from AI-generated text response."""
    coord_pattern = r"LAT:\s*(-?\d+\.?\d*),?\s*LON:\s*(-?\d+\.?\d*)"
    match = re.search(coord_pattern, text, re.IGNORECASE)

    if match:
        return float(match.group(1)), float(match.group(2))

    patterns = [
        r"(\d+\.?\d*)\s*[°]?\s*N,?\s*(\d+\.?\d*)\s*[°]?\s*E",
        r"(-?\d+\.?\d+),\s*(-?\d+\.?\d+)",
        r"coordinates?:?\s*(-?\d+\.?\d+),?\s*(-?\d+\.?\d+)",
        r"location:?\s*(-?\d+\.?\d+),?\s*(-?\d+\.?\d+)",
    ]

    for pattern in patterns:
        alt_match = re.search(pattern, text, re.IGNORECASE)
        if alt_match:
            lat, lon = float(alt_match.group(1)), float(alt_match.group(2))
            if -90 <= lat <= 90 and -180 <= lon <= 180:
                return lat, lon

    return None, None


@app.post("/upload-text")
async def upload_text(report: str = Form(...)) -> dict[str, Any]:
    cleaned_report = report.strip()
    if not cleaned_report:
        raise HTTPException(status_code=400, detail="Report cannot be empty.")

    model = _get_model()
    try:
        logger.info("Processing text report")
        prompt = f"""
You are a military intelligence analyst. Analyze this field report and extract:

1. ENTITIES: People, vehicles, equipment, weapons mentioned
2. ACTIVITIES: What actions/movements/operations are happening
3. LOCATIONS: Extract ANY coordinates, place names, or geographical references
4. COORDINATES: If you find or can estimate coordinates, format EXACTLY as: LAT: XX.XXXXX, LON: XX.XXXXX
5. THREAT LEVEL: Assess as High/Medium/Low based on tactical significance
6. TACTICAL SUMMARY: One sentence operational takeaway

Field Report: {cleaned_report}

Format your response clearly with numbered headers for each section.
If you identify specific locations or can estimate coordinates, include them in the COORDINATES section.
For threat assessment, consider: weapons presence, hostile activities, strategic locations, force size.
"""

        response = model.generate_content(prompt)
        extracted_coords = extract_coordinates_from_text(response.text)

        return {
            "message": "Field report analyzed by AI.",
            "original_report": cleaned_report,
            "ai_analysis": response.text,
            "coordinates": (
                {"lat": extracted_coords[0], "lon": extracted_coords[1]}
                if extracted_coords[0] is not None and extracted_coords[1] is not None
                else None
            ),
            "data_type": "text_analysis",
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error in text processing")
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/upload-image")
async def upload_image(image: UploadFile = File(...)) -> dict[str, Any]:
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported.")

    model = _get_model()
    try:
        logger.info("Processing image upload: %s", image.filename)
        image_bytes = await image.read()

        if not image_bytes:
            raise HTTPException(status_code=400, detail="Uploaded image is empty.")

        lat, lon = extract_gps(image_bytes)
        image_data = {
            "mime_type": image.content_type,
            "data": base64.b64encode(image_bytes).decode("utf-8"),
        }

        prompt = f"""
You are a military intelligence analyst reviewing surveillance imagery.

GPS Location from EXIF: {f"{lat}, {lon}" if lat is not None and lon is not None else "No GPS data available"}

Provide detailed tactical analysis in this format:

1. DETECTED OBJECTS: List each visible object (vehicles, personnel, structures, weapons)
2. ACTIVITIES: Describe movements, behaviors, tactical formations visible
3. TERRAIN ANALYSIS: Describe geographical features, strategic value, cover/concealment
4. COORDINATES: Use GPS if available, otherwise estimate location as: LAT: XX.XXXXX, LON: XX.XXXXX
5. THREAT ASSESSMENT: Evaluate threat level (High/Medium/Low) and tactical significance
6. OPERATIONAL INTELLIGENCE: Key findings for command decisions

Focus on military-relevant details: force composition, defensive positions, equipment types,
movement patterns, terrain advantages, and indicators of hostile intent.
"""

        response = model.generate_content([prompt, image_data])

        coordinates = None
        if lat is not None and lon is not None:
            coordinates = {"lat": lat, "lon": lon}
        else:
            extracted_coords = extract_coordinates_from_text(response.text)
            if extracted_coords[0] is not None and extracted_coords[1] is not None:
                coordinates = {"lat": extracted_coords[0], "lon": extracted_coords[1]}

        return {
            "message": "Surveillance image analyzed by AI.",
            "original_image": image.filename,
            "ai_analysis": response.text,
            "coordinates": coordinates,
            "data_type": "image_analysis",
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error in image processing")
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/batch-analysis")
async def batch_analysis(reports: list[str] = Form(...)) -> dict[str, Any]:
    """Process multiple intelligence reports at once."""
    if not reports:
        raise HTTPException(status_code=400, detail="No reports were provided.")

    results = []

    for idx, report in enumerate(reports):
        try:
            result = await upload_text(report)
            results.append({"index": idx, "status": "success", "data": result})
        except HTTPException as exc:
            results.append({"index": idx, "status": "failed", "error": exc.detail})
        except Exception as exc:
            results.append({"index": idx, "status": "failed", "error": str(exc)})

    return {
        "message": f"Batch analysis completed: {len(results)} reports processed",
        "results": results,
        "data_type": "batch_analysis",
    }


@app.get("/intelligence-summary")
async def intelligence_summary() -> dict[str, Any]:
    """Get operational summary statistics."""
    return {
        "status": "operational",
        "systems": {
            "ai_analysis": "online" if AI_ENABLED else "limited",
            "image_processing": "online" if AI_ENABLED else "limited",
            "geospatial": "active",
            "threat_assessment": "active" if AI_ENABLED else "limited",
        },
        "capabilities": [
            "Text Intelligence Analysis",
            "Image/Surveillance Analysis",
            "GPS Extraction",
            "Threat Level Assessment",
            "Geospatial Mapping",
            "Operational Intelligence",
        ],
    }
