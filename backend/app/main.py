from fastapi import FastAPI
from app.schemas.chat import ChatRequest
from app.services.chat_service import generate_response

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/chat")
def chat(request: ChatRequest):
    return {
        "response": generate_response(request.message)
    }