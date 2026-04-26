import anthropic
from datasets import load_dataset
from dotenv import load_dotenv
import os
from datasets import load_from_disk
from tqdm import tqdm
import pandas as pd

load_dotenv()
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))


dataset = load_from_disk("diagnosis_arena_data")
results = []
row = dataset[0]  # swap with your specific row

prompt = f"""Case:
Physical Exam: {row["Physical Examination"]}
Diagnostic Tests: {row["Diagnostic Tests"]}
What is the single most likely diagnosis? Be as specific as you possibly can. Reply with only the diagnosis name, nothing else."""

response = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=50,
    messages=[{"role": "user", "content": prompt}]
)
print(response.content[0].text.strip())
