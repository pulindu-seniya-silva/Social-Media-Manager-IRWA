from fastapi import FastAPI

app = FastAPI()

@app.get("/")
@app.post("/")
@app.put("/")
@app.delete("/")
def read_root():
    return {"message": "🚀 FastAPI is running!"}
