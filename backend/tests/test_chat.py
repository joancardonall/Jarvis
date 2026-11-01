import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.mark.parametrize("message", ["Hola, Jarvis!", "", "  Bon dia!  "])
def test_chat_returns_echo(message):
    with TestClient(app) as client:
        response = client.post("/chat", json={"message": message})

    assert response.status_code == 200
    assert response.json() == {"response": f"Has dit: {message}"}


def test_chat_requires_message():
    with TestClient(app) as client:
        response = client.post("/chat", json={})

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "message"]


@pytest.mark.parametrize("message", [123, 1.5, True, None, [], {}])
def test_chat_rejects_invalid_message_types(message):
    with TestClient(app) as client:
        response = client.post("/chat", json={"message": message})

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "message"]
