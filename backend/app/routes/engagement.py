from fastapi import APIRouter, HTTPException, UploadFile, File
from ..models.engagement import AnalysisReport
from ..agents import engagement as engagement_agent

router = APIRouter(
    prefix="/api/engagement",
    tags=["Engagement Analysis"]
)

@router.post("/analyze-report", response_model=AnalysisReport)
async def analyze_report(report_file: UploadFile = File(...)):
    """
    Accepts a CSV, XLSX, or XLS file, sends it to the agent, and returns a strategic report.
    """
    filename = report_file.filename.lower()
    if not (filename.endswith('.csv') or filename.endswith('.xlsx') or filename.endswith('.xls')):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a CSV, XLSX, or XLS file.")

    try:
        file_content = await report_file.read()
        result = engagement_agent.analyze_report_file(file_content, filename)
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        raise HTTPException(status_code=500, detail="An internal server error occurred during analysis.")