from fastapi import APIRouter, HTTPException, UploadFile, File, Body
from ..models.engagement import InitialAnalysisResponse, TopPostAnalysis, PostDetails
from ..agents import engagement as engagement_agent

router = APIRouter(
    prefix="/api/engagement",
    tags=["Engagement Analysis"]
)

@router.post("/process-file", response_model=InitialAnalysisResponse)
async def process_engagement_report_file(report_file: UploadFile = File(...)):
    """
    Accepts a file, processes it, and returns overall stats and a list of all posts.
    """
    filename = report_file.filename.lower()
    if not (filename.endswith(('.csv', '.xlsx', '.xls'))):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a CSV, XLSX, or XLS file.")

    try:
        file_content = await report_file.read()
        return engagement_agent.process_report_file(file_content, filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An internal server error occurred: {e}")

@router.post("/analyze-post", response_model=TopPostAnalysis)
async def analyze_single_post(post: PostDetails = Body(...)):
    """
    Accepts the details of a single post and returns a deep strategic analysis.
    """
    try:
        return engagement_agent.get_detailed_analysis_for_post(post)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze post: {e}")