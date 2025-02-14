# Import necessary libraries
from flask import Flask, render_template, request, jsonify
import google.generativeai as genai
from google.ai.generativelanguage_v1beta.types import content
import json
import os
from dotenv import load_dotenv
from elevenlabs import ElevenLabs
import base64
import threading
import uuid
import time

# Initialize Flask app and load environment variables
app = Flask(__name__)
load_dotenv()

# Configure the Gemini AI model with API key from environment
genai.configure(api_key=os.getenv("gemini_api_key"))

# Set up ElevenLabs client with API key from environment
elevenlabs_api_key = os.getenv("elevenlabs_api_key")
if not elevenlabs_api_key:
    raise ValueError("ELEVENLABS_API_KEY is not set in environment variables.")
eleven_client = ElevenLabs(api_key=elevenlabs_api_key)

# Define generation settings for Gemini model
generation_config = {
    "temperature": 0,
    "top_p": 0.95,
    "top_k": 40,
    "max_output_tokens": 8192,
    "response_schema": content.Schema(
        type=content.Type.OBJECT,
        enum=[],
        required=["most_likely_word", "list_of_other_likely_words", "is_a_full_sentence"],
        properties={
            "most_likely_word": content.Schema(type=content.Type.STRING),
            "list_of_other_likely_words": content.Schema(type=content.Type.ARRAY, items=content.Schema(type=content.Type.STRING)),
            "is_a_full_sentence": content.Schema(type=content.Type.BOOLEAN),
        },
    ),
    "response_mime_type": "application/json",
}

# Initialize the Gemini model with the configured settings
model = genai.GenerativeModel(
    model_name="gemini-1.5-flash-8b",
    generation_config=generation_config,
    system_instruction=(
        "You are an LLM AI model designed to assist a sign language to speech translation system. "
        "You will be given a sequence of Arabic letters (which may contain errors) and need to predict the most likely word. "
        "Outputs should include 'most_likely_word', 'list_of_other_likely_words', and 'is_a_full_sentence'."
    ),
)

# Thread-safe storage for TTS audio data
tts_audio_map = {}
tts_audio_lock = threading.Lock()

def generate_tts_audio(audio_id, word_to_speak, voice="Alice"):
    """
    Function to generate TTS audio in the background and store it in base64 format.
    Cleans up after 5 minutes.
    """
    try:
        # Generate TTS audio with ElevenLabs API
        audio_generator = eleven_client.generate(
            text=word_to_speak,
            voice=voice,
            model="eleven_multilingual_v2"
        )
        
        # Collect the audio data and encode it in base64
        audio_bytes = b''.join(audio_generator)
        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
        
        # Store the audio data safely
        with tts_audio_lock:
            tts_audio_map[audio_id] = audio_base64
        
        # Clean up after 5 minutes
        time.sleep(300)
        with tts_audio_lock:
            del tts_audio_map[audio_id]
    except Exception as e:
        print(f"Error generating TTS audio for ID {audio_id}: {e}")
        with tts_audio_lock:
            tts_audio_map[audio_id] = None

# Home route renders the main HTML template
@app.route('/')
def index():
    return render_template('index.html')

# TTS route that handles POST requests to generate speech
@app.route('/tts', methods=['POST'])
def tts():
    data = request.get_json()
    word = data.get('word', '').strip()
    voice = data.get('voice', 'Alice')  # Default voice is Alice

    if not word:
        return jsonify({'error': 'No word provided for TTS.'}), 400

    audio_id = str(uuid.uuid4())
    tts_thread = threading.Thread(target=generate_tts_audio, args=(audio_id, word, voice))
    tts_thread.start()

    return jsonify({'audio_id': audio_id}), 200

# Prediction route to handle model predictions for context and word completion
@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()
    context = data.get('context', '')
    current_word = data.get('currentWord', '')
    finalize = data.get('finalize', False)
    voice = data.get('voice', 'Alice')
    
    history = []
    if context:
        history.append({"role": "user", "parts": [context]})

    chat_session = model.start_chat(history=history)
    response = chat_session.send_message(current_word)

    # Parse the response and handle errors
    try:
        prediction = json.loads(response.text)
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}")
        return jsonify({'error': 'Failed to parse model response.'}), 500

    response_payload = {'prediction': prediction}

    # If word is finalized, generate TTS audio in the background
    if finalize and prediction.get('most_likely_word'):
        word_to_speak = prediction['most_likely_word']
        audio_id = str(uuid.uuid4())
        tts_thread = threading.Thread(target=generate_tts_audio, args=(audio_id, word_to_speak, voice))
        tts_thread.start()
        response_payload['audio_id'] = audio_id

    return jsonify(response_payload)

# Audio retrieval route to fetch generated TTS audio by ID
@app.route('/get_audio/<audio_id>', methods=['GET'])
def get_audio(audio_id):
    with tts_audio_lock:
        audio_data = tts_audio_map.get(audio_id)
    
    if audio_data:
        return jsonify({'audio': audio_data})
    elif audio_id in tts_audio_map:
        return jsonify({'error': 'Failed to generate audio.'}), 500
    else:
        return jsonify({'status': 'pending'}), 202

# Run Flask app in debug mode
if __name__ == '__main__':
    app.run(debug=True)
