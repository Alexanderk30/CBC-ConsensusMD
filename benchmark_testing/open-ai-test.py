from openai import OpenAI
from datasets import load_from_disk
from dotenv import load_dotenv
import os
from tqdm import tqdm
import pandas as pd

load_dotenv()
client = OpenAI(
    api_key=os.getenv("OPENROUTER_API_KEY"),
    base_url="https://openrouter.ai/api/v1",
)

dataset = load_from_disk("diagnosis_arena_data")
results = []

for i, row in enumerate(tqdm(dataset)):
    try:
        prompt = f"""Case: {row["Case Information"]}
            Physical Exam: {row["Physical Examination"]}
            Diagnostic Tests: {row["Diagnostic Tests"]}
            What is the single most likely diagnosis?
            Be as specific as you possibly can.
            Reply with only the diagnosis name, nothing else.
            """

        response = client.chat.completions.create(
            model="openai/gpt-5.4",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}]
        )
        predicted = response.choices[0].message.content.strip()
    except Exception as e:
        print(f"Row {i} failed: {e}")
        predicted = None

    correct = row["Options"][row["Right Option"]]
    results.append({"predicted": predicted, "correct": correct})

    if i % 10 == 0:
        pd.DataFrame(results).to_csv("openai_diagnosis_results.csv", index=False)

pd.DataFrame(results).to_csv("openai_diagnosis_results.csv", index=False)
print(pd.DataFrame(results).head())
