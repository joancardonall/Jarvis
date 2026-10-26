from app.schemas.chat import ChatRequest, ChatResponse


def generate_response(message: str) -> str:
    return f"Has dit: {message}"
